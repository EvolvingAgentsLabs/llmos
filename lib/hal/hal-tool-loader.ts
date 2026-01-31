/**
 * HAL Tool Loader
 *
 * Loads HAL tool definitions from markdown files, enabling:
 * - Easy evaluation by humans and LLMs
 * - Easy editing with any text editor
 * - Easy evolution by the Dreaming Engine
 *
 * Tool definitions are stored in: volumes/system/hal-tools/*.md
 */

import { logger } from '@/lib/debug/logger';

/**
 * Parsed HAL tool definition from markdown
 */
export interface HALToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
  metadata: {
    type: string;
    category: string;
    version: string;
    safetyCritical: boolean;
    requiresCapability?: string;
    priority?: string;
  };
  examples: Array<{
    description: string;
    args: Record<string, unknown>;
  }>;
  evolutionHistory: Array<{
    version: string;
    date: string;
    changes: string;
    source: string;
  }>;
  learningNotes: string;
  rawMarkdown: string;
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterText = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  // Simple YAML parser for our needs
  const frontmatter: Record<string, unknown> = {};
  const lines = frontmatterText.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value: unknown = line.slice(colonIndex + 1).trim();

      // Parse booleans
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      // Parse numbers
      else if (/^\d+(\.\d+)?$/.test(value as string)) {
        value = parseFloat(value as string);
      }

      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

/**
 * Extract description from markdown body (first paragraph after title)
 */
function extractDescription(body: string): string {
  // Find content after the title
  const titleMatch = body.match(/^#[^#].*\n\n([\s\S]*?)(?=\n##|\n```|$)/);
  if (titleMatch) {
    return titleMatch[1].trim().split('\n')[0];
  }
  return '';
}

/**
 * Extract JSON schema from markdown code block
 */
function extractParameterSchema(body: string): HALToolDefinition['parameters'] {
  const schemaMatch = body.match(/## Parameter Schema\s*\n\s*```json\n([\s\S]*?)\n```/);

  if (schemaMatch) {
    try {
      return JSON.parse(schemaMatch[1]);
    } catch {
      logger.warn('hal', 'Failed to parse parameter schema');
    }
  }

  // Default empty schema
  return {
    type: 'object',
    properties: {},
  };
}

/**
 * Extract examples from markdown
 */
function extractExamples(body: string): HALToolDefinition['examples'] {
  const examples: HALToolDefinition['examples'] = [];

  // Find examples section
  const examplesSection = body.match(/## Examples\s*\n([\s\S]*?)(?=\n## |$)/);
  if (!examplesSection) return examples;

  // Find each example (### header followed by code block)
  const exampleRegex = /### (.*?)\n[\s\S]*?```json\n([\s\S]*?)\n```/g;
  let match;

  while ((match = exampleRegex.exec(examplesSection[1])) !== null) {
    try {
      const parsed = JSON.parse(match[2]);
      examples.push({
        description: match[1].trim(),
        args: parsed.args || {},
      });
    } catch {
      // Skip malformed examples
    }
  }

  return examples;
}

/**
 * Extract evolution history from markdown table
 */
function extractEvolutionHistory(body: string): HALToolDefinition['evolutionHistory'] {
  const history: HALToolDefinition['evolutionHistory'] = [];

  const historySection = body.match(/## Evolution History\s*\n([\s\S]*?)(?=\n## |$)/);
  if (!historySection) return history;

  // Parse table rows
  const rows = historySection[1].match(/\| (\d+\.\d+\.\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/g);
  if (!rows) return history;

  for (const row of rows) {
    const cells = row.split('|').filter(c => c.trim());
    if (cells.length >= 4) {
      history.push({
        version: cells[0].trim(),
        date: cells[1].trim(),
        changes: cells[2].trim(),
        source: cells[3].trim(),
      });
    }
  }

  return history;
}

/**
 * Extract learning notes from HTML comment
 */
function extractLearningNotes(body: string): string {
  const notesMatch = body.match(/## Learning Notes\s*\n<!--\s*([\s\S]*?)-->/);
  return notesMatch ? notesMatch[1].trim() : '';
}

/**
 * Parse a single HAL tool markdown file
 */
export function parseHALToolMarkdown(content: string): HALToolDefinition {
  const { frontmatter, body } = parseFrontmatter(content);

  return {
    name: (frontmatter.name as string) || 'unknown',
    description: extractDescription(body),
    parameters: extractParameterSchema(body),
    metadata: {
      type: (frontmatter.type as string) || 'hal_tool',
      category: (frontmatter.category as string) || 'unknown',
      version: (frontmatter.version as string) || '1.0.0',
      safetyCritical: (frontmatter.safety_critical as boolean) || false,
      requiresCapability: frontmatter.requires_capability as string | undefined,
      priority: frontmatter.priority as string | undefined,
    },
    examples: extractExamples(body),
    evolutionHistory: extractEvolutionHistory(body),
    learningNotes: extractLearningNotes(body),
    rawMarkdown: content,
  };
}

/**
 * Convert parsed tool definition to LLM function calling format
 */
export function toFunctionDefinition(tool: HALToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

/**
 * Convert to OpenAI function calling format
 */
export function toOpenAIFormat(tool: HALToolDefinition) {
  return {
    type: 'function' as const,
    function: toFunctionDefinition(tool),
  };
}

/**
 * HAL Tool Registry
 *
 * Manages loaded HAL tool definitions with support for:
 * - Loading from filesystem (server-side)
 * - Loading from bundled content (client-side)
 * - Runtime updates for evolution
 */
export class HALToolRegistry {
  private tools: Map<string, HALToolDefinition> = new Map();
  private loadedFromPath: string | null = null;

  /**
   * Register a tool from markdown content
   */
  registerFromMarkdown(content: string): HALToolDefinition {
    const tool = parseHALToolMarkdown(content);
    this.tools.set(tool.name, tool);
    logger.debug('hal', `Registered HAL tool: ${tool.name}`);
    return tool;
  }

  /**
   * Register multiple tools from markdown contents
   */
  registerMultiple(contents: Record<string, string>): void {
    for (const [filename, content] of Object.entries(contents)) {
      try {
        this.registerFromMarkdown(content);
      } catch (error) {
        logger.error('hal', `Failed to parse ${filename}`, { error });
      }
    }
  }

  /**
   * Get a tool by name
   */
  get(name: string): HALToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): HALToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): HALToolDefinition[] {
    return this.getAll().filter(t => t.metadata.category === category);
  }

  /**
   * Get safety-critical tools
   */
  getSafetyCritical(): HALToolDefinition[] {
    return this.getAll().filter(t => t.metadata.safetyCritical);
  }

  /**
   * Get tools as LLM function definitions
   */
  getFunctionDefinitions() {
    return this.getAll().map(toFunctionDefinition);
  }

  /**
   * Get tools as OpenAI format
   */
  getOpenAIDefinitions() {
    return this.getAll().map(toOpenAIFormat);
  }

  /**
   * Get tools as Gemini format
   */
  getGeminiDefinitions() {
    return {
      functionDeclarations: this.getFunctionDefinitions(),
    };
  }

  /**
   * Update a tool's learning notes (for Dreaming Engine)
   */
  updateLearningNotes(name: string, notes: string): void {
    const tool = this.tools.get(name);
    if (tool) {
      tool.learningNotes = notes;
      logger.info('hal', `Updated learning notes for ${name}`);
    }
  }

  /**
   * Add evolution history entry (for Dreaming Engine)
   */
  addEvolutionEntry(
    name: string,
    entry: { version: string; date: string; changes: string; source: string }
  ): void {
    const tool = this.tools.get(name);
    if (tool) {
      tool.evolutionHistory.push(entry);
      logger.info('hal', `Added evolution entry for ${name}`, entry);
    }
  }

  /**
   * Export tool back to markdown format
   */
  exportToMarkdown(name: string): string | null {
    const tool = this.tools.get(name);
    if (!tool) return null;

    // For now, return the raw markdown with updated learning notes
    // In production, you'd regenerate the full markdown
    let markdown = tool.rawMarkdown;

    // Update learning notes section
    if (tool.learningNotes) {
      markdown = markdown.replace(
        /## Learning Notes\s*\n<!--[\s\S]*?-->/,
        `## Learning Notes\n<!--\n${tool.learningNotes}\n-->`
      );
    }

    return markdown;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
    this.loadedFromPath = null;
  }
}

// Global registry instance
let globalRegistry: HALToolRegistry | null = null;

/**
 * Get the global HAL tool registry
 */
export function getHALToolRegistry(): HALToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new HALToolRegistry();
  }
  return globalRegistry;
}

/**
 * Create a new HAL tool registry
 */
export function createHALToolRegistry(): HALToolRegistry {
  return new HALToolRegistry();
}

/**
 * Bundled HAL tool definitions for client-side use
 * This will be populated at build time or runtime
 */
export const BUNDLED_HAL_TOOLS: Record<string, string> = {};

/**
 * Initialize the global registry with bundled tools
 */
export function initializeHALTools(tools: Record<string, string>): void {
  const registry = getHALToolRegistry();
  registry.clear();
  registry.registerMultiple(tools);
  logger.info('hal', `Initialized ${registry.getAll().length} HAL tools`);
}
