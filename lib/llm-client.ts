/**
 * LLM Client - Backward Compatibility Export
 *
 * @deprecated Import from '@/lib/llm' instead
 */

export {
  LLMClient,
  createLLMClient,
  LLMStorage,
  AVAILABLE_MODELS,
  MODEL_PROVIDER_CONFIG,
  DEFAULT_BASE_URL,
  PROVIDER_BASE_URLS,
} from './llm';

export type {
  Message,
  ChatRequest,
  ChatResponse,
  LLMConfig,
  ModelId,
  ModelInfo,
  PresetModelId,
} from './llm';
