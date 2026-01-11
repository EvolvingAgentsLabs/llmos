/**
 * Prediction Timeline Visualization
 *
 * Shows past decisions, current decision point, and predicted future steps.
 * Allows seeing history, real-time decisions, and probable evolution.
 */

'use client';

import React, { useState } from 'react';
import { PredictedStep, CompletedDecision, ActiveDecision } from '@/lib/chat/types';

export interface PredictionTimelineProps {
  // Past decisions
  history: CompletedDecision[];
  // Current active decision (if any)
  current: ActiveDecision | null;
  // Predicted future steps
  predictions: PredictedStep[];
  // Speculative execution status
  speculativeStatus?: Map<string, {
    status: 'computing' | 'completed' | 'cancelled';
    progress: number;
    tokensUsed: number;
  }>;
  // Callbacks
  onViewDecision?: (decisionId: string) => void;
  onSelectPrediction?: (predictionId: string) => void;
  onModifyPrediction?: (predictionId: string) => void;
  // Display options
  showVotingDetails?: boolean;
  showTimeSaved?: boolean;
  compact?: boolean;
}

export function PredictionTimeline({
  history,
  current,
  predictions,
  speculativeStatus,
  onViewDecision,
  onSelectPrediction,
  onModifyPrediction,
  showVotingDetails = true,
  showTimeSaved = true,
  compact = false,
}: PredictionTimelineProps) {
  const [expandedSection, setExpandedSection] = useState<'past' | 'present' | 'future' | null>(
    current ? 'present' : 'future'
  );

  return (
    <div className="prediction-timeline bg-gray-900/50 rounded-lg p-4">
      {/* Timeline Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <span className="text-purple-400">⏱️</span>
          Decision Timeline
        </h3>
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setExpandedSection(expandedSection === 'past' ? null : 'past')}
            className={`px-2 py-1 rounded ${
              expandedSection === 'past'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Past ({history.length})
          </button>
          <button
            onClick={() => setExpandedSection(expandedSection === 'present' ? null : 'present')}
            className={`px-2 py-1 rounded ${
              expandedSection === 'present'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
            disabled={!current}
          >
            Now {current ? '🔴' : '⚪'}
          </button>
          <button
            onClick={() => setExpandedSection(expandedSection === 'future' ? null : 'future')}
            className={`px-2 py-1 rounded ${
              expandedSection === 'future'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Predicted ({predictions.length})
          </button>
        </div>
      </div>

      {/* Timeline Visualization */}
      <div className="relative">
        {/* Connecting Line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500 via-amber-500 to-purple-500" />

        {/* PAST SECTION */}
        {(expandedSection === 'past' || expandedSection === null) && history.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 ml-2">
              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center z-10">
                <span className="text-xs">📜</span>
              </div>
              <span className="text-xs font-medium text-blue-400">HISTORY</span>
            </div>

            <div className="ml-8 space-y-2">
              {history.slice(-5).map((decision, idx) => (
                <div
                  key={decision.id}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    compact
                      ? 'bg-gray-800/30 hover:bg-gray-800/50'
                      : 'bg-gray-800/50 hover:bg-gray-800/70'
                  }`}
                  onClick={() => onViewDecision?.(decision.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-sm text-gray-200">{decision.question}</div>
                      <div className="text-xs text-green-400 mt-1">
                        ✓ Selected: {decision.selectedOption}
                      </div>
                      {!compact && decision.alternatives.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          Other options: {decision.alternatives.join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(decision.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  {!compact && showVotingDetails && decision.votingDuration && (
                    <div className="mt-2 text-xs text-gray-500">
                      Voting time: {Math.round(decision.votingDuration / 1000)}s
                    </div>
                  )}
                </div>
              ))}
              {history.length > 5 && (
                <button
                  className="text-xs text-gray-500 hover:text-gray-400 ml-2"
                  onClick={() => setExpandedSection('past')}
                >
                  + {history.length - 5} more decisions
                </button>
              )}
            </div>
          </div>
        )}

        {/* PRESENT SECTION */}
        {current && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 ml-2">
              <div className="w-5 h-5 rounded-full bg-amber-600 flex items-center justify-center z-10 animate-pulse">
                <span className="text-xs">⚡</span>
              </div>
              <span className="text-xs font-medium text-amber-400">NOW - DECIDING</span>
            </div>

            <div className="ml-8">
              <div className="p-4 rounded-lg bg-amber-900/20 border border-amber-500/30">
                <div className="text-sm font-medium text-white mb-3">{current.question}</div>

                {/* Current Options */}
                <div className="space-y-2 mb-3">
                  {current.options.map((option, idx) => {
                    const specStatus = speculativeStatus?.get(option.id);
                    return (
                      <div
                        key={option.id}
                        className={`p-2 rounded ${
                          option.status === 'selected'
                            ? 'bg-green-600/30 border border-green-500'
                            : 'bg-gray-700/50 hover:bg-gray-700/70'
                        } cursor-pointer transition-colors`}
                        onClick={() => onSelectPrediction?.(option.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-400">
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span className="text-sm text-white">
                              {option.proposerName}
                            </span>
                            {specStatus && (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  specStatus.status === 'computing'
                                    ? 'bg-purple-600/40 text-purple-200'
                                    : specStatus.status === 'completed'
                                    ? 'bg-green-600/40 text-green-200'
                                    : 'bg-gray-600/40 text-gray-300'
                                }`}
                              >
                                {specStatus.status === 'computing' && `⚡ ${specStatus.progress}%`}
                                {specStatus.status === 'completed' && '⚡ Ready'}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400">
                            {(option.confidence * 100).toFixed(0)}%
                          </div>
                        </div>
                        {!compact && (
                          <div className="text-xs text-gray-400 mt-1 truncate">
                            {option.content.substring(0, 80)}...
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Voting Timer */}
                {current.votingSession && (
                  <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-700 pt-2">
                    <span>
                      Votes: {current.votingSession.totalVotes} / Min: {current.votingSession.rules.minVotes}
                    </span>
                    <span className={
                      current.votingSession.endTime - Date.now() < 10000
                        ? 'text-red-400 animate-pulse'
                        : ''
                    }>
                      ⏰ {Math.max(0, Math.round((current.votingSession.endTime - Date.now()) / 1000))}s
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* FUTURE SECTION - Predictions */}
        {(expandedSection === 'future' || expandedSection === null) && predictions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3 ml-2">
              <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center z-10">
                <span className="text-xs">🔮</span>
              </div>
              <span className="text-xs font-medium text-purple-400">PREDICTED FUTURE</span>
            </div>

            <div className="ml-8 space-y-2">
              {predictions.map((pred, idx) => {
                const specStatus = speculativeStatus?.get(pred.id);
                return (
                  <div
                    key={pred.id}
                    className={`p-3 rounded-lg border border-dashed transition-colors ${
                      pred.speculativelyComputed
                        ? 'bg-purple-900/20 border-purple-500/50 hover:border-purple-400'
                        : 'bg-gray-800/30 border-gray-600 hover:border-gray-500'
                    } ${onModifyPrediction ? 'cursor-pointer' : ''}`}
                    onClick={() => onModifyPrediction?.(pred.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                            pred.speculativelyComputed
                              ? 'bg-purple-600/60'
                              : 'bg-gray-700'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <div className="text-sm text-gray-200">{pred.description}</div>
                          {pred.dependencies.length > 0 && (
                            <div className="text-xs text-gray-500">
                              Depends on: Step {pred.dependencies.map((d) => {
                                const depIdx = predictions.findIndex(p => p.id === d);
                                return depIdx >= 0 ? depIdx + 1 : d;
                              }).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs text-purple-400">
                          {(pred.probability * 100).toFixed(0)}% likely
                        </span>
                        {pred.estimatedDuration && (
                          <span className="text-xs text-gray-500">
                            ~{pred.estimatedDuration}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Speculative Execution Status */}
                    {pred.speculativelyComputed && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-gray-700 rounded overflow-hidden">
                          <div
                            className="h-full bg-purple-500 transition-all"
                            style={{
                              width: specStatus
                                ? `${specStatus.progress}%`
                                : pred.status === 'computed'
                                ? '100%'
                                : '50%',
                            }}
                          />
                        </div>
                        <span className="text-xs text-purple-400">
                          {pred.status === 'computed' ? '✓ Pre-computed' : '⚡ Computing...'}
                        </span>
                      </div>
                    )}

                    {/* Modify Button */}
                    {onModifyPrediction && (
                      <button
                        className="mt-2 text-xs text-gray-500 hover:text-gray-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          onModifyPrediction(pred.id);
                        }}
                      >
                        ✏️ Modify this step
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Add Custom Step */}
              {onModifyPrediction && (
                <button
                  className="w-full p-2 rounded-lg border border-dashed border-gray-600 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-400 transition-colors"
                  onClick={() => onModifyPrediction('new')}
                >
                  + Add custom step to prediction
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {history.length === 0 && !current && predictions.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <div className="text-2xl mb-2">🎯</div>
            <div className="text-sm">No decisions yet</div>
            <div className="text-xs">Start a task to see the decision timeline</div>
          </div>
        )}
      </div>

      {/* Statistics */}
      {showTimeSaved && (history.length > 0 || current) && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-blue-400">{history.length}</div>
              <div className="text-xs text-gray-500">Decisions Made</div>
            </div>
            <div>
              <div className="text-lg font-bold text-purple-400">
                {predictions.filter((p) => p.speculativelyComputed).length}
              </div>
              <div className="text-xs text-gray-500">Pre-Computed</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-400">
                ~{predictions.filter((p) => p.speculativelyComputed).length * 15}s
              </div>
              <div className="text-xs text-gray-500">Time Saved</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PredictionTimeline;
