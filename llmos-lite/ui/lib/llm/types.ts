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
  siteUrl?: string;
  baseURL?: string;
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
  'gemini-3-flash-preview': {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    provider: 'Google',
    inputCost: 'Free tier available',
    outputCost: 'Free tier available',
    contextWindow: '1M tokens',
  },
};

// Type for preset model keys
export type PresetModelId = keyof typeof AVAILABLE_MODELS;

// Type that allows both preset and custom model IDs
export type ModelId = string;
