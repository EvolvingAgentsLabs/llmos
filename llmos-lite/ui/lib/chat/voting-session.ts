/**
 * Voting Session Manager
 *
 * Manages voting sessions for multi-agent decision making
 */

import {
  VotingSession,
  VotingRules,
  VotingStatus,
  Vote,
  VoteType,
  ProposedSolution,
  ChatParticipant,
  ChatEvent,
  ChatEventHandler,
} from './types';

export const DEFAULT_VOTING_RULES: VotingRules = {
  timeoutSeconds: 60,
  minVotes: 1,
  userVoteWeight: 2,
  agentVoteWeight: 1,
  autoDecideOnTimeout: true,
  requireUserVote: false,
  majorityThreshold: 0.5,
};

export class VotingSessionManager {
  private sessions: Map<string, VotingSession> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private eventHandlers: Set<ChatEventHandler> = new Set();

  constructor(private defaultRules: VotingRules = DEFAULT_VOTING_RULES) {}

  /**
   * Subscribe to voting events
   */
  onEvent(handler: ChatEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: ChatEvent): void {
    this.eventHandlers.forEach((handler) => handler(event));
  }

  /**
   * Create a new voting session
   */
  createSession(
    questionId: string,
    question: string,
    solutions: ProposedSolution[],
    participants: ChatParticipant[],
    rules: Partial<VotingRules> = {}
  ): VotingSession {
    const sessionId = `vote-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const mergedRules = { ...this.defaultRules, ...rules };
    const now = Date.now();

    const session: VotingSession = {
      id: sessionId,
      questionId,
      question,
      solutions: solutions.map((s) => ({ ...s, votes: [], status: 'voting' })),
      participants,
      rules: mergedRules,
      status: 'active',
      startTime: now,
      endTime: now + mergedRules.timeoutSeconds * 1000,
      totalVotes: 0,
    };

    this.sessions.set(sessionId, session);

    // Set timeout for auto-decision
    if (mergedRules.autoDecideOnTimeout) {
      const timer = setTimeout(() => {
        this.expireSession(sessionId);
      }, mergedRules.timeoutSeconds * 1000);
      this.timers.set(sessionId, timer);
    }

    this.emit({
      id: `evt-${Date.now()}`,
      type: 'voting_started',
      timestamp: now,
      actor: 'system',
      data: { sessionId, question, solutionCount: solutions.length },
    });

    return session;
  }

  /**
   * Cast a vote in a session
   */
  castVote(
    sessionId: string,
    participantId: string,
    participantName: string,
    participantType: 'user' | 'agent' | 'team-member',
    solutionId: string,
    voteType: VoteType = 'up',
    reason?: string
  ): Vote | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      console.warn(`[VotingSession] Cannot vote: session ${sessionId} not active`);
      return null;
    }

    const solution = session.solutions.find((s) => s.id === solutionId);
    if (!solution) {
      console.warn(`[VotingSession] Solution ${solutionId} not found in session`);
      return null;
    }

    // Check if participant already voted for this solution
    const existingVote = solution.votes.find((v) => v.participantId === participantId);
    if (existingVote) {
      console.warn(`[VotingSession] Participant ${participantId} already voted for ${solutionId}`);
      return null;
    }

    // Determine vote weight
    const weight =
      participantType === 'user'
        ? session.rules.userVoteWeight
        : session.rules.agentVoteWeight;

    const vote: Vote = {
      id: `vote-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      participantId,
      participantName,
      participantType,
      solutionId,
      voteType,
      weight,
      reason,
      timestamp: Date.now(),
    };

    solution.votes.push(vote);
    session.totalVotes++;

    this.emit({
      id: `evt-${Date.now()}`,
      type: 'vote_cast',
      timestamp: Date.now(),
      actor: participantId,
      data: { sessionId, solutionId, voteType, weight },
    });

    // Check if voting should complete
    this.checkForCompletion(sessionId);

    return vote;
  }

  /**
   * Get current vote counts for a session
   */
  getVoteCounts(sessionId: string): Map<string, number> {
    const session = this.sessions.get(sessionId);
    if (!session) return new Map();

    const counts = new Map<string, number>();
    session.solutions.forEach((solution) => {
      const score = solution.votes.reduce((total, vote) => {
        if (vote.voteType === 'up') return total + vote.weight;
        if (vote.voteType === 'down') return total - vote.weight;
        return total;
      }, 0);
      counts.set(solution.id, score);
    });

    return counts;
  }

  /**
   * Get winning probability for each solution
   */
  getWinningProbabilities(sessionId: string): Map<string, number> {
    const counts = this.getVoteCounts(sessionId);
    const total = Array.from(counts.values()).reduce((a, b) => a + Math.max(0, b), 0);

    const probabilities = new Map<string, number>();
    counts.forEach((count, solutionId) => {
      probabilities.set(solutionId, total > 0 ? Math.max(0, count) / total : 1 / counts.size);
    });

    return probabilities;
  }

  /**
   * Get time remaining in seconds
   */
  getTimeRemaining(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') return 0;
    return Math.max(0, Math.floor((session.endTime - Date.now()) / 1000));
  }

  /**
   * Check if voting should complete
   */
  private checkForCompletion(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') return;

    const counts = this.getVoteCounts(sessionId);
    const totalVoters = session.participants.filter((p) => p.role !== 'observer').length;

    // Check if we have enough votes
    if (session.totalVotes < session.rules.minVotes) return;

    // Check if user vote is required and present
    if (session.rules.requireUserVote) {
      const hasUserVote = session.solutions.some((s) =>
        s.votes.some((v) => v.participantType === 'user')
      );
      if (!hasUserVote) return;
    }

    // Check if we have a clear winner (majority threshold)
    const totalScore = Array.from(counts.values()).reduce((a, b) => a + Math.max(0, b), 0);
    let winner: string | null = null;
    let winnerScore = 0;

    counts.forEach((score, solutionId) => {
      if (score > winnerScore) {
        winner = solutionId;
        winnerScore = score;
      }
    });

    if (winner && totalScore > 0) {
      const winnerPercentage = winnerScore / totalScore;
      if (winnerPercentage >= session.rules.majorityThreshold) {
        this.completeSession(sessionId, winner, winnerScore);
      }
    }
  }

  /**
   * Complete a voting session with a winner
   */
  private completeSession(sessionId: string, winnerId: string, winnerScore: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clear timeout
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }

    // Update session
    session.status = 'completed';
    session.winner = winnerId;
    session.winnerScore = winnerScore;

    // Update solution statuses
    session.solutions.forEach((solution) => {
      solution.status = solution.id === winnerId ? 'selected' : 'rejected';
    });

    this.emit({
      id: `evt-${Date.now()}`,
      type: 'voting_completed',
      timestamp: Date.now(),
      actor: 'system',
      data: { sessionId, winnerId, winnerScore },
    });

    this.emit({
      id: `evt-${Date.now()}`,
      type: 'decision_made',
      timestamp: Date.now(),
      actor: 'system',
      data: { sessionId, selectedSolutionId: winnerId },
    });
  }

  /**
   * Expire a session (timeout)
   */
  private expireSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') return;

    // Auto-decide based on current votes
    const counts = this.getVoteCounts(sessionId);
    let winner: string | null = null;
    let winnerScore = -Infinity;

    counts.forEach((score, solutionId) => {
      if (score > winnerScore) {
        winner = solutionId;
        winnerScore = score;
      }
    });

    if (winner && session.rules.autoDecideOnTimeout) {
      this.completeSession(sessionId, winner, winnerScore);
    } else {
      session.status = 'expired';
      this.emit({
        id: `evt-${Date.now()}`,
        type: 'voting_completed',
        timestamp: Date.now(),
        actor: 'system',
        data: { sessionId, expired: true },
      });
    }
  }

  /**
   * Cancel a voting session
   */
  cancelSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }

    session.status = 'cancelled';
    session.solutions.forEach((s) => (s.status = 'rejected'));
  }

  /**
   * Extend voting time
   */
  extendTime(sessionId: string, additionalSeconds: number): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') return;

    // Clear existing timer
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
    }

    // Extend end time
    session.endTime += additionalSeconds * 1000;

    // Set new timer
    const newTimer = setTimeout(() => {
      this.expireSession(sessionId);
    }, session.endTime - Date.now());
    this.timers.set(sessionId, newTimer);
  }

  /**
   * Force complete with a specific winner
   */
  forceComplete(sessionId: string, winnerId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const counts = this.getVoteCounts(sessionId);
    const score = counts.get(winnerId) || 0;
    this.completeSession(sessionId, winnerId, score);
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): VotingSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): VotingSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === 'active');
  }

  /**
   * Clean up old sessions
   */
  cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    this.sessions.forEach((session, id) => {
      if (now - session.startTime > maxAgeMs) {
        this.sessions.delete(id);
        const timer = this.timers.get(id);
        if (timer) {
          clearTimeout(timer);
          this.timers.delete(id);
        }
      }
    });
  }

  /**
   * Wait for a session to complete
   */
  async waitForCompletion(sessionId: string, pollIntervalMs: number = 100): Promise<VotingSession | null> {
    return new Promise((resolve) => {
      const check = () => {
        const session = this.sessions.get(sessionId);
        if (!session) {
          resolve(null);
          return;
        }
        if (session.status !== 'active') {
          resolve(session);
          return;
        }
        setTimeout(check, pollIntervalMs);
      };
      check();
    });
  }
}
