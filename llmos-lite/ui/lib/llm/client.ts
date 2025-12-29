/**
 * Unified LLM Client
 *
 * Combines base LLM client with file tool support
 */

import { logger } from '@/lib/debug/logger';
import { getFileTools } from '@/lib/llm-tools/file-tools';
import {
  Message,
  ToolCall,
  ToolResult,
  LLMConfig,
  ChatCompletionOptions,
  StreamChunk,
  AVAILABLE_MODELS,
} from './types';
import { LLMStorage } from './storage';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export class LLMClient {
  private config: LLMConfig;
  private fileTools = getFileTools();
  private baseURL: string;

  constructor(config: LLMConfig) {
    this.config = config;
    this.baseURL = config.baseURL || DEFAULT_BASE_URL;
  }

  /**
   * Direct client-side OpenRouter call (RECOMMENDED)
   *
   * This method calls OpenRouter directly from the browser.
   * Your API key never leaves the client - it goes straight to OpenRouter.
   */
  async chatDirect(
    messages: Message[],
    options?: {
      includeSkills?: boolean;
      volume?: 'user' | 'team' | 'system';
    }
  ): Promise<string> {
    logger.time('llm-request', 'llm', 'OpenRouter API call', {
      model: this.config.model,
      messageCount: messages.length,
    });

    let finalMessages = [...messages];

    // Load skills if requested
    if (options?.includeSkills) {
      try {
        const skillContext = await this.loadSkillContext(options.volume || 'user');
        if (skillContext) {
          finalMessages = [
            { role: 'system', content: skillContext },
            ...messages
          ];
          logger.debug('llm', `Injected skill context from ${options.volume || 'user'} volume`);
        }
      } catch (error) {
        logger.warn('llm', 'Failed to load skills, continuing without them', { error });
      }
    }

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': this.config.siteUrl || (typeof window !== 'undefined' ? window.location.origin : ''),
          'X-Title': 'LLMos-Lite',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: finalMessages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('llm', `OpenRouter API error (${response.status})`, { errorText });
        logger.timeEnd('llm-request', false);

        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(`OpenRouter API error (${response.status}): ${errorJson.error?.message || errorText}`);
        } catch {
          throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
        }
      }

      const data = await response.json();

      if (!data.choices?.[0]?.message) {
        logger.error('llm', 'Unexpected response structure', { data });
        logger.timeEnd('llm-request', false);
        throw new Error('Invalid response structure from OpenRouter API');
      }

      const content = data.choices[0].message.content;
      logger.timeEnd('llm-request', true, {
        tokensUsed: data.usage?.total_tokens,
        model: data.model,
      });
      return content;
    } catch (error) {
      logger.error('llm', 'Request failed', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  /**
   * Send a chat message with file tool support
   */
  async sendMessageWithTools(
    messages: Message[],
    options?: ChatCompletionOptions
  ): Promise<Message> {
    const tools = this.fileTools.getToolDefinitions();

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
        'X-Title': 'LLMos-Lite'
      },
      body: JSON.stringify({
        model: this.config.model,
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
    if (message.tool_calls?.length > 0) {
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
    options?: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk> {
    const tools = this.fileTools.getToolDefinitions();

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
        'X-Title': 'LLMos-Lite'
      },
      body: JSON.stringify({
        model: this.config.model,
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
    const toolCalls: ToolCall[] = [];

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

          if (delta.content) {
            yield { type: 'text', content: delta.content };
          }

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
                try {
                  toolCalls[tc.index].parameters = JSON.parse(newArgs);
                } catch {
                  // Arguments still incomplete
                }
              }
            }
          }
        }
      }

      // Execute tool calls if any
      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          yield { type: 'tool_call', toolCall };

          const result = await this.fileTools.executeTool(
            toolCall.name,
            toolCall.parameters
          );

          yield { type: 'tool_result', toolResult: result };
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
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>
  ): Promise<Message> {
    const toolResults: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.fileTools.executeTool(
        toolCall.function.name,
        JSON.parse(toolCall.function.arguments)
      );
      toolResults.push(result);
    }

    const messagesWithTools: Message[] = [
      ...previousMessages,
      {
        role: 'assistant',
        content: '',
        toolCalls: toolCalls.map(tc => ({
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

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messagesWithTools
      })
    });

    const data = await response.json();

    return {
      role: 'assistant',
      content: data.choices[0].message.content,
      toolCalls: toolCalls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        parameters: JSON.parse(tc.function.arguments)
      })),
      toolResults
    };
  }

  /**
   * Load skill context from GitHub volumes
   */
  private async loadSkillContext(volume: 'user' | 'team' | 'system'): Promise<string | null> {
    try {
      const { GitService } = await import('../git-service');
      const skills = await GitService.fetchSkills(volume);

      if (skills.length === 0) {
        logger.debug('llm', `No skills found in ${volume} volume`);
        return null;
      }

      logger.info('llm', `Loaded ${skills.length} skills from ${volume} volume`);

      return `# Available Skills

You have access to the following skills that were learned from previous sessions:

${skills.map((skill, idx) => `## ${idx + 1}. ${skill.name}

${skill.content}

---`).join('\n\n')}

Use these skills to provide better, more context-aware responses.`;
    } catch (error) {
      logger.error('llm', 'Failed to load skills', { error });
      return null;
    }
  }

  private formatMessages(messages: Message[]): Array<{ role: string; content: string }> {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
  }

  setModel(model: string): void {
    this.config.model = model;
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }
}

/**
 * Create LLM client from stored config
 */
export function createLLMClient(): LLMClient | null {
  const apiKey = LLMStorage.getApiKey();
  const modelId = LLMStorage.getModel();

  if (!apiKey || !modelId) {
    logger.warn('llm', 'Missing configuration', { hasApiKey: !!apiKey, hasModelId: !!modelId });
    return null;
  }

  const model = AVAILABLE_MODELS[modelId];
  const actualModelId = model ? model.id : modelId;

  const client = new LLMClient({
    apiKey,
    model: actualModelId,
  });

  logger.success('llm', 'LLM client initialized', { model: actualModelId });
  return client;
}
