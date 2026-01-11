/**
 * Multi-Agent Chat Orchestrator
 *
 * HYBRID ARCHITECTURE:
 * - Code Layer: This adapter translates SystemAgentOrchestrator events to chat UI
 * - Markdown Layer: SystemAgent.md (evolutive) is the actual "brain"
 *
 * This follows the LLMos evolutive approach where:
 * - The SystemAgent is defined in markdown and can evolve
 * - Sub-agents are created as markdown files in VFS
 * - This code is a "proxy" that connects the agent system to the chat UI
 */

import { EventEmitter } from 'events';
import {
  SystemAgentOrchestrator,
  AgentProgressEvent,
  SystemAgentResult,
} from './system-agent-orchestrator';
import { getVFS } from './virtual-fs';
import { logger } from './debug/logger';
import { SolutionProposer } from './chat/solution-proposer';
import { getSpeculativeExecutor } from './speculative/speculative-executor';
import type { ProposedSolution, FlowPrediction, PredictedStep } from './chat/types';

// Types for multi-agent chat UI
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
  // Sub-agent dialog chain
  agentDialogs?: AgentDialogEntry[];
  // Predictions for next steps
  predictions?: PredictedStep[];
  // Speculative execution preview
  speculativePreview?: {
    executionId: string;
    status: 'computing' | 'completed' | 'cancelled';
    partialOutput?: string;
    tokensUsed: number;
  };
  // Checkpoint info
  checkpoint?: DecisionCheckpoint;
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

export interface AgentDialogEntry {
  fromAgent: string;
  toAgent: string;
  message: string;
  timestamp: number;
}

export interface DecisionCheckpoint {
  type: 'APPROACH_SELECTION' | 'AGENT_COMPOSITION' | 'IMPLEMENTATION_CHOICE' | 'REVIEW_AND_CONTINUE';
  phase: number;
  triggered: boolean;
  resolvedAt?: number;
  selectedOption?: string;
}

export interface FileReference {
  path: string;
  name: string;
  type: 'code' | 'plan' | 'output' | 'agent';
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

// Default agent colors - distinct for each actor type
// These colors are used consistently across the chat timeline graph
const AGENT_COLORS: Record<string, string> = {
  'user': '#58a6ff',           // Blue for user
  'you': '#58a6ff',            // Blue for user (alt name)
  'system-agent': '#a371f7',   // Purple for system agent
  'systemagent': '#a371f7',    // Purple for system agent (alt)
  'system': '#a371f7',         // Purple for system agent (alt)
  'planner': '#3fb950',        // Green for planning agent
  'planning': '#3fb950',       // Green for planning agent (alt)
  'coder': '#ffa657',          // Orange for coding agent
  'developer': '#ffa657',      // Orange for coding agent (alt)
  'coding': '#ffa657',         // Orange for coding agent (alt)
  'reviewer': '#f778ba',       // Pink for review agent
  'review': '#f778ba',         // Pink for review agent (alt)
  'analyst': '#79c0ff',        // Light blue for analyst
  'analysis': '#79c0ff',       // Light blue for analyst (alt)
  'executor': '#d29922',       // Gold for executor
  'default': '#8b949e',        // Gray fallback
};

/**
 * Get color for an agent by name or role
 * Tries multiple variations to find a match
 */
function getAgentColor(identifier: string): string {
  const normalized = identifier.toLowerCase().replace(/[\s-_]+/g, '');
  // Try exact match first
  if (AGENT_COLORS[normalized]) return AGENT_COLORS[normalized];
  // Try partial matches
  for (const [key, color] of Object.entries(AGENT_COLORS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return color;
    }
  }
  return AGENT_COLORS.default;
}

// Voting timeout in milliseconds (30 seconds default)
const VOTING_TIMEOUT_MS = 30000;

// Pause/Resume event names
const ORCHESTRATOR_PAUSE_EVENT = 'orchestrator:pause';
const ORCHESTRATOR_RESUME_EVENT = 'orchestrator:resume';

/**
 * Multi-Agent Chat Orchestrator
 *
 * This is an ADAPTER that:
 * 1. Wraps the real SystemAgentOrchestrator (which uses SystemAgent.md)
 * 2. Translates AgentProgressEvent → Chat UI events
 * 3. Tracks participants and messages for the chat interface
 * 4. Handles voting timeouts and pause/resume functionality
 *
 * The actual agent logic lives in:
 * - /system/agents/SystemAgent.md (the evolutive markdown agent)
 * - SystemAgentOrchestrator (the execution engine)
 */
export class MultiAgentChatOrchestrator extends EventEmitter {
  private systemOrchestrator: SystemAgentOrchestrator | null = null;
  private participants: Map<string, ChatParticipant> = new Map();
  private messages: ChatMessage[] = [];
  private currentPhase: 'planning' | 'coordinating' | 'executing' | 'reviewing' | 'completed' = 'planning';
  private vfs = getVFS();
  private currentMessageId: string | null = null;
  private pendingToolCalls: Map<string, AgentCallInfo> = new Map();
  private isPaused: boolean = false;
  private pausePromiseResolve: (() => void) | null = null;
  private votingTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Sub-agent dialog tracking
  private agentDialogs: AgentDialogEntry[] = [];

  // Speculative execution
  private speculativeExecutor = getSpeculativeExecutor();
  private solutionProposer = new SolutionProposer();

  // Decision checkpoints
  private checkpoints: DecisionCheckpoint[] = [
    { type: 'APPROACH_SELECTION', phase: 2, triggered: false },
    { type: 'AGENT_COMPOSITION', phase: 4, triggered: false },
    { type: 'IMPLEMENTATION_CHOICE', phase: 5, triggered: false },
    { type: 'REVIEW_AND_CONTINUE', phase: 7, triggered: false },
  ];

  // Flow predictions
  private predictions: FlowPrediction[] = [];

  constructor() {
    super();
    this.initializeSystemAgent();
    this.setupPauseListeners();
  }

  /**
   * Setup listeners for pause/resume events from header
   */
  private setupPauseListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener(ORCHESTRATOR_PAUSE_EVENT, () => {
        this.isPaused = true;
        logger.info('agent', 'Orchestrator paused');
        this.emit('paused', { paused: true });
      });

      window.addEventListener(ORCHESTRATOR_RESUME_EVENT, () => {
        this.isPaused = false;
        logger.info('agent', 'Orchestrator resumed');
        this.emit('paused', { paused: false });
        // Resolve any pending pause promise
        if (this.pausePromiseResolve) {
          this.pausePromiseResolve();
          this.pausePromiseResolve = null;
        }
      });
    }
  }

  /**
   * Wait if paused - returns immediately if not paused
   */
  private async waitIfPaused(): Promise<void> {
    if (!this.isPaused) return;

    return new Promise<void>((resolve) => {
      this.pausePromiseResolve = resolve;
    });
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
   * Load SystemAgent.md and create the orchestrator
   */
  private async initializeOrchestrator(): Promise<SystemAgentOrchestrator> {
    if (this.systemOrchestrator) {
      return this.systemOrchestrator;
    }

    // Load the SystemAgent markdown from VFS
    const systemAgentPath = 'system/agents/SystemAgent.md';
    let systemAgentMarkdown: string;

    try {
      const vfsFile = this.vfs.readFile(systemAgentPath);
      if (vfsFile && vfsFile.content) {
        systemAgentMarkdown = vfsFile.content;
        logger.info('agent', 'Loaded SystemAgent.md from VFS', { path: systemAgentPath });
      } else {
        throw new Error('File not found in VFS');
      }
    } catch {
      // Fallback: fetch from public folder
      try {
        const response = await fetch('/system/agents/SystemAgent.md');
        if (!response.ok) throw new Error('Failed to fetch SystemAgent.md');
        systemAgentMarkdown = await response.text();
        // Cache in VFS for future use
        this.vfs.writeFile(systemAgentPath, systemAgentMarkdown);
        logger.info('agent', 'Loaded SystemAgent.md from public folder', { path: systemAgentPath });
      } catch (fetchError) {
        logger.error('agent', 'Failed to load SystemAgent.md', { error: fetchError });
        throw new Error('SystemAgent.md not found. Cannot proceed without the evolutive agent definition.');
      }
    }

    // Extract system prompt from markdown (content after frontmatter)
    const systemPrompt = this.extractSystemPrompt(systemAgentMarkdown);

    // Create the real orchestrator with progress callback
    this.systemOrchestrator = new SystemAgentOrchestrator(
      systemPrompt,
      (event) => this.handleProgressEvent(event),
      { maxIterations: 15, strategy: 'balanced', updateSystemMemory: true, persistWorkflow: true }
    );

    // Set workspace context
    this.systemOrchestrator.setWorkspaceContext({
      volume: 'user',
      workspacePath: 'user',
      sections: ['agents', 'output', 'plans'],
    });

    return this.systemOrchestrator;
  }

  /**
   * Extract system prompt from markdown (skip YAML frontmatter)
   */
  private extractSystemPrompt(markdown: string): string {
    // Check if it starts with frontmatter
    if (markdown.startsWith('---')) {
      const endOfFrontmatter = markdown.indexOf('---', 3);
      if (endOfFrontmatter !== -1) {
        return markdown.substring(endOfFrontmatter + 3).trim();
      }
    }
    return markdown;
  }

  /**
   * Handle progress events from SystemAgentOrchestrator
   * Translate them to chat UI events
   */
  private handleProgressEvent(event: AgentProgressEvent): void {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    switch (event.type) {
      case 'initializing':
        this.updateParticipantStatus('system-agent', 'thinking');
        this.addSystemMessage(`Initializing: ${event.details || event.action || ''}`);
        break;

      case 'thinking':
        this.updateParticipantStatus('system-agent', 'thinking');
        if (event.details) {
          this.addSystemMessage(`Thinking: ${event.details}`);
        }
        break;

      case 'tool-call':
        this.handleToolCall(event, timestamp);
        break;

      case 'execution':
        this.setPhase('executing');
        this.updateParticipantStatus('system-agent', 'executing');
        if (event.details) {
          this.addSystemMessage(event.details);
        }
        break;

      case 'multi-agent-validation':
        this.handleMultiAgentValidation(event);
        break;

      case 'evolution':
        if (event.details) {
          this.addSystemMessage(`Evolution: ${event.details}`);
        }
        break;

      case 'completed':
        this.setPhase('completed');
        this.updateParticipantStatus('system-agent', 'done');
        break;

      case 'api-call':
        // Show that we're calling the LLM
        this.updateParticipantStatus('system-agent', 'thinking');
        break;

      case 'parsing':
        // Internal parsing, no UI update needed
        break;

      case 'waiting':
        this.updateParticipantStatus('system-agent', 'idle');
        break;
    }
  }

  /**
   * Handle tool-call events - these show sub-agent activity
   */
  private handleToolCall(event: AgentProgressEvent, timestamp: string): void {
    const toolId = event.tool || 'unknown';
    const toolName = event.action || toolId;

    // Check if this is a sub-agent being created
    if (toolId === 'write-file' && event.details?.includes('agents/')) {
      this.handleAgentCreation(event, timestamp);
      return;
    }

    // Track the tool call
    const callInfo: AgentCallInfo = {
      agentId: toolId,
      agentName: toolName,
      purpose: event.details || 'Executing tool',
      status: 'running',
      startTime: event.timestamp,
    };
    this.pendingToolCalls.set(toolId, callInfo);

    // Add message for tool call
    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `Using tool: ${toolName}`,
      timestamp,
      participantId: 'system-agent',
      isSystemMessage: true,
      agentCalls: [callInfo],
    };
    this.messages.push(message);
    this.emit('message:added', message);
    this.currentMessageId = message.id;
  }

  /**
   * Handle agent creation events
   */
  private handleAgentCreation(event: AgentProgressEvent, timestamp: string): void {
    // Extract agent name from path
    const pathMatch = event.details?.match(/agents\/([^.]+)\.md/);
    const agentName = pathMatch ? pathMatch[1] : 'sub-agent';
    const agentId = agentName.toLowerCase().replace(/\s+/g, '-');

    // Create participant for the sub-agent
    const participant: ChatParticipant = {
      id: agentId,
      name: agentName,
      type: 'sub-agent',
      color: getAgentColor(agentName),
      role: 'specialist',
      status: 'idle',
      capabilities: ['executing tasks'],
    };

    if (!this.participants.has(agentId)) {
      this.participants.set(agentId, participant);
      this.emit('participant:added', participant);

      // Add message about agent creation
      const message: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Created sub-agent: ${agentName}`,
        timestamp,
        participantId: 'system-agent',
        isSystemMessage: true,
        fileReferences: [{
          path: event.details || '',
          name: `${agentName}.md`,
          type: 'agent',
        }],
      };
      this.messages.push(message);
      this.emit('message:added', message);
    }
  }

  /**
   * Handle multi-agent validation events
   */
  private handleMultiAgentValidation(event: AgentProgressEvent): void {
    this.setPhase('coordinating');
    if (event.details) {
      this.addSystemMessage(`Agent Validation: ${event.details}`);
    }
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
   * Process a user goal using the real SystemAgentOrchestrator
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

    // Set phase to planning
    this.setPhase('planning');
    this.updateParticipantStatus('system-agent', 'thinking');

    try {
      // Initialize and get the real orchestrator (uses SystemAgent.md)
      const orchestrator = await this.initializeOrchestrator();

      // Add initial system message
      this.addSystemMessage('Processing your goal with the System Agent...');

      // Execute using the real SystemAgentOrchestrator
      // This will use SystemAgent.md as the brain
      const result: SystemAgentResult = await orchestrator.execute(goal);

      // Handle the result
      await this.handleExecutionResult(result, timestamp);

    } catch (error) {
      logger.error('agent', 'Failed to process goal', { error });
      this.addSystemMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.setPhase('completed');
      this.updateParticipantStatus('system-agent', 'idle');
    }
  }

  /**
   * Handle the result from SystemAgentOrchestrator
   */
  private async handleExecutionResult(result: SystemAgentResult, timestamp: string): Promise<void> {
    // Add files created to the chat
    if (result.filesCreated && result.filesCreated.length > 0) {
      const fileRefs: FileReference[] = result.filesCreated.map(path => ({
        path,
        name: path.split('/').pop() || path,
        type: path.includes('agent') ? 'agent' : path.endsWith('.md') ? 'plan' : 'code' as FileReference['type'],
      }));

      const filesMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Created ${result.filesCreated.length} file(s):`,
        timestamp,
        participantId: 'system-agent',
        isSystemMessage: true,
        fileReferences: fileRefs,
      };
      this.messages.push(filesMessage);
      this.emit('message:added', filesMessage);

      for (const ref of fileRefs) {
        this.emit('file:created', ref);
      }
    }

    // Show multi-agent validation results
    if (result.multiAgentValidation) {
      const validation = result.multiAgentValidation;
      const validationMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `**Multi-Agent Validation:**\n- Agents: ${validation.agentCount}/${validation.minimumRequired} required\n- Status: ${validation.isValid ? '✓ Valid' : '✗ Invalid'}\n- ${validation.message}`,
        timestamp,
        participantId: 'system-agent',
        isSystemMessage: true,
      };

      // Add sub-agents to participants
      for (const agent of validation.agents) {
        const agentId = agent.name.toLowerCase().replace(/\s+/g, '-');
        if (!this.participants.has(agentId)) {
          const participant: ChatParticipant = {
            id: agentId,
            name: agent.name,
            type: 'sub-agent',
            color: getAgentColor(agent.type || agent.name),
            role: agent.type,
            status: 'done',
            capabilities: [`Origin: ${agent.origin}`],
          };
          this.participants.set(agentId, participant);
          this.emit('participant:added', participant);
        }
      }

      this.messages.push(validationMessage);
      this.emit('message:added', validationMessage);
    }

    // Show sub-agent collaboration
    if (result.subAgentCollaboration && result.subAgentCollaboration.subAgentsUsed.length > 0) {
      const collab = result.subAgentCollaboration;
      const agentNames = collab.subAgentsUsed.map(a => a.agentName).join(', ');

      this.addSystemMessage(`**Sub-Agent Collaboration:**\n- Agents Used: ${agentNames}\n- ${collab.collaborationSummary}`);
    }

    // Parse sub-agent dialogs from response
    const dialogs = this.parseAgentDialogs(result.response);
    if (dialogs.length > 0) {
      this.agentDialogs.push(...dialogs);
      logger.info('agent', `Detected ${dialogs.length} sub-agent dialog(s)`);

      // Create participants for agents in dialogs
      for (const dialog of dialogs) {
        const agentId = dialog.fromAgent.toLowerCase().replace(/\s+/g, '-');
        if (!this.participants.has(agentId) && dialog.fromAgent !== 'User') {
          const participant: ChatParticipant = {
            id: agentId,
            name: dialog.fromAgent,
            type: 'sub-agent',
            color: getAgentColor(dialog.fromAgent),
            role: 'specialist',
            status: 'done',
          };
          this.participants.set(agentId, participant);
          this.emit('participant:added', participant);
        }
      }

      // Emit dialog messages for UI
      for (const dialog of dialogs) {
        const dialogMessage: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          content: `**${dialog.fromAgent}** → **${dialog.toAgent}**: ${dialog.message}`,
          timestamp,
          participantId: dialog.fromAgent.toLowerCase().replace(/\s+/g, '-'),
          isSystemMessage: true,
          agentDialogs: [dialog],
        };
        this.messages.push(dialogMessage);
        this.emit('message:added', dialogMessage);
        this.emit('agent:dialog', dialog);
      }
    }

    // Final response - check for decision points (options)
    const options = this.parseOptionsFromResponse(result.response);

    // Generate predictions for next steps
    const predictions = this.generatePredictions(this.currentPhase, options);

    const finalMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: result.response,
      timestamp,
      participantId: 'system-agent',
      isDecisionPoint: options.length > 0,
      alternatives: options.length > 0 ? options : undefined,
      agentDialogs: dialogs.length > 0 ? dialogs : undefined,
      predictions: predictions.length > 0 ? predictions : undefined,
    };
    this.messages.push(finalMessage);
    this.emit('message:added', finalMessage);

    // If there are options, set phase to coordinating (waiting for vote)
    if (options.length > 0) {
      this.setPhase('coordinating');
      this.updateParticipantStatus('system-agent', 'idle');
      logger.info('agent', `Decision point detected with ${options.length} options`);

      // Start speculative execution for high-probability options
      await this.startSpeculativeExecution(options, result.response);

      // Emit predictions for UI
      if (predictions.length > 0) {
        this.emit('predictions:updated', { predictions });
      }

      // Start voting timeout - auto-select first option if no response
      this.startVotingTimeout(options, finalMessage.id);

      return; // Don't mark as completed - waiting for user vote
    }

    // Show evolution info if available
    if (result.evolution) {
      const evo = result.evolution;
      if (evo.learnings.length > 0) {
        this.addSystemMessage(`**Evolution:**\n- Memory Updated: ${evo.memoryUpdated}\n- Learnings: ${evo.learnings.join(', ')}`);
      }
    }

    this.setPhase('completed');
    this.updateParticipantStatus('system-agent', 'done');
  }

  /**
   * Start a voting timeout - auto-selects first option if no user response
   */
  private startVotingTimeout(options: AgentProposal[], messageId: string): void {
    // Clear any existing timeout
    this.cancelVotingTimeout();

    // Emit countdown event for UI
    let remainingSeconds = VOTING_TIMEOUT_MS / 1000;
    const countdownInterval = setInterval(() => {
      remainingSeconds--;
      this.emit('voting:countdown', { seconds: remainingSeconds, messageId });
      if (remainingSeconds <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);

    this.votingTimeoutId = setTimeout(async () => {
      clearInterval(countdownInterval);

      // Check if still in coordinating phase (user hasn't voted yet)
      if (this.currentPhase === 'coordinating' && !this.isPaused) {
        // Auto-select the first option (or one marked as recommended)
        const recommendedOption = options[0];
        if (recommendedOption) {
          logger.info('agent', `Voting timeout - auto-selecting: ${recommendedOption.agentName}`);
          this.addSystemMessage(`⏱️ Voting timeout - automatically proceeding with ${recommendedOption.agentName}`);

          // Mark as selected
          recommendedOption.selected = true;
          recommendedOption.votes++;

          // Find and update the message
          const message = this.messages.find(m => m.id === messageId);
          if (message) {
            this.emit('message:updated', message);
          }

          // Continue with the auto-selected option
          await this.continueWithSelection(`Auto-selected ${recommendedOption.agentName}: ${recommendedOption.content}`);
        }
      }
    }, VOTING_TIMEOUT_MS);
  }

  /**
   * Cancel any active voting timeout
   */
  private cancelVotingTimeout(): void {
    if (this.votingTimeoutId) {
      clearTimeout(this.votingTimeoutId);
      this.votingTimeoutId = null;
    }
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
   * Parse sub-agent dialog patterns from response
   * Format: 🤖 [AgentName] → [TargetAgent/User]: "Message"
   */
  private parseAgentDialogs(response: string): AgentDialogEntry[] {
    const dialogs: AgentDialogEntry[] = [];

    // Pattern: 🤖 [AgentName] → [TargetAgent]: "Message" or without emoji
    const dialogPattern = /(?:🤖\s*)?\[?(\w+(?:Agent)?)\]?\s*(?:→|->)\s*\[?(\w+(?:Agent)?|User)\]?\s*:\s*["']?([\s\S]*?)["']?(?=\n(?:🤖|\[?\w+(?:Agent)?\]?\s*(?:→|->))|\n\n|$)/gi;

    let match;
    while ((match = dialogPattern.exec(response)) !== null) {
      dialogs.push({
        fromAgent: match[1],
        toAgent: match[2],
        message: match[3].trim(),
        timestamp: Date.now(),
      });
    }

    // Also detect simpler patterns like "AgentName says:" or "AgentName:"
    const simplePattern = /(?:^|\n)(\w+Agent)\s*(?:says|responds)?:\s*["']?([\s\S]*?)["']?(?=\n\w+Agent|\n\n|$)/gi;
    while ((match = simplePattern.exec(response)) !== null) {
      if (!dialogs.some(d => d.fromAgent === match[1] && d.message === match[2].trim())) {
        dialogs.push({
          fromAgent: match[1],
          toAgent: 'User',
          message: match[2].trim(),
          timestamp: Date.now(),
        });
      }
    }

    return dialogs;
  }

  /**
   * Start speculative execution for high-probability options
   */
  private async startSpeculativeExecution(options: AgentProposal[], context: string): Promise<void> {
    // Find options above threshold (70% confidence)
    const highProbOptions = options.filter(opt => opt.confidence >= 0.7);

    if (highProbOptions.length === 0) {
      return;
    }

    // Convert AgentProposal to ProposedSolution for speculative executor
    for (const option of highProbOptions.slice(0, 2)) { // Max 2 concurrent
      const solution: ProposedSolution = {
        id: option.id,
        proposerId: option.agentId,
        proposerName: option.agentName,
        proposerType: 'agent',
        content: option.content,
        confidence: option.confidence,
        reasoning: `Option with ${(option.confidence * 100).toFixed(0)}% confidence`,
        estimatedImpact: 'medium',
        votes: [],
        status: 'exploring',
        timestamp: Date.now(),
      };

      if (this.speculativeExecutor.shouldExecute(solution, option.confidence)) {
        logger.info('agent', `Starting speculative execution for ${option.agentName}`, {
          confidence: option.confidence,
        });

        const execution = await this.speculativeExecutor.execute(
          solution,
          context,
          option.confidence
        );

        // Emit event for UI to show speculative preview
        this.emit('speculation:started', {
          optionId: option.id,
          executionId: execution.id,
          confidence: option.confidence,
        });
      }
    }
  }

  /**
   * Generate flow predictions for next steps
   */
  private generatePredictions(currentPhase: string, options: AgentProposal[]): PredictedStep[] {
    const predictions: PredictedStep[] = [];

    // Based on current phase and options, predict likely next steps
    if (options.length > 0) {
      // Predict based on highest confidence option
      const topOption = options.reduce((best, curr) =>
        curr.confidence > best.confidence ? curr : best
      );

      predictions.push({
        id: `pred-${Date.now()}-1`,
        description: `User likely selects: ${topOption.agentName}`,
        probability: topOption.confidence,
        estimatedDuration: '5-10 seconds',
        dependencies: [],
        speculativelyComputed: this.speculativeExecutor.getExecutionBySolution(topOption.id) !== undefined,
        status: 'predicted',
      });

      predictions.push({
        id: `pred-${Date.now()}-2`,
        description: `Execute ${topOption.agentName} implementation`,
        probability: topOption.confidence * 0.9,
        estimatedDuration: '30-60 seconds',
        dependencies: [predictions[0].id],
        speculativelyComputed: false,
        status: 'predicted',
      });
    }

    // Add phase-specific predictions
    switch (currentPhase) {
      case 'planning':
        predictions.push({
          id: `pred-${Date.now()}-phase`,
          description: 'Move to agent composition phase',
          probability: 0.85,
          dependencies: [],
          speculativelyComputed: false,
          status: 'predicted',
        });
        break;
      case 'executing':
        predictions.push({
          id: `pred-${Date.now()}-phase`,
          description: 'Complete execution and review results',
          probability: 0.9,
          dependencies: [],
          speculativelyComputed: false,
          status: 'predicted',
        });
        break;
    }

    return predictions;
  }

  /**
   * Parse options/alternatives from System Agent response
   * Detects the 🗳️ DECISION POINT format and extracts options
   */
  private parseOptionsFromResponse(response: string): AgentProposal[] {
    const options: AgentProposal[] = [];

    // Check if this is a decision point
    if (!response.includes('DECISION POINT') && !response.includes('🗳️')) {
      // Also check for "Would you like me to:" pattern (simpler format)
      const simpleOptionsMatch = response.match(/Would you like me to:([\s\S]*?)(?:\n\n|$)/i);
      if (simpleOptionsMatch) {
        const optionsText = simpleOptionsMatch[1];
        // Parse numbered or bullet options
        const optionLines = optionsText.match(/(?:^|\n)\s*(?:\d+\.|[-•*])\s*(.+?)(?=\n\s*(?:\d+\.|[-•*])|\n\n|$)/g);

        if (optionLines) {
          optionLines.forEach((line, index) => {
            const cleanLine = line.replace(/^\s*(?:\d+\.|[-•*])\s*/, '').trim();
            if (cleanLine.length > 5) {
              const optionLabel = String.fromCharCode(65 + index); // A, B, C...
              options.push({
                id: `option-${optionLabel}-${Date.now()}`,
                agentId: 'system-agent',
                agentName: `Option ${optionLabel}`,
                content: cleanLine,
                confidence: 0.7 + Math.random() * 0.2,
                votes: 0,
              });
            }
          });
        }
      }
      return options;
    }

    // Parse structured OPTION blocks
    // Match patterns like "**OPTION A**: Title" or "│ **OPTION A**: Title"
    const optionPattern = /\*\*OPTION\s+([A-Z])\*\*:?\s*([^\n│]+)(?:[\s\S]*?(?:description|approach)[:\s]*([^│\n]+))?/gi;

    let match;
    while ((match = optionPattern.exec(response)) !== null) {
      const optionLetter = match[1];
      const title = match[2].trim();
      const description = match[3]?.trim() || '';

      // Try to extract confidence if present
      const confidenceMatch = response.substring(match.index, match.index + 500).match(/Confidence:\s*(\d+)%/i);
      const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.7 + Math.random() * 0.2;

      // Try to extract effort if present
      const effortMatch = response.substring(match.index, match.index + 500).match(/effort:\s*(low|medium|high)/i);
      const effort = effortMatch ? effortMatch[1] : '';

      options.push({
        id: `option-${optionLetter}-${Date.now()}`,
        agentId: 'system-agent',
        agentName: `Option ${optionLetter}`,
        content: `**${title}**${description ? `\n${description}` : ''}${effort ? `\n_Effort: ${effort}_` : ''}`,
        confidence,
        votes: 0,
      });
    }

    // Deduplicate options by letter
    const seen = new Set<string>();
    return options.filter(opt => {
      const letter = opt.agentName;
      if (seen.has(letter)) return false;
      seen.add(letter);
      return true;
    });
  }

  /**
   * Helper: Add system message
   */
  private addSystemMessage(content: string): void {
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
   * Vote for a proposal and optionally continue with selection
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

  /**
   * Continue execution with user's selected option
   * This is called when user selects an option from a decision point
   */
  async continueWithSelection(selection: string): Promise<void> {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Add user's selection as a message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: selection,
      timestamp,
      participantId: 'user',
    };
    this.messages.push(userMessage);
    this.emit('message:added', userMessage);

    // Update phase to executing
    this.setPhase('executing');
    this.updateParticipantStatus('system-agent', 'thinking');

    try {
      // Get the orchestrator and continue with the selection
      const orchestrator = await this.initializeOrchestrator();

      this.addSystemMessage(`Continuing with your selection: "${selection.substring(0, 50)}${selection.length > 50 ? '...' : ''}"`);

      // Execute with the user's selection as context
      const result = await orchestrator.execute(`Continue with the user's choice: ${selection}`);

      // Handle the result
      await this.handleExecutionResult(result, timestamp);

    } catch (error) {
      logger.error('agent', 'Failed to continue with selection', { error });
      this.addSystemMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.setPhase('completed');
      this.updateParticipantStatus('system-agent', 'idle');
    }
  }

  /**
   * Select a specific option by letter (A, B, C, etc.)
   */
  async selectOption(optionLetter: string): Promise<void> {
    // Cancel any active voting timeout since user is responding
    this.cancelVotingTimeout();

    // Find the most recent decision point message
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i];
      if (message.isDecisionPoint && message.alternatives) {
        // Find the matching option
        const option = message.alternatives.find(
          alt => alt.agentName.includes(optionLetter.toUpperCase())
        );

        if (option) {
          // Mark as selected
          option.selected = true;
          option.votes++;
          this.emit('vote:cast', { proposalId: option.id, voterId: 'user' });
          this.emit('message:updated', message);

          // Check if speculative execution was done for this option
          const speculativeExecution = this.speculativeExecutor.getExecutionBySolution(option.id);
          if (speculativeExecution && speculativeExecution.status === 'completed') {
            // Confirm speculative execution - we can use the pre-computed result!
            const result = this.speculativeExecutor.confirm(speculativeExecution.id);
            if (result) {
              logger.info('agent', `Using pre-computed result from speculative execution`, {
                executionId: speculativeExecution.id,
                tokensUsed: result.metrics.tokensUsed,
                timeSaved: speculativeExecution.endTime! - speculativeExecution.startTime,
              });

              this.emit('speculation:confirmed', {
                executionId: speculativeExecution.id,
                optionId: option.id,
                timeSaved: speculativeExecution.endTime! - speculativeExecution.startTime,
              });

              // Add message about time saved
              this.addSystemMessage(
                `⚡ Used pre-computed result (saved ~${Math.round((speculativeExecution.endTime! - speculativeExecution.startTime) / 1000)}s)`
              );
            }
          }

          // Cancel other speculative executions
          this.speculativeExecutor.cancelAll();

          // Continue with this option
          await this.continueWithSelection(`Option ${optionLetter}: ${option.content}`);
          return;
        }
      }
    }

    // No matching option found, treat as free-form response
    await this.continueWithSelection(optionLetter);
  }

  /**
   * Get agent dialogs for display
   */
  getAgentDialogs(): AgentDialogEntry[] {
    return [...this.agentDialogs];
  }

  /**
   * Get current predictions
   */
  getPredictions(): FlowPrediction[] {
    return [...this.predictions];
  }

  /**
   * Get speculative execution stats
   */
  getSpeculativeStats() {
    return this.speculativeExecutor.getStats();
  }

  /**
   * Get current phase
   */
  getCurrentPhase(): typeof this.currentPhase {
    return this.currentPhase;
  }

  /**
   * Reset the orchestrator for a new conversation
   */
  reset(): void {
    this.systemOrchestrator = null;
    this.participants.clear();
    this.messages = [];
    this.currentPhase = 'planning';
    this.pendingToolCalls.clear();
    this.initializeSystemAgent();
    this.emit('phase:changed', { phase: 'planning' });
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
  if (orchestratorInstance) {
    orchestratorInstance.reset();
  }
  orchestratorInstance = null;
}
