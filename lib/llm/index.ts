/**
 * LLM Client Module
 *
 * Unified LLM client using OpenAI-compatible API.
 * Supports Gemini (default), OpenAI, OpenRouter, Together, Groq, and other providers.
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
export { LLMStorage, DEFAULT_BASE_URL, PROVIDER_BASE_URLS } from './storage';

// Client
export { LLMClient, createLLMClient } from './client';

// Backward compatibility - re-export EnhancedLLMClient as alias
export { LLMClient as EnhancedLLMClient } from './client';

// Gemini Agentic Vision
export {
  GeminiAgenticVision,
  createAgenticVisionClient,
  type AgenticVisionConfig,
  type AgenticVisionResult,
  type CodeExecutionStep,
  type HALToolDeclaration,
} from './gemini-agentic-vision';
