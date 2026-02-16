/**
 * MCP-Compatible Tool Definitions
 *
 * Implements Model Context Protocol (MCP) standard for tool definitions.
 * This enables interoperability with Claude Desktop, ChatGPT, VS Code Copilot,
 * and other MCP-compatible clients.
 *
 * Reference: https://modelcontextprotocol.io/docs/concepts/tools
 */

import { getVFS } from '../virtual-fs';
// Python execution removed (pyodide cleanup)
import { getLLMPatternMatcher, QueryMemoryOptions } from './llm-pattern-matcher';

// =============================================================================
// MCP Tool Schema Types (following MCP specification)
// =============================================================================

export interface MCPToolInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
    default?: any;
  }>;
  required?: string[];
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// =============================================================================
// Tool Executor Interface
// =============================================================================

export type ToolExecutor = (args: Record<string, any>) => Promise<MCPToolResult>;

export interface RegisteredTool {
  definition: MCPToolDefinition;
  execute: ToolExecutor;
}

// =============================================================================
// MCP Tool Registry
// =============================================================================

class MCPToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  register(definition: MCPToolDefinition, executor: ToolExecutor): void {
    this.tools.set(definition.name, { definition, execute: executor });
  }

  getDefinitions(): MCPToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  async execute(call: MCPToolCall): Promise<MCPToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${call.name}` }],
        isError: true
      };
    }

    try {
      return await tool.execute(call.arguments);
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Tool error: ${error.message}` }],
        isError: true
      };
    }
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }
}

// =============================================================================
// Core Tool Definitions (MCP Format)
// =============================================================================

export const READ_FILE_TOOL: MCPToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file from the virtual file system or system directory. Use this to understand existing code, configuration, or data before making changes.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative file path (e.g., "projects/my_app/main.py" or "system/agents/researcher.md")'
      }
    },
    required: ['path']
  }
};

export const WRITE_FILE_TOOL: MCPToolDefinition = {
  name: 'write_file',
  description: 'Create a new file or overwrite an existing file with the provided content. Creates parent directories automatically.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path where content will be written'
      },
      content: {
        type: 'string',
        description: 'The content to write to the file'
      }
    },
    required: ['path', 'content']
  }
};

export const LIST_DIRECTORY_TOOL: MCPToolDefinition = {
  name: 'list_directory',
  description: 'List all files and subdirectories in a directory. Useful for exploring project structure.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list (e.g., "projects" or "projects/my_app/src")'
      }
    },
    required: ['path']
  }
};

export const EXECUTE_PYTHON_TOOL: MCPToolDefinition = {
  name: 'execute_python',
  description: 'Execute Python code in a sandboxed browser runtime (Pyodide). Available libraries: numpy, scipy, matplotlib, pandas, scikit-learn. Returns stdout, stderr, and any generated plots.',
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Python code to execute'
      },
      save_plots_to: {
        type: 'string',
        description: 'Optional project path to save matplotlib plots (e.g., "projects/my_app")'
      }
    },
    required: ['code']
  }
};

export const QUERY_MEMORY_TOOL: MCPToolDefinition = {
  name: 'query_memory',
  description: 'Search the system memory for relevant past experiences, learnings, and patterns. Use this before starting complex tasks to leverage institutional knowledge.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query describing what you\'re looking for (e.g., "How to create FFT visualizations" or "Previous data analysis workflows")'
      },
      memory_type: {
        type: 'string',
        description: 'Type of memory to search',
        enum: ['agent_templates', 'workflow_patterns', 'domain_knowledge', 'skills', 'traces', 'all']
      },
      scope: {
        type: 'string',
        description: 'Search scope: project (current only), global (all projects), similar (matching domains)',
        enum: ['project', 'global', 'similar']
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)'
      },
      min_relevance: {
        type: 'number',
        description: 'Minimum relevance score 0.0-1.0 (default: 0.3)'
      }
    },
    required: ['query']
  }
};

export const ARCHIVE_TRACES_TOOL: MCPToolDefinition = {
  name: 'archive_traces',
  description: 'Archive old consolidated traces to reduce active memory footprint. Traces older than the specified days will be moved to archived state.',
  inputSchema: {
    type: 'object',
    properties: {
      older_than_days: {
        type: 'number',
        description: 'Archive traces older than this many days (default: 7)'
      }
    },
    required: []
  }
};

export const BUILD_TRACE_GRAPH_TOOL: MCPToolDefinition = {
  name: 'build_trace_graph',
  description: 'Build a graph visualization of trace relationships showing parent-child and dependency links between execution traces.',
  inputSchema: {
    type: 'object',
    properties: {
      root_trace_id: {
        type: 'string',
        description: 'Optional root trace ID to start from. If not provided, includes all traces.'
      }
    },
    required: []
  }
};

export const GENERATE_APPLET_TOOL: MCPToolDefinition = {
  name: 'generate_applet',
  description: 'Generate an interactive React applet for the user. Use when a visual/interactive UI would be more effective than text. The applet will be compiled and displayed immediately.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Short descriptive name (e.g., "Budget Calculator")'
      },
      description: {
        type: 'string',
        description: 'What the applet does'
      },
      code: {
        type: 'string',
        description: 'React component code using function declaration syntax. Must define "function Applet() { ... }". Available: useState, useEffect, Tailwind CSS.'
      }
    },
    required: ['name', 'code']
  }
};

export const DELEGATE_TO_AGENT_TOOL: MCPToolDefinition = {
  name: 'delegate_to_agent',
  description: 'Delegate a specialized task to a sub-agent. Use when a task requires domain expertise (e.g., quantum computing, signal processing, data analysis).',
  inputSchema: {
    type: 'object',
    properties: {
      agent_name: {
        type: 'string',
        description: 'Name or path of the agent to invoke'
      },
      task: {
        type: 'string',
        description: 'Clear description of what the agent should accomplish'
      },
      context: {
        type: 'string',
        description: 'Additional context or data the agent needs'
      }
    },
    required: ['agent_name', 'task']
  }
};

// =============================================================================
// Tool Executors
// =============================================================================

async function executeReadFile(args: Record<string, any>): Promise<MCPToolResult> {
  const { path } = args;

  if (!path || typeof path !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: path is required' }],
      isError: true
    };
  }

  try {
    // Handle system files (from public/system/)
    if (path.startsWith('/system/') || path.startsWith('system/')) {
      const systemPath = path.replace(/^\//, '');
      const response = await fetch(`/${systemPath}`);
      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `File not found: ${path}` }],
          isError: true
        };
      }
      const content = await response.text();
      return {
        content: [{
          type: 'text',
          text: `File: ${path}\nSize: ${content.length} bytes\n\n${content}`
        }]
      };
    }

    // Handle VFS files
    const vfs = getVFS();
    const file = vfs.readFile(path);

    if (!file) {
      return {
        content: [{ type: 'text', text: `File not found: ${path}` }],
        isError: true
      };
    }

    return {
      content: [{
        type: 'text',
        text: `File: ${path}\nSize: ${file.size} bytes\nModified: ${file.modified}\n\n${file.content}`
      }]
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error reading file: ${error.message}` }],
      isError: true
    };
  }
}

async function executeWriteFile(args: Record<string, any>): Promise<MCPToolResult> {
  const { path, content } = args;

  if (!path || !content) {
    return {
      content: [{ type: 'text', text: 'Error: path and content are required' }],
      isError: true
    };
  }

  try {
    const vfs = getVFS();
    vfs.writeFile(path, content);

    return {
      content: [{
        type: 'text',
        text: `Successfully wrote ${content.length} bytes to ${path}`
      }]
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error writing file: ${error.message}` }],
      isError: true
    };
  }
}

async function executeListDirectory(args: Record<string, any>): Promise<MCPToolResult> {
  const { path } = args;

  try {
    const vfs = getVFS();
    const { files, directories } = vfs.listDirectory(path || '');

    let output = `Directory: ${path || '/'}\n\n`;

    if (directories.length > 0) {
      output += `Directories:\n${directories.map(d => `  📁 ${d}`).join('\n')}\n\n`;
    }

    if (files.length > 0) {
      output += `Files:\n${files.map(f => `  📄 ${f.path} (${f.size} bytes)`).join('\n')}`;
    }

    if (directories.length === 0 && files.length === 0) {
      output += '(empty directory)';
    }

    return { content: [{ type: 'text', text: output }] };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error listing directory: ${error.message}` }],
      isError: true
    };
  }
}

async function executeExecutePython(args: Record<string, any>): Promise<MCPToolResult> {
  const { code, save_plots_to } = args;

  if (!code) {
    return {
      content: [{ type: 'text', text: 'Error: code is required' }],
      isError: true
    };
  }

  try {
    const result = { success: false, error: 'Python execution not available (pyodide removed)', executionTime: 0, stdout: '', stderr: '', output: null, images: [] as string[] };

    const contents: MCPToolResult['content'] = [];

    // Add text output
    let textOutput = `Execution ${result.success ? 'succeeded' : 'failed'} in ${result.executionTime}ms\n\n`;

    if (result.stdout) {
      textOutput += `stdout:\n${result.stdout}\n`;
    }

    if (result.stderr) {
      textOutput += `stderr:\n${result.stderr}\n`;
    }

    if (result.error) {
      textOutput += `error:\n${result.error}\n`;
    }

    contents.push({ type: 'text', text: textOutput });

    // Add images
    if (result.images && result.images.length > 0) {
      for (const base64Image of result.images) {
        contents.push({
          type: 'image',
          data: base64Image,
          mimeType: 'image/png'
        });
      }

      // Save to VFS if path provided
      if (save_plots_to) {
        const vfs = getVFS();
        for (let i = 0; i < result.images.length; i++) {
          const imagePath = `${save_plots_to}/output/visualizations/plot_${Date.now()}_${i + 1}.png`;
          vfs.writeFile(imagePath, JSON.stringify({
            format: 'png',
            base64: result.images[i],
            createdAt: new Date().toISOString()
          }));
        }
      }
    }

    return { content: contents, isError: !result.success };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Execution error: ${error.message}` }],
      isError: true
    };
  }
}

async function executeQueryMemory(args: Record<string, any>): Promise<MCPToolResult> {
  const { query, memory_type, scope, limit = 10, min_relevance = 0.3 } = args;

  if (!query) {
    return {
      content: [{ type: 'text', text: 'Error: query is required' }],
      isError: true
    };
  }

  try {
    // Use the enhanced pattern matcher for structured queries
    const patternMatcher = getLLMPatternMatcher();

    const options: QueryMemoryOptions = {
      memoryType: memory_type || 'all',
      scope: scope || 'global',
      limit,
      minRelevance: min_relevance
    };

    const result = await patternMatcher.queryMemory(query, options);

    if (result.matches.length === 0) {
      // Fallback to file-based search
      const vfs = getVFS();
      const memoryPath = 'system/memory_log.md';

      let memoryContent = '';
      try {
        memoryContent = vfs.readFileContent(memoryPath) || '';
      } catch {
        try {
          const response = await fetch('/system/memory_log.md');
          if (response.ok) {
            memoryContent = await response.text();
          }
        } catch {
          memoryContent = '';
        }
      }

      if (!memoryContent) {
        return {
          content: [{ type: 'text', text: `No relevant memories found for: "${query}"\n\nThe system is still learning.` }]
        };
      }

      // Parse memory entries from file
      const entries = memoryContent.split('---').filter(e => e.trim());
      const queryTerms = query.toLowerCase().split(/\s+/);
      const scored = entries.map(entry => {
        const lower = entry.toLowerCase();
        const score = queryTerms.reduce((sum: number, term: string) =>
          sum + (lower.includes(term) ? 1 : 0), 0);
        return { entry, score };
      });

      const relevant = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.entry.trim());

      if (relevant.length === 0) {
        return {
          content: [{ type: 'text', text: `No relevant memories found for: "${query}"` }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Found ${relevant.length} relevant memories (file search):\n\n${relevant.join('\n\n---\n\n')}`
        }]
      };
    }

    // Format structured results
    let output = `# Memory Query Results\n\n`;
    output += `**Query:** "${query}"\n`;
    output += `**Scope:** ${options.scope}\n`;
    output += `**Type:** ${options.memoryType}\n`;
    output += `**Search Time:** ${result.searchTimeMs}ms\n\n`;
    output += `${result.querySummary}\n\n`;

    for (const match of result.matches) {
      output += `---\n\n`;
      output += `### ${match.type} (relevance: ${(match.relevance * 100).toFixed(0)}%)\n`;
      output += `**Path:** ${match.path}\n`;
      output += `**Excerpt:** ${match.excerpt}\n`;
      if (match.metadata.agentName) {
        output += `**Agent:** ${match.metadata.agentName}\n`;
      }
      if (match.metadata.toolsUsed?.length > 0) {
        output += `**Tools:** ${match.metadata.toolsUsed.join(', ')}\n`;
      }
      output += `**Success:** ${match.metadata.success ? 'Yes' : 'No'}\n`;
      output += `**Timestamp:** ${match.metadata.timestamp}\n`;
      output += `**State:** ${match.metadata.lifecycleState || 'active'}\n\n`;
    }

    return {
      content: [{ type: 'text', text: output }]
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error querying memory: ${error.message}` }],
      isError: true
    };
  }
}

async function executeArchiveTraces(args: Record<string, any>): Promise<MCPToolResult> {
  const { older_than_days = 7 } = args;

  try {
    const patternMatcher = getLLMPatternMatcher();
    const archivedCount = patternMatcher.archiveOldTraces(older_than_days);

    const activeTraces = patternMatcher.getTracesByLifecycle('active');
    const consolidatedTraces = patternMatcher.getTracesByLifecycle('consolidated');
    const archivedTraces = patternMatcher.getTracesByLifecycle('archived');

    let output = `# Trace Archival Report\n\n`;
    output += `**Archived:** ${archivedCount} traces older than ${older_than_days} days\n\n`;
    output += `## Current State\n`;
    output += `- Active: ${activeTraces.length} traces\n`;
    output += `- Consolidated: ${consolidatedTraces.length} traces\n`;
    output += `- Archived: ${archivedTraces.length} traces\n`;

    return {
      content: [{ type: 'text', text: output }]
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error archiving traces: ${error.message}` }],
      isError: true
    };
  }
}

async function executeBuildTraceGraph(args: Record<string, any>): Promise<MCPToolResult> {
  const { root_trace_id } = args;

  try {
    const patternMatcher = getLLMPatternMatcher();
    const graph = patternMatcher.buildTraceGraph(root_trace_id);

    let output = `# Trace Execution Graph\n\n`;
    output += `**Nodes:** ${graph.nodes.size} traces\n`;
    output += `**Edges:** ${graph.edges.length} links\n`;
    if (graph.rootTraceId) {
      output += `**Root:** ${graph.rootTraceId}\n`;
    }
    output += `\n`;

    // Build visual representation
    output += `## Trace Hierarchy\n\n`;
    output += '```\n';

    // Find root nodes (no parent)
    const rootNodes: string[] = [];
    for (const [id, trace] of graph.nodes) {
      if (!trace.parentTraceId) {
        rootNodes.push(id);
      }
    }

    const printNode = (nodeId: string, indent: number = 0): string => {
      const trace = graph.nodes.get(nodeId);
      if (!trace) return '';

      const prefix = '  '.repeat(indent) + (indent > 0 ? '├── ' : '');
      let result = `${prefix}[${trace.success ? '✓' : '✗'}] ${trace.id.substring(0, 20)}...\n`;
      result += `${' '.repeat(indent * 2 + 4)}Goal: ${trace.goal.substring(0, 50)}...\n`;

      // Find children
      const children = graph.edges
        .filter(e => e.from === nodeId && e.type === 'hierarchical')
        .map(e => e.to);

      for (const childId of children) {
        result += printNode(childId, indent + 1);
      }

      return result;
    };

    for (const rootId of rootNodes) {
      output += printNode(rootId);
      output += '\n';
    }
    output += '```\n\n';

    // Show dependency edges
    const depEdges = graph.edges.filter(e => e.type === 'dependency');
    if (depEdges.length > 0) {
      output += `## Dependencies\n\n`;
      for (const edge of depEdges) {
        output += `- ${edge.from.substring(0, 15)}... → ${edge.to.substring(0, 15)}...`;
        if (edge.artifact) {
          output += ` (via ${edge.artifact})`;
        }
        output += '\n';
      }
    }

    // Execution order
    const order = patternMatcher.getExecutionOrder(root_trace_id);
    output += `\n## Execution Order\n\n`;
    order.forEach((id, i) => {
      const trace = graph.nodes.get(id);
      output += `${i + 1}. ${id.substring(0, 20)}... - ${trace?.goal.substring(0, 40) || 'Unknown'}...\n`;
    });

    return {
      content: [{ type: 'text', text: output }]
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error building trace graph: ${error.message}` }],
      isError: true
    };
  }
}

// =============================================================================
// Create and Export Registry
// =============================================================================

export function createMCPToolRegistry(): MCPToolRegistry {
  const registry = new MCPToolRegistry();

  // Register all core tools
  registry.register(READ_FILE_TOOL, executeReadFile);
  registry.register(WRITE_FILE_TOOL, executeWriteFile);
  registry.register(LIST_DIRECTORY_TOOL, executeListDirectory);
  registry.register(EXECUTE_PYTHON_TOOL, executeExecutePython);
  registry.register(QUERY_MEMORY_TOOL, executeQueryMemory);

  // Register new tools from llmunix gap analysis
  registry.register(ARCHIVE_TRACES_TOOL, executeArchiveTraces);
  registry.register(BUILD_TRACE_GRAPH_TOOL, executeBuildTraceGraph);

  return registry;
}

// Singleton registry
let globalRegistry: MCPToolRegistry | null = null;

export function getMCPToolRegistry(): MCPToolRegistry {
  if (!globalRegistry) {
    globalRegistry = createMCPToolRegistry();
  }
  return globalRegistry;
}

// =============================================================================
// Convert to OpenAI/Anthropic Tool Format (for API compatibility)
// =============================================================================

export function toOpenAITools(definitions: MCPToolDefinition[]): any[] {
  return definitions.map(def => ({
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: def.inputSchema
    }
  }));
}

export function toAnthropicTools(definitions: MCPToolDefinition[]): any[] {
  return definitions.map(def => ({
    name: def.name,
    description: def.description,
    input_schema: def.inputSchema
  }));
}
