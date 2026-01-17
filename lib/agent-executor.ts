/**
 * Agent Executor - Run sub-agents defined in markdown with tool access
 *
 * Agents can:
 * - Use LLMs (via OpenRouter)
 * - Execute tools (via tool-executor)
 * - Store/retrieve context
 * - Communicate with other agents
 */

import { LLMClient, Message } from './llm-client';
import { Tool, ToolContext, executeTool, parseToolFromMarkdown } from './tool-executor';

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[]; // Tool IDs this agent can use
  model?: string; // LLM model to use
  maxIterations?: number;
  metadata?: Record<string, any>;
}

export interface AgentMessage {
  role: 'user' | 'agent' | 'tool' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  metadata?: Record<string, any>;
}

export interface ToolCall {
  toolId: string;
  toolName: string;
  inputs: Record<string, any>;
  output?: any;
  success?: boolean;
  error?: string;
}

export interface AgentExecutionResult {
  agentId: string;
  agentName: string;
  success: boolean;
  output?: string;
  messages: AgentMessage[];
  toolCalls: ToolCall[];
  iterations: number;
  executionTime: number;
  error?: string;
}

/**
 * Parse agent from markdown content
 *
 * Expected format:
 * ```
 * ---
 * name: Agent Name
 * description: Agent description
 * model: anthropic/claude-sonnet-4.5
 * tools:
 *   - tool-id-1
 *   - tool-id-2
 * maxIterations: 10
 * ---
 *
 * # Agent: Agent Name
 *
 * Description here...
 *
 * ## System Prompt
 *
 * You are an expert assistant that can...
 *
 * ## Available Tools
 *
 * - tool-id-1: Description
 * - tool-id-2: Description
 * ```
 */
export function parseAgentFromMarkdown(markdown: string): Agent | null {
  try {
    // Extract frontmatter
    const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      console.warn('No frontmatter found in agent markdown');
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const content = markdown.slice(frontmatterMatch[0].length);

    // Parse frontmatter
    const metadata: any = {};
    const lines = frontmatter.split('\n');
    let currentKey = '';
    let currentArray: string[] = [];

    for (const line of lines) {
      if (line.trim().startsWith('-')) {
        currentArray.push(line.trim().slice(1).trim());
      } else if (line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        currentKey = key.trim();

        if (value) {
          metadata[currentKey] = value;
        } else {
          currentArray = [];
          metadata[currentKey] = currentArray;
        }
      }
    }

    // Extract system prompt
    const systemPromptMatch = content.match(/##\s*System Prompt\s*\n\n([\s\S]*?)(?=\n##|\n---|$)/);
    const systemPrompt = systemPromptMatch ? systemPromptMatch[1].trim() : metadata.description || '';

    return {
      id: metadata.id || metadata.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
      name: metadata.name || 'Unknown Agent',
      description: metadata.description || '',
      systemPrompt,
      tools: metadata.tools || [],
      model: metadata.model || 'anthropic/claude-sonnet-4.5',
      maxIterations: parseInt(metadata.maxIterations) || 10,
      metadata,
    };
  } catch (error) {
    console.error('Failed to parse agent markdown:', error);
    return null;
  }
}

/**
 * Agent executor with tool access and LLM integration
 */
export class AgentExecutor {
  private agent: Agent;
  private llmClient: LLMClient;
  private toolContext: ToolContext;
  private messages: AgentMessage[] = [];
  private toolCalls: ToolCall[] = [];

  constructor(agent: Agent, llmClient: LLMClient, toolContext: ToolContext) {
    this.agent = agent;
    this.llmClient = llmClient;
    this.toolContext = toolContext;
  }

  /**
   * Execute agent with a user query
   */
  async execute(
    userQuery: string,
    context?: Record<string, any>
  ): Promise<AgentExecutionResult> {
    const startTime = performance.now();
    const maxIterations = this.agent.maxIterations || 10;

    this.messages = [];
    this.toolCalls = [];

    try {
      // Add initial user message
      this.addMessage({
        role: 'user',
        content: userQuery,
        timestamp: new Date().toISOString(),
      });

      // Build initial conversation with system prompt and tool descriptions
      const conversationHistory: Message[] = [
        {
          role: 'system',
          content: this.buildSystemPrompt(),
        },
        {
          role: 'user',
          content: userQuery,
        },
      ];

      let iterations = 0;
      let finalResponse = '';

      // Agent loop: LLM → Tool calls → LLM → ...
      while (iterations < maxIterations) {
        iterations++;

        // Call LLM
        const llmResponse = await this.llmClient.chatDirect(conversationHistory);

        // Add agent response
        this.addMessage({
          role: 'agent',
          content: llmResponse,
          timestamp: new Date().toISOString(),
        });

        // Parse for tool calls
        const toolCallsInResponse = this.parseToolCalls(llmResponse);

        if (toolCallsInResponse.length === 0) {
          // No tool calls, agent is done
          finalResponse = llmResponse;
          break;
        }

        // Execute tool calls
        for (const toolCall of toolCallsInResponse) {
          const result = await this.toolContext.executeTool(
            toolCall.toolId,
            toolCall.inputs
          );

          toolCall.output = result.output;
          toolCall.success = result.success;
          toolCall.error = result.error;

          this.toolCalls.push(toolCall);

          // Add tool result to conversation
          const toolMessage = {
            role: 'tool' as const,
            content: result.success
              ? `Tool ${toolCall.toolName} result: ${JSON.stringify(result.output)}`
              : `Tool ${toolCall.toolName} error: ${result.error}`,
            timestamp: new Date().toISOString(),
            toolCalls: [toolCall],
          };

          this.addMessage(toolMessage);
          conversationHistory.push({
            role: 'user',
            content: toolMessage.content,
          });
        }

        // Continue conversation with tool results
        conversationHistory.push({
          role: 'assistant',
          content: llmResponse,
        });
      }

      const executionTime = performance.now() - startTime;

      return {
        agentId: this.agent.id,
        agentName: this.agent.name,
        success: true,
        output: finalResponse,
        messages: this.messages,
        toolCalls: this.toolCalls,
        iterations,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = performance.now() - startTime;

      return {
        agentId: this.agent.id,
        agentName: this.agent.name,
        success: false,
        error: error.message || String(error),
        messages: this.messages,
        toolCalls: this.toolCalls,
        iterations: 0,
        executionTime,
      };
    }
  }

  private buildSystemPrompt(): string {
    let prompt = this.agent.systemPrompt;

    // Add runtime capabilities constraints
    // Dynamic import to avoid circular dependencies
    try {
      // Note: This should be imported at module level in production
      // For now, we'll add it conditionally
      prompt += '\n\n---\n\n';
      prompt += '# IMPORTANT: Runtime Environment Constraints\n\n';
      prompt += 'When generating Python code, you MUST respect these browser runtime limitations:\n\n';
      prompt += '**Available Packages:** numpy, scipy, matplotlib, pandas, scikit-learn, networkx, sympy\n';
      prompt += '**Quantum Computing:** MicroQiskit only (basic simulator, max 10 qubits)\n';
      prompt += '**NOT Available:** qiskit_aer, tensorflow, pytorch, opencv, requests, file I/O, network access\n\n';
      prompt += '**For Quantum Code:**\n';
      prompt += '- Use `from qiskit import QuantumCircuit, execute` (NOT qiskit_aer)\n';
      prompt += '- Use `execute(circuit, shots=1024)` directly (no Aer backend)\n';
      prompt += '- Do NOT use qiskit.visualization.circuit_drawer\n';
      prompt += '- Keep circuits simple: < 10 qubits, < 20 gates\n';
      prompt += '- Create visualizations with matplotlib instead\n\n';
    } catch (error) {
      console.warn('Could not load runtime capabilities:', error);
    }

    // Add tool descriptions
    if (this.agent.tools.length > 0) {
      prompt += '\n\n## Available Tools\n\n';
      prompt += 'You can use these tools by including a tool call in your response:\n\n';

      for (const toolId of this.agent.tools) {
        const tool = this.toolContext.getTool(toolId);
        if (tool) {
          prompt += `- **${tool.name}** (\`${tool.id}\`): ${tool.description}\n`;
          if (tool.inputs && tool.inputs.length > 0) {
            prompt += `  Inputs: ${tool.inputs.map(i => `${i.name} (${i.type})`).join(', ')}\n`;
          }
        }
      }

      prompt += '\nTo use a tool, respond with:\n';
      prompt += '```tool\n';
      prompt += '{\n';
      prompt += '  "tool": "tool-id",\n';
      prompt += '  "inputs": { "param1": "value1", "param2": "value2" }\n';
      prompt += '}\n';
      prompt += '```\n';
    }

    return prompt;
  }

  private parseToolCalls(response: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Look for tool call blocks
    const toolCallRegex = /```tool\s*\n([\s\S]*?)\n```/g;
    let match;

    while ((match = toolCallRegex.exec(response)) !== null) {
      try {
        const toolCallData = JSON.parse(match[1]);
        const tool = this.toolContext.getTool(toolCallData.tool);

        if (tool) {
          toolCalls.push({
            toolId: tool.id,
            toolName: tool.name,
            inputs: toolCallData.inputs || {},
          });
        }
      } catch (error) {
        console.warn('Failed to parse tool call:', error);
      }
    }

    return toolCalls;
  }

  private addMessage(message: AgentMessage): void {
    this.messages.push(message);
  }

  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  getToolCalls(): ToolCall[] {
    return [...this.toolCalls];
  }
}

/**
 * Create an agent executor from markdown
 */
export async function createAgentFromMarkdown(
  markdown: string,
  llmClient: LLMClient,
  toolContext: ToolContext
): Promise<AgentExecutor | null> {
  const agent = parseAgentFromMarkdown(markdown);
  if (!agent) return null;

  return new AgentExecutor(agent, llmClient, toolContext);
}
