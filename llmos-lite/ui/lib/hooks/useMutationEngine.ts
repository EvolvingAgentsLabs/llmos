/**
 * React Hook for Mutation Engine Integration
 *
 * Provides easy integration of the background mutation engine
 * into React components. Handles lifecycle, status updates,
 * and manual mutation triggers.
 *
 * Usage:
 * ```tsx
 * import { useMutationEngine } from '@/lib/hooks/useMutationEngine';
 *
 * function DashboardComponent() {
 *   const {
 *     status,
 *     isRunning,
 *     availableLenses,
 *     triggerMutation,
 *     start,
 *     stop
 *   } = useMutationEngine({ autoStart: true });
 *
 *   return (
 *     <div>
 *       <p>Mutations: {status.totalMutationsSuccessful} successful</p>
 *       <button onClick={() => triggerMutation('system/skills/sort.py')}>
 *         Mutate Now
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
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;

  /**
   * Poll interval for status updates (ms)
   * Default: 5000
   */
  pollInterval?: number;
}

export interface UseMutationEngineReturn {
  /**
   * Current engine status
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
   * Start the mutation engine
   */
  start: () => Promise<void>;

  /**
   * Stop the mutation engine
   */
  stop: () => void;

  /**
   * Manually trigger a mutation for a specific skill
   */
  triggerMutation: (skillPath: string, domainLensId?: string) => Promise<MutationResult>;

  /**
   * Run a full mutation cycle immediately
   */
  runCycleNow: () => Promise<MutationResult[]>;

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

export function useMutationEngine(
  options: UseMutationEngineOptions = {}
): UseMutationEngineReturn {
  const {
    autoStart = false,
    config,
    onMutationComplete,
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
  });
  const [availableLenses, setAvailableLenses] = useState<DomainLens[]>([]);
  const [lastResult, setLastResult] = useState<MutationResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  // Initialize engine
  useEffect(() => {
    engineRef.current = getMutationEngine(config);

    // Load available lenses
    const loadLenses = async () => {
      try {
        const lenses = await engineRef.current!.getAvailableLenses();
        setAvailableLenses(lenses);
      } catch (error) {
        console.warn('[useMutationEngine] Failed to load lenses:', error);
      }
    };

    loadLenses();

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

        // Check for new results
        if (newStatus.lastResult && newStatus.lastResult !== lastResult) {
          setLastResult(newStatus.lastResult);
          if (onMutationComplete) {
            onMutationComplete(newStatus.lastResult);
          }
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
  }, [pollInterval, lastResult, lastError, onMutationComplete, onError]);

  // Start the engine
  const start = useCallback(async () => {
    if (!engineRef.current) return;
    setIsLoading(true);
    try {
      await engineRef.current.start();
      setIsEnabled(true);
      setStatus(engineRef.current.getStatus());
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

  // Trigger a single mutation
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

  return {
    status,
    isRunning: status.isRunning,
    isEnabled,
    availableLenses,
    start,
    stop,
    triggerMutation,
    runCycleNow,
    lastResult,
    lastError,
    isLoading,
  };
}

// ============================================================================
// Example Integration Component
// ============================================================================

/**
 * Example component showing how to integrate the mutation engine
 * into a dashboard. Copy and adapt this for your use case.
 *
 * ```tsx
 * import { MutationEngineWidget } from '@/lib/hooks/useMutationEngine';
 *
 * function Dashboard() {
 *   return (
 *     <div>
 *       <MutationEngineWidget />
 *     </div>
 *   );
 * }
 * ```
 */
export function MutationEngineWidget() {
  const {
    status,
    isRunning,
    isEnabled,
    availableLenses,
    start,
    stop,
    runCycleNow,
    lastResult,
    lastError,
    isLoading,
  } = useMutationEngine({ autoStart: true });

  return (
    <div className="p-4 bg-bg-secondary rounded-lg border border-border-primary">
      <h3 className="text-lg font-semibold mb-3 text-text-primary">
        Mutation Engine
      </h3>

      {/* Status */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-text-secondary">Status:</span>
          <span className={isRunning ? 'text-yellow-500' : isEnabled ? 'text-green-500' : 'text-gray-500'}>
            {isRunning ? 'Running' : isEnabled ? 'Idle' : 'Stopped'}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-text-secondary">Mutations:</span>
          <span className="text-text-primary">
            {status.totalMutationsSuccessful} / {status.totalMutationsGenerated}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-text-secondary">Lenses:</span>
          <span className="text-text-primary">{availableLenses.length} loaded</span>
        </div>

        {status.lastRun && (
          <div className="flex justify-between">
            <span className="text-text-secondary">Last run:</span>
            <span className="text-text-primary">
              {new Date(status.lastRun).toLocaleTimeString()}
            </span>
          </div>
        )}

        {status.nextRun && isEnabled && (
          <div className="flex justify-between">
            <span className="text-text-secondary">Next run:</span>
            <span className="text-text-primary">
              {new Date(status.nextRun).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {/* Last Result */}
      {lastResult && (
        <div className="mt-3 p-2 bg-bg-tertiary rounded text-xs">
          <div className={lastResult.success ? 'text-green-500' : 'text-red-500'}>
            {lastResult.success ? 'Success' : 'Failed'}
          </div>
          {lastResult.success && (
            <>
              <div className="text-text-secondary truncate">
                {lastResult.mutantPath}
              </div>
              {lastResult.speedImprovement !== undefined && (
                <div className="text-text-primary">
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

      {/* Error */}
      {lastError && (
        <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400">
          {lastError}
        </div>
      )}

      {/* Controls */}
      <div className="mt-4 flex gap-2">
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
          {isLoading ? 'Running...' : 'Run Now'}
        </button>
      </div>
    </div>
  );
}

export default useMutationEngine;
