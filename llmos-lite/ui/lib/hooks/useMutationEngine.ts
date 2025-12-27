/**
 * React Hook for Mutation Engine Integration
 *
 * Provides easy integration of the evolutionary mutation engine
 * into React components. Handles lifecycle, status updates,
 * lens evolution, and manual mutation triggers.
 *
 * Features:
 * - Evolutionary lens selection with fitness tracking
 * - Lens population evolution (crossover, mutation)
 * - Code pattern analysis
 * - Lens recommendation API
 *
 * Usage:
 * ```tsx
 * import { useMutationEngine } from '@/lib/hooks/useMutationEngine';
 *
 * function DashboardComponent() {
 *   const {
 *     status,
 *     isRunning,
 *     lensLeaderboard,
 *     triggerMutation,
 *     recommendLens,
 *     evolveLenses
 *   } = useMutationEngine({ autoStart: true });
 *
 *   return (
 *     <div>
 *       <p>Top Lens: {lensLeaderboard[0]?.lensId}</p>
 *       <button onClick={() => triggerMutation('system/skills/sort.py')}>
 *         Mutate with Best Lens
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MutationEngine,
  getMutationEngine,
  MutationEngineStatus,
  MutationEngineConfig,
  MutationResult,
  DomainLens,
} from '../mutation-engine';

// ============================================================================
// Types
// ============================================================================

export interface UseMutationEngineOptions {
  /**
   * Whether to automatically start the engine on mount
   * Default: false
   */
  autoStart?: boolean;

  /**
   * Configuration overrides for the engine
   */
  config?: Partial<MutationEngineConfig>;

  /**
   * Callback when a mutation completes
   */
  onMutationComplete?: (result: MutationResult) => void;

  /**
   * Callback when lens evolution occurs
   */
  onLensEvolution?: (generated: string[], culled: string[]) => void;

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;

  /**
   * Poll interval for status updates (ms)
   * Default: 5000
   */
  pollInterval?: number;
}

export interface LensLeaderboardEntry {
  lensId: string;
  fitness: number;
  generation: number;
  usageCount: number;
  successRate: number;
}

export interface LensRecommendation {
  recommendedLens: string;
  confidence: number;
  reasoning: string;
  patterns: string[];
  alternatives: Array<{ lens: string; score: number }>;
}

export interface UseMutationEngineReturn {
  /**
   * Current engine status (includes evolutionary stats)
   */
  status: MutationEngineStatus;

  /**
   * Whether the engine is currently running a mutation cycle
   */
  isRunning: boolean;

  /**
   * Whether the engine is enabled and scheduled
   */
  isEnabled: boolean;

  /**
   * Available domain lenses
   */
  availableLenses: DomainLens[];

  /**
   * Lens fitness leaderboard (sorted by fitness)
   */
  lensLeaderboard: LensLeaderboardEntry[];

  /**
   * Lens vs code pattern affinity matrix
   */
  affinityMatrix: Record<string, Record<string, number>>;

  /**
   * Start the mutation engine
   */
  start: () => Promise<void>;

  /**
   * Stop the mutation engine
   */
  stop: () => void;

  /**
   * Manually trigger a mutation for a specific skill
   * If no lens specified, uses evolutionary selection
   */
  triggerMutation: (skillPath: string, domainLensId?: string) => Promise<MutationResult>;

  /**
   * Run a full mutation cycle immediately
   */
  runCycleNow: () => Promise<MutationResult[]>;

  /**
   * Manually trigger lens evolution
   */
  evolveLenses: () => Promise<{ generated: string[]; culled: string[] }>;

  /**
   * Analyze code patterns without mutating
   */
  analyzeCode: (code: string) => Array<{ pattern: string; confidence: number }>;

  /**
   * Get lens recommendation for code without mutating
   */
  recommendLens: (code: string) => Promise<LensRecommendation>;

  /**
   * Last mutation result
   */
  lastResult: MutationResult | null;

  /**
   * Last error message
   */
  lastError: string | null;

  /**
   * Loading state
   */
  isLoading: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useMutationEngine(
  options: UseMutationEngineOptions = {}
): UseMutationEngineReturn {
  const {
    autoStart = false,
    config,
    onMutationComplete,
    onLensEvolution,
    onError,
    pollInterval = 5000,
  } = options;

  const engineRef = useRef<MutationEngine | null>(null);
  const [status, setStatus] = useState<MutationEngineStatus>({
    isRunning: false,
    lastRun: null,
    nextRun: null,
    totalMutationsGenerated: 0,
    totalMutationsSuccessful: 0,
    cycleCount: 0,
    lensPopulationSize: 3,
    topLenses: [],
  });
  const [availableLenses, setAvailableLenses] = useState<DomainLens[]>([]);
  const [lensLeaderboard, setLensLeaderboard] = useState<LensLeaderboardEntry[]>([]);
  const [affinityMatrix, setAffinityMatrix] = useState<Record<string, Record<string, number>>>({});
  const [lastResult, setLastResult] = useState<MutationResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  // Initialize engine
  useEffect(() => {
    engineRef.current = getMutationEngine(config);

    // Load available lenses and evolution data
    const loadData = async () => {
      try {
        const lenses = await engineRef.current!.getAvailableLenses();
        setAvailableLenses(lenses);

        const leaderboard = engineRef.current!.getLensLeaderboard();
        setLensLeaderboard(leaderboard);

        const matrix = engineRef.current!.getAffinityMatrix();
        setAffinityMatrix(matrix);
      } catch (error) {
        console.warn('[useMutationEngine] Failed to load data:', error);
      }
    };

    loadData();

    // Auto-start if requested
    if (autoStart) {
      const startEngine = async () => {
        try {
          await engineRef.current!.start();
          setIsEnabled(true);
        } catch (error) {
          console.error('[useMutationEngine] Auto-start failed:', error);
          if (onError) {
            onError(error as Error);
          }
        }
      };
      startEngine();
    }

    // Cleanup on unmount
    return () => {
      // Note: We don't stop the engine on unmount because it's a singleton
      // that should continue running in the background
    };
  }, [autoStart, config, onError]);

  // Poll for status updates
  useEffect(() => {
    const updateStatus = () => {
      if (engineRef.current) {
        const newStatus = engineRef.current.getStatus();
        setStatus(newStatus);

        // Update leaderboard
        const leaderboard = engineRef.current.getLensLeaderboard();
        setLensLeaderboard(leaderboard);

        // Update affinity matrix
        const matrix = engineRef.current.getAffinityMatrix();
        setAffinityMatrix(matrix);

        // Check for new results
        if (newStatus.lastResult && newStatus.lastResult !== lastResult) {
          setLastResult(newStatus.lastResult);
          if (onMutationComplete) {
            onMutationComplete(newStatus.lastResult);
          }
        }

        // Check for lens evolution
        if (newStatus.lastEvolution && onLensEvolution) {
          onLensEvolution(
            newStatus.lastEvolution.generated,
            newStatus.lastEvolution.culled
          );
        }

        // Check for new errors
        if (newStatus.lastError && newStatus.lastError !== lastError) {
          setLastError(newStatus.lastError);
          if (onError) {
            onError(new Error(newStatus.lastError));
          }
        }
      }
    };

    // Initial update
    updateStatus();

    // Set up polling
    const intervalId = setInterval(updateStatus, pollInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [pollInterval, lastResult, lastError, onMutationComplete, onLensEvolution, onError]);

  // Start the engine
  const start = useCallback(async () => {
    if (!engineRef.current) return;
    setIsLoading(true);
    try {
      await engineRef.current.start();
      setIsEnabled(true);
      setStatus(engineRef.current.getStatus());

      // Refresh lenses after start
      const lenses = await engineRef.current.getAvailableLenses();
      setAvailableLenses(lenses);
    } catch (error) {
      console.error('[useMutationEngine] Start failed:', error);
      setLastError((error as Error).message);
      if (onError) {
        onError(error as Error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  // Stop the engine
  const stop = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.stop();
    setIsEnabled(false);
    setStatus(engineRef.current.getStatus());
  }, []);

  // Trigger a single mutation with evolutionary selection
  const triggerMutation = useCallback(
    async (skillPath: string, domainLensId?: string): Promise<MutationResult> => {
      if (!engineRef.current) {
        throw new Error('Mutation engine not initialized');
      }

      setIsLoading(true);
      setLastError(null);

      try {
        const result = await engineRef.current.mutateNow(skillPath, domainLensId);
        setLastResult(result);
        setStatus(engineRef.current.getStatus());

        // Refresh leaderboard after mutation
        setLensLeaderboard(engineRef.current.getLensLeaderboard());
        setAffinityMatrix(engineRef.current.getAffinityMatrix());

        if (onMutationComplete) {
          onMutationComplete(result);
        }

        return result;
      } catch (error) {
        const errorMsg = (error as Error).message;
        setLastError(errorMsg);
        if (onError) {
          onError(error as Error);
        }
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [onMutationComplete, onError]
  );

  // Run a full cycle immediately
  const runCycleNow = useCallback(async (): Promise<MutationResult[]> => {
    if (!engineRef.current) {
      throw new Error('Mutation engine not initialized');
    }

    setIsLoading(true);
    setLastError(null);

    try {
      const results = await engineRef.current.runMutationCycle();
      setStatus(engineRef.current.getStatus());

      // Refresh evolution data after cycle
      setLensLeaderboard(engineRef.current.getLensLeaderboard());
      setAffinityMatrix(engineRef.current.getAffinityMatrix());

      // Reload lenses in case new ones were generated
      const lenses = await engineRef.current.getAvailableLenses();
      setAvailableLenses(lenses);

      if (results.length > 0) {
        const lastSuccessful = results.find((r) => r.success);
        if (lastSuccessful) {
          setLastResult(lastSuccessful);
          if (onMutationComplete) {
            onMutationComplete(lastSuccessful);
          }
        }
      }

      return results;
    } catch (error) {
      const errorMsg = (error as Error).message;
      setLastError(errorMsg);
      if (onError) {
        onError(error as Error);
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [onMutationComplete, onError]);

  // Manually evolve lens population
  const evolveLenses = useCallback(async (): Promise<{ generated: string[]; culled: string[] }> => {
    if (!engineRef.current) {
      throw new Error('Mutation engine not initialized');
    }

    setIsLoading(true);
    setLastError(null);

    try {
      const result = await engineRef.current.evolveLensesNow();

      // Refresh all data after evolution
      const lenses = await engineRef.current.getAvailableLenses();
      setAvailableLenses(lenses);
      setLensLeaderboard(engineRef.current.getLensLeaderboard());
      setAffinityMatrix(engineRef.current.getAffinityMatrix());
      setStatus(engineRef.current.getStatus());

      if (onLensEvolution) {
        onLensEvolution(
          result.generated.map(l => l.id),
          result.culled
        );
      }

      return {
        generated: result.generated.map(l => l.id),
        culled: result.culled,
      };
    } catch (error) {
      const errorMsg = (error as Error).message;
      setLastError(errorMsg);
      if (onError) {
        onError(error as Error);
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [onLensEvolution, onError]);

  // Analyze code patterns
  const analyzeCode = useCallback(
    (code: string): Array<{ pattern: string; confidence: number }> => {
      if (!engineRef.current) {
        return [];
      }
      return engineRef.current.analyzeCode(code);
    },
    []
  );

  // Get lens recommendation
  const recommendLens = useCallback(
    async (code: string): Promise<LensRecommendation> => {
      if (!engineRef.current) {
        throw new Error('Mutation engine not initialized');
      }
      return engineRef.current.recommendLens(code);
    },
    []
  );

  return {
    status,
    isRunning: status.isRunning,
    isEnabled,
    availableLenses,
    lensLeaderboard,
    affinityMatrix,
    start,
    stop,
    triggerMutation,
    runCycleNow,
    evolveLenses,
    analyzeCode,
    recommendLens,
    lastResult,
    lastError,
    isLoading,
  };
}

// ============================================================================
// Enhanced Widget Component
// ============================================================================

/**
 * Enhanced widget showing evolutionary mutation engine status
 * including lens leaderboard and evolution controls.
 */
export function MutationEngineWidget() {
  const {
    status,
    isRunning,
    isEnabled,
    availableLenses,
    lensLeaderboard,
    start,
    stop,
    runCycleNow,
    evolveLenses,
    lastResult,
    lastError,
    isLoading,
  } = useMutationEngine({ autoStart: true });

  const [showLeaderboard, setShowLeaderboard] = useState(false);

  return (
    <div className="p-4 bg-bg-secondary rounded-lg border border-border-primary">
      <h3 className="text-lg font-semibold mb-3 text-text-primary flex items-center justify-between">
        <span>Mutation Engine</span>
        <span className="text-xs font-normal text-text-secondary">
          Cycle #{status.cycleCount || 0}
        </span>
      </h3>

      {/* Status */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-text-secondary">Status:</span>
          <span className={isRunning ? 'text-yellow-500' : isEnabled ? 'text-green-500' : 'text-gray-500'}>
            {isRunning ? 'Dreaming...' : isEnabled ? 'Idle' : 'Stopped'}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-text-secondary">Mutations:</span>
          <span className="text-text-primary">
            {status.totalMutationsSuccessful} / {status.totalMutationsGenerated}
            {status.totalMutationsGenerated > 0 && (
              <span className="text-text-secondary ml-1">
                ({((status.totalMutationsSuccessful / status.totalMutationsGenerated) * 100).toFixed(0)}%)
              </span>
            )}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-text-secondary">Lens Population:</span>
          <span className="text-text-primary">
            {status.lensPopulationSize || availableLenses.length} lenses
          </span>
        </div>

        {status.lastRun && (
          <div className="flex justify-between">
            <span className="text-text-secondary">Last run:</span>
            <span className="text-text-primary">
              {new Date(status.lastRun).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {/* Top Lenses */}
      {status.topLenses && status.topLenses.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            className="text-xs text-accent-primary hover:underline"
          >
            {showLeaderboard ? 'Hide' : 'Show'} Lens Leaderboard
          </button>

          {showLeaderboard && (
            <div className="mt-2 space-y-1">
              {lensLeaderboard.slice(0, 5).map((lens, idx) => (
                <div
                  key={lens.lensId}
                  className="flex justify-between text-xs p-1 bg-bg-tertiary rounded"
                >
                  <span className="text-text-secondary">
                    {idx + 1}. {lens.lensId}
                    {lens.generation > 0 && (
                      <span className="text-purple-400 ml-1">Gen {lens.generation}</span>
                    )}
                  </span>
                  <span className="text-text-primary">
                    {(lens.fitness * 100).toFixed(0)}% fit
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Last Result with Selection Info */}
      {lastResult && (
        <div className="mt-3 p-2 bg-bg-tertiary rounded text-xs">
          <div className={lastResult.success ? 'text-green-500' : 'text-red-500'}>
            {lastResult.success ? '✓ Success' : '✗ Failed'}
          </div>
          {lastResult.success && (
            <>
              <div className="text-text-secondary truncate">
                Lens: {lastResult.domainLens}
              </div>
              {lastResult.selectionConfidence !== undefined && (
                <div className="text-text-secondary">
                  Confidence: {(lastResult.selectionConfidence * 100).toFixed(0)}%
                </div>
              )}
              {lastResult.codePatterns && lastResult.codePatterns.length > 0 && (
                <div className="text-text-secondary truncate">
                  Patterns: {lastResult.codePatterns.join(', ')}
                </div>
              )}
              {lastResult.speedImprovement !== undefined && (
                <div className={lastResult.speedImprovement > 0 ? 'text-green-400' : 'text-text-primary'}>
                  Speed: {lastResult.speedImprovement > 0 ? '+' : ''}
                  {lastResult.speedImprovement.toFixed(1)}%
                </div>
              )}
            </>
          )}
          {lastResult.error && (
            <div className="text-red-400 truncate">{lastResult.error}</div>
          )}
        </div>
      )}

      {/* Evolution Info */}
      {status.lastEvolution && (
        <div className="mt-2 p-2 bg-purple-900/20 border border-purple-500/30 rounded text-xs">
          <div className="text-purple-400">Last Evolution:</div>
          {status.lastEvolution.generated.length > 0 && (
            <div className="text-green-400">
              +{status.lastEvolution.generated.length} new lenses
            </div>
          )}
          {status.lastEvolution.culled.length > 0 && (
            <div className="text-red-400">
              -{status.lastEvolution.culled.length} culled
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {lastError && (
        <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400">
          {lastError}
        </div>
      )}

      {/* Controls */}
      <div className="mt-4 flex flex-wrap gap-2">
        {isEnabled ? (
          <button
            onClick={stop}
            className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={start}
            disabled={isLoading}
            className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
          >
            Start
          </button>
        )}

        <button
          onClick={runCycleNow}
          disabled={isLoading || isRunning}
          className="px-3 py-1 text-sm bg-accent-primary hover:bg-accent-secondary text-white rounded disabled:opacity-50"
        >
          {isLoading ? 'Running...' : 'Dream Now'}
        </button>

        <button
          onClick={evolveLenses}
          disabled={isLoading}
          className="px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50"
        >
          Evolve Lenses
        </button>
      </div>
    </div>
  );
}

export default useMutationEngine;
