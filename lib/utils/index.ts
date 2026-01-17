/**
 * LLMos Utility Functions Index
 *
 * This module exports all utility functions for:
 * - Smart token estimation
 * - Parallel tool execution
 * - Confidence-based stopping
 * - Lazy skill loading
 */

// Smart Token Estimation
export {
  estimateTokens,
  estimateTokensSmart,
  estimateTokensLargeContent,
  estimateMessagesTokens,
  analyzeContent,
  smartTokenEstimator,
  TOKEN_RATIOS,
  type TokenEstimate,
  type ContentAnalysis,
} from './smart-token-estimator';

// Parallel Tool Execution
export {
  executeToolsParallel,
  analyzeToolDependencies,
  canExecuteInParallel,
  estimateParallelSpeedup,
  parallelToolExecutor,
  type ToolCall,
  type ToolResult,
  type ExecutionBatch,
  type ParallelExecutionResult,
  type ExecutionProgress,
} from './parallel-tool-executor';

// Confidence-Based Stopping
export {
  shouldStop,
  createHistoryTracker,
  confidenceStopping,
  DEFAULT_STOPPING_CONFIG,
  type ConfidenceSignal,
  type StoppingDecision,
  type IterationHistory,
  type StoppingConfig,
} from './confidence-based-stopping';

// Lazy Skill Loading
export {
  LazySkillLoader,
  createLazySkillLoader,
  lazySkillLoader,
  DEFAULT_LOADER_CONFIG,
  type Skill,
  type SkillMatch,
  type LazyLoaderConfig,
} from './lazy-skill-loader';
