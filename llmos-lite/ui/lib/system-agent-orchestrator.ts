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

  constructor(systemPrompt: string) {
    this.systemPrompt = systemPrompt;
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

      // Agent loop: LLM → Parse tools → Execute → LLM → ...
      while (iterations < this.maxIterations) {
        iterations++;

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
          try {
            const result = await executeSystemTool(toolCall.toolId, toolCall.inputs);

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
