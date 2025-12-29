/**
 * Enhanced LLM Client - Backward Compatibility Export
 *
 * @deprecated Import from '@/lib/llm' instead
 */

export {
  LLMClient as EnhancedLLMClient,
} from './llm';

export type {
  Message,
  ToolCall,
  ToolResult,
  ChatCompletionOptions,
  StreamChunk,
} from './llm';
