/**
 * SystemAgent Orchestrator
 *
 * Coordinates the execution of the SystemAgent with tool access
 * Uses WorkflowContextManager for intelligent context management
 * Supports artifact evolution and system memory updates
 */

import { createLLMClient, Message } from './llm-client';
import { executeSystemTool, getSystemTools } from './system-tools';
import { getVFS } from './virtual-fs';
import {
  WorkflowContextManager,
  createWorkflowContextManager,
  SummarizationStrategy,
  ContextManagerConfig,
} from './workflow-context-manager';
import {
  validateProjectAgents,
  formatValidationForLLM,
  MIN_AGENTS_REQUIRED,
  MultiAgentValidation,
} from './agents/multi-agent-validator';
import {
  getLLMPatternMatcher,
  ExecutionTrace,
  SubAgentTrace,
} from './agents/llm-pattern-matcher';

export interface SystemAgentResult {
  success: boolean;
  response: string;
  toolCalls: ToolCallResult[];
  filesCreated: string[];
  projectPath?: string;
  error?: string;
  executionTime: number;
  workflowId?: string;
  contextStats?: {
    totalTokens: number;
    wasSummarized: boolean;
    summarizationSteps?: number;
    strategy?: SummarizationStrategy;
  };
  evolution?: {
    memoryUpdated: boolean;
    learnings: string[];
    longTermTraceGenerated?: boolean;
  };
  multiAgentValidation?: {
    isValid: boolean;
    agentCount: number;
    minimumRequired: number;
    agents: Array<{
      name: string;
      origin: 'copied' | 'evolved' | 'created';
      type: string;
    }>;
    message: string;
  };
  // Sub-agent collaboration tracking
  subAgentCollaboration?: {
    subAgentsUsed: SubAgentTrace[];
    collaborationVerified: boolean;
    collaborationSummary: string;
  };
}

/**
 * Workspace context - the entire volume is the workspace
 * AI decides what context is relevant from the workspace
 */
export interface WorkspaceContext {
  /** The volume type (user/team/system) */
  volume: 'user' | 'team' | 'system';
  /** The VFS path to the workspace root */
  workspacePath: string;
  /** Top-level sections/directories in the workspace */
  sections?: string[];
  /** List of existing files in the workspace (limited to prevent context overflow) */
  existingFiles?: string[];
  /** Content of workspace memory if it exists */
  memoryFile?: string;
  /** Content of system memory log */
  systemMemory?: string;
}

/**
 * @deprecated Use WorkspaceContext instead
 */
export interface ProjectContext {
  projectPath: string;
  projectName: string;
  contextFile?: string;
  memoryFile?: string;
  existingFiles?: string[];
  isExistingProject: boolean;
}

export interface AgentProgressEvent {
  type: 'thinking' | 'tool-call' | 'memory-query' | 'execution' | 'completed' | 'context-management' | 'evolution' | 'multi-agent-validation' | 'initializing' | 'api-call' | 'parsing' | 'waiting';
  agent?: string;
  action?: string;
  tool?: string;
  details?: string;
  timestamp: number;
}

export type ProgressCallback = (event: AgentProgressEvent) => void;

export interface ToolCallResult {
  toolId: string;
  toolName: string;
  inputs: Record<string, any>;
  output?: any;
  success: boolean;
  error?: string;
}

export interface OrchestratorConfig {
  /** Maximum iterations for the agent loop (default: 10) */
  maxIterations: number;
  /** Summarization strategy (default: 'balanced') */
  strategy: SummarizationStrategy;
  /** Whether to update system memory after execution (default: true) */
  updateSystemMemory: boolean;
  /** Whether to persist workflow history (default: true) */
  persistWorkflow: boolean;
  /** Context manager configuration overrides */
  contextConfig?: Partial<ContextManagerConfig>;
}

export interface ExecuteOptions {
  /** Continue from existing context instead of reinitializing */
  continueFromContext?: boolean;
  /** Prior context to inject (planning phase results) */
  priorContext?: string;
  /** Force at least one tool execution before allowing text-only responses */
  requireToolExecution?: boolean;
  /** Minimum iterations before allowing exit (for execution phase) */
  minIterations?: number;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxIterations: 10,
  strategy: 'balanced',
  updateSystemMemory: true,
  persistWorkflow: true,
};

// Token management constants
const MAX_TOOL_RESULT_LENGTH = 8000; // Truncate large tool results

/**
 * Truncate text to max length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 100) + '\n\n... [truncated - content too long] ...\n';
}

/**
 * Summarize tool result for context efficiency
 */
function summarizeToolResult(result: any, toolId: string): string {
  const resultStr = JSON.stringify(result, null, 2);

  // Always truncate large results
  if (resultStr.length > MAX_TOOL_RESULT_LENGTH) {
    // For file reads, keep beginning and end
    if (toolId === 'read-file' && result.content) {
      const content = result.content;
      if (content.length > MAX_TOOL_RESULT_LENGTH) {
        const halfLen = Math.floor(MAX_TOOL_RESULT_LENGTH / 2) - 50;
        return JSON.stringify({
          ...result,
          content: content.substring(0, halfLen) +
            '\n\n... [content truncated for context efficiency] ...\n\n' +
            content.substring(content.length - halfLen),
          _truncated: true
        }, null, 2);
      }
    }

    // For Python execution, keep stdout/stderr and truncate
    if (toolId === 'execute-python') {
      return JSON.stringify({
        success: result.success,
        stdout: truncateText(result.stdout || '', 2000),
        stderr: truncateText(result.stderr || '', 1000),
        executionTime: result.executionTime,
        images: result.images?.length ? `[${result.images.length} image(s) generated]` : undefined,
        _truncated: true
      }, null, 2);
    }

    // Generic truncation
    return truncateText(resultStr, MAX_TOOL_RESULT_LENGTH);
  }

  return resultStr;
}

/**
 * SystemAgent Orchestrator
 */
export class SystemAgentOrchestrator {
  private systemPrompt: string;
  private maxIterations: number = 10;
  private progressCallback?: ProgressCallback;
  private contextManager: WorkflowContextManager;
  private config: OrchestratorConfig;
  private workspaceContext?: WorkspaceContext;
  /** @deprecated Use workspaceContext instead */
  private projectContext?: ProjectContext;

  constructor(
    systemPrompt: string,
    progressCallback?: ProgressCallback,
    config: Partial<OrchestratorConfig> = {}
  ) {
    this.systemPrompt = systemPrompt;
    this.progressCallback = progressCallback;
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.maxIterations = this.config.maxIterations;

    // Create context manager with strategy and config
    this.contextManager = createWorkflowContextManager({
      strategy: this.config.strategy,
      ...this.config.contextConfig,
    });
  }

  /**
   * Set workspace context - the entire volume is the workspace
   */
  setWorkspaceContext(context: WorkspaceContext): void {
    this.workspaceContext = context;
    console.log('[SystemAgent] Workspace context set:', {
      volume: context.volume,
      workspacePath: context.workspacePath,
      sections: context.sections?.length || 0,
      fileCount: context.existingFiles?.length || 0,
      hasMemory: !!context.memoryFile,
      hasSystemMemory: !!context.systemMemory,
    });
  }

  /**
   * @deprecated Use setWorkspaceContext instead
   */
  setProjectContext(context: ProjectContext): void {
    this.projectContext = context;
    // Convert to workspace context for compatibility
    this.workspaceContext = {
      volume: 'user',
      workspacePath: context.projectPath,
      existingFiles: context.existingFiles,
      memoryFile: context.memoryFile,
    };
    console.log('[SystemAgent] Project context set (deprecated):', {
      projectPath: context.projectPath,
      projectName: context.projectName,
    });
  }

  private emitProgress(event: Omit<AgentProgressEvent, 'timestamp'>) {
    if (this.progressCallback) {
      this.progressCallback({
        ...event,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Create LLM summarizer function for context management
   */
  private createSummarizer(llmClient: ReturnType<typeof createLLMClient>) {
    return async (prompt: string): Promise<string> => {
      const messages: Message[] = [
        {
          role: 'system',
          content: 'You are a context summarization assistant. Your task is to create concise but comprehensive summaries of workflow context, preserving key information relevant to the user\'s goal.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ];

      return await llmClient!.chatDirect(messages);
    };
  }

  /**
   * Execute the SystemAgent with a user goal
   * @param userGoal The user's goal or continuation prompt
   * @param options Optional execution options for continuation scenarios
   */
  async execute(userGoal: string, options?: ExecuteOptions): Promise<SystemAgentResult> {
    const startTime = performance.now();
    const toolCalls: ToolCallResult[] = [];
    const filesCreated: string[] = [];
    // Files are written to the workspace (volume root) or detected from file writes
    let projectPath: string | undefined = this.workspaceContext?.workspacePath !== '.'
      ? this.workspaceContext?.workspacePath
      : undefined;
    let lastContextResult: { wasSummarized: boolean; summarizationSteps?: number; tokenEstimate: number } | null = null;

    // Track if we've executed any tools (for requireToolExecution option)
    let hasExecutedTools = false;
    const requireToolExecution = options?.requireToolExecution ?? false;
    const minIterations = options?.minIterations ?? 1;
    const continueFromContext = options?.continueFromContext ?? false;

    try {
      // Emit initializing event
      this.emitProgress({
        type: 'initializing',
        agent: 'SystemAgent',
        action: 'Initializing LLM client',
        details: 'Configuring AI backend and loading credentials',
      });

      const llmClient = createLLMClient();
      if (!llmClient) {
        throw new Error('LLM client not configured');
      }

      this.emitProgress({
        type: 'initializing',
        agent: 'SystemAgent',
        action: 'Loading system prompt',
        details: 'Preparing agent instructions and tool definitions',
      });

      // Initialize or continue context manager
      const systemPromptWithTools = this.buildSystemPromptWithTools();

      if (continueFromContext && options?.priorContext) {
        // Continue from existing context - add prior context as a note
        // Don't reinitialize, just add the continuation as a new entry
        this.contextManager.addEntry({
          role: 'user',
          content: `CONTINUATION FROM PLANNING PHASE:\n${options.priorContext}\n\nNEW INSTRUCTION:\n${userGoal}`,
          type: 'context-note',
        });
        console.log('[SystemAgent] Continuing from prior context, preserving workflow history');
      } else {
        // Fresh initialization
        this.contextManager.initialize(systemPromptWithTools, userGoal);
      }

      let iterations = 0;
      let finalResponse = '';

      // Emit initial thinking event
      this.emitProgress({
        type: 'thinking',
        agent: 'SystemAgent',
        action: this.workspaceContext
          ? `Working in ${this.workspaceContext.volume} workspace`
          : 'Analyzing goal and planning approach',
        details: this.workspaceContext
          ? `Workspace has ${this.workspaceContext.existingFiles?.length || 0} files in context`
          : `Goal: "${userGoal.substring(0, 100)}${userGoal.length > 100 ? '...' : ''}"`,
      });

      // Create summarizer function
      const summarizer = this.createSummarizer(llmClient);

      // Agent loop: LLM → Parse tools → Execute → LLM → ...
      while (iterations < this.maxIterations) {
        iterations++;

        // Emit thinking event
        this.emitProgress({
          type: 'thinking',
          agent: 'SystemAgent',
          action: `Planning step ${iterations}/${this.maxIterations}`,
          details: 'Analyzing context and determining next actions',
        });

        // Build context with iterative summarization if needed
        const currentStep = `Step ${iterations}/${this.maxIterations}: ${iterations === 1 ? 'Initial planning' : 'Continuing workflow'}`;

        const contextResult = await this.contextManager.buildContext(
          currentStep,
          summarizer,
          (step, details) => {
            // Emit context management progress
            this.emitProgress({
              type: 'context-management',
              agent: 'SystemAgent',
              action: this.formatContextAction(step),
              details,
            });
          }
        );

        lastContextResult = contextResult;

        if (contextResult.wasSummarized) {
          console.log(`[SystemAgent] Context summarized: ${contextResult.summarizationSteps} steps, ${Math.round(contextResult.tokenEstimate / 1000)}K tokens`);
        }

        // Emit API call event
        this.emitProgress({
          type: 'api-call',
          agent: 'SystemAgent',
          action: `Making LLM API call (iteration ${iterations})`,
          details: `Context: ~${Math.round(contextResult.tokenEstimate / 1000)}K tokens`,
        });

        // Call LLM with the managed context
        const llmResponse = await llmClient.chatDirect(contextResult.messages);

        // Emit parsing event
        this.emitProgress({
          type: 'parsing',
          agent: 'SystemAgent',
          action: 'Parsing LLM response',
          details: `Response length: ${llmResponse.length} characters`,
        });

        // Parse for tool calls
        const toolCallsInResponse = this.parseToolCalls(llmResponse);

        if (toolCallsInResponse.length === 0) {
          // No tool calls in this response
          // Check if we should continue anyway (requireToolExecution or minIterations)
          const shouldContinue = (requireToolExecution && !hasExecutedTools) ||
                                  (iterations < minIterations);

          if (shouldContinue) {
            // Don't exit yet - we need to execute at least one tool
            this.emitProgress({
              type: 'thinking',
              agent: 'SystemAgent',
              action: 'Requesting tool execution',
              details: `No tools called yet (iteration ${iterations}/${minIterations}). Prompting for action.`,
            });

            // Add a follow-up prompt to encourage tool usage
            this.contextManager.addLLMResponse(llmResponse, iterations);
            this.contextManager.addEntry({
              role: 'user',
              content: `You provided analysis but no tool calls. Please execute the required actions now using tool calls. Remember to:
1. Create sub-agent markdown files using write-file
2. Execute code using invoke-subagent or execute-python
3. Generate applets using generate-applet if interactive UI is needed

Start with your first tool call NOW.`,
              type: 'context-note',
            });
            continue; // Continue the loop
          }

          // Normal exit - no more tools needed
          this.emitProgress({
            type: 'thinking',
            agent: 'SystemAgent',
            action: 'Generating final response',
            details: 'No more tool calls needed, preparing output',
          });
          finalResponse = llmResponse;
          break;
        }

        // Mark that we've executed tools
        hasExecutedTools = true;

        // Emit event about found tool calls
        this.emitProgress({
          type: 'thinking',
          agent: 'SystemAgent',
          action: `Found ${toolCallsInResponse.length} tool call(s) to execute`,
          details: toolCallsInResponse.map(t => t.toolName).join(', '),
        });

        // Add LLM response to context manager
        this.contextManager.addLLMResponse(llmResponse, iterations);

        // Execute tool calls
        let toolResults = '';
        for (const toolCall of toolCallsInResponse) {
          // Emit tool call event
          this.emitProgress({
            type: 'tool-call',
            agent: 'SystemAgent',
            action: `Calling ${toolCall.toolName}`,
            tool: toolCall.toolId,
            details: this.getToolCallDetails(toolCall),
          });

          try {
            const result = await executeSystemTool(toolCall.toolId, toolCall.inputs);

            // Emit memory-query event if reading system memory
            if (toolCall.toolId === 'read-file' &&
                toolCall.inputs.path &&
                (toolCall.inputs.path.includes('/system/memory_log.md') ||
                 toolCall.inputs.path.includes('system/memory_log.md'))) {
              this.emitProgress({
                type: 'memory-query',
                agent: 'SystemAgent',
                action: 'Consulting system memory for past experiences',
                details: 'Reading /system/memory_log.md to extract relevant learnings',
              });
            }

            // Emit memory-query event if checking existing system agents
            if (toolCall.toolId === 'read-file' &&
                toolCall.inputs.path &&
                (toolCall.inputs.path.includes('/system/agents/') ||
                 toolCall.inputs.path.includes('system/agents/'))) {
              const agentName = toolCall.inputs.path.split('/').pop()?.replace('.md', '') || 'agent';
              this.emitProgress({
                type: 'memory-query',
                agent: 'SystemAgent',
                action: `Checking existing ${agentName} for reuse`,
                details: `Evaluating if ${agentName} can be evolved for this task`,
              });
            }

            // Emit execution event
            this.emitProgress({
              type: 'execution',
              agent: 'SystemAgent',
              action: `${toolCall.toolName} completed successfully`,
              tool: toolCall.toolId,
              details: this.getToolResultSummary(toolCall, result),
            });

            toolCalls.push({
              toolId: toolCall.toolId,
              toolName: toolCall.toolName,
              inputs: toolCall.inputs,
              output: result,
              success: true,
            });

            // Track files created
            if (toolCall.toolId === 'write-file' && toolCall.inputs.path) {
              filesCreated.push(toolCall.inputs.path);

              // Detect workspace path from the volume-based structure
              // Files should be written to user/, team/, or system/ volumes
              if (!projectPath) {
                const path = toolCall.inputs.path;
                const validVolumes = ['user', 'team'];

                for (const volume of validVolumes) {
                  if (path.startsWith(`${volume}/`)) {
                    // Set the workspace path to the volume root
                    projectPath = volume;
                    break;
                  }
                }
              }
            }

            // Use summarized result to prevent context overflow
            const summarizedResult = summarizeToolResult(result, toolCall.toolId);
            toolResults += `\n\n**Tool: ${toolCall.toolName}**\nSuccess: ✓\nResult: ${summarizedResult}`;

            // Add tool result to context manager
            this.contextManager.addToolResult(toolCall.toolName, toolCall.toolId, summarizedResult);
          } catch (error: any) {
            toolCalls.push({
              toolId: toolCall.toolId,
              toolName: toolCall.toolName,
              inputs: toolCall.inputs,
              success: false,
              error: error.message || String(error),
            });

            const errorResult = `Error: ✗ ${error.message || error}`;
            toolResults += `\n\n**Tool: ${toolCall.toolName}**\n${errorResult}`;

            // Add error to context manager
            this.contextManager.addToolResult(toolCall.toolName, toolCall.toolId, errorResult);
          }
        }

        // Add continuation prompt to context
        this.contextManager.addEntry({
          role: 'user',
          content: `Tool execution results:${toolResults}\n\nContinue with the next step or provide final summary if done.`,
          type: 'context-note',
        });
      }

      const executionTime = performance.now() - startTime;
      const contextStats = this.contextManager.getStats();
      const workflowId = this.contextManager.getWorkflowId();

      // Extract learnings from the workflow
      const learnings = this.contextManager.extractLearnings();
      const evolutionResult: { memoryUpdated: boolean; learnings: string[]; longTermTraceGenerated?: boolean } = {
        memoryUpdated: false,
        learnings: [],
        longTermTraceGenerated: false,
      };

      // Collect sub-agent traces for collaboration tracking
      const subAgentsUsed: SubAgentTrace[] = this.collectSubAgentTraces(startTime);

      // Update system memory if configured
      if (this.config.updateSystemMemory && filesCreated.length > 0) {
        this.emitProgress({
          type: 'evolution',
          agent: 'SystemAgent',
          action: 'Updating system memory with workflow learnings',
          details: `Recording ${filesCreated.length} files created, ${learnings.toolsUsed.length} tools used`,
        });

        try {
          const memoryEntry = await this.updateSystemMemory(
            userGoal,
            filesCreated,
            learnings,
            executionTime
          );
          evolutionResult.memoryUpdated = true;
          evolutionResult.learnings = [
            `Completed: ${userGoal.substring(0, 100)}`,
            `Created ${filesCreated.length} file(s)`,
            `Used tools: ${learnings.toolsUsed.join(', ')}`,
          ];

          this.emitProgress({
            type: 'evolution',
            agent: 'SystemAgent',
            action: 'System memory updated',
            details: 'Learnings recorded for future reference',
          });
        } catch (error) {
          console.error('[SystemAgent] Failed to update system memory:', error);
        }
      }

      // Generate long-term trace for this task completion
      try {
        this.emitProgress({
          type: 'evolution',
          agent: 'SystemAgent',
          action: 'Generating long-term trace',
          details: 'Consolidating execution into persistent learning record',
        });

        const longTermGenerated = await this.generateLongTermTrace(
          userGoal,
          toolCalls,
          filesCreated,
          projectPath,
          true, // success
          executionTime,
          subAgentsUsed
        );

        evolutionResult.longTermTraceGenerated = longTermGenerated;

        if (longTermGenerated) {
          this.emitProgress({
            type: 'evolution',
            agent: 'SystemAgent',
            action: 'Long-term trace generated',
            details: 'Execution consolidated into project and system memory',
          });
        }
      } catch (error) {
        console.error('[SystemAgent] Failed to generate long-term trace:', error);
      }

      // Persist workflow if configured
      if (this.config.persistWorkflow) {
        await this.contextManager.save();
      }

      // Multi-agent validation: ensure project has at least 3 agents
      let multiAgentValidation: SystemAgentResult['multiAgentValidation'] | undefined;
      if (projectPath) {
        this.emitProgress({
          type: 'multi-agent-validation',
          agent: 'SystemAgent',
          action: 'Validating multi-agent requirement',
          details: `Checking if project has at least ${MIN_AGENTS_REQUIRED} agents`,
        });

        const validation = validateProjectAgents(projectPath);
        multiAgentValidation = {
          isValid: validation.isValid,
          agentCount: validation.agentCount,
          minimumRequired: validation.minimumRequired,
          agents: validation.agents.map(a => ({
            name: a.name,
            origin: a.origin,
            type: a.type,
          })),
          message: validation.message,
        };

        this.emitProgress({
          type: 'multi-agent-validation',
          agent: 'SystemAgent',
          action: validation.isValid ? 'Multi-agent validation passed' : 'Multi-agent validation warning',
          details: validation.message,
        });

        // If validation fails, add warning to final response
        if (!validation.isValid) {
          console.warn(`[SystemAgent] Multi-agent validation failed: ${validation.message}`);
          // Append validation report to final response
          finalResponse += `\n\n---\n\n⚠️ **Multi-Agent Requirement Warning**\n\n${formatValidationForLLM(validation)}`;
        }
      }

      // Emit completion event
      this.emitProgress({
        type: 'completed',
        agent: 'SystemAgent',
        action: 'Task completed successfully',
        details: `Created ${filesCreated.length} file(s) in ${executionTime.toFixed(0)}ms`,
      });

      // Build sub-agent collaboration summary
      const subAgentCollaboration = subAgentsUsed.length > 0
        ? {
            subAgentsUsed,
            collaborationVerified: subAgentsUsed.every(s => s.success),
            collaborationSummary: `${subAgentsUsed.length} sub-agent(s) collaborated: ${subAgentsUsed.map(s => `${s.agentName}(${s.success ? '✓' : '✗'})`).join(', ')}`,
          }
        : undefined;

      return {
        success: true,
        response: finalResponse,
        toolCalls,
        filesCreated,
        projectPath,
        executionTime,
        workflowId,
        contextStats: {
          totalTokens: contextStats.totalTokens,
          wasSummarized: lastContextResult?.wasSummarized || false,
          summarizationSteps: lastContextResult?.summarizationSteps,
          strategy: this.config.strategy,
        },
        evolution: evolutionResult,
        multiAgentValidation,
        subAgentCollaboration,
      };
    } catch (error: any) {
      const executionTime = performance.now() - startTime;

      return {
        success: false,
        response: '',
        toolCalls,
        filesCreated,
        projectPath,
        error: error.message || String(error),
        executionTime,
      };
    }
  }

  /**
   * Format context management action for display
   */
  private formatContextAction(step: string): string {
    switch (step) {
      case 'context-analysis':
        return 'Analyzing context size';
      case 'pagination':
        return 'Paginating context for summarization';
      case 'summarizing':
        return 'Summarizing context';
      case 'cache-hit':
        return 'Using cached context summary';
      case 'complete':
        return 'Context optimization complete';
      default:
        return 'Managing context';
    }
  }

  /**
   * Update system memory with workflow learnings
   * Appends to /system/memory_log.md for future reference
   */
  private async updateSystemMemory(
    userGoal: string,
    filesCreated: string[],
    learnings: ReturnType<WorkflowContextManager['extractLearnings']>,
    executionTime: number
  ): Promise<string> {
    const vfs = getVFS();
    const memoryPath = 'system/memory_log.md';

    // Read existing memory
    let existingMemory = '';
    try {
      existingMemory = vfs.readFileContent(memoryPath) || '';
    } catch {
      // File may not exist yet
    }

    // Create new entry
    const timestamp = new Date().toISOString();
    const entry = `
## [${timestamp}] Workflow Completed

**Goal:** ${userGoal}

**Files Created:**
${filesCreated.map(f => `- ${f}`).join('\n') || '- None'}

**Tools Used:** ${learnings.toolsUsed.join(', ') || 'None'}

**Execution Time:** ${(executionTime / 1000).toFixed(2)}s

**Iterations:** ${learnings.iterations}

${learnings.errors.length > 0 ? `**Errors Encountered:**\n${learnings.errors.map(e => `- ${e}`).join('\n')}\n` : ''}
---
`;

    // Append to memory log
    const updatedMemory = existingMemory + entry;
    vfs.writeFile(memoryPath, updatedMemory);

    return entry;
  }

  /**
   * Generate a long-term trace after task completion
   * This consolidates the execution into a persistent learning record
   */
  private async generateLongTermTrace(
    userGoal: string,
    toolCalls: ToolCallResult[],
    filesCreated: string[],
    projectPath: string | undefined,
    success: boolean,
    executionTime: number,
    subAgentsUsed: SubAgentTrace[]
  ): Promise<boolean> {
    try {
      const vfs = getVFS();
      const patternMatcher = getLLMPatternMatcher();
      const timestamp = new Date().toISOString();

      // Create comprehensive execution trace
      const trace: ExecutionTrace = {
        id: `trace-main-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        goal: userGoal,
        success,
        toolsUsed: [...new Set(toolCalls.map(tc => tc.toolId))],
        filesCreated,
        duration: executionTime,
        timestamp,
        traceType: 'main',
        projectPath,
        subAgentsUsed: subAgentsUsed.length > 0 ? subAgentsUsed : undefined,
      };

      // Add to pattern matcher for evolution analysis
      patternMatcher.addTrace(trace);

      // Write long-term trace to project memory if project exists
      if (projectPath) {
        const longTermPath = `${projectPath}/memory/long_term/learnings.md`;

        let existing = '';
        try {
          existing = vfs.readFileContent(longTermPath) || '';
        } catch {
          // File may not exist yet
        }

        // Generate collaboration summary
        const collaborationSummary = subAgentsUsed.length > 0
          ? `**Sub-Agents Collaborated:** ${subAgentsUsed.map(s => s.agentName).join(', ')}\n` +
            `**Collaboration Success Rate:** ${(subAgentsUsed.filter(s => s.success).length / subAgentsUsed.length * 100).toFixed(0)}%\n`
          : '';

        const longTermEntry = `
## [${timestamp}] Task Completed: ${success ? '✓' : '✗'}

### Goal
${userGoal}

### Execution Summary
- **Duration:** ${(executionTime / 1000).toFixed(2)}s
- **Files Created:** ${filesCreated.length}
- **Tools Used:** ${trace.toolsUsed.join(', ') || 'None'}
${collaborationSummary}
### Key Learnings
- Task ${success ? 'completed successfully' : 'failed'}
${subAgentsUsed.length > 0 ? `- ${subAgentsUsed.length} sub-agent(s) collaborated on this task` : ''}
${filesCreated.length > 0 ? `- Generated ${filesCreated.length} artifact(s)` : ''}

### Pattern Insights
This execution ${success ? 'demonstrates' : 'attempted'} the approach of:
${trace.toolsUsed.map(t => `1. Using ${t}`).join('\n')}

---
`;

        vfs.writeFile(longTermPath, existing + longTermEntry);
        console.log(`[SystemAgent] Long-term trace written to ${longTermPath}`);
      }

      // Also write to system-wide long-term memory
      const systemLongTermPath = 'system/memory/long_term/consolidated_learnings.md';
      let systemExisting = '';
      try {
        systemExisting = vfs.readFileContent(systemLongTermPath) || '';
      } catch {
        // File may not exist yet
      }

      const systemEntry = `
## [${timestamp}] ${success ? '✓' : '✗'} ${userGoal.substring(0, 100)}

- **Project:** ${projectPath || 'No project'}
- **Duration:** ${(executionTime / 1000).toFixed(2)}s
- **Tools:** ${trace.toolsUsed.join(', ') || 'None'}
- **Sub-Agents:** ${subAgentsUsed.length > 0 ? subAgentsUsed.map(s => `${s.agentName}(${s.success ? '✓' : '✗'})`).join(', ') : 'None'}

---
`;

      vfs.writeFile(systemLongTermPath, systemExisting + systemEntry);

      return true;
    } catch (error) {
      console.error('[SystemAgent] Failed to generate long-term trace:', error);
      return false;
    }
  }

  /**
   * Collect sub-agent traces from the pattern matcher
   * This retrieves recent sub-agent executions for collaboration tracking
   */
  private collectSubAgentTraces(startTime: number): SubAgentTrace[] {
    const patternMatcher = getLLMPatternMatcher();
    // Note: In a full implementation, we'd filter traces by timestamp
    // For now, we return an empty array as sub-agent traces are tracked separately
    return [];
  }

  /**
   * Build workspace context preamble
   * The entire volume is the workspace - AI decides what's relevant
   */
  private buildWorkspaceContextPreamble(): string {
    if (!this.workspaceContext) {
      return '';
    }

    const ctx = this.workspaceContext;
    let preamble = `
## 🎯 WORKSPACE CONTEXT

**You are working in the ${ctx.volume.toUpperCase()} workspace.**
**The AI decides what context is relevant from the entire workspace.**

### Workspace Overview
- **Volume**: ${ctx.volume}
- **Path**: \`${ctx.workspacePath}\`
- **Files in Context**: ${ctx.existingFiles?.length || 0}
${ctx.sections?.length ? `- **Sections**: ${ctx.sections.join(', ')}` : ''}

### Workspace Files
\`\`\`
${ctx.existingFiles?.slice(0, 30).join('\n') || 'No files in workspace yet'}
${(ctx.existingFiles?.length || 0) > 30 ? `\n... and ${ctx.existingFiles!.length - 30} more files` : ''}
\`\`\`

### Working Guidelines
1. **Write files** to the workspace root or appropriate subdirectories
2. **Read existing files** before modifying them
3. **Organize** code in logical directories (output/, components/, applets/)
4. **Update** workspace memory with learnings

`;

    if (ctx.memoryFile) {
      preamble += `### Workspace Memory
\`\`\`markdown
${ctx.memoryFile.substring(0, 2000)}${ctx.memoryFile.length > 2000 ? '\n... [truncated]' : ''}
\`\`\`

`;
    }

    if (ctx.systemMemory) {
      preamble += `### System Memory (Recent Learnings)
\`\`\`markdown
${ctx.systemMemory}
\`\`\`

`;
    }

    preamble += `---

`;

    return preamble;
  }

  /**
   * @deprecated Use buildWorkspaceContextPreamble instead
   */
  private buildProjectContextPreamble(): string {
    return this.buildWorkspaceContextPreamble();
  }

  /**
   * Build system prompt with tool descriptions
   */
  private buildSystemPromptWithTools(): string {
    let prompt = this.systemPrompt;

    // Add workspace context preamble
    const workspacePreamble = this.buildWorkspaceContextPreamble();
    if (workspacePreamble) {
      prompt = workspacePreamble + prompt;
    }

    // Add tool descriptions
    const tools = getSystemTools();
    prompt += '\n\n## Available Tools (Full Specifications)\n\n';

    for (const tool of tools) {
      prompt += `### ${tool.name} (\`${tool.id}\`)\n\n`;
      prompt += `${tool.description}\n\n`;

      if (tool.inputs && tool.inputs.length > 0) {
        prompt += '**Inputs:**\n';
        for (const input of tool.inputs) {
          prompt += `- \`${input.name}\` (${input.type})${input.required ? ' **[Required]**' : ''}: ${input.description}\n`;
        }
        prompt += '\n';
      }
    }

    prompt += '\n**Tool Call Format:**\n\n';
    prompt += 'To use a tool, include this in your response:\n\n';
    prompt += '```tool\n';
    prompt += '{\n';
    prompt += '  "tool": "tool-id",\n';
    prompt += '  "inputs": {\n';
    prompt += '    "param1": "value1",\n';
    prompt += '    "param2": "value2"\n';
    prompt += '  }\n';
    prompt += '}\n';
    prompt += '```\n\n';
    prompt += 'You can make multiple tool calls in one response by including multiple ```tool blocks.\n\n';

    return prompt;
  }

  /**
   * Get formatted details for a tool call
   */
  private getToolCallDetails(toolCall: {
    toolId: string;
    toolName: string;
    inputs: Record<string, any>;
  }): string {
    // Format tool inputs for display
    const inputKeys = Object.keys(toolCall.inputs);

    if (inputKeys.length === 0) {
      return 'No parameters';
    }

    // Special formatting for common tools
    if (toolCall.toolId === 'write-file' && toolCall.inputs.path) {
      return `Path: ${toolCall.inputs.path}`;
    }

    if (toolCall.toolId === 'read-file' && toolCall.inputs.path) {
      return `Reading: ${toolCall.inputs.path}`;
    }

    if (toolCall.toolId === 'execute-python') {
      const codePreview = toolCall.inputs.code?.substring(0, 50) || '';
      return `Executing: ${codePreview}${codePreview.length >= 50 ? '...' : ''}`;
    }

    // Generic parameter list
    return inputKeys.map(key => `${key}: ${JSON.stringify(toolCall.inputs[key]).substring(0, 30)}`).join(', ');
  }

  /**
   * Get formatted summary of tool execution result
   */
  private getToolResultSummary(
    toolCall: { toolId: string; toolName: string; inputs: Record<string, any> },
    result: any
  ): string {
    // Format result based on tool type
    if (toolCall.toolId === 'write-file') {
      return `Written ${result.size || 0} bytes to ${result.path || 'file'}`;
    }

    if (toolCall.toolId === 'read-file') {
      return `Read ${result.size || 0} bytes from ${result.type || 'unknown'} file`;
    }

    if (toolCall.toolId === 'execute-python') {
      const hasOutput = result.stdout && result.stdout.length > 0;
      const hasImages = result.images && result.images.length > 0;
      const time = result.executionTime ? `${result.executionTime}ms` : 'unknown';

      let summary = `Completed in ${time}`;
      if (hasOutput) summary += `, produced output`;
      if (hasImages) summary += `, generated ${result.images.length} plot(s)`;

      return summary;
    }

    if (toolCall.toolId === 'list-directory') {
      const fileCount = result.files?.length || 0;
      const dirCount = result.directories?.length || 0;
      return `Found ${fileCount} file(s), ${dirCount} director(ies)`;
    }

    // Generic success message
    return 'Completed successfully';
  }

  /**
   * Parse tool calls from LLM response
   */
  private parseToolCalls(response: string): Array<{
    toolId: string;
    toolName: string;
    inputs: Record<string, any>;
  }> {
    const toolCalls: Array<{
      toolId: string;
      toolName: string;
      inputs: Record<string, any>;
    }> = [];

    // Look for tool call blocks
    const toolCallRegex = /```tool\s*\n([\s\S]*?)\n```/g;
    let match;

    const tools = getSystemTools();
    const toolsById = new Map(tools.map(t => [t.id, t]));

    while ((match = toolCallRegex.exec(response)) !== null) {
      try {
        const toolCallData = JSON.parse(match[1]);
        const tool = toolsById.get(toolCallData.tool);

        if (tool) {
          toolCalls.push({
            toolId: tool.id,
            toolName: tool.name,
            inputs: toolCallData.inputs || {},
          });
        } else {
          console.warn(`Unknown tool: ${toolCallData.tool}`);
        }
      } catch (error) {
        console.warn('Failed to parse tool call:', error);
      }
    }

    return toolCalls;
  }
}

/**
 * Create and execute SystemAgent
 */
export async function executeSystemAgent(
  userGoal: string,
  progressCallback?: ProgressCallback,
  config?: Partial<OrchestratorConfig>
): Promise<SystemAgentResult> {
  // Load SystemAgent definition
  const systemAgentMarkdown = await fetch('/system/agents/SystemAgent.md').then(r => r.text());

  // Extract system prompt (everything after the frontmatter)
  const frontmatterMatch = systemAgentMarkdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const systemPrompt = frontmatterMatch ? frontmatterMatch[2].trim() : systemAgentMarkdown;

  // Create orchestrator with config
  const orchestrator = new SystemAgentOrchestrator(
    systemPrompt,
    progressCallback,
    config
  );

  // Execute
  return await orchestrator.execute(userGoal);
}

/**
 * Create SystemAgent with specific strategy
 */
export function createSystemAgentWithStrategy(
  strategy: SummarizationStrategy,
  progressCallback?: ProgressCallback
): (userGoal: string) => Promise<SystemAgentResult> {
  return async (userGoal: string) => {
    return executeSystemAgent(userGoal, progressCallback, { strategy });
  };
}
