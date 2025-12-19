/**
 * Skill Parser - Parse markdown skills with YAML frontmatter
 *
 * Format:
 * ---
 * skill_id: my-skill
 * name: My Skill
 * type: python-wasm
 * inputs: [...]
 * outputs: [...]
 * ---
 * # Description
 * ## Code
 * ```python
 * def execute(inputs):
 *   return {}
 * ```
 */

export interface SkillInput {
  name: string;
  type: string;
  description: string;
  default?: any;
  required?: boolean;
}

export interface SkillOutput {
  name: string;
  type: string;
  description: string;
}

export interface SkillMetadata {
  skill_id: string;
  name: string;
  description: string;
  type: string;
  execution_mode?: string;
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
  estimated_time_ms?: number;
  memory_mb?: number;
  inputs: SkillInput[];
  outputs: SkillOutput[];
}

export interface ParsedSkill {
  metadata: SkillMetadata;
  markdown: string;
  code: string;
}

/**
 * Parse YAML frontmatter from markdown
 */
function parseFrontmatter(content: string): { frontmatter: any; markdown: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, markdown: content };
  }

  const [, yamlContent, markdown] = match;

  // Simple YAML parser (handles basic key-value and arrays)
  const frontmatter: any = {};
  const lines = yamlContent.split('\n');
  let currentKey = '';
  let inArray = false;
  let arrayItems: any[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Array item
    if (trimmed.startsWith('- ')) {
      if (inArray) {
        const value = trimmed.substring(2).trim();
        // Check if it's a nested object
        if (value.includes(':')) {
          const [key, val] = value.split(':').map(s => s.trim());
          const lastItem = arrayItems[arrayItems.length - 1];
          if (typeof lastItem === 'object') {
            lastItem[key] = parseValue(val);
          } else {
            arrayItems.push({ [key]: parseValue(val) });
          }
        } else {
          arrayItems.push(parseValue(value));
        }
      } else {
        // Start of new array
        inArray = true;
        arrayItems = [];
        const value = trimmed.substring(2).trim();
        if (value.includes(':')) {
          const [key, val] = value.split(':').map(s => s.trim());
          arrayItems.push({ [key]: parseValue(val) });
        } else {
          arrayItems.push(parseValue(value));
        }
      }
    }
    // Key-value pair
    else if (line.match(/^\s*\w+:/)) {
      // If we were building an array, save it
      if (inArray && currentKey) {
        frontmatter[currentKey] = arrayItems;
        inArray = false;
        arrayItems = [];
      }

      const [key, ...valueParts] = trimmed.split(':');
      currentKey = key.trim();
      const value = valueParts.join(':').trim();

      if (value) {
        frontmatter[currentKey] = parseValue(value);
      } else {
        // Value might be on next lines (array or multi-line)
        inArray = true;
        arrayItems = [];
      }
    }
    // Nested property in array object
    else if (line.match(/^\s{2,}\w+:/) && inArray) {
      const indentMatch = line.match(/^(\s+)/);
      const indent = indentMatch ? indentMatch[1].length : 0;
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      if (indent >= 2) {
        // Nested property
        const lastItem = arrayItems[arrayItems.length - 1];
        if (typeof lastItem === 'object') {
          lastItem[key.trim()] = parseValue(value);
        } else {
          arrayItems.push({ [key.trim()]: parseValue(value) });
        }
      }
    }
  }

  // Save last array if any
  if (inArray && currentKey) {
    frontmatter[currentKey] = arrayItems;
  }

  return { frontmatter, markdown };
}

function parseValue(value: string): any {
  // Remove quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Number
  if (!isNaN(Number(value))) {
    return Number(value);
  }

  // Array (JSON-like)
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

/**
 * Extract code blocks from markdown
 */
function extractCode(markdown: string): string {
  const codeBlockRegex = /```(?:python|javascript|js)?\n([\s\S]*?)```/g;
  const matches = [...markdown.matchAll(codeBlockRegex)];

  if (matches.length === 0) {
    return '';
  }

  // Return the first code block (usually the main execute function)
  return matches[0][1].trim();
}

/**
 * Parse a skill markdown file
 */
export function parseSkillMarkdown(content: string): ParsedSkill {
  const { frontmatter, markdown } = parseFrontmatter(content);
  const code = extractCode(markdown);

  const metadata: SkillMetadata = {
    skill_id: frontmatter.skill_id || 'unknown',
    name: frontmatter.name || 'Unnamed Skill',
    description: frontmatter.description || '',
    type: frontmatter.type || 'python-wasm',
    execution_mode: frontmatter.execution_mode,
    category: frontmatter.category,
    tags: frontmatter.tags || [],
    version: frontmatter.version,
    author: frontmatter.author,
    estimated_time_ms: frontmatter.estimated_time_ms,
    memory_mb: frontmatter.memory_mb,
    inputs: frontmatter.inputs || [],
    outputs: frontmatter.outputs || [],
  };

  return {
    metadata,
    markdown,
    code,
  };
}

/**
 * Generate skill markdown from metadata and code
 */
export function generateSkillMarkdown(
  metadata: SkillMetadata,
  code: string,
  additionalMarkdown?: string
): string {
  const yamlLines = [
    '---',
    `skill_id: ${metadata.skill_id}`,
    `name: ${metadata.name}`,
    `description: ${metadata.description}`,
    `type: ${metadata.type}`,
  ];

  if (metadata.execution_mode) {
    yamlLines.push(`execution_mode: ${metadata.execution_mode}`);
  }
  if (metadata.category) {
    yamlLines.push(`category: ${metadata.category}`);
  }
  if (metadata.tags && metadata.tags.length > 0) {
    yamlLines.push(`tags: ${JSON.stringify(metadata.tags)}`);
  }
  if (metadata.version) {
    yamlLines.push(`version: ${metadata.version}`);
  }
  if (metadata.author) {
    yamlLines.push(`author: ${metadata.author}`);
  }
  if (metadata.estimated_time_ms) {
    yamlLines.push(`estimated_time_ms: ${metadata.estimated_time_ms}`);
  }
  if (metadata.memory_mb) {
    yamlLines.push(`memory_mb: ${metadata.memory_mb}`);
  }

  // Inputs
  if (metadata.inputs.length > 0) {
    yamlLines.push('inputs:');
    metadata.inputs.forEach(input => {
      yamlLines.push(`  - name: ${input.name}`);
      yamlLines.push(`    type: ${input.type}`);
      yamlLines.push(`    description: ${input.description}`);
      if (input.default !== undefined) {
        yamlLines.push(`    default: ${JSON.stringify(input.default)}`);
      }
      if (input.required !== undefined) {
        yamlLines.push(`    required: ${input.required}`);
      }
    });
  }

  // Outputs
  if (metadata.outputs.length > 0) {
    yamlLines.push('outputs:');
    metadata.outputs.forEach(output => {
      yamlLines.push(`  - name: ${output.name}`);
      yamlLines.push(`    type: ${output.type}`);
      yamlLines.push(`    description: ${output.description}`);
    });
  }

  yamlLines.push('---');

  const markdown = [
    yamlLines.join('\n'),
    '',
    `# ${metadata.name}`,
    '',
    metadata.description,
    '',
    '## Code',
    '',
    '```python',
    code,
    '```',
  ];

  if (additionalMarkdown) {
    markdown.push('', additionalMarkdown);
  }

  return markdown.join('\n');
}
