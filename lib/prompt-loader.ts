/**
 * Prompt Loader - Load and interpolate prompts from markdown files
 *
 * Prompts are loaded from a hierarchical file system:
 * 1. user/prompts/[path] - User customizations (highest priority)
 * 2. team/prompts/[path] - Team customizations
 * 3. system/prompts/[path] - System defaults (lowest priority)
 *
 * This allows users and teams to evolve prompts while maintaining
 * stable system defaults.
 */

import { getVFS } from './virtual-fs';

export interface PromptMetadata {
  name: string;
  type: 'system' | 'tool' | 'guide' | 'runtime' | 'template';
  version: string;
  description: string;
  variables?: PromptVariable[];
  evolvedFrom?: string | null;
  origin?: 'created' | 'extracted' | 'evolved';
  extractedFrom?: string | null;
}

export interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  default?: any;
}

export interface LoadedPrompt {
  metadata: PromptMetadata;
  content: string;
  rawContent: string;
  path: string;
  volume: 'user' | 'team' | 'system';
}

// Cache for loaded prompts
const promptCache = new Map<string, LoadedPrompt>();

// Cache for fetched system prompts (to avoid repeated fetches)
const systemPromptCache = new Map<string, string>();

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(markdown: string): { metadata: Partial<PromptMetadata>; content: string } {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return {
      metadata: {},
      content: markdown,
    };
  }

  const frontmatterStr = frontmatterMatch[1];
  const content = frontmatterMatch[2].trim();

  // Parse YAML-like frontmatter (simple parser)
  const metadata: Record<string, any> = {};
  const lines = frontmatterStr.split('\n');
  let currentKey = '';
  let currentArray: any[] = [];
  let inArray = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('- ')) {
      // Array item
      if (inArray) {
        const itemContent = trimmed.slice(2).trim();
        // Check if it's an object item
        if (itemContent.includes(':')) {
          const [key, ...valueParts] = itemContent.split(':');
          const value = valueParts.join(':').trim();
          if (currentArray.length > 0 && typeof currentArray[currentArray.length - 1] === 'object') {
            currentArray[currentArray.length - 1][key.trim()] = value;
          } else {
            currentArray.push({ [key.trim()]: value });
          }
        } else {
          currentArray.push(itemContent);
        }
      }
    } else if (trimmed.includes(':')) {
      // Key-value pair
      if (inArray && currentKey) {
        metadata[currentKey] = currentArray;
        inArray = false;
      }

      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      currentKey = key;

      if (value === '') {
        // Start of array or object
        currentArray = [];
        inArray = true;
      } else {
        // Simple value
        inArray = false;
        // Parse value type
        if (value === 'true') {
          metadata[key] = true;
        } else if (value === 'false') {
          metadata[key] = false;
        } else if (value === 'null') {
          metadata[key] = null;
        } else if (!isNaN(Number(value)) && value !== '') {
          metadata[key] = Number(value);
        } else if (value.startsWith('"') && value.endsWith('"')) {
          metadata[key] = value.slice(1, -1);
        } else {
          metadata[key] = value;
        }
      }
    }
  }

  // Handle last array
  if (inArray && currentKey) {
    metadata[currentKey] = currentArray;
  }

  return { metadata: metadata as Partial<PromptMetadata>, content };
}

/**
 * Interpolate variables in prompt content
 *
 * Supports:
 * - {{variableName}} - Simple replacement
 * - {{#if condition}}...{{else}}...{{/if}} - Conditionals
 * - {{#each array}}...{{/each}} - Loops
 */
function interpolate(content: string, variables: Record<string, any>): string {
  let result = content;

  // Handle conditionals: {{#if condition}}...{{else}}...{{/if}}
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
  result = result.replace(conditionalRegex, (match, varName, ifContent, elseContent = '') => {
    const value = variables[varName];
    if (value && value !== '' && value !== false && (!Array.isArray(value) || value.length > 0)) {
      return ifContent;
    }
    return elseContent;
  });

  // Handle loops: {{#each array}}...{{/each}}
  const loopRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  result = result.replace(loopRegex, (match, varName, loopContent) => {
    const array = variables[varName];
    if (!Array.isArray(array)) return '';

    return array.map((item, index) => {
      let itemContent = loopContent;
      // Replace {{this}} with the item
      if (typeof item === 'object') {
        // Replace {{this.property}} with item.property
        itemContent = itemContent.replace(/\{\{this\.(\w+)\}\}/g, (m: string, prop: string) => {
          return item[prop] !== undefined ? String(item[prop]) : '';
        });
      } else {
        itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));
      }
      // Replace {{@index}} with the index
      itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));
      return itemContent;
    }).join('');
  });

  // Handle simple variable replacement: {{variableName}}
  result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = variables[varName];
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  });

  return result;
}

/**
 * Try to load a prompt from a specific volume
 */
async function tryLoadFromVolume(
  promptPath: string,
  volume: 'user' | 'team' | 'system'
): Promise<string | null> {
  const fullPath = `${volume}/prompts/${promptPath}`;

  if (volume === 'system') {
    // System prompts are in public/system/prompts/
    // Check cache first
    if (systemPromptCache.has(promptPath)) {
      return systemPromptCache.get(promptPath)!;
    }

    try {
      // Fetch from public directory
      const response = await fetch(`/system/prompts/${promptPath}`);
      if (response.ok) {
        const content = await response.text();
        systemPromptCache.set(promptPath, content);
        return content;
      }
    } catch (error) {
      // Not found in system
    }
    return null;
  }

  // User and team prompts are in VFS
  try {
    const vfs = getVFS();
    const content = vfs.readFileContent(fullPath);
    return content || null;
  } catch (error) {
    return null;
  }
}

/**
 * Load a prompt from the hierarchical file system
 *
 * @param promptPath - Path relative to prompts directory (e.g., "core/context-summarization.md")
 * @param variables - Variables to interpolate in the prompt
 * @param options - Additional options
 * @returns Loaded and interpolated prompt
 */
export async function loadPrompt(
  promptPath: string,
  variables: Record<string, any> = {},
  options: { forceReload?: boolean; volume?: 'user' | 'team' | 'system' } = {}
): Promise<LoadedPrompt | null> {
  const cacheKey = `${promptPath}:${JSON.stringify(variables)}`;

  // Check cache unless force reload
  if (!options.forceReload && promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey)!;
  }

  // Try loading from each volume in priority order
  const volumes: Array<'user' | 'team' | 'system'> = options.volume
    ? [options.volume]
    : ['user', 'team', 'system'];

  let rawContent: string | null = null;
  let loadedVolume: 'user' | 'team' | 'system' = 'system';

  for (const volume of volumes) {
    rawContent = await tryLoadFromVolume(promptPath, volume);
    if (rawContent) {
      loadedVolume = volume;
      break;
    }
  }

  if (!rawContent) {
    console.warn(`[PromptLoader] Prompt not found: ${promptPath}`);
    return null;
  }

  // Parse frontmatter
  const { metadata, content } = parseFrontmatter(rawContent);

  // Apply default values from metadata variables
  const effectiveVariables = { ...variables };
  if (metadata.variables) {
    for (const variable of metadata.variables) {
      if (effectiveVariables[variable.name] === undefined && variable.default !== undefined) {
        effectiveVariables[variable.name] = variable.default;
      }
    }
  }

  // Interpolate variables
  const interpolatedContent = interpolate(content, effectiveVariables);

  const loadedPrompt: LoadedPrompt = {
    metadata: metadata as PromptMetadata,
    content: interpolatedContent,
    rawContent,
    path: promptPath,
    volume: loadedVolume,
  };

  // Cache the result
  promptCache.set(cacheKey, loadedPrompt);

  return loadedPrompt;
}

/**
 * Load a prompt synchronously from cache or return null
 * Use this only when you're sure the prompt has been preloaded
 */
export function getPromptFromCache(
  promptPath: string,
  variables: Record<string, any> = {}
): LoadedPrompt | null {
  const cacheKey = `${promptPath}:${JSON.stringify(variables)}`;
  return promptCache.get(cacheKey) || null;
}

/**
 * Preload multiple prompts for faster access
 */
export async function preloadPrompts(promptPaths: string[]): Promise<void> {
  await Promise.all(promptPaths.map(path => loadPrompt(path)));
}

/**
 * Clear the prompt cache
 */
export function clearPromptCache(): void {
  promptCache.clear();
  systemPromptCache.clear();
}

/**
 * Get prompt content directly (for simple use cases)
 */
export async function getPromptContent(
  promptPath: string,
  variables: Record<string, any> = {}
): Promise<string> {
  const prompt = await loadPrompt(promptPath, variables);
  return prompt?.content || '';
}

/**
 * List available prompts in a directory
 */
export async function listPrompts(
  directory: string,
  volume: 'user' | 'team' | 'system' = 'system'
): Promise<string[]> {
  if (volume === 'system') {
    // For system prompts, we need to maintain a known list
    // since we can't list directories via fetch
    const knownPrompts: Record<string, string[]> = {
      'core': [
        'context-summarization.md',
        'tool-execution-continuation.md',
        'workspace-context.md',
      ],
      'runtime': [
        'python-constraints.md',
        'quantum-constraints.md',
        'browser-limitations.md',
      ],
      'tools': [
        'generate-applet.md',
        'generate-robot-agent.md',
      ],
      'guides': [
        'tool-call-format.md',
      ],
      'templates': [
        'agent-template.md',
        'tool-template.md',
        'prompt-template.md',
      ],
    };
    return knownPrompts[directory] || [];
  }

  // For user/team volumes, use VFS
  try {
    const vfs = getVFS();
    const fullPath = `${volume}/prompts/${directory}`;
    const { files } = vfs.listDirectory(fullPath);
    return files.filter(f => f.path.endsWith('.md')).map(f => f.path.split('/').pop()!);
  } catch {
    return [];
  }
}

/**
 * Copy a system prompt to user volume for customization
 */
export async function evolvePrompt(
  systemPromptPath: string,
  modifications?: Partial<PromptMetadata>
): Promise<string> {
  const sourcePrompt = await loadPrompt(systemPromptPath, {}, { volume: 'system' });

  if (!sourcePrompt) {
    throw new Error(`System prompt not found: ${systemPromptPath}`);
  }

  // Update metadata for evolution
  const evolvedMetadata = {
    ...sourcePrompt.metadata,
    ...modifications,
    evolvedFrom: `system/prompts/${systemPromptPath}`,
    origin: 'evolved' as const,
    version: incrementVersion(sourcePrompt.metadata.version || '1.0'),
  };

  // Reconstruct the prompt with updated frontmatter
  const evolvedContent = reconstructPrompt(evolvedMetadata, sourcePrompt.content);

  // Write to user volume
  const vfs = getVFS();
  const userPath = `user/prompts/${systemPromptPath}`;
  vfs.writeFile(userPath, evolvedContent);

  // Clear cache for this prompt
  promptCache.delete(`${systemPromptPath}:${JSON.stringify({})}`);

  return userPath;
}

/**
 * Increment version string
 */
function incrementVersion(version: string): string {
  const parts = version.replace(/"/g, '').split('.');
  const minor = parseInt(parts[1] || '0', 10);
  return `${parts[0]}.${minor + 1}`;
}

/**
 * Reconstruct prompt markdown from metadata and content
 */
function reconstructPrompt(metadata: Partial<PromptMetadata>, content: string): string {
  const frontmatterLines = ['---'];

  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) {
      frontmatterLines.push(`${key}: null`);
    } else if (Array.isArray(value)) {
      frontmatterLines.push(`${key}:`);
      for (const item of value) {
        if (typeof item === 'object') {
          frontmatterLines.push(`  - name: ${item.name}`);
          for (const [k, v] of Object.entries(item)) {
            if (k !== 'name') {
              frontmatterLines.push(`    ${k}: ${v}`);
            }
          }
        } else {
          frontmatterLines.push(`  - ${item}`);
        }
      }
    } else if (typeof value === 'string' && value.includes(' ')) {
      frontmatterLines.push(`${key}: "${value}"`);
    } else {
      frontmatterLines.push(`${key}: ${value}`);
    }
  }

  frontmatterLines.push('---');

  return `${frontmatterLines.join('\n')}\n\n${content}`;
}

// Export for use in tests
export { parseFrontmatter, interpolate };
