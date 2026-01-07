/**
 * Compiled Agent Runtime
 *
 * Executes compiled agents with model-aware optimizations.
 * This runtime bridges the gap between markdown agents (optimal for Claude)
 * and structured execution (optimal for Gemini, Llama, etc.)
 *
 * Features:
 * - Automatic strategy selection based on model
 * - Tool execution with structured calls
 * - Context window management
 * - Inter-agent messaging
 * - Error recovery and retry logic
 */

import { createLLMClient } from '../llm/client';
import { Message } from '../llm/types';
import { LoadedAgent, loadAgent, invokeAgent, AgentResponse } from './agent-loader';
import {
  CompiledAgent,
  AgentCompiler,
  buildCompiledMessages,
  parseCompiledResponse,
  CompiledExecutionResult,
} from './agent-compiler';
import {
  ExecutionStrategyType,
  ExecutionStrategyConfig,
  getExecutionStrategy,
  getExecutionStrategyConfig,
  getModelCapabilities,
  shouldCompileAgents,
  analyzeTaskComplexity,
} from './model-capabilities';
import {
  AgentMessengerHub,
  AgentIdentity,
  AgentMessage,
  createMessengerHub,
  createAgentIdentity,
  DelegationResult,
} from './agent-messenger';
import { getMCPToolRegistry, MCPToolCall, MCPToolResult } from './mcp-tools';

// =============================================================================
// Runtime Types
// =============================================================================

export interface RuntimeConfig {
  modelId: string;
  forceStrategy?: ExecutionStrategyType;
  maxIterations?: number;
  verbose?: boolean;
  enableMessaging?: boolean;
}

export interface AgentExecutionRequest {
  agentPath: string;
  task: string;
  context?: Record<string, any>;
  parentAgentId?: string;  // For sub-agent tracking
}

export interface AgentExecutionResponse {
  success: boolean;
  response: string;
  parsed?: any;
  toolCalls: ToolCallRecord[];
  filesCreated: string[];
  executionTime: number;
  iterations: number;
  strategy: ExecutionStrategyType;
  memoryUpdated?: boolean;
}

export interface ToolCallRecord {
  tool: string;
  args: Record<string, any>;
  result: MCPToolResult;
  duration: number;
}

export interface RuntimeProgressEvent {
  type: 'loading' | 'compiling' | 'executing' | 'tool_call' | 'tool_result' | 'completed' | 'error';
  message: string;
  details?: any;
  timestamp: number;
}

export type RuntimeProgressCallback = (event: RuntimeProgressEvent) => void;

// =============================================================================
// Compiled Agent Runtime
// =============================================================================

export class CompiledAgentRuntime {
  private config: RuntimeConfig;
  private strategyConfig: ExecutionStrategyConfig;
  private strategy: ExecutionStrategyType;
  private compiler: AgentCompiler;
  private messenger: AgentMessengerHub | null;
  private toolRegistry = getMCPToolRegistry();
  private progressCallback?: RuntimeProgressCallback;

  // Cache for compiled agents
  private compiledAgentCache: Map<string, CompiledAgent> = new Map();

  // Controller identity for messaging
  private controllerIdentity: AgentIdentity = {
    id: 'controller',
    name: 'Controller',
    type: 'controller',
  };

  constructor(config: RuntimeConfig, progressCallback?: RuntimeProgressCallback) {
    this.config = config;
    this.strategy = config.forceStrategy || getExecutionStrategy(config.modelId);
    this.strategyConfig = getExecutionStrategyConfig(config.modelId);
    this.compiler = new AgentCompiler(config.modelId);
    this.messenger = config.enableMessaging ? createMessengerHub(config.modelId) : null;
    this.progressCallback = progressCallback;
  }

  // =============================================================================
  // Public API
  // =============================================================================

  /**
   * Execute an agent with automatic strategy selection
   */
  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResponse> {
    const startTime = performance.now();

    this.emit({
      type: 'loading',
      message: `Loading agent: ${request.agentPath}`,
    });

    // Load the markdown agent
    const agent = await loadAgent(request.agentPath);
    if (!agent) {
      return this.errorResponse(`Agent not found: ${request.agentPath}`, startTime);
    }

    // Analyze task complexity for potential strategy adjustment
    const taskAnalysis = analyzeTaskComplexity(request.task);

    // Decide execution strategy
    if (this.strategy === 'markdown' || this.strategy === 'hybrid') {
      // Use native markdown execution for Claude-like models
      return this.executeMarkdownAgent(agent, request, startTime);
    } else {
      // Compile and execute for other models
      return this.executeCompiledAgent(agent, request, startTime);
    }
  }

  /**
   * Execute multiple agents in parallel
   */
  async executeParallel(
    requests: AgentExecutionRequest[]
  ): Promise<AgentExecutionResponse[]> {
    return Promise.all(requests.map(r => this.execute(r)));
  }

  /**
   * Delegate a task to a sub-agent
   */
  async delegateToAgent(
    fromAgent: AgentIdentity,
    toAgentPath: string,
    task: string,
    context?: Record<string, any>
  ): Promise<DelegationResult> {
    if (!this.messenger) {
      // Without messaging, just execute directly
      const result = await this.execute({
        agentPath: toAgentPath,
        task,
        context,
        parentAgentId: fromAgent.id,
      });

      return {
        success: result.success,
        result: result.parsed || result.response,
        duration: result.executionTime,
      };
    }

    // Load target agent for identity
    const targetAgent = await loadAgent(toAgentPath);
    if (!targetAgent) {
      return {
        success: false,
        error: `Agent not found: ${toAgentPath}`,
        duration: 0,
      };
    }

    const targetIdentity = createAgentIdentity({
      id: targetAgent.frontmatter.id,
      name: targetAgent.frontmatter.name,
    }, 'subagent');

    // Use messaging system for delegation
    return this.messenger.delegateTask(
      fromAgent,
      targetIdentity,
      {
        description: task,
        expectedOutput: 'JSON result or structured response',
      },
      this.config.maxIterations ? this.config.maxIterations * 30000 : 300000
    );
  }

  /**
   * Get the current execution strategy
   */
  getStrategy(): ExecutionStrategyType {
    return this.strategy;
  }

  /**
   * Get model capabilities
   */
  getModelCapabilities() {
    return getModelCapabilities(this.config.modelId);
  }

  /**
   * Clear the compiled agent cache
   */
  clearCache(): void {
    this.compiledAgentCache.clear();
  }

  // =============================================================================
  // Markdown Agent Execution
  // =============================================================================

  private async executeMarkdownAgent(
    agent: LoadedAgent,
    request: AgentExecutionRequest,
    startTime: number
  ): Promise<AgentExecutionResponse> {
    this.emit({
      type: 'executing',
      message: `Executing ${agent.frontmatter.name} with markdown strategy`,
    });

    // Use the existing agent invocation system
    const result = await invokeAgent({
      agent,
      input: request.task,
      context: request.context,
    });

    const executionTime = performance.now() - startTime;

    if (!result.success) {
      return this.errorResponse(result.error || 'Unknown error', startTime);
    }

    this.emit({
      type: 'completed',
      message: `Completed ${agent.frontmatter.name}`,
      details: { executionTime },
    });

    return {
      success: true,
      response: result.output,
      parsed: result.parsed,
      toolCalls: [],  // Markdown agents handle tools internally
      filesCreated: [],
      executionTime,
      iterations: 1,
      strategy: 'markdown',
    };
  }

  // =============================================================================
  // Compiled Agent Execution
  // =============================================================================

  private async executeCompiledAgent(
    agent: LoadedAgent,
    request: AgentExecutionRequest,
    startTime: number
  ): Promise<AgentExecutionResponse> {
    // Check cache or compile
    const cacheKey = `${request.agentPath}:${this.config.modelId}`;
    let compiledAgent = this.compiledAgentCache.get(cacheKey);

    if (!compiledAgent) {
      this.emit({
        type: 'compiling',
        message: `Compiling ${agent.frontmatter.name} for ${this.config.modelId}`,
      });

      const tools = this.toolRegistry.getDefinitions();
      compiledAgent = this.compiler.compile(agent, tools);
      this.compiledAgentCache.set(cacheKey, compiledAgent);
    }

    this.emit({
      type: 'executing',
      message: `Executing ${compiledAgent.name} with ${this.strategy} strategy`,
    });

    // Execute with the compiled agent
    const llmClient = createLLMClient();
    if (!llmClient) {
      return this.errorResponse('LLM client not configured', startTime);
    }

    const toolCalls: ToolCallRecord[] = [];
    const filesCreated: string[] = [];
    let iterations = 0;
    const maxIterations = this.config.maxIterations || compiledAgent.maxIterations;

    // Build initial messages
    const messages = buildCompiledMessages({
      agent: compiledAgent,
      task: request.task,
      context: request.context,
    });

    // Convert to LLM message format
    let llmMessages: Message[] = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Agentic loop
    while (iterations < maxIterations) {
      iterations++;

      try {
        // Get LLM response
        const response = await llmClient.chatDirect(llmMessages);

        // Parse tool calls from response
        const parsedToolCalls = this.parseToolCalls(response, compiledAgent);

        if (parsedToolCalls.length === 0) {
          // No tool calls = task complete
          const executionTime = performance.now() - startTime;

          // Parse final response
          const parseResult = parseCompiledResponse(response, compiledAgent.responseSchema);

          this.emit({
            type: 'completed',
            message: `Completed ${compiledAgent.name}`,
            details: { iterations, toolCalls: toolCalls.length },
          });

          return {
            success: true,
            response,
            parsed: parseResult.parsed,
            toolCalls,
            filesCreated,
            executionTime,
            iterations,
            strategy: this.strategy,
          };
        }

        // Execute tool calls
        llmMessages.push({ role: 'assistant', content: response });
        let toolResultsText = '';

        for (const toolCall of parsedToolCalls) {
          this.emit({
            type: 'tool_call',
            message: `Calling ${toolCall.name}`,
            details: toolCall.arguments,
          });

          const callStart = performance.now();
          const result = await this.toolRegistry.execute(toolCall);
          const duration = performance.now() - callStart;

          toolCalls.push({
            tool: toolCall.name,
            args: toolCall.arguments,
            result,
            duration,
          });

          // Track files
          if (toolCall.name === 'write_file' && toolCall.arguments.path) {
            filesCreated.push(toolCall.arguments.path);
          }

          this.emit({
            type: 'tool_result',
            message: result.isError ? `${toolCall.name} failed` : `${toolCall.name} completed`,
            details: { duration, isError: result.isError },
          });

          // Format result for context
          const resultText = result.content
            .map(c => c.text || (c.data ? '[image data]' : ''))
            .join('\n');

          // Use structured format for compiled agents
          toolResultsText += `\n\n<tool_result name="${toolCall.name}">
${result.isError ? 'ERROR: ' : ''}${resultText}
</tool_result>`;
        }

        // Add tool results
        llmMessages.push({
          role: 'user',
          content: `Tool results:${toolResultsText}\n\nContinue with the next step or provide final result if done. Remember to format your response according to the expected output format.`,
        });

        // Context management - summarize if needed
        if (this.shouldSummarizeContext(llmMessages)) {
          llmMessages = this.summarizeContext(llmMessages, compiledAgent);
        }

      } catch (error: any) {
        // Retry logic for recoverable errors
        if (this.strategyConfig.maxRetries > 0 && iterations < this.strategyConfig.maxRetries) {
          this.emit({
            type: 'error',
            message: `Error in iteration ${iterations}, retrying: ${error.message}`,
          });

          // Add error context for self-healing
          if (this.strategyConfig.selfHealingEnabled) {
            llmMessages.push({
              role: 'user',
              content: `An error occurred: ${error.message}\n\nPlease try a different approach or fix the issue.`,
            });
          }

          continue;
        }

        return this.errorResponse(error.message, startTime);
      }
    }

    // Max iterations reached
    const executionTime = performance.now() - startTime;

    return {
      success: false,
      response: 'Maximum iterations reached without completing the task.',
      toolCalls,
      filesCreated,
      executionTime,
      iterations,
      strategy: this.strategy,
    };
  }

  // =============================================================================
  // Tool Parsing
  // =============================================================================

  private parseToolCalls(response: string, agent: CompiledAgent): MCPToolCall[] {
    const calls: MCPToolCall[] = [];

    // Try multiple formats based on strategy

    // Format 1: ```tool JSON blocks
    const toolBlockRegex = /```tool\s*\n([\s\S]*?)\n```/g;
    let match;

    while ((match = toolBlockRegex.exec(response)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const toolName = data.name || data.tool;
        if (toolName && this.toolRegistry.has(toolName)) {
          calls.push({
            name: toolName,
            arguments: data.arguments || data.inputs || {},
          });
        }
      } catch { }
    }

    if (calls.length > 0) return calls;

    // Format 2: <tool_call> XML tags
    const xmlRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

    while ((match = xmlRegex.exec(response)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const toolName = data.name || data.tool;
        if (toolName && this.toolRegistry.has(toolName)) {
          calls.push({
            name: toolName,
            arguments: data.arguments || {},
          });
        }
      } catch { }
    }

    if (calls.length > 0) return calls;

    // Format 3: Function call syntax (for OpenAI-style)
    const funcRegex = /(\w+)\(([\s\S]*?)\)/g;

    while ((match = funcRegex.exec(response)) !== null) {
      const toolName = match[1];
      if (this.toolRegistry.has(toolName)) {
        try {
          // Try to parse arguments
          const argsText = match[2].trim();
          let args = {};

          if (argsText.startsWith('{')) {
            args = JSON.parse(argsText);
          } else if (argsText.includes('=')) {
            // Key=value format
            const pairs = argsText.split(',');
            for (const pair of pairs) {
              const [key, value] = pair.split('=').map(s => s.trim());
              args[key] = value.replace(/^["']|["']$/g, '');
            }
          }

          calls.push({ name: toolName, arguments: args });
        } catch { }
      }
    }

    return calls;
  }

  // =============================================================================
  // Context Management
  // =============================================================================

  private shouldSummarizeContext(messages: Message[]): boolean {
    // Rough token estimate
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    const estimatedTokens = totalChars / 4;

    return estimatedTokens > this.strategyConfig.maxContextTokens * 0.8;
  }

  private summarizeContext(messages: Message[], agent: CompiledAgent): Message[] {
    // Keep system message and last few exchanges
    const systemMessage = messages[0];
    const recentMessages = messages.slice(-4);

    // Summarize middle messages
    const middleMessages = messages.slice(1, -4);
    const summary = this.createContextSummary(middleMessages);

    return [
      systemMessage,
      {
        role: 'user',
        content: `Previous conversation summary:\n${summary}`,
      },
      ...recentMessages,
    ];
  }

  private createContextSummary(messages: Message[]): string {
    const parts: string[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const role = msg.role;

      // Extract key information
      if (role === 'user') {
        // Look for task descriptions
        const taskMatch = msg.content.match(/Task:\s*(.+?)(?:\n|$)/);
        if (taskMatch) {
          parts.push(`- User task: ${taskMatch[1]}`);
        }
      } else if (role === 'assistant') {
        // Look for tool calls
        const toolMatch = msg.content.match(/```tool[\s\S]*?"name":\s*"(\w+)"[\s\S]*?```/);
        if (toolMatch) {
          parts.push(`- Assistant called: ${toolMatch[1]}`);
        }
      }
    }

    return parts.length > 0 ? parts.join('\n') : 'Multiple exchanges occurred.';
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  private emit(event: Omit<RuntimeProgressEvent, 'timestamp'>): void {
    if (this.progressCallback) {
      this.progressCallback({
        ...event,
        timestamp: Date.now(),
      });
    }
  }

  private errorResponse(error: string, startTime: number): AgentExecutionResponse {
    this.emit({
      type: 'error',
      message: error,
    });

    return {
      success: false,
      response: error,
      toolCalls: [],
      filesCreated: [],
      executionTime: performance.now() - startTime,
      iterations: 0,
      strategy: this.strategy,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a runtime for a specific model
 */
export function createRuntime(
  modelId: string,
  options?: Partial<RuntimeConfig>,
  progressCallback?: RuntimeProgressCallback
): CompiledAgentRuntime {
  return new CompiledAgentRuntime(
    {
      modelId,
      ...options,
    },
    progressCallback
  );
}

/**
 * Execute an agent with automatic model detection
 */
export async function executeAgent(
  agentPath: string,
  task: string,
  modelId: string,
  context?: Record<string, any>
): Promise<AgentExecutionResponse> {
  const runtime = createRuntime(modelId);
  return runtime.execute({ agentPath, task, context });
}

/**
 * Check if an agent should be compiled for a model
 */
export function shouldCompileAgent(modelId: string): boolean {
  return shouldCompileAgents(modelId);
}
