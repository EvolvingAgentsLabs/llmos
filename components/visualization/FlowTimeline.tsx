'use client';

import { useMemo } from 'react';
import {
  TimelineView,
  CompletedDecision,
  ActiveDecision,
  FlowPrediction,
  PredictedStep,
} from '@/lib/chat/types';

interface FlowTimelineProps {
  timeline: TimelineView;
  onSelectDecision?: (decisionId: string) => void;
  onSelectPrediction?: (predictionId: string) => void;
  showPredictions?: boolean;
}

export default function FlowTimeline({
  timeline,
  onSelectDecision,
  onSelectPrediction,
  showPredictions = true,
}: FlowTimelineProps) {
  const { past, present, future } = timeline;

  // Calculate timeline position percentages
  const timelineStats = useMemo(() => {
    const totalItems = past.length + (present ? 1 : 0) + (showPredictions ? future.length : 0);
    const pastWidth = totalItems > 0 ? (past.length / totalItems) * 100 : 33;
    const presentWidth = present ? (1 / totalItems) * 100 : 0;
    const futureWidth = totalItems > 0 ? (future.length / totalItems) * 100 : 33;

    return { totalItems, pastWidth, presentWidth, futureWidth };
  }, [past, present, future, showPredictions]);

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary/50 bg-bg-secondary/30">
        <h3 className="text-sm font-semibold text-fg-primary">Decision Timeline</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent-success" />
            <span className="text-fg-secondary">{past.length} completed</span>
          </span>
          {present && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
              <span className="text-fg-secondary">1 active</span>
            </span>
          )}
          {showPredictions && future.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500 opacity-60" />
              <span className="text-fg-secondary">{future.length} predicted</span>
            </span>
          )}
        </div>
      </div>

      {/* Timeline bar */}
      <div className="px-4 py-2 border-b border-border-primary/30">
        <div className="flex h-2 rounded-full overflow-hidden bg-bg-tertiary">
          {past.length > 0 && (
            <div
              className="bg-accent-success transition-all duration-500"
              style={{ width: `${timelineStats.pastWidth}%` }}
            />
          )}
          {present && (
            <div
              className="bg-accent-primary animate-pulse transition-all duration-500"
              style={{ width: `${timelineStats.presentWidth}%` }}
            />
          )}
          {showPredictions && future.length > 0 && (
            <div
              className="bg-purple-500 opacity-50 transition-all duration-500"
              style={{ width: `${timelineStats.futureWidth}%` }}
            />
          )}
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-fg-muted">
          <span>Past</span>
          <span>Present</span>
          <span>Future (Predicted)</span>
        </div>
      </div>

      {/* Timeline content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex gap-6">
          {/* Past section */}
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-semibold text-accent-success uppercase tracking-wider mb-3 flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Completed Decisions
            </h4>
            <div className="space-y-2">
              {past.length === 0 ? (
                <p className="text-xs text-fg-muted italic">No decisions yet</p>
              ) : (
                past.map((decision) => (
                  <CompletedDecisionCard
                    key={decision.id}
                    decision={decision}
                    onClick={() => onSelectDecision?.(decision.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-border-primary/50" />

          {/* Present section */}
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-semibold text-accent-primary uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-accent-primary" />
              </span>
              Current Decision
            </h4>
            {present ? (
              <ActiveDecisionCard decision={present} />
            ) : (
              <p className="text-xs text-fg-muted italic">No active decision</p>
            )}
          </div>

          {/* Divider */}
          {showPredictions && <div className="w-px bg-border-primary/50" />}

          {/* Future section */}
          {showPredictions && (
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Predicted Flow
              </h4>
              <div className="space-y-2">
                {future.length === 0 ? (
                  <p className="text-xs text-fg-muted italic">No predictions available</p>
                ) : (
                  future.map((prediction) => (
                    <PredictionCard
                      key={prediction.id}
                      prediction={prediction}
                      onClick={() => onSelectPrediction?.(prediction.id)}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CompletedDecisionCardProps {
  decision: CompletedDecision;
  onClick?: () => void;
}

function CompletedDecisionCard({ decision, onClick }: CompletedDecisionCardProps) {
  const duration = decision.votingDuration
    ? `${Math.round(decision.votingDuration / 1000)}s`
    : 'N/A';

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg bg-accent-success/5 border border-accent-success/20 hover:border-accent-success/40 transition-colors"
    >
      <div className="flex items-start gap-2">
        <div className="w-5 h-5 rounded-full bg-accent-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-3 h-3 text-accent-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-fg-primary line-clamp-2">{decision.question}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-success/20 text-accent-success">
              Selected
            </span>
            <span className="text-[10px] text-fg-muted">
              {decision.alternatives.length} alternatives
            </span>
            <span className="text-[10px] text-fg-muted">
              {duration}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

interface ActiveDecisionCardProps {
  decision: ActiveDecision;
}

function ActiveDecisionCard({ decision }: ActiveDecisionCardProps) {
  const votingSession = decision.votingSession;
  const timeRemaining = votingSession
    ? Math.max(0, Math.floor((votingSession.endTime - Date.now()) / 1000))
    : 0;

  return (
    <div className="p-3 rounded-lg bg-accent-primary/10 border-2 border-accent-primary/30 animate-pulse-subtle">
      <div className="flex items-start gap-2">
        <div className="w-5 h-5 rounded-full bg-accent-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <div className="w-2 h-2 rounded-full bg-accent-primary animate-ping" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-fg-primary">{decision.question}</p>

          {/* Options */}
          <div className="mt-2 space-y-1">
            {decision.options.slice(0, 3).map((option, index) => (
              <div
                key={option.id}
                className={`flex items-center gap-2 text-[10px] p-1.5 rounded ${
                  option.status === 'selected'
                    ? 'bg-accent-success/20 text-accent-success'
                    : 'bg-bg-tertiary/50 text-fg-secondary'
                }`}
              >
                <span className="font-bold">{index + 1}.</span>
                <span className="truncate flex-1">{option.proposerName}</span>
                <span className="text-fg-muted">{(option.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>

          {/* Voting timer */}
          {votingSession && votingSession.status === 'active' && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-primary transition-all"
                  style={{
                    width: `${(timeRemaining / votingSession.rules.timeoutSeconds) * 100}%`,
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-fg-muted">
                {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface PredictionCardProps {
  prediction: FlowPrediction;
  onClick?: () => void;
}

function PredictionCard({ prediction, onClick }: PredictionCardProps) {
  const mainSteps = prediction.predictedPath.slice(0, 3);
  const avgProbability =
    mainSteps.reduce((sum, step) => sum + step.probability, 0) / mainSteps.length;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 hover:border-purple-500/40 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
          {(prediction.confidence * 100).toFixed(0)}% confidence
        </span>
        {prediction.computationStarted && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-warning/20 text-accent-warning flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-warning animate-pulse" />
            Computing
          </span>
        )}
      </div>

      {/* Predicted steps */}
      <div className="space-y-1">
        {mainSteps.map((step, index) => (
          <PredictedStepRow key={step.id} step={step} index={index} />
        ))}
        {prediction.predictedPath.length > 3 && (
          <p className="text-[10px] text-fg-muted text-center">
            +{prediction.predictedPath.length - 3} more steps
          </p>
        )}
      </div>
    </button>
  );
}

interface PredictedStepRowProps {
  step: PredictedStep;
  index: number;
}

function PredictedStepRow({ step, index }: PredictedStepRowProps) {
  const getStatusIcon = () => {
    switch (step.status) {
      case 'computed':
        return (
          <svg className="w-3 h-3 text-accent-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'computing':
        return <div className="w-2 h-2 rounded-full bg-accent-warning animate-pulse" />;
      case 'confirmed':
        return (
          <svg className="w-3 h-3 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return <span className="text-[10px] text-purple-400 font-mono">{index + 1}</span>;
    }
  };

  return (
    <div className={`flex items-center gap-2 text-[10px] p-1.5 rounded ${
      step.speculativelyComputed
        ? 'bg-accent-success/10 border border-accent-success/20'
        : 'bg-bg-tertiary/30'
    }`}>
      <div className="w-4 h-4 flex items-center justify-center">
        {getStatusIcon()}
      </div>
      <span className="truncate flex-1 text-fg-secondary">{step.description}</span>
      <span className={`font-mono ${step.probability > 0.7 ? 'text-accent-success' : 'text-fg-muted'}`}>
        {(step.probability * 100).toFixed(0)}%
      </span>
    </div>
  );
}
