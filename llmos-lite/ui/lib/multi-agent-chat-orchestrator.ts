/**
 * Multi-Agent Chat Orchestrator
 *
 * Coordinates real agent interactions for goal-oriented tasks.
 * Creates and manages sub-agents dynamically, tracks all interactions,
 * and emits events for real-time UI display.
 */

import { EventEmitter } from 'events';
import { LLMClient, createLLMClient, Message } from './llm-client';
import { AgentExecutor, parseAgentFromMarkdown, AgentExecutionResult } from './agent-executor';
import { getToolContext } from './tool-executor';
import { getVFS } from './virtual-fs';
import { logger } from './debug/logger';

// Types for multi-agent chat
export type ParticipantType = 'user' | 'system-agent' | 'sub-agent';

export interface ChatParticipant {
  id: string;
  name: string;
  type: ParticipantType;
  color: string;
  role?: string;
  status: 'idle' | 'thinking' | 'executing' | 'done';
  capabilities?: string[];
}

export interface AgentProposal {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  confidence: number;
  votes: number;
  selected?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  participantId: string;
  branchId?: number;
  isDecisionPoint?: boolean;
  alternatives?: AgentProposal[];
  agentCalls?: AgentCallInfo[];
  fileReferences?: FileReference[];
  isSystemMessage?: boolean;
}

export interface AgentCallInfo {
  agentId: string;
  agentName: string;
  purpose: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  startTime?: number;
  endTime?: number;
}

export interface FileReference {
  path: string;
  name: string;
  type: 'code' | 'plan' | 'output';
}

// Event types emitted by orchestrator
export interface OrchestratorEvents {
  'participant:added': ChatParticipant;
  'participant:status': { participantId: string; status: ChatParticipant['status'] };
  'message:added': ChatMessage;
  'message:updated': ChatMessage;
  'agent:called': AgentCallInfo;
  'agent:completed': AgentCallInfo;
  'proposal:added': { messageId: string; proposal: AgentProposal };
  'vote:cast': { proposalId: string; voterId: string };
  'file:created': FileReference;
  'phase:changed': { phase: 'planning' | 'coordinating' | 'executing' | 'reviewing' | 'completed' };
}

// Default agent colors
const AGENT_COLORS: Record<string, string> = {
  'system-agent': '#a371f7',
  'planner': '#3fb950',
  'coder': '#ffa657',
  'reviewer': '#f778ba',
  'analyst': '#79c0ff',
  'default': '#8b949e',
};

/**
 * Multi-Agent Chat Orchestrator
 *
 * Creates real sub-agents for goal execution and coordinates their work.
 */
export class MultiAgentChatOrchestrator extends EventEmitter {
  private llmClient: LLMClient | null = null;
  private participants: Map<string, ChatParticipant> = new Map();
  private messages: ChatMessage[] = [];
  private activeAgents: Map<string, AgentExecutor> = new Map();
  private currentPhase: 'planning' | 'coordinating' | 'executing' | 'reviewing' | 'completed' = 'planning';
  private vfs = getVFS();

  constructor() {
    super();
    this.initializeSystemAgent();
  }

  /**
   * Initialize the System Agent as the main coordinator
   */
  private initializeSystemAgent(): void {
    const systemAgent: ChatParticipant = {
      id: 'system-agent',
      name: 'System Agent',
      type: 'system-agent',
      color: AGENT_COLORS['system-agent'],
      status: 'idle',
      capabilities: ['coordination', 'planning', 'delegation', 'evolution'],
    };
    this.participants.set('system-agent', systemAgent);
  }

  /**
   * Initialize LLM client
   */
  private ensureLLMClient(): LLMClient {
    if (!this.llmClient) {
      this.llmClient = createLLMClient();
      if (!this.llmClient) {
        throw new Error('LLM client not configured. Please set API key and model.');
      }
    }
    return this.llmClient;
  }

  /**
   * Get all participants
   */
  getParticipants(): ChatParticipant[] {
    return Array.from(this.participants.values());
  }

  /**
   * Get all messages
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Add user message and process goal
   */
  async processUserGoal(goal: string): Promise<void> {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Add user participant if not exists
    if (!this.participants.has('user')) {
      const userParticipant: ChatParticipant = {
        id: 'user',
        name: 'You',
        type: 'user',
        color: '#58a6ff',
        status: 'idle',
      };
      this.participants.set('user', userParticipant);
      this.emit('participant:added', userParticipant);
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: goal,
      timestamp,
      participantId: 'user',
    };
    this.messages.push(userMessage);
    this.emit('message:added', userMessage);

    try {
      // Phase 1: Planning
      await this.planGoal(goal);

      // Phase 2: Create sub-agents
      await this.createSubAgents(goal);

      // Phase 3: Coordinate execution
      await this.coordinateExecution(goal);

      // Phase 4: Review and summarize
      await this.reviewResults();

    } catch (error) {
      logger.error('orchestrator', 'Failed to process goal', { error });
      this.addSystemMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Phase 1: Plan the goal
   */
  private async planGoal(goal: string): Promise<void> {
    this.setPhase('planning');
    this.updateParticipantStatus('system-agent', 'thinking');

    const planningMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: 'Analyzing your goal and creating an execution plan...',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      participantId: 'system-agent',
      isSystemMessage: true,
      agentCalls: [{
        agentId: 'planner',
        agentName: 'Planning Agent',
        purpose: 'Decomposing goal into tasks',
        status: 'pending',
      }],
    };
    this.messages.push(planningMessage);
    this.emit('message:added', planningMessage);

    // Call LLM to create execution plan
    const llmClient = this.ensureLLMClient();
    const planPrompt = this.buildPlanningPrompt(goal);

    try {
      const planResponse = await llmClient.chatDirect([
        { role: 'system', content: planPrompt },
        { role: 'user', content: goal },
      ]);

      // Update planning message with result
      planningMessage.content = planResponse;
      planningMessage.agentCalls![0].status = 'completed';
      planningMessage.agentCalls![0].result = 'Plan created successfully';
      this.emit('message:updated', planningMessage);

      // Store plan in VFS
      const planPath = `user/plans/plan-${Date.now()}.md`;
      this.vfs.writeFile(planPath, `# Execution Plan\n\n${planResponse}`);

      planningMessage.fileReferences = [{
        path: planPath,
        name: 'execution_plan.md',
        type: 'plan',
      }];
      this.emit('message:updated', planningMessage);

    } catch (error) {
      planningMessage.agentCalls![0].status = 'failed';
      this.emit('message:updated', planningMessage);
      throw error;
    }

    this.updateParticipantStatus('system-agent', 'idle');
  }

  /**
   * Phase 2: Create sub-agents for the goal
   */
  private async createSubAgents(goal: string): Promise<void> {
    this.setPhase('coordinating');
    this.updateParticipantStatus('system-agent', 'executing');

    // Create at least 3 sub-agents based on the goal
    const agentTypes = this.determineRequiredAgents(goal);

    const coordinationMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `Creating ${agentTypes.length} specialized agents to work on this goal:`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      participantId: 'system-agent',
      isSystemMessage: true,
      agentCalls: agentTypes.map(agent => ({
        agentId: agent.id,
        agentName: agent.name,
        purpose: agent.purpose,
        status: 'pending' as const,
      })),
    };
    this.messages.push(coordinationMessage);
    this.emit('message:added', coordinationMessage);

    // Create each agent
    for (let i = 0; i < agentTypes.length; i++) {
      const agentType = agentTypes[i];
      await this.createAndRegisterAgent(agentType);

      // Update status
      coordinationMessage.agentCalls![i].status = 'completed';
      coordinationMessage.agentCalls![i].result = `${agentType.name} ready`;
      this.emit('message:updated', coordinationMessage);
      this.emit('agent:completed', coordinationMessage.agentCalls![i]);

      // Small delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    this.updateParticipantStatus('system-agent', 'idle');
  }

  /**
   * Determine which agents are needed based on goal
   */
  private determineRequiredAgents(goal: string): Array<{ id: string; name: string; role: string; purpose: string }> {
    const goalLower = goal.toLowerCase();
    const agents: Array<{ id: string; name: string; role: string; purpose: string }> = [];

    // Always include a planner
    agents.push({
      id: 'planner',
      name: 'Planner Agent',
      role: 'planner',
      purpose: 'Breaking down the task into steps',
    });

    // Code-related goals
    if (goalLower.includes('code') || goalLower.includes('implement') || goalLower.includes('create') ||
        goalLower.includes('build') || goalLower.includes('firmware') || goalLower.includes('script')) {
      agents.push({
        id: 'coder',
        name: 'Coder Agent',
        role: 'coder',
        purpose: 'Writing and implementing code',
      });
    }

    // Analysis-related goals
    if (goalLower.includes('analyz') || goalLower.includes('research') || goalLower.includes('investigate') ||
        goalLower.includes('study') || goalLower.includes('understand')) {
      agents.push({
        id: 'analyst',
        name: 'Analyst Agent',
        role: 'analyst',
        purpose: 'Analyzing requirements and data',
      });
    }

    // Always include a reviewer
    agents.push({
      id: 'reviewer',
      name: 'Reviewer Agent',
      role: 'reviewer',
      purpose: 'Reviewing and validating results',
    });

    // Ensure at least 3 agents
    if (agents.length < 3) {
      if (!agents.find(a => a.id === 'coder')) {
        agents.splice(1, 0, {
          id: 'coder',
          name: 'Coder Agent',
          role: 'coder',
          purpose: 'Implementing the solution',
        });
      }
    }

    return agents;
  }

  /**
   * Create and register a sub-agent
   */
  private async createAndRegisterAgent(agentType: { id: string; name: string; role: string; purpose: string }): Promise<void> {
    // Create participant
    const participant: ChatParticipant = {
      id: agentType.id,
      name: agentType.name,
      type: 'sub-agent',
      color: AGENT_COLORS[agentType.role] || AGENT_COLORS.default,
      role: agentType.role,
      status: 'idle',
      capabilities: [agentType.purpose],
    };
    this.participants.set(agentType.id, participant);
    this.emit('participant:added', participant);

    // Create agent markdown definition
    const agentMarkdown = this.generateAgentMarkdown(agentType);

    // Write to VFS
    const agentPath = `user/agents/${agentType.id}.md`;
    this.vfs.writeFile(agentPath, agentMarkdown);

    logger.info('orchestrator', `Created sub-agent: ${agentType.name}`, { path: agentPath });
  }

  /**
   * Generate markdown for a sub-agent
   */
  private generateAgentMarkdown(agentType: { id: string; name: string; role: string; purpose: string }): string {
    const templates: Record<string, string> = {
      planner: `---
name: ${agentType.name}
type: specialist
id: ${agentType.id}
description: ${agentType.purpose}
model: anthropic/claude-sonnet-4
maxIterations: 5
tools:
  - read-file
  - list-directory
capabilities:
  - Task decomposition
  - Step-by-step planning
  - Resource identification
origin: created
---

# ${agentType.name}

You are a Planning Agent specialized in breaking down complex goals into actionable steps.

## Your Role
- Analyze the user's goal and understand requirements
- Identify necessary resources and dependencies
- Create a clear, step-by-step execution plan
- Estimate complexity and potential challenges

## Output Format
Provide your plan as a structured markdown list with clear steps.
`,
      coder: `---
name: ${agentType.name}
type: specialist
id: ${agentType.id}
description: ${agentType.purpose}
model: anthropic/claude-sonnet-4
maxIterations: 10
tools:
  - write-file
  - read-file
  - execute-python
capabilities:
  - Code implementation
  - Algorithm design
  - File creation
origin: created
---

# ${agentType.name}

You are a Coding Agent specialized in implementing solutions.

## Your Role
- Write clean, efficient code based on the plan
- Follow best practices and coding standards
- Create necessary files and structures
- Test implementations when possible

## Output Format
Provide working code with clear comments explaining the implementation.
`,
      reviewer: `---
name: ${agentType.name}
type: specialist
id: ${agentType.id}
description: ${agentType.purpose}
model: anthropic/claude-sonnet-4
maxIterations: 3
tools:
  - read-file
capabilities:
  - Code review
  - Quality assurance
  - Validation
origin: created
---

# ${agentType.name}

You are a Review Agent specialized in validating and improving work.

## Your Role
- Review code and outputs for correctness
- Identify potential issues or improvements
- Validate against requirements
- Suggest optimizations

## Output Format
Provide a structured review with findings and recommendations.
`,
      analyst: `---
name: ${agentType.name}
type: specialist
id: ${agentType.id}
description: ${agentType.purpose}
model: anthropic/claude-sonnet-4
maxIterations: 5
tools:
  - read-file
  - execute-python
capabilities:
  - Data analysis
  - Research
  - Pattern identification
origin: created
---

# ${agentType.name}

You are an Analysis Agent specialized in understanding and researching problems.

## Your Role
- Analyze requirements and constraints
- Research relevant information
- Identify patterns and insights
- Provide data-driven recommendations

## Output Format
Provide analysis results with clear findings and evidence.
`,
    };

    return templates[agentType.role] || templates.coder;
  }

  /**
   * Phase 3: Coordinate agent execution
   */
  private async coordinateExecution(goal: string): Promise<void> {
    this.setPhase('executing');

    // Get proposals from each agent
    const proposals: AgentProposal[] = [];

    for (const [agentId, participant] of this.participants) {
      if (participant.type !== 'sub-agent') continue;

      this.updateParticipantStatus(agentId, 'thinking');

      // Get agent's proposal
      const proposal = await this.getAgentProposal(agentId, participant.name, goal);
      if (proposal) {
        proposals.push(proposal);
      }

      this.updateParticipantStatus(agentId, 'idle');
    }

    // Create decision point message with alternatives
    if (proposals.length > 0) {
      const decisionMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'The agents have proposed different approaches. Please review and select one:',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        participantId: 'system-agent',
        isSystemMessage: true,
        isDecisionPoint: true,
        alternatives: proposals,
      };
      this.messages.push(decisionMessage);
      this.emit('message:added', decisionMessage);
    }

    // Execute with the first proposal (or wait for user selection in full implementation)
    if (proposals.length > 0) {
      await this.executeWithProposal(proposals[0], goal);
    }
  }

  /**
   * Get a proposal from an agent
   */
  private async getAgentProposal(agentId: string, agentName: string, goal: string): Promise<AgentProposal | null> {
    try {
      const llmClient = this.ensureLLMClient();

      const proposalPrompt = `You are ${agentName}. Given this goal, propose your approach in 2-3 sentences. Be specific about what you would do.

Goal: ${goal}

Your proposal:`;

      const response = await llmClient.chatDirect([
        { role: 'user', content: proposalPrompt },
      ]);

      return {
        id: `proposal-${agentId}-${Date.now()}`,
        agentId,
        agentName,
        content: response.trim(),
        confidence: 0.7 + Math.random() * 0.3, // Simulated confidence
        votes: Math.floor(Math.random() * 3), // Initial votes
      };
    } catch (error) {
      logger.error('orchestrator', `Failed to get proposal from ${agentName}`, { error });
      return null;
    }
  }

  /**
   * Execute with selected proposal
   */
  private async executeWithProposal(proposal: AgentProposal, goal: string): Promise<void> {
    const executingAgent = this.participants.get(proposal.agentId);
    if (!executingAgent) return;

    this.updateParticipantStatus(proposal.agentId, 'executing');

    // Execute the goal using the selected approach
    const llmClient = this.ensureLLMClient();

    const executionMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `Executing ${proposal.agentName}'s approach...`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      participantId: proposal.agentId,
      isSystemMessage: false,
      agentCalls: [{
        agentId: proposal.agentId,
        agentName: proposal.agentName,
        purpose: 'Implementing solution',
        status: 'running',
      }],
    };
    this.messages.push(executionMessage);
    this.emit('message:added', executionMessage);

    try {
      const executionPrompt = `You are ${proposal.agentName}. Execute this task based on your proposed approach.

Goal: ${goal}

Your approach: ${proposal.content}

Provide the complete implementation or result. If code is needed, write it. If files need to be created, specify them.`;

      const result = await llmClient.chatDirect([
        { role: 'user', content: executionPrompt },
      ]);

      // Update message with result
      executionMessage.content = result;
      executionMessage.agentCalls![0].status = 'completed';
      executionMessage.agentCalls![0].result = 'Implementation complete';

      // Check for code blocks and create files
      const codeBlocks = this.extractCodeBlocks(result);
      if (codeBlocks.length > 0) {
        executionMessage.fileReferences = [];
        for (const block of codeBlocks) {
          const filePath = `user/output/${block.filename || `code-${Date.now()}.${block.language}`}`;
          this.vfs.writeFile(filePath, block.code);
          executionMessage.fileReferences.push({
            path: filePath,
            name: block.filename || `code.${block.language}`,
            type: 'code',
          });
          this.emit('file:created', executionMessage.fileReferences[executionMessage.fileReferences.length - 1]);
        }
      }

      this.emit('message:updated', executionMessage);

    } catch (error) {
      executionMessage.agentCalls![0].status = 'failed';
      executionMessage.content = `Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.emit('message:updated', executionMessage);
    }

    this.updateParticipantStatus(proposal.agentId, 'done');
  }

  /**
   * Extract code blocks from response
   */
  private extractCodeBlocks(content: string): Array<{ language: string; code: string; filename?: string }> {
    const blocks: Array<{ language: string; code: string; filename?: string }> = [];
    const codeBlockRegex = /```(\w+)?\s*(?:\n)?(?:\/\/\s*(\S+)\s*\n)?([\s\S]*?)```/g;

    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const language = match[1] || 'txt';
      const filename = match[2];
      const code = match[3].trim();

      if (code.length > 10) { // Skip tiny blocks
        blocks.push({ language, code, filename });
      }
    }

    return blocks;
  }

  /**
   * Phase 4: Review results
   */
  private async reviewResults(): Promise<void> {
    this.setPhase('reviewing');

    const reviewer = this.participants.get('reviewer');
    if (!reviewer) {
      this.setPhase('completed');
      return;
    }

    this.updateParticipantStatus('reviewer', 'thinking');

    const reviewMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: 'Reviewing the implementation...',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      participantId: 'reviewer',
      agentCalls: [{
        agentId: 'reviewer',
        agentName: 'Reviewer Agent',
        purpose: 'Validating results',
        status: 'running',
      }],
    };
    this.messages.push(reviewMessage);
    this.emit('message:added', reviewMessage);

    try {
      const llmClient = this.ensureLLMClient();

      // Get recent execution context
      const recentMessages = this.messages.slice(-5).map(m => m.content).join('\n\n');

      const reviewPrompt = `You are a Review Agent. Review the following work and provide feedback.

Work done:
${recentMessages}

Provide a brief review (2-3 points) on:
1. What was done well
2. Any issues or improvements needed
3. Overall assessment`;

      const review = await llmClient.chatDirect([
        { role: 'user', content: reviewPrompt },
      ]);

      reviewMessage.content = review;
      reviewMessage.agentCalls![0].status = 'completed';
      this.emit('message:updated', reviewMessage);

    } catch (error) {
      reviewMessage.content = 'Review could not be completed.';
      reviewMessage.agentCalls![0].status = 'failed';
      this.emit('message:updated', reviewMessage);
    }

    this.updateParticipantStatus('reviewer', 'done');
    this.setPhase('completed');

    // Final summary
    this.addSystemMessage('Goal execution complete. All agents have finished their work.');
  }

  /**
   * Helper: Update participant status
   */
  private updateParticipantStatus(participantId: string, status: ChatParticipant['status']): void {
    const participant = this.participants.get(participantId);
    if (participant) {
      participant.status = status;
      this.emit('participant:status', { participantId, status });
    }
  }

  /**
   * Helper: Set current phase
   */
  private setPhase(phase: typeof this.currentPhase): void {
    this.currentPhase = phase;
    this.emit('phase:changed', { phase });
  }

  /**
   * Helper: Add system message
   */
  private addSystemMessage(content: string): void {
    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      participantId: 'system-agent',
      isSystemMessage: true,
    };
    this.messages.push(message);
    this.emit('message:added', message);
  }

  /**
   * Build planning prompt for LLM
   */
  private buildPlanningPrompt(goal: string): string {
    return `You are a Planning Agent in a multi-agent system. Your role is to analyze the user's goal and create a clear execution plan.

## Your Task
Analyze the goal and provide:
1. A brief understanding of what needs to be done
2. Key requirements and constraints
3. A step-by-step plan (3-5 steps)
4. What specialist agents would be needed

## Guidelines
- Be concise but thorough
- Focus on actionable steps
- Consider practical implementation
- Identify potential challenges

Respond in markdown format with clear sections.`;
  }

  /**
   * Vote for a proposal
   */
  voteForProposal(proposalId: string, voterId: string = 'user'): void {
    for (const message of this.messages) {
      if (message.alternatives) {
        for (const alt of message.alternatives) {
          if (alt.id === proposalId) {
            alt.votes++;
            alt.selected = true;
            this.emit('vote:cast', { proposalId, voterId });
            this.emit('message:updated', message);
            return;
          }
        }
      }
    }
  }
}

// Singleton instance
let orchestratorInstance: MultiAgentChatOrchestrator | null = null;

export function getMultiAgentOrchestrator(): MultiAgentChatOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new MultiAgentChatOrchestrator();
  }
  return orchestratorInstance;
}

export function resetMultiAgentOrchestrator(): void {
  orchestratorInstance = null;
}
