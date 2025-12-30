/**
 * Agentic Orchestrator
 *
 * Implements Claude Agent SDK patterns for LLMos:
 * - Explicit planning phase before execution
 * - Memory-aware context building
 * - MCP-compatible tool execution
 * - Continuous learning integration
 *
 * Architecture follows the agentic loop pattern:
 * 1. PLAN: Analyze task, query memory, create execution plan
 * 2. EXECUTE: Run plan steps with tool calls
 * 3. REFLECT: Evaluate results, update memory
 * 4. ITERATE: Continue until task complete or max iterations
 */

import { createLLMClient } from '../llm/client';
import { Message } from '../llm/types';
import { getMCPToolRegistry, MCPToolDefinition, MCPToolCall, MCPToolResult, toAnthropicTools } from './mcp-tools';
import { getLLMPatternMatcher, ExecutionTrace, PatternMatch } from './llm-pattern-matcher';
import { getVFS } from '../virtual-fs';

// =============================================================================
// Types
// =============================================================================

export interface AgentPlan {
  taskAnalysis: string;
  approach: string;
  steps: PlanStep[];
  estimatedTools: string[];
  relevantMemories: PatternMatch[];
  confidence: number;
}

export interface PlanStep {
  id: string;
  description: string;
  toolHint?: string;
  dependsOn?: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
}

export interface AgentState {
  phase: 'planning' | 'executing' | 'reflecting' | 'completed' | 'failed';
  currentStep?: string;
  plan?: AgentPlan;
  executedSteps: number;
  totalSteps: number;
  toolCallCount: number;
  startTime: number;
}

export interface AgenticResult {
  success: boolean;
  response: string;
  plan: AgentPlan | null;
  toolCalls: Array<{
    tool: string;
    args: Record<string, any>;
    result: MCPToolResult;
    duration: number;
  }>;
  filesCreated: string[];
  executionTime: number;
  iterations: number;
  memoryUpdated: boolean;
}

export interface AgenticProgressEvent {
  type: 'planning' | 'memory_query' | 'step_start' | 'tool_call' | 'tool_result' | 'step_complete' | 'reflecting' | 'completed' | 'error';
  phase: AgentState['phase'];
  message: string;
  details?: any;
  timestamp: number;
}

export type AgenticProgressCallback = (event: AgenticProgressEvent) => void;

export interface AgenticConfig {
  maxIterations: number;
  planFirst: boolean;
  queryMemory: boolean;
  updateMemory: boolean;
  verbose: boolean;
}

const DEFAULT_CONFIG: AgenticConfig = {
  maxIterations: 15,
  planFirst: true,
  queryMemory: true,
  updateMemory: true,
  verbose: true
};

// =============================================================================
// Agentic Orchestrator
// =============================================================================

export class AgenticOrchestrator {
  private config: AgenticConfig;
  private toolRegistry = getMCPToolRegistry();
  private patternMatcher = getLLMPatternMatcher();
  private progressCallback?: AgenticProgressCallback;
  private state: AgentState;

  constructor(
    config: Partial<AgenticConfig> = {},
    progressCallback?: AgenticProgressCallback
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.progressCallback = progressCallback;
    this.state = this.createInitialState();
  }

  private createInitialState(): AgentState {
    return {
      phase: 'planning',
      executedSteps: 0,
      totalSteps: 0,
      toolCallCount: 0,
      startTime: Date.now()
    };
  }

  private emit(event: Omit<AgenticProgressEvent, 'timestamp'>): void {
    if (this.progressCallback) {
      this.progressCallback({
        ...event,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Execute a task using the agentic loop pattern
   */
  async execute(task: string): Promise<AgenticResult> {
    this.state = this.createInitialState();
    const startTime = performance.now();
    const toolCalls: AgenticResult['toolCalls'] = [];
    const filesCreated: string[] = [];
    let iterations = 0;
    let plan: AgentPlan | null = null;

    try {
      const llmClient = createLLMClient();
      if (!llmClient) {
        throw new Error('LLM client not configured');
      }

      // =========================================================================
      // Phase 1: PLANNING
      // =========================================================================
      if (this.config.planFirst) {
        this.state.phase = 'planning';
        this.emit({
          type: 'planning',
          phase: 'planning',
          message: 'Analyzing task and creating execution plan...'
        });

        plan = await this.createPlan(task, llmClient);
        this.state.plan = plan;
        this.state.totalSteps = plan.steps.length;

        this.emit({
          type: 'planning',
          phase: 'planning',
          message: `Plan created with ${plan.steps.length} steps`,
          details: plan
        });
      }

      // =========================================================================
      // Phase 2: EXECUTION
      // =========================================================================
      this.state.phase = 'executing';

      const messages: Message[] = [
        { role: 'system', content: this.buildSystemPrompt(plan) },
        { role: 'user', content: this.buildUserPrompt(task, plan) }
      ];

      // Agentic loop
      while (iterations < this.config.maxIterations) {
        iterations++;

        // Get LLM response
        const response = await llmClient.chatDirect(messages);

        // Parse tool calls from response
        const parsedToolCalls = this.parseToolCalls(response);

        if (parsedToolCalls.length === 0) {
          // No tool calls = task complete
          this.state.phase = 'reflecting';

          // =====================================================================
          // Phase 3: REFLECTION
          // =====================================================================
          this.emit({
            type: 'reflecting',
            phase: 'reflecting',
            message: 'Evaluating execution results...'
          });

          // Update memory if configured
          let memoryUpdated = false;
          if (this.config.updateMemory) {
            memoryUpdated = await this.updateMemory(task, toolCalls, filesCreated, true);
          }

          this.state.phase = 'completed';
          this.emit({
            type: 'completed',
            phase: 'completed',
            message: 'Task completed successfully',
            details: { iterations, toolCalls: toolCalls.length }
          });

          return {
            success: true,
            response,
            plan,
            toolCalls,
            filesCreated,
            executionTime: performance.now() - startTime,
            iterations,
            memoryUpdated
          };
        }

        // Execute tool calls
        messages.push({ role: 'assistant', content: response });

        let toolResultsText = '';

        for (const toolCall of parsedToolCalls) {
          this.state.toolCallCount++;

          this.emit({
            type: 'tool_call',
            phase: 'executing',
            message: `Calling ${toolCall.name}`,
            details: toolCall.arguments
          });

          const callStart = performance.now();
          const result = await this.toolRegistry.execute(toolCall);
          const duration = performance.now() - callStart;

          toolCalls.push({
            tool: toolCall.name,
            args: toolCall.arguments,
            result,
            duration
          });

          // Track files created
          if (toolCall.name === 'write_file' && toolCall.arguments.path) {
            filesCreated.push(toolCall.arguments.path);
          }

          this.emit({
            type: 'tool_result',
            phase: 'executing',
            message: result.isError ? `${toolCall.name} failed` : `${toolCall.name} completed`,
            details: { duration, isError: result.isError }
          });

          // Format result for context
          const resultText = result.content
            .map(c => c.text || (c.data ? '[image data]' : ''))
            .join('\n');

          toolResultsText += `\n\n**Tool: ${toolCall.name}**\n${result.isError ? 'Error: ' : ''}${resultText}`;
        }

        // Add tool results to context
        messages.push({
          role: 'user',
          content: `Tool execution results:${toolResultsText}\n\nContinue with the next step or provide final summary if done.`
        });

        // Update step progress
        this.state.executedSteps = Math.min(
          this.state.executedSteps + 1,
          this.state.totalSteps
        );
      }

      // Max iterations reached
      this.state.phase = 'failed';

      await this.updateMemory(task, toolCalls, filesCreated, false);

      return {
        success: false,
        response: 'Maximum iterations reached without completing the task.',
        plan,
        toolCalls,
        filesCreated,
        executionTime: performance.now() - startTime,
        iterations,
        memoryUpdated: true
      };

    } catch (error: any) {
      this.state.phase = 'failed';

      this.emit({
        type: 'error',
        phase: 'failed',
        message: error.message,
        details: error
      });

      await this.updateMemory(task, toolCalls, filesCreated, false);

      return {
        success: false,
        response: error.message,
        plan,
        toolCalls,
        filesCreated,
        executionTime: performance.now() - startTime,
        iterations,
        memoryUpdated: true
      };
    }
  }

  /**
   * Create an execution plan for the task
   */
  private async createPlan(
    task: string,
    llmClient: NonNullable<ReturnType<typeof createLLMClient>>
  ): Promise<AgentPlan> {
    // Query memory for similar tasks
    let relevantMemories: PatternMatch[] = [];

    if (this.config.queryMemory) {
      this.emit({
        type: 'memory_query',
        phase: 'planning',
        message: 'Searching memory for relevant experiences...'
      });

      relevantMemories = await this.patternMatcher.findSimilarTasks(task, {
        limit: 3,
        minSimilarity: 0.3
      });

      if (relevantMemories.length > 0) {
        this.emit({
          type: 'memory_query',
          phase: 'planning',
          message: `Found ${relevantMemories.length} relevant past experiences`,
          details: relevantMemories
        });
      }
    }

    // Build planning prompt
    const planningPrompt = this.buildPlanningPrompt(task, relevantMemories);

    const response = await llmClient.chatDirect([
      { role: 'system', content: PLANNING_SYSTEM_PROMPT },
      { role: 'user', content: planningPrompt }
    ]);

    // Parse plan from response
    return this.parsePlan(response, relevantMemories);
  }

  /**
   * Build the planning prompt
   */
  private buildPlanningPrompt(task: string, memories: PatternMatch[]): string {
    const tools = this.toolRegistry.getDefinitions();
    const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');

    let memoryContext = '';
    if (memories.length > 0) {
      memoryContext = `\n\n## Relevant Past Experiences

${memories.map((m, i) => `${i + 1}. "${m.goal}" (similarity: ${(m.similarity * 100).toFixed(0)}%)
   ${m.suggestedApproach || 'No specific approach noted'}`).join('\n\n')}`;
    }

    return `## Task
${task}

## Available Tools
${toolList}
${memoryContext}

Create a detailed execution plan for this task.

Return JSON:
{
  "taskAnalysis": "Brief analysis of what the task requires",
  "approach": "High-level approach to solve this",
  "steps": [
    {
      "id": "step-1",
      "description": "What this step does",
      "toolHint": "Suggested tool to use (optional)",
      "dependsOn": []
    }
  ],
  "estimatedTools": ["tool1", "tool2"],
  "confidence": 0.85
}`;
  }

  /**
   * Parse plan from LLM response
   */
  private parsePlan(response: string, memories: PatternMatch[]): AgentPlan {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);

      return {
        taskAnalysis: data.taskAnalysis || 'No analysis provided',
        approach: data.approach || 'Direct execution',
        steps: (data.steps || []).map((s: any, i: number) => ({
          id: s.id || `step-${i + 1}`,
          description: s.description || 'Unnamed step',
          toolHint: s.toolHint,
          dependsOn: s.dependsOn || [],
          status: 'pending' as const
        })),
        estimatedTools: data.estimatedTools || [],
        relevantMemories: memories,
        confidence: data.confidence || 0.5
      };
    } catch (error) {
      // Fallback plan
      return {
        taskAnalysis: 'Unable to parse detailed plan',
        approach: 'Execute task directly',
        steps: [{
          id: 'step-1',
          description: 'Complete the task',
          status: 'pending'
        }],
        estimatedTools: [],
        relevantMemories: memories,
        confidence: 0.3
      };
    }
  }

  /**
   * Build the system prompt for execution
   */
  private buildSystemPrompt(plan: AgentPlan | null): string {
    const tools = this.toolRegistry.getDefinitions();

    let prompt = `You are an intelligent agent operating within LLMos, a self-learning AI operating system.

## Your Capabilities

You have access to these tools:

${tools.map(t => `### ${t.name}
${t.description}

Parameters:
${Object.entries(t.inputSchema.properties).map(([name, prop]: [string, any]) =>
  `- ${name}${t.inputSchema.required?.includes(name) ? ' (required)' : ''}: ${prop.description}`
).join('\n')}`).join('\n\n')}

## Tool Call Format

To use a tool, include a JSON block in your response:

\`\`\`tool
{
  "name": "tool_name",
  "arguments": {
    "param1": "value1"
  }
}
\`\`\`

You can make multiple tool calls in one response.

## Guidelines

1. **Think step by step** - Break complex tasks into smaller steps
2. **Read before writing** - Always read files before modifying them
3. **Verify results** - Check that operations succeeded
4. **Learn from errors** - If something fails, try a different approach
5. **Be concise** - Provide clear, actionable responses`;

    if (plan) {
      prompt += `\n\n## Execution Plan

The following plan has been created for this task:

**Analysis**: ${plan.taskAnalysis}

**Approach**: ${plan.approach}

**Steps**:
${plan.steps.map((s, i) => `${i + 1}. ${s.description}${s.toolHint ? ` (suggested: ${s.toolHint})` : ''}`).join('\n')}

Follow this plan, but adapt as needed based on tool results.`;
    }

    if (plan?.relevantMemories && plan.relevantMemories.length > 0) {
      prompt += `\n\n## Relevant Past Experiences

${plan.relevantMemories.map(m =>
  `- "${m.goal}": ${m.suggestedApproach || 'Completed successfully'}`
).join('\n')}

Consider these experiences when executing the task.`;
    }

    return prompt;
  }

  /**
   * Build the user prompt
   */
  private buildUserPrompt(task: string, plan: AgentPlan | null): string {
    if (plan) {
      return `Execute this task following the plan:

${task}

Begin with step 1 and proceed through the plan. Report progress as you go.`;
    }

    return task;
  }

  /**
   * Parse tool calls from LLM response
   */
  private parseToolCalls(response: string): MCPToolCall[] {
    const calls: MCPToolCall[] = [];
    const toolCallRegex = /```tool\s*\n([\s\S]*?)\n```/g;

    let match;
    while ((match = toolCallRegex.exec(response)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        if (data.name && this.toolRegistry.has(data.name)) {
          calls.push({
            name: data.name,
            arguments: data.arguments || {}
          });
        } else if (data.tool && this.toolRegistry.has(data.tool)) {
          // Also support "tool" key for backwards compatibility
          calls.push({
            name: data.tool,
            arguments: data.inputs || data.arguments || {}
          });
        }
      } catch (error) {
        console.warn('Failed to parse tool call:', error);
      }
    }

    return calls;
  }

  /**
   * Update system memory with execution results
   */
  private async updateMemory(
    task: string,
    toolCalls: AgenticResult['toolCalls'],
    filesCreated: string[],
    success: boolean
  ): Promise<boolean> {
    try {
      // Add trace to pattern matcher
      const trace: ExecutionTrace = {
        id: `trace-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        goal: task,
        success,
        toolsUsed: [...new Set(toolCalls.map(tc => tc.tool))],
        filesCreated,
        duration: toolCalls.reduce((sum, tc) => sum + tc.duration, 0),
        timestamp: new Date().toISOString()
      };

      this.patternMatcher.addTrace(trace);

      // Also append to memory log
      const vfs = getVFS();
      const memoryPath = 'system/memory_log.md';

      let existingMemory = '';
      try {
        existingMemory = vfs.readFileContent(memoryPath) || '';
      } catch {
        // File may not exist
      }

      const entry = `
## [${trace.timestamp}] ${success ? '✓' : '✗'} Workflow

**Goal:** ${task}

**Tools Used:** ${trace.toolsUsed.join(', ') || 'None'}

**Files Created:** ${filesCreated.length > 0 ? filesCreated.join(', ') : 'None'}

**Duration:** ${(trace.duration / 1000).toFixed(2)}s

**Status:** ${success ? 'Completed successfully' : 'Failed'}

---
`;

      vfs.writeFile(memoryPath, existingMemory + entry);

      return true;
    } catch (error) {
      console.error('Failed to update memory:', error);
      return false;
    }
  }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }
}

// =============================================================================
// System Prompts
// =============================================================================

const PLANNING_SYSTEM_PROMPT = `You are a planning assistant that creates detailed execution plans for tasks.

Your job is to:
1. Analyze what the task requires
2. Break it into concrete, actionable steps
3. Identify which tools will be needed
4. Consider any relevant past experiences
5. Estimate confidence in the plan

Be specific and practical. Each step should be clear enough to execute.

Return your plan as valid JSON only.`;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an agentic orchestrator instance
 */
export function createAgenticOrchestrator(
  config?: Partial<AgenticConfig>,
  progressCallback?: AgenticProgressCallback
): AgenticOrchestrator {
  return new AgenticOrchestrator(config, progressCallback);
}

/**
 * Execute a task using the agentic pattern (convenience function)
 */
export async function executeAgenticTask(
  task: string,
  config?: Partial<AgenticConfig>,
  progressCallback?: AgenticProgressCallback
): Promise<AgenticResult> {
  const orchestrator = createAgenticOrchestrator(config, progressCallback);
  return orchestrator.execute(task);
}
