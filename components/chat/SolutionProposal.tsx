'use client';

import { ProposedSolution } from '@/lib/chat/types';

interface SolutionProposalProps {
  proposal: ProposedSolution;
  onVote?: (voteType: 'up' | 'down') => void;
  showVoteButtons?: boolean;
  hasVoted?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  isWinner?: boolean;
}

export default function SolutionProposal({
  proposal,
  onVote,
  showVoteButtons = true,
  hasVoted = false,
  expanded = false,
  onToggleExpand,
  isWinner = false,
}: SolutionProposalProps) {
  const voteScore = proposal.votes.reduce((total, vote) => {
    if (vote.voteType === 'up') return total + vote.weight;
    if (vote.voteType === 'down') return total - vote.weight;
    return total;
  }, 0);

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high':
        return 'text-accent-error bg-accent-error/10';
      case 'medium':
        return 'text-accent-warning bg-accent-warning/10';
      case 'low':
        return 'text-accent-success bg-accent-success/10';
      default:
        return 'text-fg-muted bg-bg-tertiary';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'selected':
        return 'border-accent-success bg-accent-success/5';
      case 'rejected':
        return 'border-border-primary/30 bg-bg-tertiary/30 opacity-60';
      case 'voting':
        return 'border-accent-primary bg-accent-primary/5';
      case 'exploring':
        return 'border-accent-warning bg-accent-warning/5';
      default:
        return 'border-border-primary bg-bg-secondary';
    }
  };

  return (
    <div
      className={`rounded-lg border-2 transition-all ${getStatusColor(proposal.status)} ${
        isWinner ? 'ring-2 ring-accent-success ring-offset-2 ring-offset-bg-primary' : ''
      }`}
    >
      {/* Header */}
      <div className="p-3 border-b border-border-primary/30">
        <div className="flex items-start gap-3">
          {/* Vote section */}
          {showVoteButtons && (
            <div className="flex flex-col items-center gap-1 min-w-[40px]">
              <button
                onClick={() => onVote?.('up')}
                disabled={hasVoted}
                className={`p-1 rounded transition-colors ${
                  hasVoted
                    ? 'text-fg-muted cursor-not-allowed'
                    : 'text-fg-secondary hover:text-accent-success hover:bg-accent-success/10'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <span className={`text-sm font-bold ${
                voteScore > 0 ? 'text-accent-success' : voteScore < 0 ? 'text-accent-error' : 'text-fg-muted'
              }`}>
                {voteScore}
              </span>
              <button
                onClick={() => onVote?.('down')}
                disabled={hasVoted}
                className={`p-1 rounded transition-colors ${
                  hasVoted
                    ? 'text-fg-muted cursor-not-allowed'
                    : 'text-fg-secondary hover:text-accent-error hover:bg-accent-error/10'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Proposer */}
              <div className="flex items-center gap-1.5">
                <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                  proposal.proposerType === 'agent'
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'bg-accent-secondary/20 text-accent-secondary'
                }`}>
                  {proposal.proposerType === 'agent' ? 'A' : 'U'}
                </div>
                <span className="text-sm font-medium text-fg-primary">
                  {proposal.proposerName}
                </span>
              </div>

              {/* Badges */}
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getImpactColor(proposal.estimatedImpact)}`}>
                {proposal.estimatedImpact} impact
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-fg-muted">
                {(proposal.confidence * 100).toFixed(0)}% confidence
              </span>

              {/* Status badge */}
              {proposal.status === 'selected' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-success/20 text-accent-success font-semibold">
                  Selected
                </span>
              )}
              {proposal.status === 'exploring' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-warning/20 text-accent-warning font-semibold animate-pulse">
                  Exploring...
                </span>
              )}

              {/* Winner badge */}
              {isWinner && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-success text-white font-bold">
                  WINNER
                </span>
              )}
            </div>

            {/* Main content */}
            <p className={`mt-2 text-sm text-fg-secondary ${expanded ? '' : 'line-clamp-2'}`}>
              {proposal.content}
            </p>

            {/* Expand button */}
            {proposal.content.length > 150 && onToggleExpand && (
              <button
                onClick={onToggleExpand}
                className="mt-1 text-[10px] text-accent-primary hover:underline"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="p-3 space-y-3">
          {/* Reasoning */}
          {proposal.reasoning && (
            <div>
              <h4 className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1">
                Reasoning
              </h4>
              <p className="text-xs text-fg-secondary">{proposal.reasoning}</p>
            </div>
          )}

          {/* Pros & Cons */}
          {(proposal.pros?.length || proposal.cons?.length) && (
            <div className="grid grid-cols-2 gap-3">
              {proposal.pros && proposal.pros.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-accent-success uppercase tracking-wider mb-1">
                    Pros
                  </h4>
                  <ul className="space-y-0.5">
                    {proposal.pros.map((pro, i) => (
                      <li key={i} className="text-[10px] text-fg-secondary flex items-start gap-1">
                        <span className="text-accent-success mt-0.5">+</span>
                        {pro}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {proposal.cons && proposal.cons.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-accent-error uppercase tracking-wider mb-1">
                    Cons
                  </h4>
                  <ul className="space-y-0.5">
                    {proposal.cons.map((con, i) => (
                      <li key={i} className="text-[10px] text-fg-secondary flex items-start gap-1">
                        <span className="text-accent-error mt-0.5">-</span>
                        {con}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Code */}
          {proposal.code && (
            <div>
              <h4 className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1">
                Code ({proposal.codeLanguage || 'code'})
              </h4>
              <pre className="p-2 bg-bg-primary rounded text-[10px] font-mono text-fg-secondary overflow-x-auto">
                {proposal.code}
              </pre>
            </div>
          )}

          {/* Predicted outcome */}
          {proposal.predictedOutcome && (
            <div className="p-2 bg-accent-primary/5 border border-accent-primary/20 rounded">
              <h4 className="text-[10px] font-semibold text-accent-primary uppercase tracking-wider mb-1">
                Predicted Outcome
              </h4>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-fg-secondary">
                  Success: {(proposal.predictedOutcome.successProbability * 100).toFixed(0)}%
                </span>
                {proposal.predictedOutcome.estimatedDuration && (
                  <span className="text-fg-muted">
                    Duration: {proposal.predictedOutcome.estimatedDuration}
                  </span>
                )}
              </div>
              {proposal.predictedOutcome.nextSteps.length > 0 && (
                <div className="mt-1">
                  <span className="text-fg-muted">Next steps: </span>
                  <span className="text-fg-secondary">
                    {proposal.predictedOutcome.nextSteps.join(' → ')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Voters */}
          {proposal.votes.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-border-primary/30">
              <span className="text-[10px] text-fg-muted">Voted by:</span>
              <div className="flex -space-x-1">
                {proposal.votes.slice(0, 5).map((vote) => (
                  <div
                    key={vote.id}
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold border border-bg-primary ${
                      vote.voteType === 'up'
                        ? 'bg-accent-success/20 text-accent-success'
                        : 'bg-accent-error/20 text-accent-error'
                    }`}
                    title={`${vote.participantName}: ${vote.voteType}`}
                  >
                    {vote.participantName.charAt(0).toUpperCase()}
                  </div>
                ))}
                {proposal.votes.length > 5 && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold bg-bg-tertiary text-fg-muted border border-bg-primary">
                    +{proposal.votes.length - 5}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
