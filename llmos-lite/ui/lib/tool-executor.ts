/**
 * Tool Executor - Execute tools defined in markdown with WebAssembly
 *
 * Tools can be Python or JavaScript code that runs safely in the browser
 */

import { executePython, executeJavaScript, ExecutionResult, ExecutionOptions } from './pyodide-runtime';

export interface Tool {
  id: string;
  name: string;
  description: string;
  language: 'python' | 'javascript';
  code: string;
  inputs?: ToolInput[];
  outputs?: ToolOutput[];
  packages?: string[]; // Python packages required
  metadata?: Record<string, any>;
}

export interface ToolInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  default?: any;
}

export interface ToolOutput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
}

export interface ToolExecutionResult extends ExecutionResult {
  toolId: string;
  toolName: string;
  inputs: Record<string, any>;
}

/**
 * Parse tool from markdown content
 *
 * Expected format:
 * ```
 * ---
 * name: Tool Name
 * description: Tool description
 * language: python
 * inputs:
 *   - name: input1
 *     type: string
 *     required: true
 * outputs:
 *   - name: result
 *     type: number
 * packages:
 *   - numpy
 *   - pandas
 * ---
 *
 * # Tool: Tool Name
 *
 * Description here...
 *
 * ## Code
 *
 * ```python
 * def main(input1):
 *     # Tool code here
 *     return result
 * ```
 * ```
 */
export function parseToolFromMarkdown(markdown: string): Tool | null {
  try {
    // Extract frontmatter
    const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      console.warn('No frontmatter found in tool markdown');
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const content = markdown.slice(frontmatterMatch[0].length);

    // Parse frontmatter (simple YAML parser)
    const metadata: any = {};
    const lines = frontmatter.split('\n');
    let currentKey = '';
    let currentArray: any[] = [];

    for (const line of lines) {
      if (line.trim().startsWith('-')) {
        // Array item
        const item = line.trim().slice(1).trim();
        if (item.includes(':')) {
          // Object in array
          const [key, value] = item.split(':').map(s => s.trim());
          if (currentArray.length === 0 || typeof currentArray[currentArray.length - 1] !== 'object') {
            currentArray.push({});
          }
          currentArray[currentArray.length - 1][key] = value;
        } else {
          // Simple value
          currentArray.push(item);
        }
      } else if (line.includes(':')) {
        // Key-value pair
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        currentKey = key.trim();

        if (value) {
          metadata[currentKey] = value;
        } else {
          // Start of array
          currentArray = [];
          metadata[currentKey] = currentArray;
        }
      }
    }

    // Extract code block
    const codeBlockMatch = content.match(/```(?:python|javascript|js)\n([\s\S]*?)\n```/);
    if (!codeBlockMatch) {
      console.warn('No code block found in tool markdown');
      return null;
    }

    const code = codeBlockMatch[1];
    const language = metadata.language === 'javascript' || metadata.language === 'js' ? 'javascript' : 'python';

    return {
      id: metadata.id || metadata.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
      name: metadata.name || 'Unknown Tool',
      description: metadata.description || '',
      language,
      code,
      inputs: metadata.inputs || [],
      outputs: metadata.outputs || [],
      packages: metadata.packages || [],
      metadata,
    };
  } catch (error) {
    console.error('Failed to parse tool markdown:', error);
    return null;
  }
}

/**
 * Execute a tool with given inputs
 */
export async function executeTool(
  tool: Tool,
  inputs: Record<string, any>,
  options: ExecutionOptions = {}
): Promise<ToolExecutionResult> {
  // Validate inputs
  const validationError = validateToolInputs(tool, inputs);
  if (validationError) {
    return {
      toolId: tool.id,
      toolName: tool.name,
      inputs,
      success: false,
      error: validationError,
      executionTime: 0,
    };
  }

  // Prepare code with input injection
  const wrappedCode = wrapToolCode(tool, inputs);

  // Merge packages from options
  const packages = [...(tool.packages || []), ...(options.packages || [])];

  // Execute based on language
  let result: ExecutionResult;
  if (tool.language === 'python') {
    result = await executePython(wrappedCode, {
      ...options,
      packages,
      globals: inputs,
    });
  } else {
    result = await executeJavaScript(wrappedCode, {
      ...options,
      globals: inputs,
    });
  }

  return {
    ...result,
    toolId: tool.id,
    toolName: tool.name,
    inputs,
  };
}

/**
 * Validate tool inputs against schema
 */
function validateToolInputs(tool: Tool, inputs: Record<string, any>): string | null {
  if (!tool.inputs) return null;

  for (const input of tool.inputs) {
    // Check required inputs
    if (input.required && !(input.name in inputs)) {
      return `Missing required input: ${input.name}`;
    }

    // Check types
    if (input.name in inputs) {
      const value = inputs[input.name];
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (input.type !== actualType && value !== null && value !== undefined) {
        return `Invalid type for ${input.name}: expected ${input.type}, got ${actualType}`;
      }
    }
  }

  return null;
}

/**
 * Wrap tool code with input/output handling
 */
function wrapToolCode(tool: Tool, inputs: Record<string, any>): string {
  if (tool.language === 'python') {
    // Python wrapper
    const inputAssignments = Object.entries(inputs)
      .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
      .join('\n');

    return `
${inputAssignments}

# Tool code
${tool.code}

# Execute main if it exists
if 'main' in dir():
    result = main(${Object.keys(inputs).join(', ')})
else:
    result = None

result
`;
  } else {
    // JavaScript wrapper
    return `
${tool.code}

// Execute main if it exists
if (typeof main === 'function') {
  return await main(${Object.keys(inputs).map(k => k).join(', ')});
}
`;
  }
}

/**
 * Load tools from a volume (GitHub repo)
 */
export async function loadToolsFromVolume(
  volumePath: string
): Promise<Tool[]> {
  // This would integrate with git-service to fetch tool markdown files
  // For now, return empty array
  // TODO: Implement GitHub integration
  return [];
}

/**
 * Create a tool execution context with loaded tools
 */
export class ToolContext {
  private tools: Map<string, Tool> = new Map();

  addTool(tool: Tool): void {
    this.tools.set(tool.id, tool);
  }

  getTool(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  async executeTool(
    toolId: string,
    inputs: Record<string, any>,
    options?: ExecutionOptions
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        toolId,
        toolName: 'Unknown',
        inputs,
        success: false,
        error: `Tool not found: ${toolId}`,
        executionTime: 0,
      };
    }

    return executeTool(tool, inputs, options);
  }

  listTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  clear(): void {
    this.tools.clear();
  }
}
