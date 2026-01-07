/**
 * Model Capabilities and Execution Strategy System
 *
 * Defines capabilities of different LLM models and determines
 * the optimal execution strategy for subagents based on the model.
 *
 * Key insight:
 * - Claude models excel at following complex markdown instructions
 * - Other models (Gemini, Llama, etc.) often need more structured approaches
 * - This system enables "compiling" markdown agents to structured formats
 *   for models that benefit from explicit structure
 */

// =============================================================================
// Model Capability Definitions
// =============================================================================

export interface ModelCapabilities {
  // Core capabilities
  markdownInstructionFollowing: 'excellent' | 'good' | 'moderate' | 'limited';
  structuredOutputReliability: 'excellent' | 'good' | 'moderate' | 'limited';
  toolUseAccuracy: 'excellent' | 'good' | 'moderate' | 'limited';
  contextWindowSize: number;

  // Agent-related capabilities
  multiStepReasoning: 'excellent' | 'good' | 'moderate' | 'limited';
  agentDelegation: 'excellent' | 'good' | 'moderate' | 'limited';
  selfCorrection: 'excellent' | 'good' | 'moderate' | 'limited';

  // Recommended execution strategy
  recommendedStrategy: ExecutionStrategyType;

  // Additional metadata
  provider: string;
  supportsStreaming: boolean;
  supportsImages: boolean;
}

export type ExecutionStrategyType =
  | 'markdown'      // Use raw markdown agents (Claude)
  | 'compiled'      // Compile to structured format (Gemini, Llama, etc.)
  | 'hybrid'        // Markdown with structured tool bindings
  | 'simple';       // Simplified prompts for smaller models

// =============================================================================
// Model Registry
// =============================================================================

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // Anthropic Claude Models - Excellent markdown instruction following
  'anthropic/claude-opus-4.5': {
    markdownInstructionFollowing: 'excellent',
    structuredOutputReliability: 'excellent',
    toolUseAccuracy: 'excellent',
    contextWindowSize: 200000,
    multiStepReasoning: 'excellent',
    agentDelegation: 'excellent',
    selfCorrection: 'excellent',
    recommendedStrategy: 'markdown',
    provider: 'anthropic',
    supportsStreaming: true,
    supportsImages: true,
  },
  'anthropic/claude-sonnet-4.5': {
    markdownInstructionFollowing: 'excellent',
    structuredOutputReliability: 'excellent',
    toolUseAccuracy: 'excellent',
    contextWindowSize: 200000,
    multiStepReasoning: 'excellent',
    agentDelegation: 'excellent',
    selfCorrection: 'excellent',
    recommendedStrategy: 'markdown',
    provider: 'anthropic',
    supportsStreaming: true,
    supportsImages: true,
  },
  'anthropic/claude-sonnet-4': {
    markdownInstructionFollowing: 'excellent',
    structuredOutputReliability: 'excellent',
    toolUseAccuracy: 'excellent',
    contextWindowSize: 200000,
    multiStepReasoning: 'excellent',
    agentDelegation: 'good',
    selfCorrection: 'excellent',
    recommendedStrategy: 'markdown',
    provider: 'anthropic',
    supportsStreaming: true,
    supportsImages: true,
  },
  'anthropic/claude-haiku-3.5': {
    markdownInstructionFollowing: 'good',
    structuredOutputReliability: 'good',
    toolUseAccuracy: 'good',
    contextWindowSize: 200000,
    multiStepReasoning: 'good',
    agentDelegation: 'moderate',
    selfCorrection: 'good',
    recommendedStrategy: 'hybrid',
    provider: 'anthropic',
    supportsStreaming: true,
    supportsImages: true,
  },

  // Google Gemini Models - Need more structure
  'google/gemini-2.0-flash': {
    markdownInstructionFollowing: 'good',
    structuredOutputReliability: 'good',
    toolUseAccuracy: 'good',
    contextWindowSize: 1000000,
    multiStepReasoning: 'good',
    agentDelegation: 'moderate',
    selfCorrection: 'good',
    recommendedStrategy: 'compiled',
    provider: 'google',
    supportsStreaming: true,
    supportsImages: true,
  },
  'google/gemini-2.0-pro': {
    markdownInstructionFollowing: 'good',
    structuredOutputReliability: 'good',
    toolUseAccuracy: 'good',
    contextWindowSize: 2000000,
    multiStepReasoning: 'excellent',
    agentDelegation: 'good',
    selfCorrection: 'good',
    recommendedStrategy: 'compiled',
    provider: 'google',
    supportsStreaming: true,
    supportsImages: true,
  },
  'google/gemini-1.5-flash': {
    markdownInstructionFollowing: 'moderate',
    structuredOutputReliability: 'good',
    toolUseAccuracy: 'moderate',
    contextWindowSize: 1000000,
    multiStepReasoning: 'moderate',
    agentDelegation: 'moderate',
    selfCorrection: 'moderate',
    recommendedStrategy: 'compiled',
    provider: 'google',
    supportsStreaming: true,
    supportsImages: true,
  },

  // OpenAI Models
  'openai/gpt-4o': {
    markdownInstructionFollowing: 'good',
    structuredOutputReliability: 'excellent',
    toolUseAccuracy: 'excellent',
    contextWindowSize: 128000,
    multiStepReasoning: 'good',
    agentDelegation: 'good',
    selfCorrection: 'good',
    recommendedStrategy: 'hybrid',
    provider: 'openai',
    supportsStreaming: true,
    supportsImages: true,
  },
  'openai/gpt-4-turbo': {
    markdownInstructionFollowing: 'good',
    structuredOutputReliability: 'good',
    toolUseAccuracy: 'good',
    contextWindowSize: 128000,
    multiStepReasoning: 'good',
    agentDelegation: 'good',
    selfCorrection: 'good',
    recommendedStrategy: 'hybrid',
    provider: 'openai',
    supportsStreaming: true,
    supportsImages: true,
  },
  'openai/gpt-4o-mini': {
    markdownInstructionFollowing: 'moderate',
    structuredOutputReliability: 'good',
    toolUseAccuracy: 'moderate',
    contextWindowSize: 128000,
    multiStepReasoning: 'moderate',
    agentDelegation: 'moderate',
    selfCorrection: 'moderate',
    recommendedStrategy: 'compiled',
    provider: 'openai',
    supportsStreaming: true,
    supportsImages: true,
  },

  // Meta Llama Models - Need structured approach
  'meta-llama/llama-3.3-70b': {
    markdownInstructionFollowing: 'moderate',
    structuredOutputReliability: 'moderate',
    toolUseAccuracy: 'moderate',
    contextWindowSize: 128000,
    multiStepReasoning: 'good',
    agentDelegation: 'moderate',
    selfCorrection: 'moderate',
    recommendedStrategy: 'compiled',
    provider: 'meta',
    supportsStreaming: true,
    supportsImages: false,
  },
  'meta-llama/llama-3.1-8b': {
    markdownInstructionFollowing: 'limited',
    structuredOutputReliability: 'moderate',
    toolUseAccuracy: 'limited',
    contextWindowSize: 128000,
    multiStepReasoning: 'moderate',
    agentDelegation: 'limited',
    selfCorrection: 'limited',
    recommendedStrategy: 'simple',
    provider: 'meta',
    supportsStreaming: true,
    supportsImages: false,
  },

  // Mistral Models
  'mistral/mistral-large': {
    markdownInstructionFollowing: 'good',
    structuredOutputReliability: 'good',
    toolUseAccuracy: 'good',
    contextWindowSize: 128000,
    multiStepReasoning: 'good',
    agentDelegation: 'moderate',
    selfCorrection: 'good',
    recommendedStrategy: 'compiled',
    provider: 'mistral',
    supportsStreaming: true,
    supportsImages: false,
  },
  'mistral/mistral-medium': {
    markdownInstructionFollowing: 'moderate',
    structuredOutputReliability: 'moderate',
    toolUseAccuracy: 'moderate',
    contextWindowSize: 32000,
    multiStepReasoning: 'moderate',
    agentDelegation: 'limited',
    selfCorrection: 'moderate',
    recommendedStrategy: 'compiled',
    provider: 'mistral',
    supportsStreaming: true,
    supportsImages: false,
  },

  // DeepSeek Models
  'deepseek/deepseek-chat': {
    markdownInstructionFollowing: 'good',
    structuredOutputReliability: 'good',
    toolUseAccuracy: 'moderate',
    contextWindowSize: 64000,
    multiStepReasoning: 'good',
    agentDelegation: 'moderate',
    selfCorrection: 'good',
    recommendedStrategy: 'compiled',
    provider: 'deepseek',
    supportsStreaming: true,
    supportsImages: false,
  },
  'deepseek/deepseek-reasoner': {
    markdownInstructionFollowing: 'good',
    structuredOutputReliability: 'good',
    toolUseAccuracy: 'good',
    contextWindowSize: 64000,
    multiStepReasoning: 'excellent',
    agentDelegation: 'good',
    selfCorrection: 'excellent',
    recommendedStrategy: 'compiled',
    provider: 'deepseek',
    supportsStreaming: true,
    supportsImages: false,
  },

  // Qwen Models
  'qwen/qwen-2.5-72b': {
    markdownInstructionFollowing: 'good',
    structuredOutputReliability: 'good',
    toolUseAccuracy: 'moderate',
    contextWindowSize: 128000,
    multiStepReasoning: 'good',
    agentDelegation: 'moderate',
    selfCorrection: 'good',
    recommendedStrategy: 'compiled',
    provider: 'alibaba',
    supportsStreaming: true,
    supportsImages: false,
  },
};

// Default capabilities for unknown models
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  markdownInstructionFollowing: 'moderate',
  structuredOutputReliability: 'moderate',
  toolUseAccuracy: 'moderate',
  contextWindowSize: 32000,
  multiStepReasoning: 'moderate',
  agentDelegation: 'limited',
  selfCorrection: 'moderate',
  recommendedStrategy: 'compiled',
  provider: 'unknown',
  supportsStreaming: true,
  supportsImages: false,
};

// =============================================================================
// Capability Detection Functions
// =============================================================================

/**
 * Get capabilities for a model
 */
export function getModelCapabilities(modelId: string): ModelCapabilities {
  // Direct match
  if (MODEL_CAPABILITIES[modelId]) {
    return MODEL_CAPABILITIES[modelId];
  }

  // Try to match by provider prefix
  const normalizedId = modelId.toLowerCase();

  if (normalizedId.includes('claude') || normalizedId.includes('anthropic')) {
    // Default to Claude Sonnet capabilities
    return MODEL_CAPABILITIES['anthropic/claude-sonnet-4.5'];
  }

  if (normalizedId.includes('gemini') || normalizedId.includes('google')) {
    return MODEL_CAPABILITIES['google/gemini-2.0-flash'];
  }

  if (normalizedId.includes('gpt') || normalizedId.includes('openai')) {
    return MODEL_CAPABILITIES['openai/gpt-4o'];
  }

  if (normalizedId.includes('llama') || normalizedId.includes('meta')) {
    return MODEL_CAPABILITIES['meta-llama/llama-3.3-70b'];
  }

  if (normalizedId.includes('mistral')) {
    return MODEL_CAPABILITIES['mistral/mistral-large'];
  }

  if (normalizedId.includes('deepseek')) {
    return MODEL_CAPABILITIES['deepseek/deepseek-chat'];
  }

  if (normalizedId.includes('qwen')) {
    return MODEL_CAPABILITIES['qwen/qwen-2.5-72b'];
  }

  return DEFAULT_CAPABILITIES;
}

/**
 * Get the recommended execution strategy for a model
 */
export function getExecutionStrategy(modelId: string): ExecutionStrategyType {
  const capabilities = getModelCapabilities(modelId);
  return capabilities.recommendedStrategy;
}

/**
 * Check if a model should use compiled agents
 */
export function shouldCompileAgents(modelId: string): boolean {
  const strategy = getExecutionStrategy(modelId);
  return strategy === 'compiled' || strategy === 'simple';
}

/**
 * Check if a model can handle markdown agents directly
 */
export function supportsMarkdownAgents(modelId: string): boolean {
  const strategy = getExecutionStrategy(modelId);
  return strategy === 'markdown' || strategy === 'hybrid';
}

/**
 * Get capability score (0-100) for agent execution
 */
export function getAgentCapabilityScore(modelId: string): number {
  const capabilities = getModelCapabilities(modelId);

  const scoreMap = {
    'excellent': 100,
    'good': 75,
    'moderate': 50,
    'limited': 25
  };

  const scores = [
    scoreMap[capabilities.markdownInstructionFollowing],
    scoreMap[capabilities.structuredOutputReliability],
    scoreMap[capabilities.toolUseAccuracy],
    scoreMap[capabilities.multiStepReasoning],
    scoreMap[capabilities.agentDelegation],
    scoreMap[capabilities.selfCorrection],
  ];

  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// =============================================================================
// Execution Strategy Configuration
// =============================================================================

export interface ExecutionStrategyConfig {
  type: ExecutionStrategyType;

  // Compilation options
  compileSystemPrompt: boolean;
  compileToolDefinitions: boolean;
  useStructuredMessages: boolean;

  // Context management
  maxContextTokens: number;
  reserveTokensForOutput: number;
  summarizeContext: boolean;

  // Subagent handling
  subagentMessageFormat: 'markdown' | 'json' | 'xml';
  includeExplicitInstructions: boolean;
  requireStructuredResponses: boolean;

  // Error handling
  maxRetries: number;
  selfHealingEnabled: boolean;
}

/**
 * Get execution strategy configuration for a model
 */
export function getExecutionStrategyConfig(modelId: string): ExecutionStrategyConfig {
  const capabilities = getModelCapabilities(modelId);
  const strategy = capabilities.recommendedStrategy;

  switch (strategy) {
    case 'markdown':
      return {
        type: 'markdown',
        compileSystemPrompt: false,
        compileToolDefinitions: false,
        useStructuredMessages: false,
        maxContextTokens: capabilities.contextWindowSize * 0.8,
        reserveTokensForOutput: 4000,
        summarizeContext: capabilities.contextWindowSize < 100000,
        subagentMessageFormat: 'markdown',
        includeExplicitInstructions: false,
        requireStructuredResponses: false,
        maxRetries: 3,
        selfHealingEnabled: true,
      };

    case 'hybrid':
      return {
        type: 'hybrid',
        compileSystemPrompt: false,
        compileToolDefinitions: true,
        useStructuredMessages: true,
        maxContextTokens: capabilities.contextWindowSize * 0.75,
        reserveTokensForOutput: 4000,
        summarizeContext: true,
        subagentMessageFormat: 'json',
        includeExplicitInstructions: true,
        requireStructuredResponses: true,
        maxRetries: 3,
        selfHealingEnabled: true,
      };

    case 'compiled':
      return {
        type: 'compiled',
        compileSystemPrompt: true,
        compileToolDefinitions: true,
        useStructuredMessages: true,
        maxContextTokens: capabilities.contextWindowSize * 0.7,
        reserveTokensForOutput: 4000,
        summarizeContext: true,
        subagentMessageFormat: 'json',
        includeExplicitInstructions: true,
        requireStructuredResponses: true,
        maxRetries: 5,
        selfHealingEnabled: true,
      };

    case 'simple':
      return {
        type: 'simple',
        compileSystemPrompt: true,
        compileToolDefinitions: true,
        useStructuredMessages: true,
        maxContextTokens: capabilities.contextWindowSize * 0.6,
        reserveTokensForOutput: 2000,
        summarizeContext: true,
        subagentMessageFormat: 'json',
        includeExplicitInstructions: true,
        requireStructuredResponses: true,
        maxRetries: 5,
        selfHealingEnabled: false, // Simpler models may struggle with self-healing
      };
  }
}

// =============================================================================
// Strategy Selection Helpers
// =============================================================================

/**
 * Analyze task complexity and recommend strategy adjustments
 */
export function analyzeTaskComplexity(task: string): {
  complexity: 'low' | 'medium' | 'high';
  suggestedStrategyAdjustment?: Partial<ExecutionStrategyConfig>;
} {
  const taskLower = task.toLowerCase();

  // Indicators of high complexity
  const highComplexityIndicators = [
    'multi-step', 'complex', 'analyze', 'create project',
    'build application', 'implement', 'architect', 'design system',
    'multiple agents', 'coordinate', 'orchestrate'
  ];

  // Indicators of low complexity
  const lowComplexityIndicators = [
    'simple', 'quick', 'just', 'only', 'basic',
    'single', 'one file', 'small change', 'fix'
  ];

  const highCount = highComplexityIndicators.filter(i => taskLower.includes(i)).length;
  const lowCount = lowComplexityIndicators.filter(i => taskLower.includes(i)).length;

  if (highCount >= 2 || taskLower.length > 500) {
    return {
      complexity: 'high',
      suggestedStrategyAdjustment: {
        maxRetries: 5,
        summarizeContext: true,
        includeExplicitInstructions: true,
      }
    };
  }

  if (lowCount >= 2 || taskLower.length < 100) {
    return {
      complexity: 'low',
      suggestedStrategyAdjustment: {
        maxRetries: 2,
        summarizeContext: false,
      }
    };
  }

  return { complexity: 'medium' };
}
