/**
 * LLM Client Types
 *
 * Shared types for LLM client implementations
 */

/**
 * Content block for multimodal messages
 */
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;  // Can be a data URL (base64) or http URL
    detail?: 'low' | 'high' | 'auto';  // Optional detail level for OpenAI
  };
}

export type MessageContent = string | (TextContent | ImageContent)[];

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: MessageContent;
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
  'qwen/qwen3-vl-8b-instruct': {
    id: 'qwen/qwen3-vl-8b-instruct',
    name: 'Qwen3 VL 8B (OpenRouter)',
    provider: 'OpenRouter',
    inputCost: '$0.08/M',
    outputCost: '$0.50/M',
    contextWindow: '131k tokens',
  },
  'qwen3-vl:8b-instruct': {
    id: 'qwen3-vl:8b-instruct',
    name: 'Qwen3 VL 8B (Ollama Local)',
    provider: 'Ollama',
    inputCost: 'Free (local)',
    outputCost: 'Free (local)',
    contextWindow: '131k tokens',
  },
};

// Maps model keys to their provider configuration
export const MODEL_PROVIDER_CONFIG: Record<string, { provider: string; baseUrl: string; requiresApiKey: boolean }> = {
  'qwen/qwen3-vl-8b-instruct': { provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1/', requiresApiKey: true },
  'qwen3-vl:8b-instruct': { provider: 'ollama', baseUrl: 'http://localhost:11434/v1/', requiresApiKey: false },
};

// Type for preset model keys
export type PresetModelId = keyof typeof AVAILABLE_MODELS;

// Type that allows both preset and custom model IDs
export type ModelId = string;
