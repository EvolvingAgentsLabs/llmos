/**
 * Agents Module
 *
 * Claude Agent SDK-inspired agentic architecture for LLMos.
 *
 * This module provides:
 * - MCP-compatible tool definitions
 * - LLM-based pattern matching
 * - Agentic orchestration with planning
 * - Evolution integration for continuous learning
 *
 * Usage:
 * ```typescript
 * import {
 *   executeAgenticTask,
 *   getMCPToolRegistry,
 *   getLLMPatternMatcher,
 *   runEvolutionCycle
 * } from '@/lib/agents';
 *
 * // Execute a task with planning and memory
 * const result = await executeAgenticTask('Create a data visualization', {
 *   planFirst: true,
 *   queryMemory: true
 * });
 *
 * // Get pattern analysis
 * const patterns = await getLLMPatternMatcher().extractPatterns();
 *
 * // Run evolution cycle
 * const report = await runEvolutionCycle();
 * ```
 */

// MCP-Compatible Tools
export {
  type MCPToolDefinition,
  type MCPToolCall,
  type MCPToolResult,
  type MCPToolInputSchema,
  type RegisteredTool,
  type ToolExecutor,
  READ_FILE_TOOL,
  WRITE_FILE_TOOL,
  LIST_DIRECTORY_TOOL,
  EXECUTE_PYTHON_TOOL,
  QUERY_MEMORY_TOOL,
  GENERATE_APPLET_TOOL,
  DELEGATE_TO_AGENT_TOOL,
  getMCPToolRegistry,
  createMCPToolRegistry,
  toOpenAITools,
  toAnthropicTools
} from './mcp-tools';

// LLM Pattern Matcher
export {
  type ExecutionTrace,
  type PatternMatch,
  type SkillRecommendation,
  type ConsolidatedPattern,
  type LLMPatternAnalysis,
  LLMPatternMatcher,
  getLLMPatternMatcher
} from './llm-pattern-matcher';

// Agentic Orchestrator
export {
  type AgentPlan,
  type PlanStep,
  type AgentState,
  type AgenticResult,
  type AgenticProgressEvent,
  type AgenticProgressCallback,
  type AgenticConfig,
  AgenticOrchestrator,
  createAgenticOrchestrator,
  executeAgenticTask
} from './agentic-orchestrator';

// Evolution Integration
export {
  type EvolutionTrigger,
  type SkillCandidate,
  type EvolutionReport,
  EvolutionIntegration,
  getEvolutionIntegration,
  runEvolutionCycle
} from './evolution-integration';
