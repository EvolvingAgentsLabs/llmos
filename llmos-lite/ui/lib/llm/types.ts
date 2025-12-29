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

export const AVAILABLE_MODELS = {
  // Anthropic Claude 4.5
  'claude-opus-4.5': {
    id: 'anthropic/claude-opus-4.5',
    name: 'Claude Opus 4.5',
    provider: 'Anthropic',
    inputCost: '$15/M tokens',
    outputCost: '$75/M tokens',
    contextWindow: '200K tokens',
  },
  'claude-sonnet-4.5': {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    inputCost: '$3/M tokens',
    outputCost: '$15/M tokens',
    contextWindow: '200K tokens',
  },
} as const;

export type ModelId = keyof typeof AVAILABLE_MODELS;
