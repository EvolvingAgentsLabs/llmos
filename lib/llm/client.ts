/**
 * Unified LLM Client
 *
 * Uses OpenAI-compatible API (works with Gemini, OpenAI, OpenRouter, etc.)
 * Default configuration uses Google AI Studio's OpenAI-compatible endpoint.
 */

import OpenAI from 'openai';
import { logger } from '@/lib/debug/logger';
import { llmMetrics } from '@/lib/debug/llm-metrics-store';
import { getFileTools } from '@/lib/llm-tools/file-tools';
import {
  Message,
  MessageContent,
  TextContent,
  ImageContent,
  ToolCall,
  ToolResult,
  LLMConfig,
  ChatCompletionOptions,
  StreamChunk,
  AVAILABLE_MODELS,
} from './types';
import { LLMStorage, DEFAULT_BASE_URL } from './storage';

export class LLMClient {
  private config: LLMConfig;
  private fileTools = getFileTools();
  private client: OpenAI;

  constructor(config: LLMConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      dangerouslyAllowBrowser: true, // Required for client-side usage
    });
  }

  /**
   * Direct API call using OpenAI-compatible endpoint
   *
   * This method calls the configured API directly from the browser.
   * By default, it uses Google AI Studio's OpenAI-compatible endpoint.
   * Your API key never leaves the client - it goes straight to the provider.
   */
  async chatDirect(
    messages: Message[],
    options?: {
      includeSkills?: boolean;
      volume?: 'user' | 'team' | 'system';
    }
  ): Promise<string> {
    logger.time('llm-request', 'llm', 'OpenAI-compatible API call', {
      model: this.config.model,
      messageCount: messages.length,
      baseURL: this.config.baseURL,
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

    // Calculate request payload size for metrics
    const requestChars = finalMessages.reduce((acc, m) => {
      if (typeof m.content === 'string') {
        return acc + m.content.length;
      }
      // For multimodal content, sum text lengths (images not counted)
      return acc + m.content.reduce((sum, part) => {
        return sum + (part.type === 'text' ? part.text.length : 0);
      }, 0);
    }, 0);

    // Start tracking this request
    const metricsId = llmMetrics.startRequest(
      this.config.model,
      requestChars,
      finalMessages.length
    );

    try {
      // Convert to OpenAI message format
      const openaiMessages = this.formatMessages(finalMessages);

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: openaiMessages,
      });

      const content = response.choices[0]?.message?.content || '';
      const responseChars = content.length;

      // Complete metrics tracking
      llmMetrics.completeRequest(
        metricsId,
        responseChars,
        response.usage ? {
          prompt: response.usage.prompt_tokens || 0,
          completion: response.usage.completion_tokens || 0,
          total: response.usage.total_tokens || 0,
        } : undefined
      );

      logger.timeEnd('llm-request', true, {
        tokensUsed: response.usage?.total_tokens,
        model: this.config.model,
        requestChars,
        responseChars,
      });
      return content;
    } catch (error) {
      llmMetrics.failRequest(metricsId, error instanceof Error ? error.message : String(error));
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
    const openaiMessages = this.formatMessages(messages);

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: openaiMessages,
        // Tool support can be added here when needed
        // tools: tools.map(t => ({ type: 'function', function: t })),
      });

      return {
        role: 'assistant',
        content: response.choices[0]?.message?.content || ''
      };
    } catch (error) {
      throw new Error(`OpenAI-compatible API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Stream chat completion with tool support
   */
  async *streamMessage(
    messages: Message[],
    options?: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk> {
    const requestChars = messages.reduce((acc, m) => {
      if (typeof m.content === 'string') {
        return acc + m.content.length;
      }
      return acc + m.content.reduce((sum, part) => {
        return sum + (part.type === 'text' ? part.text.length : 0);
      }, 0);
    }, 0);

    // Start tracking this streaming request
    const metricsId = llmMetrics.startRequest(
      this.config.model,
      requestChars,
      messages.length
    );

    try {
      const openaiMessages = this.formatMessages(messages);

      // Use streaming API
      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages: openaiMessages,
        stream: true,
      });

      let totalResponseChars = 0;

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          const chunkChars = text.length;
          totalResponseChars += chunkChars;
          llmMetrics.updateStreamingChunk(metricsId, chunkChars);
          yield { type: 'text', content: text };
        }
      }

      // Complete the metrics tracking
      llmMetrics.completeRequest(metricsId, totalResponseChars);

      yield { type: 'done' };
    } catch (error) {
      llmMetrics.failRequest(metricsId, error instanceof Error ? error.message : String(error));
      throw error;
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

    // Continue conversation with tool results
    const openaiMessages = this.formatMessages([
      ...previousMessages,
      {
        role: 'assistant',
        content: `Tool results: ${toolResults.map(r => r.output || r.error).join('\n')}`
      }
    ]);

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: openaiMessages,
    });

    return {
      role: 'assistant',
      content: response.choices[0]?.message?.content || '',
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
      // git-service removed during cleanup - skills loading not yet reimplemented
      logger.debug('llm', `Skills loading not available for ${volume} volume`);
      return null;
    } catch (error) {
      logger.error('llm', 'Failed to load skills', { error });
      return null;
    }
  }

  /**
   * Format messages for OpenAI-compatible API
   * Supports both text-only and multimodal (text + image) messages
   */
  private formatMessages(messages: Message[]): Array<OpenAI.Chat.ChatCompletionMessageParam> {
    return messages.map(msg => {
      const role = msg.role === 'tool' ? 'assistant' : msg.role as 'user' | 'assistant' | 'system';

      // Handle multimodal content (array of text/image blocks)
      if (Array.isArray(msg.content)) {
        // Convert to OpenAI's multimodal format
        const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = msg.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text };
          } else if (part.type === 'image_url') {
            return {
              type: 'image_url' as const,
              image_url: {
                url: part.image_url.url,
                detail: part.image_url.detail || 'auto',
              },
            };
          }
          // Fallback for unknown types
          return { type: 'text' as const, text: JSON.stringify(part) };
        });

        return {
          role,
          content: contentParts,
        } as OpenAI.Chat.ChatCompletionMessageParam;
      }

      // Handle plain text content
      return {
        role,
        content: msg.content,
      } as OpenAI.Chat.ChatCompletionMessageParam;
    });
  }

  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
    this.client = new OpenAI({
      apiKey,
      baseURL: this.config.baseURL,
      dangerouslyAllowBrowser: true,
    });
  }

  setModel(model: string): void {
    this.config.model = model;
  }

  setBaseURL(baseURL: string): void {
    this.config.baseURL = baseURL;
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL,
      dangerouslyAllowBrowser: true,
    });
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
  const baseURL = LLMStorage.getBaseUrl();
  const provider = LLMStorage.getProvider();

  if (!modelId) {
    logger.warn('llm', 'Missing model configuration', { hasModelId: false });
    return null;
  }

  // Ollama doesn't require an API key; use a placeholder for the OpenAI client
  const isOllama = provider === 'ollama';
  const effectiveApiKey = isOllama ? 'ollama' : apiKey;

  if (!effectiveApiKey) {
    logger.warn('llm', 'Missing API key', { provider });
    return null;
  }

  const model = AVAILABLE_MODELS[modelId];
  const actualModelId = model ? model.id : modelId;

  const client = new LLMClient({
    apiKey: effectiveApiKey,
    model: actualModelId,
    baseURL,
  });

  logger.success('llm', 'LLM client initialized', { model: actualModelId, baseURL, provider });
  return client;
}
