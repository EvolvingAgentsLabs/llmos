/**
 * Agent Compiler
 *
 * Compiles markdown agent definitions into structured formats optimized
 * for different LLM models. This enables agents to work effectively
 * across Claude, Gemini, Llama, and other models by adapting the
 * instruction format to each model's strengths.
 *
 * Key transformations:
 * - Markdown → Structured system prompts (simplified, explicit)
 * - Complex instructions → Step-by-step procedures
 * - Implicit tool usage → Explicit tool definitions
 * - Free-form output → Structured response schemas
 */

import { AgentFrontmatter, LoadedAgent } from './agent-loader';
import {
  ExecutionStrategyType,
  ExecutionStrategyConfig,
  getExecutionStrategyConfig,
  getModelCapabilities,
  ModelCapabilities,
} from './model-capabilities';
import { MCPToolDefinition } from './mcp-tools';

// =============================================================================
// Compiled Agent Types
// =============================================================================

export interface CompiledAgent {
  // Metadata from original agent
  id: string;
  name: string;
  type: AgentFrontmatter['type'];
  originalPath: string;
  compiledAt: string;
  targetModel: string;
  strategy: ExecutionStrategyType;

  // Compiled prompts
  systemPrompt: string;           // Optimized for target model
  agentPrompt: string;            // Task-specific instructions
  responseSchema?: ResponseSchema; // Expected response format

  // Tool bindings
  tools: CompiledToolBinding[];

  // Capabilities extracted from markdown
  capabilities: string[];

  // Context management
  contextConfig: ContextConfig;

  // Execution metadata
  maxIterations: number;
  timeoutMs: number;
}

export interface CompiledToolBinding {
  name: string;
  description: string;
  parameters: Record<string, ParameterDefinition>;
  required: string[];
  exampleCall?: string;
}

export interface ParameterDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  default?: any;
}

export interface ResponseSchema {
  type: 'json' | 'text' | 'structured';
  schema?: Record<string, any>;
  examples?: string[];
}

export interface ContextConfig {
  maxTokens: number;
  summarizationThreshold: number;
  includeHistory: boolean;
  historyMessageLimit: number;
}

// =============================================================================
// Agent Compiler Class
// =============================================================================

export class AgentCompiler {
  private targetModel: string;
  private capabilities: ModelCapabilities;
  private strategyConfig: ExecutionStrategyConfig;

  constructor(targetModel: string) {
    this.targetModel = targetModel;
    this.capabilities = getModelCapabilities(targetModel);
    this.strategyConfig = getExecutionStrategyConfig(targetModel);
  }

  /**
   * Compile a loaded markdown agent to structured format
   */
  compile(agent: LoadedAgent, availableTools: MCPToolDefinition[] = []): CompiledAgent {
    const strategy = this.strategyConfig.type;

    // Extract sections from markdown
    const sections = this.parseMarkdownSections(agent.systemPrompt);

    // Build compiled agent based on strategy
    const compiledAgent: CompiledAgent = {
      id: agent.frontmatter.id,
      name: agent.frontmatter.name,
      type: agent.frontmatter.type,
      originalPath: agent.filePath,
      compiledAt: new Date().toISOString(),
      targetModel: this.targetModel,
      strategy,

      systemPrompt: this.compileSystemPrompt(agent, sections, strategy),
      agentPrompt: this.compileAgentPrompt(agent, sections, strategy),
      responseSchema: this.buildResponseSchema(agent, strategy),

      tools: this.compileToolBindings(agent, availableTools, strategy),

      capabilities: agent.frontmatter.capabilities || [],

      contextConfig: {
        maxTokens: this.strategyConfig.maxContextTokens,
        summarizationThreshold: this.strategyConfig.maxContextTokens * 0.8,
        includeHistory: true,
        historyMessageLimit: strategy === 'simple' ? 5 : 10,
      },

      maxIterations: agent.frontmatter.maxIterations || 15,
      timeoutMs: 300000,
    };

    return compiledAgent;
  }

  /**
   * Parse markdown content into sections
   */
  private parseMarkdownSections(content: string): Map<string, string> {
    const sections = new Map<string, string>();
    const lines = content.split('\n');

    let currentSection = 'introduction';
    let currentContent: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^#+\s+(.+)$/);

      if (headerMatch) {
        // Save previous section
        if (currentContent.length > 0) {
          sections.set(currentSection, currentContent.join('\n').trim());
        }

        // Start new section
        currentSection = headerMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '_');
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentContent.length > 0) {
      sections.set(currentSection, currentContent.join('\n').trim());
    }

    return sections;
  }

  /**
   * Compile system prompt based on strategy
   */
  private compileSystemPrompt(
    agent: LoadedAgent,
    sections: Map<string, string>,
    strategy: ExecutionStrategyType
  ): string {
    switch (strategy) {
      case 'markdown':
        // For Claude, use original with minimal modifications
        return agent.systemPrompt;

      case 'hybrid':
        // Simplify but keep markdown structure
        return this.simplifyMarkdown(agent.systemPrompt);

      case 'compiled':
        // Convert to structured, explicit format
        return this.buildStructuredPrompt(agent, sections);

      case 'simple':
        // Minimal, clear instructions for smaller models
        return this.buildSimplePrompt(agent, sections);

      default:
        return agent.systemPrompt;
    }
  }

  /**
   * Compile agent-specific task prompt
   */
  private compileAgentPrompt(
    agent: LoadedAgent,
    sections: Map<string, string>,
    strategy: ExecutionStrategyType
  ): string {
    const taskSection = sections.get('your_specific_task')
      || sections.get('task')
      || sections.get('your_primary_directive')
      || '';

    if (strategy === 'simple' || strategy === 'compiled') {
      // Make instructions more explicit
      return this.makeExplicit(taskSection, agent);
    }

    return taskSection;
  }

  /**
   * Build structured prompt for non-Claude models
   */
  private buildStructuredPrompt(
    agent: LoadedAgent,
    sections: Map<string, string>
  ): string {
    const parts: string[] = [];

    // Role definition
    parts.push(`# ROLE: ${agent.frontmatter.name}`);
    parts.push(`TYPE: ${agent.frontmatter.type}`);
    parts.push(`DESCRIPTION: ${agent.frontmatter.description}`);
    parts.push('');

    // Capabilities as a list
    if (agent.frontmatter.capabilities?.length) {
      parts.push('# CAPABILITIES');
      agent.frontmatter.capabilities.forEach((cap, i) => {
        parts.push(`${i + 1}. ${cap}`);
      });
      parts.push('');
    }

    // Core instructions - simplified
    parts.push('# CORE INSTRUCTIONS');
    const intro = sections.get('introduction') || '';
    parts.push(this.simplifyText(intro));
    parts.push('');

    // Task execution steps
    const taskContent = sections.get('your_specific_task')
      || sections.get('your_primary_directive')
      || '';
    if (taskContent) {
      parts.push('# TASK EXECUTION');
      parts.push(this.extractSteps(taskContent));
      parts.push('');
    }

    // Output format - make explicit
    parts.push('# OUTPUT FORMAT');
    parts.push(this.buildOutputInstructions(agent, sections));
    parts.push('');

    // Constraints
    const constraints = sections.get('technical_constraints')
      || sections.get('constraints')
      || sections.get('guidelines')
      || '';
    if (constraints) {
      parts.push('# CONSTRAINTS');
      parts.push(this.simplifyText(constraints));
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Build simple prompt for smaller models
   */
  private buildSimplePrompt(
    agent: LoadedAgent,
    sections: Map<string, string>
  ): string {
    const parts: string[] = [];

    // Very concise role
    parts.push(`You are ${agent.frontmatter.name}, a ${agent.frontmatter.type}.`);
    parts.push(`Task: ${agent.frontmatter.description}`);
    parts.push('');

    // Simple numbered instructions
    parts.push('INSTRUCTIONS:');
    parts.push('1. Read the user request carefully');
    parts.push('2. Use available tools when needed');
    parts.push('3. Provide clear, structured responses');
    parts.push('4. Format responses as JSON when requested');
    parts.push('');

    // Capabilities as simple list
    if (agent.frontmatter.capabilities?.length) {
      parts.push('YOUR SKILLS:');
      parts.push(agent.frontmatter.capabilities.slice(0, 5).map(c => `- ${c}`).join('\n'));
      parts.push('');
    }

    // Key constraint
    parts.push('IMPORTANT: Always respond in the requested format.');

    return parts.join('\n');
  }

  /**
   * Simplify markdown content while keeping structure
   */
  private simplifyMarkdown(content: string): string {
    // Remove excessive formatting
    let simplified = content;

    // Remove emoji (often confusing for smaller models)
    simplified = simplified.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');

    // Simplify complex tables
    simplified = simplified.replace(/\|.*\|/g, (match) => {
      // Keep simple tables, remove complex ones
      const columns = match.split('|').filter(c => c.trim());
      if (columns.length <= 4) return match;
      return columns.slice(0, 3).join(' | ');
    });

    // Remove excessive horizontal rules
    simplified = simplified.replace(/---+/g, '---');

    // Simplify code blocks with excessive comments
    simplified = simplified.replace(/```[\s\S]*?```/g, (block) => {
      const lines = block.split('\n');
      const filtered = lines.filter(line =>
        !line.trim().startsWith('//') || lines.indexOf(line) < 5
      );
      return filtered.join('\n');
    });

    return simplified;
  }

  /**
   * Make instructions more explicit for structured execution
   */
  private makeExplicit(content: string, agent: LoadedAgent): string {
    const parts: string[] = [];

    parts.push(`AGENT: ${agent.frontmatter.name}`);
    parts.push(`PURPOSE: ${agent.frontmatter.description}`);
    parts.push('');
    parts.push('EXECUTION STEPS:');

    // Extract or create numbered steps
    const steps = this.extractSteps(content);
    parts.push(steps);

    return parts.join('\n');
  }

  /**
   * Extract numbered steps from content
   */
  private extractSteps(content: string): string {
    // Look for existing numbered lists
    const numberedRegex = /^\d+\.\s+.+$/gm;
    const matches = content.match(numberedRegex);

    if (matches && matches.length >= 3) {
      return matches.join('\n');
    }

    // Extract bullet points and convert to numbers
    const bulletRegex = /^[-*]\s+(.+)$/gm;
    const bullets: string[] = [];
    let match;

    while ((match = bulletRegex.exec(content)) !== null) {
      bullets.push(match[1]);
    }

    if (bullets.length >= 3) {
      return bullets.map((b, i) => `${i + 1}. ${b}`).join('\n');
    }

    // Create generic steps from content
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    return sentences.slice(0, 5).map((s, i) => `${i + 1}. ${s.trim()}`).join('\n');
  }

  /**
   * Simplify text for smaller models
   */
  private simplifyText(content: string): string {
    // Remove markdown formatting
    let text = content
      .replace(/#+\s+/g, '')       // Headers
      .replace(/\*\*(.+?)\*\*/g, '$1') // Bold
      .replace(/\*(.+?)\*/g, '$1')     // Italic
      .replace(/`(.+?)`/g, '$1')       // Inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Links

    // Remove empty lines
    text = text.split('\n').filter(l => l.trim()).join('\n');

    return text;
  }

  /**
   * Build output format instructions
   */
  private buildOutputInstructions(
    agent: LoadedAgent,
    sections: Map<string, string>
  ): string {
    const responseSection = sections.get('response_format')
      || sections.get('output_format')
      || sections.get('output')
      || '';

    if (responseSection.includes('JSON') || responseSection.includes('json')) {
      return `Respond with valid JSON only. No additional text before or after the JSON.

Example format:
{
  "success": true,
  "result": "your result here",
  "data": {}
}`;
    }

    return `Provide clear, structured responses.
- Use bullet points for lists
- Use headers for sections
- Be concise but complete`;
  }

  /**
   * Build response schema from agent definition
   */
  private buildResponseSchema(
    agent: LoadedAgent,
    strategy: ExecutionStrategyType
  ): ResponseSchema | undefined {
    if (strategy === 'markdown') {
      return undefined; // Claude handles free-form well
    }

    // Look for JSON schema in agent
    const content = agent.systemPrompt.toLowerCase();

    if (content.includes('json') || content.includes('respond with')) {
      return {
        type: 'json',
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            result: { type: 'string' },
            data: { type: 'object' },
          },
        },
        examples: [
          '{"success": true, "result": "Task completed", "data": {}}',
        ],
      };
    }

    return {
      type: 'structured',
      examples: ['Structured response with clear sections'],
    };
  }

  /**
   * Compile tool bindings for the agent
   */
  private compileToolBindings(
    agent: LoadedAgent,
    availableTools: MCPToolDefinition[],
    strategy: ExecutionStrategyType
  ): CompiledToolBinding[] {
    const agentTools = agent.frontmatter.tools || [];
    const bindings: CompiledToolBinding[] = [];

    for (const toolName of agentTools) {
      const mcpTool = availableTools.find(t => t.name === toolName);

      if (mcpTool) {
        bindings.push(this.compileToolFromMCP(mcpTool, strategy));
      } else {
        // Create a placeholder binding
        bindings.push({
          name: toolName,
          description: `Tool: ${toolName}`,
          parameters: {},
          required: [],
        });
      }
    }

    return bindings;
  }

  /**
   * Compile an MCP tool to binding format
   */
  private compileToolFromMCP(
    tool: MCPToolDefinition,
    strategy: ExecutionStrategyType
  ): CompiledToolBinding {
    const parameters: Record<string, ParameterDefinition> = {};
    const props = tool.inputSchema.properties || {};

    for (const [name, prop] of Object.entries(props)) {
      const propDef = prop as any;
      parameters[name] = {
        type: propDef.type || 'string',
        description: propDef.description || name,
        enum: propDef.enum,
        default: propDef.default,
      };
    }

    const binding: CompiledToolBinding = {
      name: tool.name,
      description: tool.description,
      parameters,
      required: tool.inputSchema.required || [],
    };

    // Add example for non-markdown strategies
    if (strategy !== 'markdown') {
      binding.exampleCall = this.generateToolExample(tool);
    }

    return binding;
  }

  /**
   * Generate an example tool call
   */
  private generateToolExample(tool: MCPToolDefinition): string {
    const args: Record<string, any> = {};
    const props = tool.inputSchema.properties || {};

    for (const [name, prop] of Object.entries(props)) {
      const propDef = prop as any;
      if (propDef.type === 'string') {
        args[name] = propDef.enum?.[0] || `<${name}>`;
      } else if (propDef.type === 'number') {
        args[name] = propDef.default || 0;
      } else if (propDef.type === 'boolean') {
        args[name] = propDef.default || true;
      }
    }

    return JSON.stringify({ tool: tool.name, arguments: args }, null, 2);
  }
}

// =============================================================================
// Compiled Agent Executor
// =============================================================================

export interface CompiledExecutionContext {
  agent: CompiledAgent;
  task: string;
  context?: Record<string, any>;
  messageHistory?: Array<{ role: string; content: string }>;
}

export interface CompiledExecutionResult {
  success: boolean;
  response: string;
  parsed?: any;
  toolCalls?: Array<{ tool: string; args: any; result: any }>;
  tokensUsed?: number;
  executionTime: number;
}

/**
 * Build messages for compiled agent execution
 */
export function buildCompiledMessages(
  ctx: CompiledExecutionContext
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  // System message
  messages.push({
    role: 'system',
    content: ctx.agent.systemPrompt,
  });

  // Include relevant history
  if (ctx.messageHistory && ctx.agent.contextConfig.includeHistory) {
    const limit = ctx.agent.contextConfig.historyMessageLimit;
    const recentHistory = ctx.messageHistory.slice(-limit);

    for (const msg of recentHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }
  }

  // Current task with context
  let userMessage = ctx.task;

  if (ctx.context && Object.keys(ctx.context).length > 0) {
    userMessage = `CONTEXT:\n${JSON.stringify(ctx.context, null, 2)}\n\nTASK:\n${ctx.task}`;
  }

  // Add agent prompt if available
  if (ctx.agent.agentPrompt) {
    userMessage = `${ctx.agent.agentPrompt}\n\n${userMessage}`;
  }

  messages.push({
    role: 'user',
    content: userMessage,
  });

  return messages;
}

/**
 * Parse response from compiled agent
 */
export function parseCompiledResponse(
  response: string,
  schema?: ResponseSchema
): { success: boolean; parsed?: any; error?: string } {
  if (!schema || schema.type === 'text') {
    return { success: true, parsed: response };
  }

  if (schema.type === 'json') {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { success: true, parsed };
      }
      return { success: false, error: 'No JSON found in response' };
    } catch (e) {
      return { success: false, error: `JSON parse error: ${e}` };
    }
  }

  return { success: true, parsed: response };
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an agent compiler for a specific model
 */
export function createAgentCompiler(targetModel: string): AgentCompiler {
  return new AgentCompiler(targetModel);
}

/**
 * Compile an agent for a specific model
 */
export function compileAgentForModel(
  agent: LoadedAgent,
  targetModel: string,
  availableTools: MCPToolDefinition[] = []
): CompiledAgent {
  const compiler = createAgentCompiler(targetModel);
  return compiler.compile(agent, availableTools);
}
