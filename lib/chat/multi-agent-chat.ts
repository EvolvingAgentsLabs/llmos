/**
 * Multi-Agent Chat System
 *
 * Core orchestration for collaborative multi-agent chat with voting,
 * decision graphs, and speculative computation
 */

import {
  MultiAgentChatState,
  ChatSettings,
  EnhancedMessage,
  ProposedSolution,
  ChatParticipant,
  VotingSession,
  DecisionBranch,
  DecisionNode,
  DecisionEdge,
  FlowPrediction,
  SpeculativeExecution,
  TimelineView,
  ChatEvent,
  ChatEventHandler,
  VotingRules,
  ParticipationBubble,
} from './types';
import { VotingSessionManager, DEFAULT_VOTING_RULES } from './voting-session';
import { ParticipantManager } from './participant-manager';
import { SolutionProposer } from './solution-proposer';

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  enableVoting: true,
  enablePredictions: true,
  enableSpeculation: true,
  enableBubbles: true,
  defaultVotingRules: DEFAULT_VOTING_RULES,
  speculationThreshold: 0.7,
  maxSpeculativeTokens: 5000,
  autoExpandBranches: true,
  showConfidenceScores: true,
};

export class MultiAgentChat {
  private state: MultiAgentChatState;
  private votingManager: VotingSessionManager;
  private participantManager: ParticipantManager;
  private solutionProposer: SolutionProposer;
  private eventHandlers: Set<ChatEventHandler> = new Set();
  private speculativeWorkers: Map<string, AbortController> = new Map();

  constructor(
    sessionId: string = `session-${Date.now()}`,
    settings: Partial<ChatSettings> = {}
  ) {
    this.votingManager = new VotingSessionManager();
    this.participantManager = new ParticipantManager();
    this.solutionProposer = new SolutionProposer();

    // Initialize state
    const mergedSettings = { ...DEFAULT_CHAT_SETTINGS, ...settings };
    const rootNode = this.createRootNode();

    this.state = {
      sessionId,
      participants: new Map(),
      messages: [],
      activeSolutions: new Map(),
      votingSessions: new Map(),
      decisionGraph: {
        id: `branch-${Date.now()}`,
        name: 'main',
        nodes: new Map([[rootNode.id, rootNode]]),
        edges: [],
        currentHead: rootNode.id,
        history: [],
        rootId: rootNode.id,
      },
      predictions: [],
      speculativeExecutions: new Map(),
      bubbles: new Map(),
      timeline: {
        past: [],
        present: null,
        future: [],
      },
      viewMode: 'linear',
      settings: mergedSettings,
    };

    // Subscribe to voting events
    this.votingManager.onEvent((event) => this.handleVotingEvent(event));
    this.participantManager.onEvent((event) => this.emit(event));
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /**
   * Subscribe to chat events
   */
  onEvent(handler: ChatEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: ChatEvent): void {
    this.eventHandlers.forEach((handler) => handler(event));
  }

  private handleVotingEvent(event: ChatEvent): void {
    // Update state based on voting events
    if (event.type === 'voting_completed' && event.data.winnerId) {
      this.handleDecisionMade(
        event.data.sessionId as string,
        event.data.winnerId as string
      );
    }
    this.emit(event);
  }

  // ============================================================================
  // Participant Management
  // ============================================================================

  /**
   * Add a participant to the chat
   */
  addParticipant(participant: Omit<ChatParticipant, 'online'>): ChatParticipant {
    const added = this.participantManager.addParticipant(participant);
    this.state.participants.set(added.id, added);
    return added;
  }

  /**
   * Get all participants
   */
  getParticipants(): ChatParticipant[] {
    return Array.from(this.state.participants.values());
  }

  /**
   * Add an agent as a participant
   */
  addAgent(agentId: string, name: string, capabilities: string[] = []): ChatParticipant {
    const agent = this.participantManager.createAgentParticipant(
      agentId,
      name,
      capabilities,
      'proposer'
    );
    this.state.participants.set(agent.id, agent);
    return agent;
  }

  /**
   * Add a user as a participant
   */
  addUser(userId: string, name: string): ChatParticipant {
    const user = this.participantManager.createUserParticipant(userId, name, 'voter');
    this.state.participants.set(user.id, user);
    return user;
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  /**
   * Send a message
   */
  async sendMessage(
    participantId: string,
    content: string,
    options: {
      requestProposals?: boolean;
      context?: string;
    } = {}
  ): Promise<EnhancedMessage> {
    const participant = this.state.participants.get(participantId);
    if (!participant) {
      throw new Error(`Participant ${participantId} not found`);
    }

    // Create message
    const message: EnhancedMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: participant.type === 'user' ? 'user' : 'agent',
      content,
      timestamp: Date.now(),
      participantId,
      participantName: participant.name,
      participantType: participant.type,
      branchId: this.state.decisionGraph.id,
      nodeId: this.state.decisionGraph.currentHead,
    };

    this.state.messages.push(message);

    // Record contribution in bubble
    if (this.state.settings.enableBubbles) {
      const bubble = this.participantManager.findOrCreateBubble(content);
      this.participantManager.addToBubble(bubble.id, participantId);
      this.participantManager.recordContribution(bubble.id, participantId);
      this.state.bubbles.set(bubble.id, bubble);
    }

    this.emit({
      id: `evt-${Date.now()}`,
      type: 'message_sent',
      timestamp: Date.now(),
      actor: participantId,
      data: { messageId: message.id, content },
    });

    // Request proposals if enabled
    if (options.requestProposals && this.state.settings.enableVoting) {
      await this.requestProposals(content, options.context || '');
    }

    return message;
  }

  /**
   * Get all messages
   */
  getMessages(): EnhancedMessage[] {
    return [...this.state.messages];
  }

  // ============================================================================
  // Proposal & Voting
  // ============================================================================

  /**
   * Request solution proposals from agents
   */
  async requestProposals(
    question: string,
    context: string = ''
  ): Promise<ProposedSolution[]> {
    const agents = this.getParticipants().filter(
      (p) => p.type === 'agent' && p.role === 'proposer'
    );

    if (agents.length === 0) {
      console.warn('[MultiAgentChat] No proposer agents available');
      return [];
    }

    const proposals = await this.solutionProposer.generateProposals(
      question,
      context,
      agents,
      {
        maxProposals: 3,
        includeCode: true,
      }
    );

    // Store proposals
    proposals.forEach((p) => {
      this.state.activeSolutions.set(p.id, p);

      // Add proposal as message
      const message: EnhancedMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'agent',
        content: p.content,
        timestamp: Date.now(),
        participantId: p.proposerId,
        participantName: p.proposerName,
        participantType: p.proposerType,
        isProposal: true,
        proposalId: p.id,
        branchId: this.state.decisionGraph.id,
        nodeId: this.state.decisionGraph.currentHead,
      };
      this.state.messages.push(message);

      this.emit({
        id: `evt-${Date.now()}`,
        type: 'proposal_created',
        timestamp: Date.now(),
        actor: p.proposerId,
        data: { proposalId: p.id, confidence: p.confidence },
      });
    });

    // Start voting if we have multiple proposals
    if (proposals.length > 1 && this.state.settings.enableVoting) {
      await this.startVoting(question, proposals);
    }

    // Start speculative computation for high-confidence proposal
    if (this.state.settings.enableSpeculation && proposals.length > 0) {
      const topProposal = proposals[0];
      if (topProposal.confidence >= this.state.settings.speculationThreshold) {
        this.startSpeculativeExecution(topProposal, context);
      }
    }

    return proposals;
  }

  /**
   * Start a voting session
   */
  async startVoting(
    question: string,
    solutions: ProposedSolution[],
    rules?: Partial<VotingRules>
  ): Promise<VotingSession> {
    const participants = this.getParticipants();
    const questionId = `q-${Date.now()}`;

    const session = this.votingManager.createSession(
      questionId,
      question,
      solutions,
      participants,
      rules || this.state.settings.defaultVotingRules
    );

    this.state.votingSessions.set(session.id, session);

    // Create decision branch node for this vote
    this.addDecisionNode({
      id: `node-${Date.now()}`,
      type: 'question',
      content: question,
      parentId: this.state.decisionGraph.currentHead,
      children: solutions.map((s) => s.id),
      status: 'active',
      metadata: { votingSessionId: session.id },
      position: { x: 0, y: 0, column: 0 },
      timestamp: Date.now(),
    });

    // Add option nodes for each solution
    solutions.forEach((solution, index) => {
      this.addDecisionNode({
        id: solution.id,
        type: 'option',
        content: solution.content.slice(0, 100),
        parentId: `node-${Date.now() - 1}`,
        children: [],
        status: 'pending',
        metadata: {
          proposalId: solution.id,
          confidence: solution.confidence,
        },
        position: { x: index * 100, y: 50, column: index },
        timestamp: Date.now(),
      });
    });

    // Update timeline
    this.state.timeline.present = {
      id: session.id,
      question,
      options: solutions,
      votingSession: session,
      startTime: Date.now(),
      predictions: await this.generatePredictions(solutions),
    };

    return session;
  }

  /**
   * Cast a vote
   */
  castVote(
    sessionId: string,
    participantId: string,
    solutionId: string,
    voteType: 'up' | 'down' = 'up',
    reason?: string
  ): boolean {
    const participant = this.state.participants.get(participantId);
    if (!participant) return false;

    const vote = this.votingManager.castVote(
      sessionId,
      participantId,
      participant.name,
      participant.type,
      solutionId,
      voteType,
      reason
    );

    return vote !== null;
  }

  /**
   * Get active voting session
   */
  getActiveVotingSession(): VotingSession | null {
    const sessions = this.votingManager.getActiveSessions();
    return sessions.length > 0 ? sessions[0] : null;
  }

  /**
   * Get vote counts for a session
   */
  getVoteCounts(sessionId: string): Map<string, number> {
    return this.votingManager.getVoteCounts(sessionId);
  }

  /**
   * Get winning probabilities
   */
  getWinningProbabilities(sessionId: string): Map<string, number> {
    return this.votingManager.getWinningProbabilities(sessionId);
  }

  /**
   * Get time remaining in voting
   */
  getVotingTimeRemaining(sessionId: string): number {
    return this.votingManager.getTimeRemaining(sessionId);
  }

  /**
   * Handle when a decision is made
   */
  private handleDecisionMade(sessionId: string, winnerId: string): void {
    const session = this.state.votingSessions.get(sessionId);
    if (!session) return;

    // Update solution statuses
    session.solutions.forEach((s) => {
      const solution = this.state.activeSolutions.get(s.id);
      if (solution) {
        solution.status = s.id === winnerId ? 'selected' : 'rejected';
      }
    });

    // Update decision graph
    const questionNode = Array.from(this.state.decisionGraph.nodes.values()).find(
      (n) => n.metadata.votingSessionId === sessionId
    );

    if (questionNode) {
      // Update option nodes
      questionNode.children.forEach((childId) => {
        const childNode = this.state.decisionGraph.nodes.get(childId);
        if (childNode) {
          childNode.status = childId === winnerId ? 'selected' : 'rejected';
        }
      });

      // Create merge node
      const mergeNode: DecisionNode = {
        id: `merge-${Date.now()}`,
        type: 'merge',
        content: `Selected: ${winnerId}`,
        parentId: winnerId,
        children: [],
        status: 'merged',
        metadata: { selectedId: winnerId },
        position: { x: 0, y: 100, column: 0 },
        timestamp: Date.now(),
      };

      this.addDecisionNode(mergeNode);
      this.state.decisionGraph.currentHead = mergeNode.id;
    }

    // Update timeline
    if (this.state.timeline.present) {
      const completed = {
        id: this.state.timeline.present.id,
        question: this.state.timeline.present.question,
        selectedOption: winnerId,
        alternatives: session.solutions
          .filter((s) => s.id !== winnerId)
          .map((s) => s.id),
        timestamp: Date.now(),
        participants: session.participants.map((p) => p.id),
        votingDuration: Date.now() - session.startTime,
      };
      this.state.timeline.past.push(completed);
      this.state.timeline.present = null;
    }

    // Confirm or cancel speculative execution
    this.speculativeExecutions.forEach((exec, id) => {
      if (exec.solutionId === winnerId) {
        this.confirmSpeculativeExecution(id);
      } else {
        this.cancelSpeculativeExecution(id);
      }
    });

    this.emit({
      id: `evt-${Date.now()}`,
      type: 'decision_made',
      timestamp: Date.now(),
      actor: 'system',
      data: { sessionId, winnerId },
    });
  }

  // ============================================================================
  // Decision Graph
  // ============================================================================

  private createRootNode(): DecisionNode {
    return {
      id: `root-${Date.now()}`,
      type: 'decision',
      content: 'Conversation Start',
      children: [],
      status: 'selected',
      metadata: {},
      position: { x: 0, y: 0, column: 0 },
      timestamp: Date.now(),
    };
  }

  /**
   * Add a node to the decision graph
   */
  private addDecisionNode(node: DecisionNode): void {
    this.state.decisionGraph.nodes.set(node.id, node);

    // Add edge from parent
    if (node.parentId) {
      const edge: DecisionEdge = {
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        from: node.parentId,
        to: node.id,
        type: node.type === 'prediction' ? 'prediction' : 'branch',
      };
      this.state.decisionGraph.edges.push(edge);

      // Update parent's children
      const parent = this.state.decisionGraph.nodes.get(node.parentId);
      if (parent && !parent.children.includes(node.id)) {
        parent.children.push(node.id);
      }
    }

    this.state.decisionGraph.history.push({
      id: `evt-${Date.now()}`,
      type: 'option_added',
      nodeId: node.id,
      timestamp: Date.now(),
      actor: 'system',
    });
  }

  /**
   * Get the decision graph
   */
  getDecisionGraph(): DecisionBranch {
    return this.state.decisionGraph;
  }

  /**
   * Get nodes as array
   */
  getDecisionNodes(): DecisionNode[] {
    return Array.from(this.state.decisionGraph.nodes.values());
  }

  // ============================================================================
  // Predictions
  // ============================================================================

  /**
   * Generate predictions for solutions
   */
  private async generatePredictions(
    solutions: ProposedSolution[]
  ): Promise<FlowPrediction[]> {
    if (!this.state.settings.enablePredictions) return [];

    const predictions: FlowPrediction[] = [];

    for (const solution of solutions) {
      const outcome = await this.solutionProposer.predictOutcome(solution, '');

      predictions.push({
        id: `pred-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        nodeId: solution.id,
        predictedPath: outcome.nextSteps.map((step, i) => ({
          id: `step-${i}`,
          description: step,
          probability: outcome.successProbability * (1 - i * 0.1),
          dependencies: i > 0 ? [`step-${i - 1}`] : [],
          speculativelyComputed: false,
          status: 'predicted',
        })),
        confidence: outcome.successProbability,
        computationStarted: false,
        timestamp: Date.now(),
      });
    }

    this.state.predictions = predictions;
    this.state.timeline.future = predictions;

    return predictions;
  }

  /**
   * Get current predictions
   */
  getPredictions(): FlowPrediction[] {
    return [...this.state.predictions];
  }

  // ============================================================================
  // Speculative Execution
  // ============================================================================

  private get speculativeExecutions(): Map<string, SpeculativeExecution> {
    return this.state.speculativeExecutions;
  }

  /**
   * Start speculative execution for a proposal
   */
  private async startSpeculativeExecution(
    proposal: ProposedSolution,
    context: string
  ): Promise<void> {
    const executionId = `spec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const abortController = new AbortController();

    const execution: SpeculativeExecution = {
      id: executionId,
      optionId: proposal.id,
      solutionId: proposal.id,
      probability: proposal.confidence,
      status: 'computing',
      startTime: Date.now(),
      tokensUsed: 0,
      cancelled: false,
    };

    this.speculativeExecutions.set(executionId, execution);
    this.speculativeWorkers.set(executionId, abortController);

    this.emit({
      id: `evt-${Date.now()}`,
      type: 'speculation_started',
      timestamp: Date.now(),
      actor: 'system',
      data: { executionId, proposalId: proposal.id },
    });

    // Simulated speculative computation
    // In a real implementation, this would run the proposal in a sandbox
    try {
      await this.runSpeculativeComputation(execution, proposal, context, abortController.signal);
    } catch (error) {
      if (!abortController.signal.aborted) {
        console.error('[MultiAgentChat] Speculative execution failed:', error);
        execution.status = 'failed';
      }
    }
  }

  /**
   * Run speculative computation (simulated)
   */
  private async runSpeculativeComputation(
    execution: SpeculativeExecution,
    proposal: ProposedSolution,
    context: string,
    signal: AbortSignal
  ): Promise<void> {
    // Simulate computation with periodic checks
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      if (signal.aborted) {
        execution.cancelled = true;
        execution.status = 'cancelled';
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      execution.tokensUsed += Math.floor(
        this.state.settings.maxSpeculativeTokens / steps
      );
    }

    // Complete speculation
    execution.status = 'completed';
    execution.endTime = Date.now();
    execution.result = {
      success: true,
      partialOutput: `Speculative result for: ${proposal.content.slice(0, 50)}...`,
      filesGenerated: [],
      canContinue: true,
      checkpointState: { step: steps },
      metrics: {
        tokensUsed: execution.tokensUsed,
        timeElapsed: execution.endTime - execution.startTime,
        completionPercentage: 100,
      },
    };

    this.emit({
      id: `evt-${Date.now()}`,
      type: 'speculation_completed',
      timestamp: Date.now(),
      actor: 'system',
      data: { executionId: execution.id, success: true },
    });
  }

  /**
   * Confirm speculative execution (decision matches speculation)
   */
  private confirmSpeculativeExecution(executionId: string): void {
    const execution = this.speculativeExecutions.get(executionId);
    if (!execution) return;

    console.log('[MultiAgentChat] Speculative execution confirmed:', executionId);

    // The result can now be used directly
    // This saves time as computation was already done
  }

  /**
   * Cancel speculative execution
   */
  private cancelSpeculativeExecution(executionId: string): void {
    const controller = this.speculativeWorkers.get(executionId);
    if (controller) {
      controller.abort();
      this.speculativeWorkers.delete(executionId);
    }

    const execution = this.speculativeExecutions.get(executionId);
    if (execution) {
      execution.cancelled = true;
      execution.status = 'cancelled';
    }
  }

  /**
   * Get speculative execution by ID
   */
  getSpeculativeExecution(executionId: string): SpeculativeExecution | undefined {
    return this.speculativeExecutions.get(executionId);
  }

  // ============================================================================
  // View Modes & State
  // ============================================================================

  /**
   * Set view mode
   */
  setViewMode(mode: 'linear' | 'branches' | 'timeline' | 'bubbles'): void {
    this.state.viewMode = mode;
  }

  /**
   * Get current view mode
   */
  getViewMode(): 'linear' | 'branches' | 'timeline' | 'bubbles' {
    return this.state.viewMode;
  }

  /**
   * Get timeline view
   */
  getTimeline(): TimelineView {
    return { ...this.state.timeline };
  }

  /**
   * Get participation bubbles
   */
  getBubbles(): ParticipationBubble[] {
    return Array.from(this.state.bubbles.values());
  }

  /**
   * Get full state
   */
  getState(): MultiAgentChatState {
    return { ...this.state };
  }

  /**
   * Get settings
   */
  getSettings(): ChatSettings {
    return { ...this.state.settings };
  }

  /**
   * Update settings
   */
  updateSettings(updates: Partial<ChatSettings>): void {
    Object.assign(this.state.settings, updates);
  }

  /**
   * Clear chat state
   */
  clear(): void {
    this.state.messages = [];
    this.state.activeSolutions.clear();
    this.state.votingSessions.clear();
    this.state.predictions = [];
    this.speculativeExecutions.clear();
    this.state.bubbles.clear();
    this.state.timeline = { past: [], present: null, future: [] };

    // Reset decision graph
    const rootNode = this.createRootNode();
    this.state.decisionGraph = {
      id: `branch-${Date.now()}`,
      name: 'main',
      nodes: new Map([[rootNode.id, rootNode]]),
      edges: [],
      currentHead: rootNode.id,
      history: [],
      rootId: rootNode.id,
    };
  }
}

// Export singleton factory
let instance: MultiAgentChat | null = null;

export function getMultiAgentChat(
  sessionId?: string,
  settings?: Partial<ChatSettings>
): MultiAgentChat {
  if (!instance || sessionId) {
    instance = new MultiAgentChat(sessionId, settings);
  }
  return instance;
}

export function resetMultiAgentChat(): void {
  instance = null;
}
