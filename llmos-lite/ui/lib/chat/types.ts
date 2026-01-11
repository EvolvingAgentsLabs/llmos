/**
 * Multi-Agent Chat Types
 *
 * Core types for the collaborative multi-agent chat system with voting
 */

// ============================================================================
// Participants
// ============================================================================

export type ParticipantType = 'user' | 'agent' | 'team-member';
export type ParticipantRole = 'proposer' | 'voter' | 'observer' | 'moderator';

export interface ChatParticipant {
  id: string;
  type: ParticipantType;
  name: string;
  avatar?: string;
  role: ParticipantRole;
  online: boolean;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Solutions & Proposals
// ============================================================================

export type ImpactLevel = 'low' | 'medium' | 'high';
export type ProposalStatus = 'pending' | 'voting' | 'selected' | 'rejected' | 'exploring';

export interface ProposedSolution {
  id: string;
  proposerId: string;
  proposerName: string;
  proposerType: ParticipantType;
  content: string;
  code?: string;
  codeLanguage?: string;
  confidence: number;  // 0-1
  reasoning: string;
  estimatedImpact: ImpactLevel;
  pros?: string[];
  cons?: string[];
  votes: Vote[];
  status: ProposalStatus;
  predictedOutcome?: PredictedOutcome;
  speculativeExecutionId?: string;
  timestamp: number;
}

export interface PredictedOutcome {
  successProbability: number;
  estimatedDuration?: string;
  potentialIssues: string[];
  nextSteps: string[];
}

// ============================================================================
// Voting
// ============================================================================

export type VoteType = 'up' | 'down' | 'neutral';
export type VotingStatus = 'pending' | 'active' | 'completed' | 'expired' | 'cancelled';

export interface Vote {
  id: string;
  participantId: string;
  participantName: string;
  participantType: ParticipantType;
  solutionId: string;
  voteType: VoteType;
  weight: number;
  reason?: string;
  timestamp: number;
}

export interface VotingRules {
  timeoutSeconds: number;
  minVotes: number;
  userVoteWeight: number;
  agentVoteWeight: number;
  autoDecideOnTimeout: boolean;
  requireUserVote: boolean;
  majorityThreshold: number;  // 0-1, percentage needed to win
}

export interface VotingSession {
  id: string;
  questionId: string;
  question: string;
  solutions: ProposedSolution[];
  participants: ChatParticipant[];
  rules: VotingRules;
  status: VotingStatus;
  startTime: number;
  endTime: number;
  winner?: string;
  winnerScore?: number;
  totalVotes: number;
}

// ============================================================================
// Decision Graph (Git-like branches)
// ============================================================================

export type DecisionNodeType = 'question' | 'option' | 'decision' | 'merge' | 'prediction' | 'speculative';
export type DecisionNodeStatus = 'pending' | 'active' | 'selected' | 'rejected' | 'exploring' | 'predicted' | 'merged';
export type EdgeType = 'branch' | 'merge' | 'speculative' | 'prediction';

export interface DecisionNode {
  id: string;
  type: DecisionNodeType;
  content: string;
  description?: string;
  parentId?: string;
  children: string[];
  status: DecisionNodeStatus;
  metadata: {
    votes?: number;
    confidence?: number;
    speculativeComputation?: SpeculativeResult;
    timeToDecision?: number;
    proposalId?: string;
    votingSessionId?: string;
  };
  position: { x: number; y: number; column: number };
  timestamp: number;
}

export interface DecisionEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  label?: string;
  color?: string;
}

export interface DecisionBranch {
  id: string;
  name: string;
  nodes: Map<string, DecisionNode>;
  edges: DecisionEdge[];
  currentHead: string;
  history: DecisionEvent[];
  rootId: string;
}

export interface DecisionEvent {
  id: string;
  type: 'branch_created' | 'option_added' | 'vote_cast' | 'decision_made' | 'branch_merged' | 'speculation_started' | 'speculation_confirmed';
  nodeId: string;
  timestamp: number;
  actor: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Flow Prediction
// ============================================================================

export interface FlowPrediction {
  id: string;
  nodeId: string;
  predictedPath: PredictedStep[];
  confidence: number;
  computationStarted: boolean;
  partialResult?: unknown;
  timestamp: number;
}

export interface PredictedStep {
  id: string;
  description: string;
  probability: number;
  estimatedDuration?: string;
  dependencies: string[];
  speculativelyComputed: boolean;
  status: 'predicted' | 'computing' | 'computed' | 'confirmed' | 'invalidated';
}

export interface TimelineView {
  past: CompletedDecision[];
  present: ActiveDecision | null;
  future: FlowPrediction[];
}

export interface CompletedDecision {
  id: string;
  question: string;
  selectedOption: string;
  alternatives: string[];
  timestamp: number;
  participants: string[];
  votingDuration?: number;
}

export interface ActiveDecision {
  id: string;
  question: string;
  options: ProposedSolution[];
  votingSession?: VotingSession;
  startTime: number;
  predictions: FlowPrediction[];
}

// ============================================================================
// Speculative Computation
// ============================================================================

export type SpeculativeStatus = 'queued' | 'computing' | 'completed' | 'cancelled' | 'failed';

export interface SpeculativeExecution {
  id: string;
  optionId: string;
  solutionId: string;
  probability: number;
  status: SpeculativeStatus;
  startTime: number;
  endTime?: number;
  result?: SpeculativeResult;
  tokensUsed: number;
  cancelled: boolean;
  checkpointState?: unknown;
}

export interface SpeculativeResult {
  success: boolean;
  partialOutput: string;
  filesGenerated: string[];
  codeGenerated?: string;
  canContinue: boolean;
  checkpointState: unknown;
  metrics: {
    tokensUsed: number;
    timeElapsed: number;
    completionPercentage: number;
  };
}

// ============================================================================
// Participation Bubbles
// ============================================================================

export type RelationshipType = 'collaborates' | 'reviews' | 'delegates' | 'supervises' | 'assists';

export interface ParticipationBubble {
  id: string;
  topicId: string;
  topic: string;
  description?: string;
  participants: BubbleParticipant[];
  relationships: ParticipantRelationship[];
  createdAt: number;
  lastActivity: number;
  messageCount: number;
  decisionCount: number;
}

export interface BubbleParticipant {
  id: string;
  participantId: string;
  type: ParticipantType;
  name: string;
  role: 'owner' | 'contributor' | 'observer';
  online: boolean;
  contributions: number;
  lastContribution: number;
  position?: { x: number; y: number };
}

export interface ParticipantRelationship {
  id: string;
  from: string;
  to: string;
  type: RelationshipType;
  strength: number;  // 0-1 based on interaction frequency
  bidirectional: boolean;
}

// ============================================================================
// Enhanced Message Types
// ============================================================================

export interface EnhancedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'agent';
  content: string;
  timestamp: number;

  // Participant info
  participantId: string;
  participantName: string;
  participantType: ParticipantType;

  // Proposal & Voting
  isProposal?: boolean;
  proposalId?: string;
  votingSessionId?: string;

  // Branch info
  branchId?: string;
  nodeId?: string;
  parentMessageId?: string;
  childMessageIds?: string[];

  // Prediction
  isPredicted?: boolean;
  predictionConfidence?: number;
  actualOutcome?: string;

  // Speculative
  isSpeculative?: boolean;
  speculativeExecutionId?: string;
  wasConfirmed?: boolean;

  // Metadata
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Chat Session State
// ============================================================================

export interface MultiAgentChatState {
  sessionId: string;
  participants: Map<string, ChatParticipant>;
  messages: EnhancedMessage[];
  activeSolutions: Map<string, ProposedSolution>;
  votingSessions: Map<string, VotingSession>;
  decisionGraph: DecisionBranch;
  predictions: FlowPrediction[];
  speculativeExecutions: Map<string, SpeculativeExecution>;
  bubbles: Map<string, ParticipationBubble>;
  timeline: TimelineView;
  viewMode: 'linear' | 'branches' | 'timeline' | 'bubbles';
  settings: ChatSettings;
}

export interface ChatSettings {
  enableVoting: boolean;
  enablePredictions: boolean;
  enableSpeculation: boolean;
  enableBubbles: boolean;
  defaultVotingRules: VotingRules;
  speculationThreshold: number;
  maxSpeculativeTokens: number;
  autoExpandBranches: boolean;
  showConfidenceScores: boolean;
}

// ============================================================================
// Events
// ============================================================================

export type ChatEventType =
  | 'message_sent'
  | 'proposal_created'
  | 'voting_started'
  | 'vote_cast'
  | 'voting_completed'
  | 'decision_made'
  | 'branch_created'
  | 'speculation_started'
  | 'speculation_completed'
  | 'prediction_updated'
  | 'participant_joined'
  | 'participant_left';

export interface ChatEvent {
  id: string;
  type: ChatEventType;
  timestamp: number;
  actor: string;
  data: Record<string, unknown>;
}

export interface ChatEventHandler {
  (event: ChatEvent): void | Promise<void>;
}
