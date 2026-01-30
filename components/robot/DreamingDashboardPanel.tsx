/**
 * Dreaming Dashboard Panel
 *
 * UI component for monitoring and controlling the Dreaming Engine.
 * Shows evolution progress, failure analysis, and skill improvements.
 *
 * Features:
 * - View recorded sessions and failures
 * - Monitor evolution progress
 * - Apply skill patches
 * - View dreaming statistics
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  getBlackBoxRecorder,
  RecordingSession,
  FailureMarker,
} from '@/lib/evolution/black-box-recorder';
import {
  getEvolutionaryPatcher,
  EvolutionProgress,
  EvolutionResult,
} from '@/lib/evolution/evolutionary-patcher';
import {
  getDreamingStats,
  runDreamingCycle,
  shouldDream,
} from '@/lib/evolution';

interface DreamingDashboardPanelProps {
  deviceId: string;
  activeSkillName?: string;
  onSkillPatched?: (skillPath: string) => void;
}

interface SessionListItemProps {
  session: {
    id: string;
    skillName: string;
    startTime: number;
    status: string;
    failureCount: number;
  };
  onSelect: () => void;
  isSelected: boolean;
}

/**
 * Session list item
 */
function SessionListItem({ session, onSelect, isSelected }: SessionListItemProps) {
  const date = new Date(session.startTime);

  return (
    <button
      onClick={onSelect}
      className={`
        w-full text-left p-2 rounded transition-colors
        ${isSelected
          ? 'bg-zinc-700'
          : 'bg-zinc-800/50 hover:bg-zinc-800'
        }
      `}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-200 truncate">
          {session.skillName}
        </span>
        <span className={`
          text-xs px-1.5 py-0.5 rounded
          ${session.status === 'failed'
            ? 'bg-red-500/20 text-red-400'
            : 'bg-green-500/20 text-green-400'
          }
        `}>
          {session.failureCount} failures
        </span>
      </div>
      <p className="text-xs text-zinc-500 mt-1">
        {date.toLocaleDateString()} {date.toLocaleTimeString()}
      </p>
    </button>
  );
}

/**
 * Failure details component
 */
function FailureDetails({ failure }: { failure: FailureMarker }) {
  return (
    <div className="p-2 bg-zinc-800 rounded">
      <div className="flex items-center gap-2">
        <span className={`
          text-xs px-1.5 py-0.5 rounded
          ${failure.severity === 'critical'
            ? 'bg-red-500/20 text-red-400'
            : failure.severity === 'moderate'
            ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-zinc-700 text-zinc-400'
          }
        `}>
          {failure.type}
        </span>
        <span className="text-xs text-zinc-500">
          Frame #{failure.frameIndex}
        </span>
      </div>
      <p className="text-xs text-zinc-300 mt-1">{failure.description}</p>
    </div>
  );
}

/**
 * Evolution progress component
 */
function EvolutionProgressDisplay({ progress }: { progress: EvolutionProgress }) {
  const percentage = (progress.generation / progress.totalGenerations) * 100;

  return (
    <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-purple-300">
          Evolution in Progress
        </span>
        <span className="text-xs text-purple-400">
          Gen {progress.generation}/{progress.totalGenerations}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-purple-500 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
        <div>
          <p className="text-zinc-500">Best Fitness</p>
          <p className="text-zinc-200">{(progress.bestFitness * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-zinc-500">Avg Fitness</p>
          <p className="text-zinc-200">{(progress.averageFitness * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-zinc-500">Improvement</p>
          <p className="text-green-400">+{progress.improvementSoFar.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-zinc-500">Evaluations</p>
          <p className="text-zinc-200">{progress.evaluationsComplete}/{progress.totalEvaluations}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Stats card component
 */
function StatsCard({ label, value, subValue }: { label: string; value: string | number; subValue?: string }) {
  return (
    <div className="p-3 bg-zinc-800 rounded">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-zinc-200">{value}</p>
      {subValue && <p className="text-xs text-zinc-400">{subValue}</p>}
    </div>
  );
}

/**
 * Main Dreaming Dashboard Panel
 */
export function DreamingDashboardPanel({
  deviceId,
  activeSkillName,
  onSkillPatched,
}: DreamingDashboardPanelProps) {
  const [sessions, setSessions] = useState<Array<{
    id: string;
    skillName: string;
    startTime: number;
    status: string;
    failureCount: number;
  }>>([]);
  const [selectedSession, setSelectedSession] = useState<RecordingSession | null>(null);
  const [stats, setStats] = useState<{
    totalSessions: number;
    failedSessions: number;
    totalFailures: number;
    failuresByType: Record<string, number>;
    skillsWithFailures: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [evolving, setEvolving] = useState(false);
  const [evolutionProgress, setEvolutionProgress] = useState<EvolutionProgress | null>(null);
  const [lastResult, setLastResult] = useState<EvolutionResult | null>(null);
  const [canDream, setCanDream] = useState(false);
  const [activeTab, setActiveTab] = useState<'sessions' | 'stats' | 'results'>('sessions');

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Check if can dream when skill changes
  useEffect(() => {
    if (activeSkillName) {
      shouldDream(activeSkillName).then(setCanDream);
    } else {
      setCanDream(false);
    }
  }, [activeSkillName]);

  const loadData = async () => {
    setLoading(true);
    try {
      const recorder = getBlackBoxRecorder();
      const sessionList = await recorder.listSessions();
      setSessions(sessionList);

      const dreamingStats = await getDreamingStats();
      setStats(dreamingStats);
    } catch (error) {
      console.error('Failed to load dreaming data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSessionDetails = async (sessionId: string) => {
    const recorder = getBlackBoxRecorder();
    const session = await recorder.loadSession(sessionId);
    setSelectedSession(session);
  };

  const handleStartDreaming = useCallback(async () => {
    if (!activeSkillName || evolving) return;

    setEvolving(true);
    setEvolutionProgress(null);
    setLastResult(null);

    try {
      const result = await runDreamingCycle({
        skillPath: `skills/${activeSkillName}.md`,
        generations: 5,
        populationSize: 4,
        autoApply: false, // Let user decide
        onProgress: setEvolutionProgress,
      });

      setLastResult(result);
      setActiveTab('results');
    } catch (error) {
      console.error('Dreaming failed:', error);
    } finally {
      setEvolving(false);
      setEvolutionProgress(null);
    }
  }, [activeSkillName, evolving]);

  const handleApplyPatch = useCallback(async () => {
    if (!lastResult) return;

    const patcher = getEvolutionaryPatcher();
    const success = await patcher.applyPatch(lastResult.bestVariant);

    if (success && onSkillPatched) {
      onSkillPatched(lastResult.bestVariant.skill.path);
    }

    // Reload data
    loadData();
  }, [lastResult, onSkillPatched]);

  return (
    <div className="h-full flex flex-col bg-zinc-900 rounded-lg border border-zinc-700">
      {/* Header */}
      <div className="p-3 border-b border-zinc-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            <h3 className="text-sm font-medium text-zinc-200">Dreaming Engine</h3>
          </div>
          {activeSkillName && canDream && !evolving && (
            <button
              onClick={handleStartDreaming}
              className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded"
            >
              Start Dreaming
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {(['sessions', 'stats', 'results'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                px-3 py-1 text-xs rounded transition-colors
                ${activeTab === tab
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
                }
              `}
            >
              {tab === 'sessions' && 'Sessions'}
              {tab === 'stats' && 'Statistics'}
              {tab === 'results' && 'Results'}
            </button>
          ))}
        </div>
      </div>

      {/* Evolution Progress */}
      {evolving && evolutionProgress && (
        <div className="p-3 border-b border-zinc-700">
          <EvolutionProgressDisplay progress={evolutionProgress} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="text-center text-zinc-500 text-sm py-4">
            Loading...
          </div>
        )}

        {/* Sessions Tab */}
        {activeTab === 'sessions' && !loading && (
          <div className="space-y-4">
            {/* Session List */}
            <div>
              <h4 className="text-xs font-medium text-zinc-400 mb-2">Recorded Sessions</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {sessions.length === 0 && (
                  <p className="text-xs text-zinc-500 text-center py-2">
                    No sessions recorded yet
                  </p>
                )}
                {sessions.map((session) => (
                  <SessionListItem
                    key={session.id}
                    session={session}
                    isSelected={selectedSession?.id === session.id}
                    onSelect={() => loadSessionDetails(session.id)}
                  />
                ))}
              </div>
            </div>

            {/* Session Details */}
            {selectedSession && (
              <div>
                <h4 className="text-xs font-medium text-zinc-400 mb-2">
                  Failures ({selectedSession.failures.length})
                </h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {selectedSession.failures.map((failure, i) => (
                    <FailureDetails key={i} failure={failure} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && !loading && stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <StatsCard
                label="Total Sessions"
                value={stats.totalSessions}
              />
              <StatsCard
                label="Failed Sessions"
                value={stats.failedSessions}
              />
              <StatsCard
                label="Total Failures"
                value={stats.totalFailures}
              />
              <StatsCard
                label="Skills Affected"
                value={stats.skillsWithFailures.length}
              />
            </div>

            <div>
              <h4 className="text-xs font-medium text-zinc-400 mb-2">Failures by Type</h4>
              <div className="space-y-1">
                {Object.entries(stats.failuresByType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">{type}</span>
                    <span className="text-zinc-500">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-zinc-400 mb-2">Skills with Failures</h4>
              <div className="flex flex-wrap gap-1">
                {stats.skillsWithFailures.map((skill) => (
                  <span
                    key={skill}
                    className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Results Tab */}
        {activeTab === 'results' && !loading && (
          <div className="space-y-4">
            {!lastResult && (
              <p className="text-xs text-zinc-500 text-center py-4">
                No evolution results yet. Start dreaming to improve skills.
              </p>
            )}

            {lastResult && (
              <>
                <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-green-300">
                      Evolution Complete
                    </span>
                    <span className="text-lg font-bold text-green-400">
                      +{lastResult.improvement.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <StatsCard
                    label="Skill"
                    value={lastResult.skillName}
                    subValue={`v${lastResult.originalVersion}`}
                  />
                  <StatsCard
                    label="Generations"
                    value={lastResult.generations}
                  />
                  <StatsCard
                    label="Variants Tested"
                    value={lastResult.totalVariants}
                  />
                  <StatsCard
                    label="Failures Fixed"
                    value={lastResult.failuresFixed}
                  />
                </div>

                <div>
                  <h4 className="text-xs font-medium text-zinc-400 mb-2">Mutations Applied</h4>
                  <ul className="space-y-1">
                    {lastResult.bestVariant.mutations.map((mutation, i) => (
                      <li key={i} className="text-xs text-zinc-300 flex items-center gap-2">
                        <span className="text-green-400">+</span>
                        {mutation.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={handleApplyPatch}
                  className="w-full py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded"
                >
                  Apply Improvement to Skill
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-zinc-700">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            {activeSkillName
              ? `Active: ${activeSkillName}`
              : 'No skill selected'
            }
          </span>
          {canDream && !evolving && (
            <span className="text-purple-400">Ready to dream</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default DreamingDashboardPanel;
