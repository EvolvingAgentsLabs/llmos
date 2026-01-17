/**
 * LLM Metrics Store
 *
 * Tracks detailed LLM API metrics including:
 * - Characters sent to LLM
 * - Partial responses (streaming chunks)
 * - Total response characters
 * - Token estimates
 * - Request/response timing
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export interface LLMRequest {
  id: string;
  timestamp: number;
  model: string;
  /** Characters in the request payload */
  requestChars: number;
  /** Estimated tokens in request (chars * 0.25) */
  requestTokensEstimate: number;
  /** Number of messages in the request */
  messageCount: number;
  /** Status of the request */
  status: 'pending' | 'streaming' | 'completed' | 'error';
  /** Start time in ms */
  startTime: number;
  /** End time in ms (when completed) */
  endTime?: number;
  /** Duration in ms */
  duration?: number;
}

export interface LLMResponse {
  requestId: string;
  timestamp: number;
  /** Total characters in the response */
  responseChars: number;
  /** Estimated tokens in response */
  responseTokensEstimate: number;
  /** Number of streaming chunks received (for streaming responses) */
  streamingChunks: number;
  /** Characters received per chunk (for streaming analysis) */
  chunkSizes: number[];
  /** Was this a streaming response */
  isStreaming: boolean;
  /** Actual token usage from API (if available) */
  actualTokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface SessionMetrics {
  /** Total requests made in this session */
  totalRequests: number;
  /** Total characters sent to LLM */
  totalCharsSent: number;
  /** Total characters received from LLM */
  totalCharsReceived: number;
  /** Total estimated tokens used */
  totalTokensEstimate: number;
  /** Total actual tokens (if API reports them) */
  totalActualTokens: number;
  /** Average response time in ms */
  avgResponseTime: number;
  /** Average characters per response */
  avgCharsPerResponse: number;
  /** Total streaming chunks received */
  totalStreamingChunks: number;
  /** Session start time */
  sessionStart: number;
  /** Session duration in ms */
  sessionDuration: number;
}

export interface CurrentRequest {
  id: string;
  model: string;
  startTime: number;
  requestChars: number;
  requestTokensEstimate: number;
  /** For streaming: characters received so far */
  partialResponseChars: number;
  /** For streaming: chunks received so far */
  chunksReceived: number;
  /** Status */
  status: 'pending' | 'streaming' | 'completed' | 'error';
  /** Last chunk timestamp */
  lastChunkTime?: number;
  /** Chars per second rate */
  charsPerSecond?: number;
}

interface LLMMetricsState {
  // Current request being processed
  currentRequest: CurrentRequest | null;

  // History of requests
  requests: LLMRequest[];

  // History of responses
  responses: LLMResponse[];

  // Session-level metrics
  sessionMetrics: SessionMetrics;

  // Max history size
  maxHistory: number;

  // Actions
  startRequest: (model: string, requestChars: number, messageCount: number) => string;
  updateStreamingChunk: (requestId: string, chunkChars: number) => void;
  completeRequest: (requestId: string, totalResponseChars: number, actualTokens?: { prompt: number; completion: number; total: number }) => void;
  failRequest: (requestId: string, error: string) => void;
  resetSession: () => void;

  // Getters
  getSessionMetrics: () => SessionMetrics;
  getCurrentRequestStatus: () => CurrentRequest | null;
  getRecentRequests: (count?: number) => LLMRequest[];
}

// =============================================================================
// Constants
// =============================================================================

const TOKENS_PER_CHAR = 0.25; // Rough estimate: 1 token ≈ 4 characters

// =============================================================================
// Helper Functions
// =============================================================================

const generateId = () => `llm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const estimateTokens = (chars: number): number => Math.ceil(chars * TOKENS_PER_CHAR);

const calculateSessionMetrics = (
  requests: LLMRequest[],
  responses: LLMResponse[],
  sessionStart: number
): SessionMetrics => {
  const completedRequests = requests.filter(r => r.status === 'completed');
  const totalDurations = completedRequests.reduce((sum, r) => sum + (r.duration || 0), 0);

  const totalCharsSent = requests.reduce((sum, r) => sum + r.requestChars, 0);
  const totalCharsReceived = responses.reduce((sum, r) => sum + r.responseChars, 0);
  const totalStreamingChunks = responses.reduce((sum, r) => sum + r.streamingChunks, 0);
  const totalActualTokens = responses.reduce((sum, r) => sum + (r.actualTokens?.total || 0), 0);

  return {
    totalRequests: requests.length,
    totalCharsSent,
    totalCharsReceived,
    totalTokensEstimate: estimateTokens(totalCharsSent + totalCharsReceived),
    totalActualTokens,
    avgResponseTime: completedRequests.length > 0 ? totalDurations / completedRequests.length : 0,
    avgCharsPerResponse: responses.length > 0 ? totalCharsReceived / responses.length : 0,
    totalStreamingChunks,
    sessionStart,
    sessionDuration: Date.now() - sessionStart,
  };
};

// =============================================================================
// Store
// =============================================================================

export const useLLMMetricsStore = create<LLMMetricsState>((set, get) => {
  const sessionStart = Date.now();

  return {
    currentRequest: null,
    requests: [],
    responses: [],
    sessionMetrics: {
      totalRequests: 0,
      totalCharsSent: 0,
      totalCharsReceived: 0,
      totalTokensEstimate: 0,
      totalActualTokens: 0,
      avgResponseTime: 0,
      avgCharsPerResponse: 0,
      totalStreamingChunks: 0,
      sessionStart,
      sessionDuration: 0,
    },
    maxHistory: 100,

    startRequest: (model: string, requestChars: number, messageCount: number) => {
      const id = generateId();
      const now = Date.now();

      const request: LLMRequest = {
        id,
        timestamp: now,
        model,
        requestChars,
        requestTokensEstimate: estimateTokens(requestChars),
        messageCount,
        status: 'pending',
        startTime: now,
      };

      const currentRequest: CurrentRequest = {
        id,
        model,
        startTime: now,
        requestChars,
        requestTokensEstimate: estimateTokens(requestChars),
        partialResponseChars: 0,
        chunksReceived: 0,
        status: 'pending',
      };

      set(state => ({
        currentRequest,
        requests: [...state.requests.slice(-state.maxHistory + 1), request],
      }));

      return id;
    },

    updateStreamingChunk: (requestId: string, chunkChars: number) => {
      const now = Date.now();

      set(state => {
        if (!state.currentRequest || state.currentRequest.id !== requestId) {
          return state;
        }

        const elapsed = now - state.currentRequest.startTime;
        const newPartialChars = state.currentRequest.partialResponseChars + chunkChars;
        const charsPerSecond = elapsed > 0 ? (newPartialChars / elapsed) * 1000 : 0;

        // Update current request
        const updatedCurrent: CurrentRequest = {
          ...state.currentRequest,
          status: 'streaming',
          partialResponseChars: newPartialChars,
          chunksReceived: state.currentRequest.chunksReceived + 1,
          lastChunkTime: now,
          charsPerSecond,
        };

        // Update request in history
        const updatedRequests = state.requests.map(r =>
          r.id === requestId ? { ...r, status: 'streaming' as const } : r
        );

        return {
          currentRequest: updatedCurrent,
          requests: updatedRequests,
        };
      });
    },

    completeRequest: (requestId: string, totalResponseChars: number, actualTokens?: { prompt: number; completion: number; total: number }) => {
      const now = Date.now();

      set(state => {
        const request = state.requests.find(r => r.id === requestId);
        if (!request) return state;

        const duration = now - request.startTime;

        // Update request status
        const updatedRequests = state.requests.map(r =>
          r.id === requestId
            ? { ...r, status: 'completed' as const, endTime: now, duration }
            : r
        );

        // Create response record
        const response: LLMResponse = {
          requestId,
          timestamp: now,
          responseChars: totalResponseChars,
          responseTokensEstimate: estimateTokens(totalResponseChars),
          streamingChunks: state.currentRequest?.chunksReceived || 0,
          chunkSizes: [], // Could track this if needed
          isStreaming: (state.currentRequest?.chunksReceived || 0) > 1,
          actualTokens,
        };

        const newResponses = [...state.responses.slice(-state.maxHistory + 1), response];
        const sessionMetrics = calculateSessionMetrics(updatedRequests, newResponses, state.sessionMetrics.sessionStart);

        return {
          currentRequest: null,
          requests: updatedRequests,
          responses: newResponses,
          sessionMetrics,
        };
      });
    },

    failRequest: (requestId: string, error: string) => {
      const now = Date.now();

      set(state => {
        const request = state.requests.find(r => r.id === requestId);
        if (!request) return state;

        const duration = now - request.startTime;

        const updatedRequests = state.requests.map(r =>
          r.id === requestId
            ? { ...r, status: 'error' as const, endTime: now, duration }
            : r
        );

        return {
          currentRequest: null,
          requests: updatedRequests,
        };
      });
    },

    resetSession: () => {
      const now = Date.now();
      set({
        currentRequest: null,
        requests: [],
        responses: [],
        sessionMetrics: {
          totalRequests: 0,
          totalCharsSent: 0,
          totalCharsReceived: 0,
          totalTokensEstimate: 0,
          totalActualTokens: 0,
          avgResponseTime: 0,
          avgCharsPerResponse: 0,
          totalStreamingChunks: 0,
          sessionStart: now,
          sessionDuration: 0,
        },
      });
    },

    getSessionMetrics: () => {
      const state = get();
      return calculateSessionMetrics(state.requests, state.responses, state.sessionMetrics.sessionStart);
    },

    getCurrentRequestStatus: () => {
      return get().currentRequest;
    },

    getRecentRequests: (count = 10) => {
      return get().requests.slice(-count);
    },
  };
});

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format bytes/characters for display
 */
export function formatChars(chars: number): string {
  if (chars < 1000) return `${chars}`;
  if (chars < 1000000) return `${(chars / 1000).toFixed(1)}K`;
  return `${(chars / 1000000).toFixed(2)}M`;
}

/**
 * Format tokens for display
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Calculate estimated cost based on tokens
 * Uses approximate OpenRouter pricing for Claude models
 */
export function estimateCost(promptTokens: number, completionTokens: number, model: string): number {
  // Approximate costs per 1M tokens (varies by model)
  const costs: Record<string, { input: number; output: number }> = {
    'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
    'anthropic/claude-3-opus': { input: 15, output: 75 },
    'anthropic/claude-3-sonnet': { input: 3, output: 15 },
    'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
    'openai/gpt-4': { input: 30, output: 60 },
    'openai/gpt-4-turbo': { input: 10, output: 30 },
    'openai/gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  };

  const modelCost = costs[model] || { input: 3, output: 15 }; // Default to Sonnet pricing
  return (promptTokens * modelCost.input + completionTokens * modelCost.output) / 1000000;
}

// =============================================================================
// Singleton Accessor
// =============================================================================

/**
 * Get the LLM metrics store instance for use outside React components
 */
export const llmMetrics = {
  startRequest: (model: string, requestChars: number, messageCount: number) =>
    useLLMMetricsStore.getState().startRequest(model, requestChars, messageCount),

  updateStreamingChunk: (requestId: string, chunkChars: number) =>
    useLLMMetricsStore.getState().updateStreamingChunk(requestId, chunkChars),

  completeRequest: (requestId: string, totalResponseChars: number, actualTokens?: { prompt: number; completion: number; total: number }) =>
    useLLMMetricsStore.getState().completeRequest(requestId, totalResponseChars, actualTokens),

  failRequest: (requestId: string, error: string) =>
    useLLMMetricsStore.getState().failRequest(requestId, error),

  getCurrentRequest: () =>
    useLLMMetricsStore.getState().getCurrentRequestStatus(),

  getSessionMetrics: () =>
    useLLMMetricsStore.getState().getSessionMetrics(),
};
