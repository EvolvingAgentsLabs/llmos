/**
 * SystemAgent Orchestrator
 *
 * Coordinates the execution of the SystemAgent with tool access
 */

import { createLLMClient, Message } from './llm-client';
import { executeSystemTool, getSystemTools } from './system-tools';
import { getVFS } from './virtual-fs';

export interface SystemAgentResult {
  success: boolean;
  response: string;
  toolCalls: ToolCallResult[];
  filesCreated: string[];
  projectPath?: string;
  error?: string;
  executionTime: number;
}

export interface AgentProgressEvent {
  type: 'thinking' | 'tool-call' | 'memory-query' | 'execution' | 'completed';
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

/**
 * SystemAgent Orchestrator
 */
export class SystemAgentOrchestrator {
  private systemPrompt: string;
  private maxIterations: number = 10;
  private progressCallback?: ProgressCallback;

  constructor(systemPrompt: string, progressCallback?: ProgressCallback) {
    this.systemPrompt = systemPrompt;
    this.progressCallback = progressCallback;
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
   * Execute the SystemAgent with a user goal
   */
  async execute(userGoal: string): Promise<SystemAgentResult> {
    const startTime = performance.now();
    const toolCalls: ToolCallResult[] = [];
    const filesCreated: string[] = [];
    let projectPath: string | undefined;

    try {
      const llmClient = createLLMClient();
      if (!llmClient) {
        throw new Error('LLM client not configured');
      }

      // Build conversation with system prompt and tools
      const conversationHistory: Message[] = [
        {
          role: 'system',
          content: this.buildSystemPromptWithTools(),
        },
        {
          role: 'user',
          content: userGoal,
        },
      ];

      let iterations = 0;
      let finalResponse = '';

      // Emit initial thinking event
      this.emitProgress({
        type: 'thinking',
        agent: 'SystemAgent',
        action: 'Reading system memory and planning approach',
        details: 'Consulting /system/memory_log.md for similar past tasks',
      });

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

        // Call LLM
        const llmResponse = await llmClient.chatDirect(conversationHistory);

        // Parse for tool calls
        const toolCallsInResponse = this.parseToolCalls(llmResponse);

        if (toolCallsInResponse.length === 0) {
          // No tool calls, agent is done
          finalResponse = llmResponse;
          break;
        }

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

            toolResults += `\n\n**Tool: ${toolCall.toolName}**\nSuccess: ✓\nResult: ${JSON.stringify(result, null, 2)}`;
          } catch (error: any) {
            toolCalls.push({
              toolId: toolCall.toolId,
              toolName: toolCall.toolName,
              inputs: toolCall.inputs,
              success: false,
              error: error.message || String(error),
            });

            toolResults += `\n\n**Tool: ${toolCall.toolName}**\nError: ✗ ${error.message || error}`;
          }
        }

        // Add tool results to conversation
        conversationHistory.push({
          role: 'assistant',
          content: llmResponse,
        });

        conversationHistory.push({
          role: 'user',
          content: `Tool execution results:${toolResults}\n\nContinue with the next step or provide final summary if done.`,
        });
      }

      const executionTime = performance.now() - startTime;

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
