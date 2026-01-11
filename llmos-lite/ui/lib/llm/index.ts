/**
 * LLM Client Module
 *
 * Unified LLM client with OpenRouter support and file tools
 */

// Types
export type {
  Message,
  ToolCall,
  ToolResult,
  ChatRequest,
  ChatResponse,
  LLMConfig,
  ChatCompletionOptions,
  StreamChunk,
  ModelId,
  ModelInfo,
  PresetModelId,
} from './types';

export { AVAILABLE_MODELS } from './types';

// Storage
export { LLMStorage } from './storage';

// Client
export { LLMClient, createLLMClient } from './client';

// Backward compatibility - re-export EnhancedLLMClient as alias
export { LLMClient as EnhancedLLMClient } from './client';
