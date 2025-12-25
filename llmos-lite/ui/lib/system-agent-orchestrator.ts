/**
 * SystemAgent Orchestrator
 *
 * Coordinates the execution of the SystemAgent with tool access
 * Uses WorkflowContextManager for intelligent context management
 */

import { createLLMClient, Message } from './llm-client';
import { executeSystemTool, getSystemTools } from './system-tools';
import { getVFS } from './virtual-fs';
import { WorkflowContextManager, createWorkflowContextManager } from './workflow-context-manager';

export interface SystemAgentResult {
  success: boolean;
  response: string;
  toolCalls: ToolCallResult[];
  filesCreated: string[];
  projectPath?: string;
  error?: string;
  executionTime: number;
  contextStats?: {
    totalTokens: number;
    wasSummarized: boolean;
    summarizationSteps?: number;
  };
}

export interface AgentProgressEvent {
  type: 'thinking' | 'tool-call' | 'memory-query' | 'execution' | 'completed' | 'context-management';
  agent?: string;
  action?: string;
  tool?: string;
  details?: string;
  timestamp: number;
}

export type ProgressCallback = (event: AgentProgressEvent) => void;

export interface ToolCallResult {
  toolId: string;
  toolName: string;
  inputs: Record<string, any>;
  output?: any;
  success: boolean;
  error?: string;
}

// Token management constants
const MAX_TOOL_RESULT_LENGTH = 8000; // Truncate large tool results

/**
 * Truncate text to max length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 100) + '\n\n... [truncated - content too long] ...\n';
}

/**
 * Summarize tool result for context efficiency
 */
function summarizeToolResult(result: any, toolId: string): string {
  const resultStr = JSON.stringify(result, null, 2);

  // Always truncate large results
  if (resultStr.length > MAX_TOOL_RESULT_LENGTH) {
    // For file reads, keep beginning and end
    if (toolId === 'read-file' && result.content) {
      const content = result.content;
      if (content.length > MAX_TOOL_RESULT_LENGTH) {
        const halfLen = Math.floor(MAX_TOOL_RESULT_LENGTH / 2) - 50;
        return JSON.stringify({
          ...result,
          content: content.substring(0, halfLen) +
            '\n\n... [content truncated for context efficiency] ...\n\n' +
            content.substring(content.length - halfLen),
          _truncated: true
        }, null, 2);
      }
    }

    // For Python execution, keep stdout/stderr and truncate
    if (toolId === 'execute-python') {
      return JSON.stringify({
        success: result.success,
        stdout: truncateText(result.stdout || '', 2000),
        stderr: truncateText(result.stderr || '', 1000),
        executionTime: result.executionTime,
        images: result.images?.length ? `[${result.images.length} image(s) generated]` : undefined,
        _truncated: true
      }, null, 2);
    }

    // Generic truncation
    return truncateText(resultStr, MAX_TOOL_RESULT_LENGTH);
  }

  return resultStr;
}

/**
 * SystemAgent Orchestrator
 */
export class SystemAgentOrchestrator {
  private systemPrompt: string;
  private maxIterations: number = 10;
  private progressCallback?: ProgressCallback;
  private contextManager: WorkflowContextManager;

  constructor(systemPrompt: string, progressCallback?: ProgressCallback) {
    this.systemPrompt = systemPrompt;
    this.progressCallback = progressCallback;
    this.contextManager = createWorkflowContextManager();
  }

  private emitProgress(event: Omit<AgentProgressEvent, 'timestamp'>) {
    if (this.progressCallback) {
      this.progressCallback({
        ...event,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Create LLM summarizer function for context management
   */
  private createSummarizer(llmClient: ReturnType<typeof createLLMClient>) {
    return async (prompt: string): Promise<string> => {
      const messages: Message[] = [
        {
          role: 'system',
          content: 'You are a context summarization assistant. Your task is to create concise but comprehensive summaries of workflow context, preserving key information relevant to the user\'s goal.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ];

      return await llmClient!.chatDirect(messages);
    };
  }

  /**
   * Execute the SystemAgent with a user goal
   */
  async execute(userGoal: string): Promise<SystemAgentResult> {
    const startTime = performance.now();
    const toolCalls: ToolCallResult[] = [];
    const filesCreated: string[] = [];
    let projectPath: string | undefined;
    let lastContextResult: { wasSummarized: boolean; summarizationSteps?: number; tokenEstimate: number } | null = null;

    try {
      const llmClient = createLLMClient();
      if (!llmClient) {
        throw new Error('LLM client not configured');
      }

      // Initialize context manager with system prompt and user goal
      const systemPromptWithTools = this.buildSystemPromptWithTools();
      this.contextManager.initialize(systemPromptWithTools, userGoal);

      let iterations = 0;
      let finalResponse = '';

      // Emit initial thinking event
      this.emitProgress({
        type: 'thinking',
        agent: 'SystemAgent',
        action: 'Reading system memory and planning approach',
        details: 'Consulting /system/memory_log.md for similar past tasks',
      });

      // Create summarizer function
      const summarizer = this.createSummarizer(llmClient);

      // Agent loop: LLM → Parse tools → Execute → LLM → ...
      while (iterations < this.maxIterations) {
        iterations++;

        // Emit thinking event
        this.emitProgress({
          type: 'thinking',
          agent: 'SystemAgent',
          action: `Planning step ${iterations}/${this.maxIterations}`,
          details: 'Analyzing context and determining next actions',
        });

        // Build context with iterative summarization if needed
        const currentStep = `Step ${iterations}/${this.maxIterations}: ${iterations === 1 ? 'Initial planning' : 'Continuing workflow'}`;

        const contextResult = await this.contextManager.buildContext(
          currentStep,
          summarizer,
          (step, details) => {
            // Emit context management progress
            this.emitProgress({
              type: 'context-management',
              agent: 'SystemAgent',
              action: this.formatContextAction(step),
              details,
            });
          }
        );

        lastContextResult = contextResult;

        if (contextResult.wasSummarized) {
          console.log(`[SystemAgent] Context summarized: ${contextResult.summarizationSteps} steps, ${Math.round(contextResult.tokenEstimate / 1000)}K tokens`);
        }

        // Call LLM with the managed context
        const llmResponse = await llmClient.chatDirect(contextResult.messages);

        // Parse for tool calls
        const toolCallsInResponse = this.parseToolCalls(llmResponse);

        if (toolCallsInResponse.length === 0) {
          // No tool calls, agent is done
          finalResponse = llmResponse;
          break;
        }

        // Add LLM response to context manager
        this.contextManager.addLLMResponse(llmResponse, iterations);

        // Execute tool calls
        let toolResults = '';
        for (const toolCall of toolCallsInResponse) {
          // Emit tool call event
          this.emitProgress({
            type: 'tool-call',
            agent: 'SystemAgent',
            action: `Calling ${toolCall.toolName}`,
            tool: toolCall.toolId,
            details: this.getToolCallDetails(toolCall),
          });

          try {
            const result = await executeSystemTool(toolCall.toolId, toolCall.inputs);

            // Emit memory-query event if reading system memory
            if (toolCall.toolId === 'read-file' &&
                toolCall.inputs.path &&
                (toolCall.inputs.path.includes('/system/memory_log.md') ||
                 toolCall.inputs.path.includes('system/memory_log.md'))) {
              this.emitProgress({
                type: 'memory-query',
                agent: 'SystemAgent',
                action: 'Consulting system memory for past experiences',
                details: 'Reading /system/memory_log.md to extract relevant learnings',
              });
            }

            // Emit memory-query event if checking existing system agents
            if (toolCall.toolId === 'read-file' &&
                toolCall.inputs.path &&
                (toolCall.inputs.path.includes('/system/agents/') ||
                 toolCall.inputs.path.includes('system/agents/'))) {
              const agentName = toolCall.inputs.path.split('/').pop()?.replace('.md', '') || 'agent';
              this.emitProgress({
                type: 'memory-query',
                agent: 'SystemAgent',
                action: `Checking existing ${agentName} for reuse`,
                details: `Evaluating if ${agentName} can be evolved for this task`,
              });
            }

            // Emit execution event
            this.emitProgress({
              type: 'execution',
              agent: 'SystemAgent',
              action: `${toolCall.toolName} completed successfully`,
              tool: toolCall.toolId,
              details: this.getToolResultSummary(toolCall, result),
            });

            toolCalls.push({
              toolId: toolCall.toolId,
              toolName: toolCall.toolName,
              inputs: toolCall.inputs,
              output: result,
              success: true,
            });

            // Track files created
            if (toolCall.toolId === 'write-file' && toolCall.inputs.path) {
              filesCreated.push(toolCall.inputs.path);

              // Detect project path
              if (!projectPath && toolCall.inputs.path.startsWith('projects/')) {
                const parts = toolCall.inputs.path.split('/');
                if (parts.length >= 2) {
                  projectPath = `projects/${parts[1]}`;
                }
              }
            }

            // Use summarized result to prevent context overflow
            const summarizedResult = summarizeToolResult(result, toolCall.toolId);
            toolResults += `\n\n**Tool: ${toolCall.toolName}**\nSuccess: ✓\nResult: ${summarizedResult}`;

            // Add tool result to context manager
            this.contextManager.addToolResult(toolCall.toolName, toolCall.toolId, summarizedResult);
          } catch (error: any) {
            toolCalls.push({
              toolId: toolCall.toolId,
              toolName: toolCall.toolName,
              inputs: toolCall.inputs,
              success: false,
              error: error.message || String(error),
            });

            const errorResult = `Error: ✗ ${error.message || error}`;
            toolResults += `\n\n**Tool: ${toolCall.toolName}**\n${errorResult}`;

            // Add error to context manager
            this.contextManager.addToolResult(toolCall.toolName, toolCall.toolId, errorResult);
          }
        }

        // Add continuation prompt to context
        this.contextManager.addEntry({
          role: 'user',
          content: `Tool execution results:${toolResults}\n\nContinue with the next step or provide final summary if done.`,
          type: 'context-note',
        });
      }

      const executionTime = performance.now() - startTime;
      const contextStats = this.contextManager.getStats();

      // Emit completion event
      this.emitProgress({
        type: 'completed',
        agent: 'SystemAgent',
        action: 'Task completed successfully',
        details: `Created ${filesCreated.length} file(s) in ${executionTime.toFixed(0)}ms`,
      });

      return {
        success: true,
        response: finalResponse,
        toolCalls,
        filesCreated,
        projectPath,
        executionTime,
        contextStats: {
          totalTokens: contextStats.totalTokens,
          wasSummarized: lastContextResult?.wasSummarized || false,
          summarizationSteps: lastContextResult?.summarizationSteps,
        },
      };
    } catch (error: any) {
      const executionTime = performance.now() - startTime;

      return {
        success: false,
        response: '',
        toolCalls,
        filesCreated,
        projectPath,
        error: error.message || String(error),
        executionTime,
      };
    }
  }

  /**
   * Format context management action for display
   */
  private formatContextAction(step: string): string {
    switch (step) {
      case 'context-analysis':
        return 'Analyzing context size';
      case 'pagination':
        return 'Paginating context for summarization';
      case 'summarizing':
        return 'Summarizing context';
      case 'cache-hit':
        return 'Using cached context summary';
      case 'complete':
        return 'Context optimization complete';
      default:
        return 'Managing context';
    }
  }

  /**
   * Build system prompt with tool descriptions
   */
  private buildSystemPromptWithTools(): string {
    let prompt = this.systemPrompt;

    // Add tool descriptions
    const tools = getSystemTools();
    prompt += '\n\n## Available Tools (Full Specifications)\n\n';

    for (const tool of tools) {
      prompt += `### ${tool.name} (\`${tool.id}\`)\n\n`;
      prompt += `${tool.description}\n\n`;

      if (tool.inputs && tool.inputs.length > 0) {
        prompt += '**Inputs:**\n';
        for (const input of tool.inputs) {
          prompt += `- \`${input.name}\` (${input.type})${input.required ? ' **[Required]**' : ''}: ${input.description}\n`;
        }
        prompt += '\n';
      }
    }

    prompt += '\n**Tool Call Format:**\n\n';
    prompt += 'To use a tool, include this in your response:\n\n';
    prompt += '```tool\n';
    prompt += '{\n';
    prompt += '  "tool": "tool-id",\n';
    prompt += '  "inputs": {\n';
    prompt += '    "param1": "value1",\n';
    prompt += '    "param2": "value2"\n';
    prompt += '  }\n';
    prompt += '}\n';
    prompt += '```\n\n';
    prompt += 'You can make multiple tool calls in one response by including multiple ```tool blocks.\n\n';

    return prompt;
  }

  /**
   * Get formatted details for a tool call
   */
  private getToolCallDetails(toolCall: {
    toolId: string;
    toolName: string;
    inputs: Record<string, any>;
  }): string {
    // Format tool inputs for display
    const inputKeys = Object.keys(toolCall.inputs);

    if (inputKeys.length === 0) {
      return 'No parameters';
    }

    // Special formatting for common tools
    if (toolCall.toolId === 'write-file' && toolCall.inputs.path) {
      return `Path: ${toolCall.inputs.path}`;
    }

    if (toolCall.toolId === 'read-file' && toolCall.inputs.path) {
      return `Reading: ${toolCall.inputs.path}`;
    }

    if (toolCall.toolId === 'execute-python') {
      const codePreview = toolCall.inputs.code?.substring(0, 50) || '';
      return `Executing: ${codePreview}${codePreview.length >= 50 ? '...' : ''}`;
    }

    // Generic parameter list
    return inputKeys.map(key => `${key}: ${JSON.stringify(toolCall.inputs[key]).substring(0, 30)}`).join(', ');
  }

  /**
   * Get formatted summary of tool execution result
   */
  private getToolResultSummary(
    toolCall: { toolId: string; toolName: string; inputs: Record<string, any> },
    result: any
  ): string {
    // Format result based on tool type
    if (toolCall.toolId === 'write-file') {
      return `Written ${result.size || 0} bytes to ${result.path || 'file'}`;
    }

    if (toolCall.toolId === 'read-file') {
      return `Read ${result.size || 0} bytes from ${result.type || 'unknown'} file`;
    }

    if (toolCall.toolId === 'execute-python') {
      const hasOutput = result.stdout && result.stdout.length > 0;
      const hasImages = result.images && result.images.length > 0;
      const time = result.executionTime ? `${result.executionTime}ms` : 'unknown';

      let summary = `Completed in ${time}`;
      if (hasOutput) summary += `, produced output`;
      if (hasImages) summary += `, generated ${result.images.length} plot(s)`;

      return summary;
    }

    if (toolCall.toolId === 'list-directory') {
      const fileCount = result.files?.length || 0;
      const dirCount = result.directories?.length || 0;
      return `Found ${fileCount} file(s), ${dirCount} director(ies)`;
    }

    // Generic success message
    return 'Completed successfully';
  }

  /**
   * Parse tool calls from LLM response
   */
  private parseToolCalls(response: string): Array<{
    toolId: string;
    toolName: string;
    inputs: Record<string, any>;
  }> {
    const toolCalls: Array<{
      toolId: string;
      toolName: string;
      inputs: Record<string, any>;
    }> = [];

    // Look for tool call blocks
    const toolCallRegex = /```tool\s*\n([\s\S]*?)\n```/g;
    let match;

    const tools = getSystemTools();
    const toolsById = new Map(tools.map(t => [t.id, t]));

    while ((match = toolCallRegex.exec(response)) !== null) {
      try {
        const toolCallData = JSON.parse(match[1]);
        const tool = toolsById.get(toolCallData.tool);

        if (tool) {
          toolCalls.push({
            toolId: tool.id,
            toolName: tool.name,
            inputs: toolCallData.inputs || {},
          });
        } else {
          console.warn(`Unknown tool: ${toolCallData.tool}`);
        }
      } catch (error) {
        console.warn('Failed to parse tool call:', error);
      }
    }

    return toolCalls;
  }
}

/**
 * Create and execute SystemAgent
 */
export async function executeSystemAgent(userGoal: string): Promise<SystemAgentResult> {
  // Load SystemAgent definition
  const systemAgentMarkdown = await fetch('/system/agents/SystemAgent.md').then(r => r.text());

  // Extract system prompt (everything after the frontmatter)
  const frontmatterMatch = systemAgentMarkdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const systemPrompt = frontmatterMatch ? frontmatterMatch[2].trim() : systemAgentMarkdown;

  // Create orchestrator
  const orchestrator = new SystemAgentOrchestrator(systemPrompt);

  // Execute
  return await orchestrator.execute(userGoal);
}
