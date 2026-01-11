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
