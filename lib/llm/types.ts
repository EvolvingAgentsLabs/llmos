/**
 * LLM Client Types
 *
 * Shared types for LLM client implementations
 */

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  output?: string;
  error?: string;
  fileChanges?: {
    path: string;
    volume: string;
    operation: 'write' | 'edit' | 'delete';
    diff?: string[];
  }[];
}

export interface ChatRequest {
  user_id: string;
  team_id: string;
  message: string;
  session_id?: string;
  include_skills?: boolean;
  max_skills?: number;
  model?: string;
}

export interface ChatResponse {
  response: string;
  skills_used: string[];
  trace_id: string;
  session_id: string;
  model_used?: string;
}

export interface LLMConfig {
  apiKey: string;
  model: string;
  baseURL: string;  // Required: OpenAI-compatible API base URL
  siteUrl?: string;
}

export interface ChatCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: boolean;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'done';
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  inputCost: string;
  outputCost: string;
  contextWindow: string;
}

export const AVAILABLE_MODELS: Record<string, ModelInfo> = {
  'xiaomi/mimo-v2-flash:free': {
    id: 'xiaomi/mimo-v2-flash:free',
    name: 'Xiaomi Mimo v2 Flash',
    provider: 'OpenRouter (Xiaomi)',
    inputCost: 'Free',
    outputCost: 'Free',
    contextWindow: '128k tokens',
  },
  'google/gemini-3-flash-preview': {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    provider: 'OpenRouter (Google)',
    inputCost: 'Varies',
    outputCost: 'Varies',
    contextWindow: '1M tokens',
  },
  'anthropic/claude-haiku-4.5': {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    provider: 'OpenRouter (Anthropic)',
    inputCost: 'Varies',
    outputCost: 'Varies',
    contextWindow: '200k tokens',
  },
  'custom': {
    id: 'custom',
    name: 'Custom Model',
    provider: 'Custom',
    inputCost: 'Varies',
    outputCost: 'Varies',
    contextWindow: 'Varies',
  },
};

// Type for preset model keys
export type PresetModelId = keyof typeof AVAILABLE_MODELS;

// Type that allows both preset and custom model IDs
export type ModelId = string;
