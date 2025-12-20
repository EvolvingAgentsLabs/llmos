/**
 * Enhanced LLM Client with File Tools
 *
 * Extends the base LLM client to support Claude Code-style file operations
 */

import { getFileTools, ToolResult } from './llm-tools/file-tools';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: any;
}

export interface ChatCompletionOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: boolean;  // Enable file tools
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'done';
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
}

/**
 * Enhanced LLM Client
 *
 * Supports Claude Code-style file operations through tool use
 */
export class EnhancedLLMClient {
  private fileTools = getFileTools();
  private apiKey: string;
  private model: string;
  private baseURL: string = 'https://openrouter.ai/api/v1';

  constructor(options: ChatCompletionOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || 'anthropic/claude-3.5-sonnet';
  }

  /**
   * Send a chat message with file tool support
   */
  async sendMessage(
    messages: Message[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<Message> {
    const tools = this.fileTools.getToolDefinitions();

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
        'X-Title': 'LLMos-Lite'
      },
      body: JSON.stringify({
        model: this.model,
        messages: this.formatMessages(messages),
        tools: tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }
        })),
        tool_choice: 'auto',
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const message = choice.message;

    // Check if the model wants to use tools
    if (message.tool_calls && message.tool_calls.length > 0) {
      return await this.handleToolCalls(messages, message.tool_calls);
    }

    return {
      role: 'assistant',
      content: message.content || ''
    };
  }

  /**
   * Stream chat completion with tool support
   */
  async *streamMessage(
    messages: Message[],
    options?: { temperature?: number; maxTokens?: number }
  ): AsyncGenerator<StreamChunk> {
    const tools = this.fileTools.getToolDefinitions();

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
        'X-Title': 'LLMos-Lite'
      },
      body: JSON.stringify({
        model: this.model,
        messages: this.formatMessages(messages),
        tools: tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }
        })),
        tool_choice: 'auto',
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let toolCalls: ToolCall[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.trim() === 'data: [DONE]') continue;
          if (!line.startsWith('data: ')) continue;

          const json = JSON.parse(line.slice(6));
          const delta = json.choices[0]?.delta;

          if (!delta) continue;

          // Handle text content
          if (delta.content) {
            yield {
              type: 'text',
              content: delta.content
            };
          }

          // Handle tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (!toolCalls[tc.index]) {
                toolCalls[tc.index] = {
                  id: tc.id || `tool_${tc.index}`,
                  name: tc.function?.name || '',
                  parameters: {}
                };
              }

              if (tc.function?.arguments) {
                const currentArgs = JSON.stringify(toolCalls[tc.index].parameters);
                const newArgs = currentArgs === '{}'
                  ? tc.function.arguments
                  : currentArgs.slice(0, -1) + tc.function.arguments;
                toolCalls[tc.index].parameters = JSON.parse(newArgs);
              }
            }
          }
        }
      }

      // Execute tool calls if any
      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          yield {
            type: 'tool_call',
            toolCall
          };

          const result = await this.fileTools.executeTool(
            toolCall.name,
            toolCall.parameters
          );

          yield {
            type: 'tool_result',
            toolResult: result
          };
        }
      }

      yield { type: 'done' };

    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle tool calls from the model
   */
  private async handleToolCalls(
    previousMessages: Message[],
    toolCalls: any[]
  ): Promise<Message> {
    const toolResults: ToolResult[] = [];

    // Execute each tool call
    for (const toolCall of toolCalls) {
      const result = await this.fileTools.executeTool(
        toolCall.function.name,
        JSON.parse(toolCall.function.arguments)
      );
      toolResults.push(result);
    }

    // Add tool results to conversation
    const messagesWithTools = [
      ...previousMessages,
      {
        role: 'assistant' as const,
        content: '',
        toolCalls: toolCalls.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          parameters: JSON.parse(tc.function.arguments)
        }))
      },
      ...toolResults.map((result, idx) => ({
        role: 'tool' as const,
        tool_call_id: toolCalls[idx].id,
        content: result.output || result.error || 'No output'
      }))
    ];

    // Get model's response after tool execution
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: messagesWithTools
      })
    });

    const data = await response.json();

    return {
      role: 'assistant',
      content: data.choices[0].message.content,
      toolCalls: toolCalls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        parameters: JSON.parse(tc.function.arguments)
      })),
      toolResults
    };
  }

  /**
   * Format messages for API
   */
  private formatMessages(messages: Message[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }
}
