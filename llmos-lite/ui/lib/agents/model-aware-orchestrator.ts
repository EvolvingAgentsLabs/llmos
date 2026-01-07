/**
 * Model-Aware Orchestrator
 *
 * Unified orchestrator that intelligently coordinates subagent execution
 * based on the target LLM model's capabilities. This is the main entry point
 * for model-aware agent execution in LLMos.
 *
 * Key responsibilities:
 * 1. Analyze task and determine execution strategy
 * 2. Compile agents if needed (for non-Claude models)
 * 3. Manage inter-agent communication
 * 4. Execute subagents with appropriate runtime
 * 5. Handle context window management
 * 6. Track execution for evolution/learning
 */

import { createLLMClient } from '../llm/client';
import { Message } from '../llm/types';
import { LoadedAgent, loadAgent, loadAgentRegistry } from './agent-loader';
import {
  ExecutionStrategyType,
  getExecutionStrategy,
  getModelCapabilities,
  getExecutionStrategyConfig,
  analyzeTaskComplexity,
  shouldCompileAgents,
  ModelCapabilities,
} from './model-capabilities';
import {
  AgentCompiler,
  CompiledAgent,
  compileAgentForModel,
} from './agent-compiler';
import {
  AgentMessengerHub,
  AgentIdentity,
  createMessengerHub,
  createAgentIdentity,
  DelegationResult,
} from './agent-messenger';
import {
  CompiledAgentRuntime,
  createRuntime,
  AgentExecutionResponse,
} from './compiled-agent-runtime';
import { getMCPToolRegistry, MCPToolDefinition } from './mcp-tools';
import { getLLMPatternMatcher, ExecutionTrace, PatternMatch } from './llm-pattern-matcher';
import { logger } from '../debug/logger';
import { planLogger } from '../debug/plan-log-store';

// =============================================================================
// Types
// =============================================================================

export interface ModelAwareConfig {
  modelId: string;
  forceStrategy?: ExecutionStrategyType;
  enableMessaging?: boolean;
  enableLearning?: boolean;
  maxSubagents?: number;
  maxIterations?: number;
  verbose?: boolean;
}

export interface SubagentPlan {
  agentPath: string;
  agentName: string;
  task: string;
  strategy: ExecutionStrategyType;
  compilationNeeded: boolean;
  dependencies: string[];
  priority: number;
}

export interface ExecutionPlan {
  taskAnalysis: {
    complexity: 'low' | 'medium' | 'high';
    requiresSubagents: boolean;
    estimatedSubagents: number;
  };
  modelStrategy: {
    modelId: string;
    capabilities: ModelCapabilities;
    baseStrategy: ExecutionStrategyType;
  };
  subagentPlans: SubagentPlan[];
  executionOrder: string[][];  // Groups that can run in parallel
  contextBudget: {
    totalTokens: number;
    perAgentTokens: number;
    reservedForOutput: number;
  };
  memoryInsights: PatternMatch[];
}

export interface OrchestratorResult {
  success: boolean;
  response: string;
  plan: ExecutionPlan | null;
  subagentResults: Map<string, AgentExecutionResponse>;
  totalExecutionTime: number;
  tokensUsed: number;
  learningRecorded: boolean;
}

export interface OrchestratorProgressEvent {
  type: 'planning' | 'compiling' | 'executing' | 'delegating' | 'completed' | 'error';
  phase: string;
  message: string;
  details?: any;
  timestamp: number;
}

export type OrchestratorProgressCallback = (event: OrchestratorProgressEvent) => void;

// =============================================================================
// Model-Aware Orchestrator
// =============================================================================

export class ModelAwareOrchestrator {
  private config: ModelAwareConfig;
  private capabilities: ModelCapabilities;
  private strategy: ExecutionStrategyType;
  private runtime: CompiledAgentRuntime;
  private messenger: AgentMessengerHub | null;
  private compiler: AgentCompiler;
  private toolRegistry = getMCPToolRegistry();
  private patternMatcher = getLLMPatternMatcher();
  private progressCallback?: OrchestratorProgressCallback;

  // Controller identity
  private controllerIdentity: AgentIdentity = {
    id: 'model-aware-orchestrator',
    name: 'ModelAwareOrchestrator',
    type: 'controller',
  };

  // Compiled agent cache
  private compiledAgents: Map<string, CompiledAgent> = new Map();

  constructor(config: ModelAwareConfig, progressCallback?: OrchestratorProgressCallback) {
    this.config = config;
    this.capabilities = getModelCapabilities(config.modelId);
    this.strategy = config.forceStrategy || getExecutionStrategy(config.modelId);
    this.compiler = new AgentCompiler(config.modelId);
    this.runtime = createRuntime(config.modelId, {
      maxIterations: config.maxIterations,
      verbose: config.verbose,
      enableMessaging: config.enableMessaging,
    });
    this.messenger = config.enableMessaging ? createMessengerHub(config.modelId) : null;
    this.progressCallback = progressCallback;
  }

  // =============================================================================
  // Main Execution API
  // =============================================================================

  /**
   * Execute a task with intelligent model-aware orchestration
   */
  async execute(task: string, context?: Record<string, any>): Promise<OrchestratorResult> {
    const startTime = performance.now();
    const subagentResults = new Map<string, AgentExecutionResponse>();

    // Start plan execution logging
    const executionId = planLogger.startPlan(task, this.config.modelId);
    logger.info('plan', `Starting model-aware orchestration`, {
      executionId,
      modelId: this.config.modelId,
      strategy: this.strategy,
    });

    try {
      // Phase 1: Create execution plan
      planLogger.setPhase('planning');
      logger.info('plan', 'Phase 1: Creating execution plan');

      this.emit({
        type: 'planning',
        phase: 'analysis',
        message: 'Analyzing task and creating execution plan...',
      });

      const plan = await this.createExecutionPlan(task, context);

      logger.success('plan', `Execution plan created`, {
        subagentCount: plan.subagentPlans.length,
        strategy: plan.modelStrategy.baseStrategy,
        complexity: plan.taskAnalysis.complexity,
      });

      this.emit({
        type: 'planning',
        phase: 'complete',
        message: `Plan created: ${plan.subagentPlans.length} subagents, strategy: ${plan.modelStrategy.baseStrategy}`,
        details: plan,
      });

      // Phase 2: Compile agents if needed
      const needsCompilation = plan.subagentPlans.filter(p => p.compilationNeeded);
      if (needsCompilation.length > 0) {
        logger.info('agent', `Compiling ${needsCompilation.length} agents for target model`);
        planLogger.info(`Compiling ${needsCompilation.length} agents`);

        this.emit({
          type: 'compiling',
          phase: 'start',
          message: 'Compiling agents for target model...',
        });

        await this.compileAgents(needsCompilation);

        logger.success('agent', 'Agent compilation complete');
        planLogger.info('Agent compilation complete');

        this.emit({
          type: 'compiling',
          phase: 'complete',
          message: 'Agent compilation complete',
        });
      }

      // Phase 3: Execute subagents
      planLogger.setPhase('executing');
      logger.info('plan', `Phase 2: Executing ${plan.executionOrder.length} agent groups`);

      for (let groupIndex = 0; groupIndex < plan.executionOrder.length; groupIndex++) {
        const parallelGroup = plan.executionOrder[groupIndex];
        logger.info('agent', `Executing agent group ${groupIndex + 1}/${plan.executionOrder.length}`, {
          agents: parallelGroup,
        });
        planLogger.info(`Executing group: ${parallelGroup.join(', ')}`);

        this.emit({
          type: 'executing',
          phase: 'group',
          message: `Executing agent group: ${parallelGroup.join(', ')}`,
        });

        // Execute agents in parallel within each group
        const groupResults = await Promise.all(
          parallelGroup.map(agentName => {
            const agentPlan = plan.subagentPlans.find(p => p.agentName === agentName);
            if (!agentPlan) {
              logger.warn('agent', `Agent plan not found for ${agentName}`);
              return null;
            }

            planLogger.agentStart(agentName, agentPlan.task);
            return this.executeSubagent(agentPlan, context, subagentResults);
          })
        );

        // Store results
        for (let i = 0; i < parallelGroup.length; i++) {
          const result = groupResults[i];
          if (result) {
            subagentResults.set(parallelGroup[i], result);
            planLogger.agentComplete(parallelGroup[i], result.success, result.executionTime);

            if (result.success) {
              logger.success('agent', `Agent ${parallelGroup[i]} completed`, {
                iterations: result.iterations,
                toolCalls: result.toolCalls.length,
              });
            } else {
              logger.error('agent', `Agent ${parallelGroup[i]} failed`, {
                error: result.response,
              });
            }
          }
        }
      }

      // Phase 4: Synthesize results
      planLogger.setPhase('reflecting');
      logger.info('plan', 'Phase 3: Synthesizing results');
      const finalResponse = this.synthesizeResults(task, plan, subagentResults);

      // Phase 5: Record learning if enabled
      let learningRecorded = false;
      if (this.config.enableLearning) {
        logger.debug('memory', 'Recording execution for learning');
        learningRecorded = await this.recordExecution(task, plan, subagentResults, true);
        logger.info('memory', learningRecorded ? 'Learning recorded' : 'Learning recording skipped');
      }

      const totalExecutionTime = performance.now() - startTime;
      logger.success('plan', `Model-aware orchestration completed successfully`, {
        totalExecutionTime: `${(totalExecutionTime / 1000).toFixed(2)}s`,
        subagentCount: subagentResults.size,
        tokensUsed: this.estimateTokensUsed(plan, subagentResults),
      });
      planLogger.success(`Completed in ${(totalExecutionTime / 1000).toFixed(2)}s`);
      planLogger.endPlan(true);

      this.emit({
        type: 'completed',
        phase: 'done',
        message: 'Execution completed successfully',
        details: { subagentCount: subagentResults.size },
      });

      return {
        success: true,
        response: finalResponse,
        plan,
        subagentResults,
        totalExecutionTime,
        tokensUsed: this.estimateTokensUsed(plan, subagentResults),
        learningRecorded,
      };

    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      logger.error('plan', `Model-aware orchestration failed: ${errorMessage}`, {
        error: errorMessage,
        stack: error.stack,
      });
      planLogger.error(errorMessage, error);
      planLogger.endPlan(false, errorMessage);

      this.emit({
        type: 'error',
        phase: 'failed',
        message: error.message,
        details: error,
      });

      // Record failure for learning
      if (this.config.enableLearning) {
        await this.recordExecution(task, null, subagentResults, false);
      }

      return {
        success: false,
        response: error.message,
        plan: null,
        subagentResults,
        totalExecutionTime: performance.now() - startTime,
        tokensUsed: 0,
        learningRecorded: false,
      };
    }
  }

  /**
   * Execute a single subagent with delegation
   */
  async delegateToSubagent(
    agentPath: string,
    task: string,
    context?: Record<string, any>
  ): Promise<AgentExecutionResponse> {
    const agent = await loadAgent(agentPath);
    if (!agent) {
      return {
        success: false,
        response: `Agent not found: ${agentPath}`,
        toolCalls: [],
        filesCreated: [],
        executionTime: 0,
        iterations: 0,
        strategy: this.strategy,
      };
    }

    const plan: SubagentPlan = {
      agentPath,
      agentName: agent.frontmatter.name,
      task,
      strategy: this.strategy,
      compilationNeeded: shouldCompileAgents(this.config.modelId),
      dependencies: [],
      priority: 1,
    };

    return this.executeSubagent(plan, context, new Map());
  }

  // =============================================================================
  // Planning
  // =============================================================================

  private async createExecutionPlan(
    task: string,
    context?: Record<string, any>
  ): Promise<ExecutionPlan> {
    // Analyze task complexity
    const taskAnalysis = analyzeTaskComplexity(task);

    // Query memory for similar tasks
    const memoryInsights = await this.patternMatcher.findSimilarTasks(task, {
      limit: 3,
      minSimilarity: 0.3,
    });

    // Get available agents
    const availableAgents = await loadAgentRegistry('system/agents');

    // Determine which agents are needed
    const neededAgents = await this.selectAgentsForTask(task, availableAgents, memoryInsights);

    // Calculate context budget
    const strategyConfig = getExecutionStrategyConfig(this.config.modelId);
    const totalTokens = strategyConfig.maxContextTokens;
    const reservedForOutput = strategyConfig.reserveTokensForOutput;
    const perAgentTokens = Math.floor((totalTokens - reservedForOutput) / Math.max(neededAgents.length, 1));

    // Create subagent plans
    const subagentPlans: SubagentPlan[] = neededAgents.map((agent, index) => ({
      agentPath: agent.filePath,
      agentName: agent.frontmatter.name,
      task: this.createSubtask(task, agent, index),
      strategy: this.strategy,
      compilationNeeded: shouldCompileAgents(this.config.modelId),
      dependencies: this.determineDependencies(agent, neededAgents.slice(0, index)),
      priority: index + 1,
    }));

    // Determine execution order (group by dependencies)
    const executionOrder = this.createExecutionOrder(subagentPlans);

    return {
      taskAnalysis: {
        complexity: taskAnalysis.complexity,
        requiresSubagents: neededAgents.length > 0,
        estimatedSubagents: neededAgents.length,
      },
      modelStrategy: {
        modelId: this.config.modelId,
        capabilities: this.capabilities,
        baseStrategy: this.strategy,
      },
      subagentPlans,
      executionOrder,
      contextBudget: {
        totalTokens,
        perAgentTokens,
        reservedForOutput,
      },
      memoryInsights,
    };
  }

  private async selectAgentsForTask(
    task: string,
    availableAgents: LoadedAgent[],
    memoryInsights: PatternMatch[]
  ): Promise<LoadedAgent[]> {
    const taskLower = task.toLowerCase();
    const selected: LoadedAgent[] = [];

    // Keywords for different agent types
    const agentKeywords: Record<string, string[]> = {
      'PlanningAgent': ['plan', 'design', 'architect', 'strategy'],
      'PatternMatcherAgent': ['similar', 'pattern', 'match', 'find'],
      'MutationAgent': ['transform', 'convert', 'mutate', 'adapt'],
      'LensSelectorAgent': ['domain', 'scientific', 'model', 'lens'],
    };

    // Select based on task keywords
    for (const agent of availableAgents) {
      const keywords = agentKeywords[agent.frontmatter.name] || [];
      const capabilities = agent.frontmatter.capabilities || [];

      // Check if task matches agent capabilities
      const matchesKeyword = keywords.some(k => taskLower.includes(k));
      const matchesCapability = capabilities.some(c =>
        taskLower.includes(c.toLowerCase())
      );

      if (matchesKeyword || matchesCapability) {
        selected.push(agent);
      }
    }

    // Learn from memory insights
    for (const insight of memoryInsights) {
      // If a similar task used certain agents successfully, include them
      if (insight.relevantAspects) {
        for (const aspect of insight.relevantAspects) {
          const matchingAgent = availableAgents.find(a =>
            a.frontmatter.name.toLowerCase().includes(aspect.toLowerCase())
          );
          if (matchingAgent && !selected.includes(matchingAgent)) {
            selected.push(matchingAgent);
          }
        }
      }
    }

    // Limit to max subagents
    const maxSubagents = this.config.maxSubagents || 5;
    return selected.slice(0, maxSubagents);
  }

  private createSubtask(task: string, agent: LoadedAgent, index: number): string {
    // Create a focused subtask based on agent capabilities
    const capabilities = agent.frontmatter.capabilities || [];
    const capList = capabilities.slice(0, 3).join(', ');

    return `As ${agent.frontmatter.name} (specializing in ${capList}), help with: ${task}`;
  }

  private determineDependencies(
    agent: LoadedAgent,
    previousAgents: LoadedAgent[]
  ): string[] {
    // Simple dependency logic - planning should come first
    const dependencies: string[] = [];

    if (agent.frontmatter.type !== 'orchestrator') {
      const planner = previousAgents.find(a => a.frontmatter.name === 'PlanningAgent');
      if (planner) {
        dependencies.push(planner.frontmatter.name);
      }
    }

    return dependencies;
  }

  private createExecutionOrder(plans: SubagentPlan[]): string[][] {
    const order: string[][] = [];
    const completed = new Set<string>();

    while (completed.size < plans.length) {
      const currentGroup: string[] = [];

      for (const plan of plans) {
        if (completed.has(plan.agentName)) continue;

        // Check if all dependencies are completed
        const depsCompleted = plan.dependencies.every(d => completed.has(d));
        if (depsCompleted) {
          currentGroup.push(plan.agentName);
        }
      }

      if (currentGroup.length === 0) {
        // Circular dependency or error - add remaining
        const remaining = plans
          .filter(p => !completed.has(p.agentName))
          .map(p => p.agentName);
        order.push(remaining);
        break;
      }

      order.push(currentGroup);
      currentGroup.forEach(name => completed.add(name));
    }

    return order;
  }

  // =============================================================================
  // Compilation
  // =============================================================================

  private async compileAgents(plans: SubagentPlan[]): Promise<void> {
    const tools = this.toolRegistry.getDefinitions();

    for (const plan of plans) {
      const cacheKey = `${plan.agentPath}:${this.config.modelId}`;

      if (!this.compiledAgents.has(cacheKey)) {
        const agent = await loadAgent(plan.agentPath);
        if (agent) {
          const compiled = this.compiler.compile(agent, tools);
          this.compiledAgents.set(cacheKey, compiled);
        }
      }
    }
  }

  // =============================================================================
  // Execution
  // =============================================================================

  private async executeSubagent(
    plan: SubagentPlan,
    context: Record<string, any> | undefined,
    previousResults: Map<string, AgentExecutionResponse>
  ): Promise<AgentExecutionResponse> {
    // Build context including previous results
    const enrichedContext = {
      ...context,
      previousResults: Object.fromEntries(
        Array.from(previousResults.entries()).map(([k, v]) => [k, {
          success: v.success,
          response: v.response.substring(0, 500),  // Truncate for context
        }])
      ),
    };

    // Execute using the runtime
    return this.runtime.execute({
      agentPath: plan.agentPath,
      task: plan.task,
      context: enrichedContext,
    });
  }

  // =============================================================================
  // Synthesis
  // =============================================================================

  private synthesizeResults(
    task: string,
    plan: ExecutionPlan,
    results: Map<string, AgentExecutionResponse>
  ): string {
    const parts: string[] = [];

    parts.push(`## Task Execution Summary\n`);
    parts.push(`**Original Task:** ${task}\n`);
    parts.push(`**Model:** ${this.config.modelId}`);
    parts.push(`**Strategy:** ${plan.modelStrategy.baseStrategy}\n`);

    parts.push(`### Subagent Results\n`);

    for (const [agentName, result] of results) {
      const status = result.success ? '✅' : '❌';
      parts.push(`#### ${status} ${agentName}`);
      parts.push(`- Iterations: ${result.iterations}`);
      parts.push(`- Tool calls: ${result.toolCalls.length}`);
      parts.push(`- Time: ${result.executionTime.toFixed(0)}ms`);

      if (result.success) {
        // Truncate long responses
        const response = result.response.length > 500
          ? result.response.substring(0, 500) + '...'
          : result.response;
        parts.push(`\n${response}\n`);
      } else {
        parts.push(`\n**Error:** ${result.response}\n`);
      }
    }

    return parts.join('\n');
  }

  // =============================================================================
  // Learning
  // =============================================================================

  private async recordExecution(
    task: string,
    plan: ExecutionPlan | null,
    results: Map<string, AgentExecutionResponse>,
    success: boolean
  ): Promise<boolean> {
    try {
      const trace: ExecutionTrace = {
        id: `trace-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        goal: task,
        success,
        toolsUsed: Array.from(results.values())
          .flatMap(r => r.toolCalls.map(tc => tc.tool))
          .filter((v, i, a) => a.indexOf(v) === i),
        filesCreated: Array.from(results.values()).flatMap(r => r.filesCreated),
        duration: Array.from(results.values()).reduce((sum, r) => sum + r.executionTime, 0),
        timestamp: new Date().toISOString(),
        subAgentsUsed: plan?.subagentPlans.map(p => ({
          agentName: p.agentName,
          agentPath: p.agentPath,
          volume: 'system',
          task: p.task,
          success: results.get(p.agentName)?.success || false,
          executionTime: results.get(p.agentName)?.executionTime || 0,
          timestamp: new Date().toISOString(),
        })),
      };

      this.patternMatcher.addTrace(trace);
      return true;
    } catch {
      return false;
    }
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  private estimateTokensUsed(
    plan: ExecutionPlan,
    results: Map<string, AgentExecutionResponse>
  ): number {
    // Rough estimate: 4 chars per token
    let totalChars = 0;

    for (const result of results.values()) {
      totalChars += result.response.length;
      for (const tc of result.toolCalls) {
        totalChars += JSON.stringify(tc.args).length;
        totalChars += JSON.stringify(tc.result).length;
      }
    }

    return Math.ceil(totalChars / 4);
  }

  private emit(event: Omit<OrchestratorProgressEvent, 'timestamp'>): void {
    if (this.progressCallback) {
      this.progressCallback({
        ...event,
        timestamp: Date.now(),
      });
    }
  }

  // =============================================================================
  // Public Getters
  // =============================================================================

  getStrategy(): ExecutionStrategyType {
    return this.strategy;
  }

  getCapabilities(): ModelCapabilities {
    return this.capabilities;
  }

  getModelId(): string {
    return this.config.modelId;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a model-aware orchestrator
 */
export function createModelAwareOrchestrator(
  modelId: string,
  options?: Partial<ModelAwareConfig>,
  progressCallback?: OrchestratorProgressCallback
): ModelAwareOrchestrator {
  return new ModelAwareOrchestrator(
    {
      modelId,
      enableMessaging: true,
      enableLearning: true,
      verbose: true,
      ...options,
    },
    progressCallback
  );
}

/**
 * Execute a task with model-aware orchestration (convenience function)
 */
export async function executeWithModelAwareness(
  task: string,
  modelId: string,
  context?: Record<string, any>,
  options?: Partial<ModelAwareConfig>
): Promise<OrchestratorResult> {
  const orchestrator = createModelAwareOrchestrator(modelId, options);
  return orchestrator.execute(task, context);
}
