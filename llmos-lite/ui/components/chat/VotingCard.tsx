'use client';

import { useState, useEffect } from 'react';
import { VotingSession, ProposedSolution, VoteType } from '@/lib/chat/types';

interface VotingCardProps {
  session: VotingSession;
  currentUserId: string;
  onVote: (solutionId: string, voteType: VoteType) => void;
  onExtendTime?: (seconds: number) => void;
  onAutoDecide?: () => void;
  voteCounts: Map<string, number>;
  winningProbabilities: Map<string, number>;
  compact?: boolean;
}

export default function VotingCard({
  session,
  currentUserId,
  onVote,
  onExtendTime,
  onAutoDecide,
  voteCounts,
  winningProbabilities,
  compact = false,
}: VotingCardProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(
    Math.max(0, Math.floor((session.endTime - Date.now()) / 1000))
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Update timer
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((session.endTime - Date.now()) / 1000));
      setTimeRemaining(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [session.endTime]);

  // Check if user has voted
  const hasVoted = session.solutions.some((s) =>
    s.votes.some((v) => v.participantId === currentUserId)
  );

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = (solutionId: string): number => {
    const total = Array.from(voteCounts.values()).reduce((a, b) => a + Math.max(0, b), 0);
    if (total === 0) return 0;
    return Math.max(0, (voteCounts.get(solutionId) || 0) / total) * 100;
  };

  const handleVote = (solutionId: string) => {
    if (hasVoted || session.status !== 'active') return;
    setSelectedId(solutionId);
    onVote(solutionId, 'up');
  };

  const isCompleted = session.status !== 'active';
  const isExpired = session.status === 'expired';
  const isUrgent = timeRemaining <= 10 && !isCompleted;

  if (compact) {
    return (
      <div className="glass-panel p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-fg-secondary">Voting</span>
          <span className={`text-xs font-mono ${isUrgent ? 'text-accent-error animate-pulse' : 'text-fg-muted'}`}>
            {isCompleted ? (isExpired ? 'Expired' : 'Completed') : formatTime(timeRemaining)}
          </span>
        </div>
        <div className="space-y-1">
          {session.solutions.map((solution) => (
            <button
              key={solution.id}
              onClick={() => handleVote(solution.id)}
              disabled={hasVoted || isCompleted}
              className={`w-full flex items-center gap-2 p-2 rounded text-xs transition-all ${
                session.winner === solution.id
                  ? 'bg-accent-success/20 border border-accent-success/50'
                  : solution.status === 'rejected'
                  ? 'bg-bg-tertiary/50 opacity-50'
                  : selectedId === solution.id
                  ? 'bg-accent-primary/20 border border-accent-primary/50'
                  : 'bg-bg-tertiary hover:bg-bg-elevated border border-transparent'
              }`}
            >
              <div className="flex-1 text-left truncate text-fg-primary">
                {solution.proposerName}
              </div>
              <div className="flex items-center gap-1">
                <div className="w-12 h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      session.winner === solution.id ? 'bg-accent-success' : 'bg-accent-primary'
                    }`}
                    style={{ width: `${getProgressPercentage(solution.id)}%` }}
                  />
                </div>
                <span className="text-[10px] text-fg-muted w-8 text-right">
                  {Math.round(getProgressPercentage(solution.id))}%
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-4 space-y-4 border-2 border-accent-primary/30">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-accent-primary/20 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-fg-primary">
            {isCompleted ? 'Voting Complete' : 'Active Vote'}
          </span>
        </div>
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full ${
          isCompleted
            ? 'bg-accent-success/20'
            : isUrgent
            ? 'bg-accent-error/20 animate-pulse'
            : 'bg-bg-tertiary'
        }`}>
          <svg className="w-3.5 h-3.5 text-fg-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className={`text-xs font-mono ${isUrgent ? 'text-accent-error' : 'text-fg-secondary'}`}>
            {isCompleted ? (isExpired ? 'Expired' : 'Done') : formatTime(timeRemaining)}
          </span>
        </div>
      </div>

      {/* Question */}
      <div className="p-3 bg-bg-tertiary/50 rounded-lg">
        <p className="text-sm text-fg-secondary">{session.question}</p>
      </div>

      {/* Solutions */}
      <div className="space-y-3">
        {session.solutions.map((solution, index) => (
          <SolutionVoteOption
            key={solution.id}
            solution={solution}
            index={index}
            isWinner={session.winner === solution.id}
            isSelected={selectedId === solution.id}
            hasVoted={hasVoted}
            isCompleted={isCompleted}
            voteCount={voteCounts.get(solution.id) || 0}
            probability={winningProbabilities.get(solution.id) || 0}
            progressPercentage={getProgressPercentage(solution.id)}
            onVote={() => handleVote(solution.id)}
          />
        ))}
      </div>

      {/* Actions */}
      {!isCompleted && (
        <div className="flex items-center gap-2 pt-2 border-t border-border-primary/50">
          {onAutoDecide && (
            <button
              onClick={onAutoDecide}
              className="flex-1 px-3 py-2 text-xs font-medium text-fg-secondary bg-bg-tertiary hover:bg-bg-elevated rounded-lg transition-colors"
            >
              Auto-decide
            </button>
          )}
          {onExtendTime && (
            <button
              onClick={() => onExtendTime(30)}
              className="flex-1 px-3 py-2 text-xs font-medium text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 rounded-lg transition-colors"
            >
              +30s
            </button>
          )}
        </div>
      )}

      {/* Status message */}
      {hasVoted && !isCompleted && (
        <div className="text-center text-xs text-fg-muted">
          Vote recorded. Waiting for others...
        </div>
      )}

      {session.winner && (
        <div className="text-center text-xs text-accent-success font-medium">
          Winner: {session.solutions.find(s => s.id === session.winner)?.proposerName}
        </div>
      )}
    </div>
  );
}

interface SolutionVoteOptionProps {
  solution: ProposedSolution;
  index: number;
  isWinner: boolean;
  isSelected: boolean;
  hasVoted: boolean;
  isCompleted: boolean;
  voteCount: number;
  probability: number;
  progressPercentage: number;
  onVote: () => void;
}

function SolutionVoteOption({
  solution,
  index,
  isWinner,
  isSelected,
  hasVoted,
  isCompleted,
  voteCount,
  probability,
  progressPercentage,
  onVote,
}: SolutionVoteOptionProps) {
  const canVote = !hasVoted && !isCompleted;

  return (
    <div
      className={`relative p-3 rounded-lg border-2 transition-all ${
        isWinner
          ? 'bg-accent-success/10 border-accent-success/50'
          : solution.status === 'rejected'
          ? 'bg-bg-tertiary/30 border-border-primary/30 opacity-60'
          : isSelected
          ? 'bg-accent-primary/10 border-accent-primary/50'
          : 'bg-bg-tertiary border-border-primary/50 hover:border-accent-primary/30'
      } ${canVote ? 'cursor-pointer' : ''}`}
      onClick={canVote ? onVote : undefined}
    >
      {/* Option header */}
      <div className="flex items-start gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
          isWinner
            ? 'bg-accent-success text-white'
            : isSelected
            ? 'bg-accent-primary text-white'
            : 'bg-bg-secondary text-fg-secondary'
        }`}>
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-fg-primary truncate">
              {solution.proposerName}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-fg-muted">
              {(solution.confidence * 100).toFixed(0)}% confidence
            </span>
          </div>
          <p className="mt-1 text-xs text-fg-secondary line-clamp-2">
            {solution.content}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-fg-muted">{voteCount} votes</span>
          <span className={`font-medium ${
            probability > 0.5 ? 'text-accent-success' : 'text-fg-muted'
          }`}>
            {(probability * 100).toFixed(0)}% winning
          </span>
        </div>
        <div className="h-1.5 bg-bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isWinner ? 'bg-accent-success' : 'bg-accent-primary'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Winner badge */}
      {isWinner && (
        <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-accent-success text-white text-[10px] font-bold rounded-full shadow-lg">
          WINNER
        </div>
      )}

      {/* Prediction indicator */}
      {probability > 0.6 && !isCompleted && !isWinner && (
        <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-accent-warning/90 text-white text-[10px] font-medium rounded-full">
          Likely
        </div>
      )}
    </div>
  );
}
