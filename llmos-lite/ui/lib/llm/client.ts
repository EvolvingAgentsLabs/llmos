/**
 * Unified LLM Client
 *
 * Uses Google AI Studio (Gemini) API via @google/genai SDK
 */

import { GoogleGenAI } from '@google/genai';
import { logger } from '@/lib/debug/logger';
import { llmMetrics } from '@/lib/debug/llm-metrics-store';
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

export class LLMClient {
  private config: LLMConfig;
  private fileTools = getFileTools();
  private client: GoogleGenAI;

  constructor(config: LLMConfig) {
    this.config = config;
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  /**
   * Direct Google AI Studio call (RECOMMENDED)
   *
   * This method calls Google AI directly from the browser.
   * Your API key never leaves the client - it goes straight to Google.
   */
  async chatDirect(
    messages: Message[],
    options?: {
      includeSkills?: boolean;
      volume?: 'user' | 'team' | 'system';
    }
  ): Promise<string> {
    logger.time('llm-request', 'llm', 'Google AI API call', {
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

    // Calculate request payload size for metrics
    const requestChars = finalMessages.reduce((acc, m) => acc + m.content.length, 0);

    // Start tracking this request
    const metricsId = llmMetrics.startRequest(
      this.config.model,
      requestChars,
      finalMessages.length
    );

    try {
      // Convert messages to Gemini format
      const contents = this.convertToGeminiFormat(finalMessages);

      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents: contents,
      });

      const content = response.text || '';
      const responseChars = content.length;

      // Complete metrics tracking
      llmMetrics.completeRequest(
        metricsId,
        responseChars,
        response.usageMetadata ? {
          prompt: response.usageMetadata.promptTokenCount || 0,
          completion: response.usageMetadata.candidatesTokenCount || 0,
          total: response.usageMetadata.totalTokenCount || 0,
        } : undefined
      );

      logger.timeEnd('llm-request', true, {
        tokensUsed: response.usageMetadata?.totalTokenCount,
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
   * Convert messages array to Gemini format
   */
  private convertToGeminiFormat(messages: Message[]): string | Array<{ role: string; parts: Array<{ text: string }> }> {
    // Handle system messages by prepending to first user message
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    // If we only have simple messages, convert to content array
    if (otherMessages.length === 0 && systemMessages.length > 0) {
      return systemMessages.map(m => m.content).join('\n\n');
    }

    // Build conversation history
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // Add system context to the first user message
    const systemContext = systemMessages.map(m => m.content).join('\n\n');

    for (let i = 0; i < otherMessages.length; i++) {
      const msg = otherMessages[i];
      let content = msg.content;

      // Prepend system context to first user message
      if (i === 0 && msg.role === 'user' && systemContext) {
        content = `${systemContext}\n\n${content}`;
      }

      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: content }]
      });
    }

    // If no messages, return empty string
    if (contents.length === 0) {
      return systemContext || '';
    }

    return contents;
  }

  /**
   * Send a chat message with file tool support
   */
  async sendMessageWithTools(
    messages: Message[],
    options?: ChatCompletionOptions
  ): Promise<Message> {
    const tools = this.fileTools.getToolDefinitions();

    // For now, use simple chat without tools - Gemini tool calling requires different format
    const contents = this.convertToGeminiFormat(messages);

    try {
      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents: contents,
      });

      return {
        role: 'assistant',
        content: response.text || ''
      };
    } catch (error) {
      throw new Error(`Google AI API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Stream chat completion with tool support
   */
  async *streamMessage(
    messages: Message[],
    options?: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk> {
    const requestChars = messages.reduce((acc, m) => acc + m.content.length, 0);

    // Start tracking this streaming request
    const metricsId = llmMetrics.startRequest(
      this.config.model,
      requestChars,
      messages.length
    );

    try {
      const contents = this.convertToGeminiFormat(messages);

      // Use streaming API
      const response = await this.client.models.generateContentStream({
        model: this.config.model,
        contents: contents,
      });

      let totalResponseChars = 0;

      for await (const chunk of response) {
        const text = chunk.text;
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
    const messagesWithTools: Message[] = [
      ...previousMessages,
      {
        role: 'assistant',
        content: `Tool results: ${toolResults.map(r => r.output || r.error).join('\n')}`
      }
    ];

    const contents = this.convertToGeminiFormat(messagesWithTools);

    const response = await this.client.models.generateContent({
      model: this.config.model,
      contents: contents,
    });

    return {
      role: 'assistant',
      content: response.text || '',
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
    this.client = new GoogleGenAI({ apiKey });
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
