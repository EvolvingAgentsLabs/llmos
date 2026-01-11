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
  // Anthropic Claude
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
  'claude-sonnet-4': {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    inputCost: '$3/M tokens',
    outputCost: '$15/M tokens',
    contextWindow: '200K tokens',
  },
  'claude-haiku-3.5': {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Claude Haiku 3.5',
    provider: 'Anthropic',
    inputCost: '$0.80/M tokens',
    outputCost: '$4/M tokens',
    contextWindow: '200K tokens',
  },

  // DeepSeek
  'deepseek-r1': {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'DeepSeek',
    inputCost: '$0.55/M tokens',
    outputCost: '$2.19/M tokens',
    contextWindow: '64K tokens',
  },
  'deepseek-chat': {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3',
    provider: 'DeepSeek',
    inputCost: '$0.27/M tokens',
    outputCost: '$1.10/M tokens',
    contextWindow: '64K tokens',
  },
  'deepseek-r1-free': {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1 (Free)',
    provider: 'DeepSeek',
    inputCost: 'Free',
    outputCost: 'Free',
    contextWindow: '64K tokens',
  },

  // Google Gemini
  'gemini-2.5-pro': {
    id: 'google/gemini-2.5-pro-preview-06-05',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    inputCost: '$1.25/M tokens',
    outputCost: '$10/M tokens',
    contextWindow: '1M tokens',
  },
  'gemini-2.5-flash': {
    id: 'google/gemini-2.5-flash-preview-05-20',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    inputCost: '$0.15/M tokens',
    outputCost: '$0.60/M tokens',
    contextWindow: '1M tokens',
  },
  'gemini-2-flash': {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    inputCost: '$0.10/M tokens',
    outputCost: '$0.40/M tokens',
    contextWindow: '1M tokens',
  },

  // OpenAI
  'gpt-4o': {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    inputCost: '$2.50/M tokens',
    outputCost: '$10/M tokens',
    contextWindow: '128K tokens',
  },
  'gpt-4o-mini': {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    inputCost: '$0.15/M tokens',
    outputCost: '$0.60/M tokens',
    contextWindow: '128K tokens',
  },
  'o3-mini': {
    id: 'openai/o3-mini',
    name: 'o3-mini',
    provider: 'OpenAI',
    inputCost: '$1.10/M tokens',
    outputCost: '$4.40/M tokens',
    contextWindow: '200K tokens',
  },

  // Meta Llama
  'llama-4-maverick': {
    id: 'meta-llama/llama-4-maverick',
    name: 'Llama 4 Maverick',
    provider: 'Meta',
    inputCost: '$0.20/M tokens',
    outputCost: '$0.50/M tokens',
    contextWindow: '1M tokens',
  },
  'llama-3.3-70b': {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    provider: 'Meta',
    inputCost: '$0.10/M tokens',
    outputCost: '$0.20/M tokens',
    contextWindow: '128K tokens',
  },

  // Mistral
  'mistral-large': {
    id: 'mistralai/mistral-large-2411',
    name: 'Mistral Large',
    provider: 'Mistral',
    inputCost: '$2/M tokens',
    outputCost: '$6/M tokens',
    contextWindow: '128K tokens',
  },
  'codestral': {
    id: 'mistralai/codestral-2501',
    name: 'Codestral',
    provider: 'Mistral',
    inputCost: '$0.30/M tokens',
    outputCost: '$0.90/M tokens',
    contextWindow: '256K tokens',
  },

  // Qwen
  'qwen-2.5-coder-32b': {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B',
    provider: 'Qwen',
    inputCost: '$0.07/M tokens',
    outputCost: '$0.16/M tokens',
    contextWindow: '32K tokens',
  },
  'qwq-32b': {
    id: 'qwen/qwq-32b',
    name: 'QwQ 32B',
    provider: 'Qwen',
    inputCost: '$0.12/M tokens',
    outputCost: '$0.18/M tokens',
    contextWindow: '32K tokens',
  },
};

// Type for preset model keys
export type PresetModelId = keyof typeof AVAILABLE_MODELS;

// Type that allows both preset and custom model IDs
export type ModelId = string;
