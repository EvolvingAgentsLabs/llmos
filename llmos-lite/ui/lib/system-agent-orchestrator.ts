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
}

/**
 * Project context for continuing work on an existing project
 */
export interface ProjectContext {
  /** The VFS path to the project (e.g., "projects/pacman_game") */
  projectPath: string;
  /** The display name of the project (e.g., "Pacman Game") */
  projectName: string;
  /** Content of context.md if it exists */
  contextFile?: string;
  /** Content of memory.md if it exists */
  memoryFile?: string;
  /** List of existing files in the project */
  existingFiles?: string[];
  /** Whether this is an existing project or a new one */
  isExistingProject: boolean;
}

export interface AgentProgressEvent {
  type: 'thinking' | 'tool-call' | 'memory-query' | 'execution' | 'completed' | 'context-management' | 'evolution' | 'multi-agent-validation';
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
   * Set project context for continuing work on an existing project
   */
  setProjectContext(context: ProjectContext): void {
    this.projectContext = context;
    console.log('[SystemAgent] Project context set:', {
      projectPath: context.projectPath,
      projectName: context.projectName,
      isExisting: context.isExistingProject,
      hasContext: !!context.contextFile,
      hasMemory: !!context.memoryFile,
      fileCount: context.existingFiles?.length || 0,
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
   */
  async execute(userGoal: string): Promise<SystemAgentResult> {
    const startTime = performance.now();
    const toolCalls: ToolCallResult[] = [];
    const filesCreated: string[] = [];
    // Use project context path if available, otherwise detect from file writes
    let projectPath: string | undefined = this.projectContext?.isExistingProject
      ? this.projectContext.projectPath
      : undefined;
    let lastContextResult: { wasSummarized: boolean; summarizationSteps?: number; tokenEstimate: number } | null = null;

    try {
      const llmClient = createLLMClient();
      if (!llmClient) {
        throw new Error('LLM client not configured');
      }

      // Initialize context manager with system prompt and user goal
      const systemPromptWithTools = this.buildSystemPromptWithTools();
      this.contextManager.initialize(systemPromptWithTools, userGoal);

      let iterations = 0;
      let finalResponse = '';

      // Emit initial thinking event
      this.emitProgress({
        type: 'thinking',
        agent: 'SystemAgent',
        action: this.projectContext?.isExistingProject
          ? `Continuing work on "${this.projectContext.projectName}"`
          : 'Reading system memory and planning approach',
        details: this.projectContext?.isExistingProject
          ? `Working in ${this.projectContext.projectPath} with ${this.projectContext.existingFiles?.length || 0} existing files`
          : 'Consulting /system/memory_log.md for similar past tasks',
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

        // Call LLM with the managed context
        const llmResponse = await llmClient.chatDirect(contextResult.messages);

        // Parse for tool calls
        const toolCallsInResponse = this.parseToolCalls(llmResponse);

        if (toolCallsInResponse.length === 0) {
          // No tool calls, agent is done
          finalResponse = llmResponse;
          break;
        }

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

              // Detect project path - only for actual project structures
              // A project must have a proper directory structure (not just a file in /projects/)
              if (!projectPath && toolCall.inputs.path.startsWith('projects/')) {
                const parts = toolCall.inputs.path.split('/');
                // Only consider it a project if:
                // 1. Path has at least 3 parts (projects/projectName/something)
                // 2. The path suggests project structure (components/, agents/, output/, etc.)
                const isProjectStructure = parts.length >= 3 && (
                  parts.includes('components') ||
                  parts.includes('agents') ||
                  parts.includes('output') ||
                  parts.includes('memory') ||
                  // Or if explicitly creating a project config file
                  parts[parts.length - 1] === 'project.json' ||
                  parts[parts.length - 1] === 'README.md'
                );

                if (isProjectStructure && parts.length >= 2) {
                  projectPath = `projects/${parts[1]}`;
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
      const evolutionResult: { memoryUpdated: boolean; learnings: string[] } = {
        memoryUpdated: false,
        learnings: [],
      };

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
   * Build project context preamble for existing projects
   */
  private buildProjectContextPreamble(): string {
    if (!this.projectContext || !this.projectContext.isExistingProject) {
      return '';
    }

    const ctx = this.projectContext;
    let preamble = `
## 🎯 ACTIVE PROJECT CONTEXT - CONTINUE WORKING HERE

**IMPORTANT: You are continuing work on an EXISTING project. DO NOT create a new project structure.**

### Current Project
- **Name**: ${ctx.projectName}
- **Path**: \`${ctx.projectPath}\`
- **Status**: Existing project with ${ctx.existingFiles?.length || 0} files

### Existing Files
\`\`\`
${ctx.existingFiles?.slice(0, 30).join('\n') || 'No files listed'}
${(ctx.existingFiles?.length || 0) > 30 ? `\n... and ${ctx.existingFiles!.length - 30} more files` : ''}
\`\`\`

### Instructions for Continuation
1. **DO NOT** create a new project directory structure
2. **DO** work within \`${ctx.projectPath}/\`
3. **DO** read existing files before modifying them
4. **DO** evolve existing agents rather than creating duplicates
5. **DO** update context.md and memory.md with new work

`;

    if (ctx.contextFile) {
      preamble += `### Project Context (context.md)
\`\`\`markdown
${ctx.contextFile.substring(0, 2000)}${ctx.contextFile.length > 2000 ? '\n... [truncated]' : ''}
\`\`\`

`;
    }

    if (ctx.memoryFile) {
      preamble += `### Project Memory (memory.md)
\`\`\`markdown
${ctx.memoryFile.substring(0, 2000)}${ctx.memoryFile.length > 2000 ? '\n... [truncated]' : ''}
\`\`\`

`;
    }

    preamble += `### Continuation Mode Active
When the user asks to:
- "Add a feature" → Add to THIS project
- "Refactor" → Modify existing code in THIS project
- "Fix a bug" → Fix within THIS project
- "Improve" → Enhance THIS project
- "Create something new" → Ask if it should be in THIS project or a new one

---

`;

    return preamble;
  }

  /**
   * Build system prompt with tool descriptions
   */
  private buildSystemPromptWithTools(): string {
    let prompt = this.systemPrompt;

    // Add project context preamble if working on existing project
    const projectPreamble = this.buildProjectContextPreamble();
    if (projectPreamble) {
      prompt = projectPreamble + prompt;
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
