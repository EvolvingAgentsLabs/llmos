/**
 * Agents Module
 *
 * Claude Agent SDK-inspired agentic architecture for LLMos.
 *
 * ## Philosophy
 *
 * Following the LLMos core principles:
 * - **Agents are markdown files** that can be created, modified, and evolved
 * - **Skills are markdown files** that encode learned knowledge
 * - **Tools are markdown files** that define capabilities
 * - **TypeScript is just a thin runtime** that loads and executes markdown agents
 *
 * ## Architecture
 *
 * ```
 * system/agents/*.md     → Agent definitions (prompts + frontmatter)
 * system/tools/*.md      → Tool definitions (capabilities)
 * system/skills/*.md     → Learned skills and patterns
 * lib/agents/*.ts        → Thin runtime executors
 * ```
 *
 * ## Key Agents (Markdown Files)
 *
 * - `PatternMatcherAgent.md` - Semantic pattern matching using LLM
 * - `PlanningAgent.md` - Creates execution plans before tasks
 * - `SystemAgent.md` - Master orchestrator
 * - `MutationAgent.md` - Cross-domain code transformation
 *
 * ## Usage
 *
 * ```typescript
 * import {
 *   loadAndInvokeAgent,
 *   invokePatternMatcher,
 *   invokePlanningAgent,
 *   executeAgenticTask
 * } from '@/lib/agents';
 *
 * // Invoke a markdown-defined agent directly
 * const result = await loadAndInvokeAgent(
 *   'system/agents/PatternMatcherAgent.md',
 *   'Find similar tasks to: Create FFT visualization',
 *   { traces: [...] }
 * );
 *
 * // Execute a task with planning and memory
 * const result = await executeAgenticTask('Create a data visualization', {
 *   planFirst: true,
 *   queryMemory: true
 * });
 * ```
 */

// =============================================================================
// Agent Loader (Thin Runtime for Markdown Agents)
// =============================================================================

export {
  type AgentFrontmatter,
  type LoadedAgent,
  type AgentInvocation,
  type AgentResponse,
  loadAgent,
  invokeAgent,
  loadAndInvokeAgent,
  invokePatternMatcher,
  invokePlanningAgent,
  discoverAgents,
  loadAgentRegistry
} from './agent-loader';

// =============================================================================
// MCP-Compatible Tools (Runtime Executors)
// =============================================================================

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

// =============================================================================
// LLM Pattern Matcher (Uses PatternMatcherAgent.md)
// =============================================================================

export {
  type ExecutionTrace,
  type PatternMatch,
  type SkillRecommendation,
  type ConsolidatedPattern,
  type LLMPatternAnalysis,
  LLMPatternMatcher,
  getLLMPatternMatcher
} from './llm-pattern-matcher';

// =============================================================================
// Agentic Orchestrator (Coordinates Markdown Agents)
// =============================================================================

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

// =============================================================================
// Evolution Integration (Skill Generation from Patterns)
// =============================================================================

export {
  type EvolutionTrigger,
  type SkillCandidate,
  type EvolutionReport,
  EvolutionIntegration,
  getEvolutionIntegration,
  runEvolutionCycle
} from './evolution-integration';

// =============================================================================
// Model Capabilities (Strategy Selection for Different LLMs)
// =============================================================================

export {
  type ModelCapabilities,
  type ExecutionStrategyType,
  type ExecutionStrategyConfig,
  MODEL_CAPABILITIES,
  getModelCapabilities,
  getExecutionStrategy,
  shouldCompileAgents,
  supportsMarkdownAgents,
  getAgentCapabilityScore,
  getExecutionStrategyConfig,
  analyzeTaskComplexity
} from './model-capabilities';

// =============================================================================
// Agent Compiler (Markdown to Structured Format Transformation)
// =============================================================================

export {
  type CompiledAgent,
  type CompiledToolBinding,
  type ParameterDefinition,
  type ResponseSchema,
  type ContextConfig,
  type CompiledExecutionContext,
  type CompiledExecutionResult,
  AgentCompiler,
  createAgentCompiler,
  compileAgentForModel,
  buildCompiledMessages,
  parseCompiledResponse
} from './agent-compiler';

// =============================================================================
// Agent Messenger (Enhanced Inter-Agent Communication)
// =============================================================================

export {
  type AgentMessage,
  type AgentIdentity,
  type MessageType,
  type MessageContent,
  type TaskInfo,
  type ErrorInfo,
  type Attachment,
  type ContextWindow,
  type MessageFormat,
  type MessageHandler,
  type PendingTask,
  type DelegationResult,
  type MessengerConfig,
  ContextManager,
  MessageFormatter,
  AgentMessengerHub,
  createMessengerHub,
  createAgentIdentity
} from './agent-messenger';

// =============================================================================
// Compiled Agent Runtime (Model-Aware Execution)
// =============================================================================

export {
  type RuntimeConfig,
  type AgentExecutionRequest,
  type AgentExecutionResponse,
  type ToolCallRecord,
  type RuntimeProgressEvent,
  type RuntimeProgressCallback,
  CompiledAgentRuntime,
  createRuntime,
  executeAgent,
  shouldCompileAgent
} from './compiled-agent-runtime';

// =============================================================================
// Model-Aware Orchestrator (Unified Execution Coordinator)
// =============================================================================

export {
  type ModelAwareConfig,
  type SubagentPlan,
  type ExecutionPlan,
  type OrchestratorResult,
  type OrchestratorProgressEvent,
  type OrchestratorProgressCallback,
  ModelAwareOrchestrator,
  createModelAwareOrchestrator,
  executeWithModelAwareness
} from './model-aware-orchestrator';

// =============================================================================
// Client-Side Agent Manager (Full Browser-Based Agent Management)
// =============================================================================

export {
  type Agent,
  type AgentFrontmatter as ClientAgentFrontmatter,
  type AgentValidationResult,
  ClientAgentManager,
  getAgentManager
} from './client-agent-manager';
