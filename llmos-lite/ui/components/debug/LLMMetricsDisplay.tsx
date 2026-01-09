'use client';

/**
 * LLM Metrics Display Component
 *
 * Shows detailed metrics about LLM API usage including:
 * - Characters sent and received
 * - Token estimates and actual usage
 * - Streaming progress (partial responses)
 * - Request timing and throughput
 */

import { useEffect, useState } from 'react';
import {
  useLLMMetricsStore,
  formatChars,
  formatTokens,
  formatDuration,
} from '@/lib/debug/llm-metrics-store';
import {
  Activity,
  ArrowUp,
  ArrowDown,
  Zap,
  Clock,
  Hash,
  Layers,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  color?: string;
  isLive?: boolean;
}

function MetricCard({ icon, label, value, subValue, color = 'text-fg-secondary', isLive }: MetricCardProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-bg-tertiary/30 rounded">
      <div className={`${color}`}>{icon}</div>
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] text-fg-muted uppercase tracking-wide">{label}</span>
        <div className="flex items-center gap-1">
          <span className={`text-sm font-mono ${color}`}>{value}</span>
          {isLive && (
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
        </div>
        {subValue && (
          <span className="text-[10px] text-fg-muted">{subValue}</span>
        )}
      </div>
    </div>
  );
}

interface LLMMetricsDisplayProps {
  /** Show compact version */
  compact?: boolean;
  /** Show live streaming metrics */
  showLive?: boolean;
}

export default function LLMMetricsDisplay({ compact = false, showLive = true }: LLMMetricsDisplayProps) {
  const { currentRequest, sessionMetrics, getSessionMetrics } = useLLMMetricsStore();
  const [liveMetrics, setLiveMetrics] = useState(sessionMetrics);

  // Update live metrics every 100ms during active requests
  useEffect(() => {
    if (!currentRequest) {
      setLiveMetrics(getSessionMetrics());
      return;
    }

    const interval = setInterval(() => {
      setLiveMetrics(getSessionMetrics());
    }, 100);

    return () => clearInterval(interval);
  }, [currentRequest, getSessionMetrics]);

  // Calculate current request stats
  const currentStats = currentRequest ? {
    elapsed: Date.now() - currentRequest.startTime,
    charsPerSecond: currentRequest.charsPerSecond || 0,
    progress: currentRequest.partialResponseChars,
  } : null;

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-xs">
        {/* Sent */}
        <div className="flex items-center gap-1 text-fg-muted">
          <ArrowUp className="w-3 h-3 text-orange-400" />
          <span>{formatChars(liveMetrics.totalCharsSent)}</span>
        </div>

        {/* Received */}
        <div className="flex items-center gap-1 text-fg-muted">
          <ArrowDown className="w-3 h-3 text-green-400" />
          <span>{formatChars(liveMetrics.totalCharsReceived)}</span>
          {currentRequest && currentRequest.status === 'streaming' && (
            <>
              <span className="text-cyan-400">+{formatChars(currentRequest.partialResponseChars)}</span>
              <RefreshCw className="w-2.5 h-2.5 text-cyan-400 animate-spin" />
            </>
          )}
        </div>

        {/* Tokens */}
        <div className="flex items-center gap-1 text-fg-muted">
          <Hash className="w-3 h-3 text-purple-400" />
          <span>~{formatTokens(liveMetrics.totalTokensEstimate)}</span>
          {liveMetrics.totalActualTokens > 0 && (
            <span className="text-fg-tertiary">({formatTokens(liveMetrics.totalActualTokens)})</span>
          )}
        </div>

        {/* Requests */}
        <div className="flex items-center gap-1 text-fg-muted">
          <Layers className="w-3 h-3 text-blue-400" />
          <span>{liveMetrics.totalRequests}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Current Request Progress (if streaming) */}
      {showLive && currentRequest && (
        <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-sm font-medium text-cyan-300">Live Request</span>
            <span className="text-xs text-cyan-400/70 font-mono">{currentRequest.model}</span>
          </div>

          {/* Progress Bar */}
          <div className="mb-2">
            <div className="flex justify-between text-[10px] text-fg-muted mb-1">
              <span>Streaming Response</span>
              <span>{formatChars(currentRequest.partialResponseChars)} chars</span>
            </div>
            <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-100"
                style={{
                  width: `${Math.min(100, (currentRequest.partialResponseChars / 10000) * 100)}%`,
                }}
              />
            </div>
          </div>

          {/* Live Stats */}
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center">
              <div className="text-lg font-mono text-cyan-400">
                {formatChars(currentRequest.requestChars)}
              </div>
              <div className="text-[10px] text-fg-muted">Sent</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono text-green-400">
                {formatChars(currentRequest.partialResponseChars)}
              </div>
              <div className="text-[10px] text-fg-muted">Received</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono text-purple-400">
                {currentRequest.chunksReceived}
              </div>
              <div className="text-[10px] text-fg-muted">Chunks</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono text-orange-400">
                {currentStats ? formatDuration(currentStats.elapsed) : '-'}
              </div>
              <div className="text-[10px] text-fg-muted">Elapsed</div>
            </div>
          </div>

          {/* Throughput */}
          {currentRequest.charsPerSecond && currentRequest.charsPerSecond > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
              <TrendingUp className="w-3 h-3 text-green-400" />
              <span>{Math.round(currentRequest.charsPerSecond)} chars/sec</span>
              <span className="text-fg-tertiary">
                (~{Math.round(currentRequest.charsPerSecond * 0.25)} tokens/sec)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Session Summary */}
      <div className="p-3 bg-bg-secondary/50 rounded-lg border border-border-primary/30">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-medium text-fg-secondary">Session Metrics</span>
          <span className="text-[10px] text-fg-muted">
            {formatDuration(liveMetrics.sessionDuration)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard
            icon={<ArrowUp className="w-3.5 h-3.5" />}
            label="Chars Sent"
            value={formatChars(liveMetrics.totalCharsSent)}
            subValue={`~${formatTokens(Math.ceil(liveMetrics.totalCharsSent * 0.25))} tokens`}
            color="text-orange-400"
          />

          <MetricCard
            icon={<ArrowDown className="w-3.5 h-3.5" />}
            label="Chars Received"
            value={formatChars(liveMetrics.totalCharsReceived)}
            subValue={`~${formatTokens(Math.ceil(liveMetrics.totalCharsReceived * 0.25))} tokens`}
            color="text-green-400"
            isLive={!!currentRequest}
          />

          <MetricCard
            icon={<Hash className="w-3.5 h-3.5" />}
            label="Total Tokens"
            value={liveMetrics.totalActualTokens > 0
              ? formatTokens(liveMetrics.totalActualTokens)
              : `~${formatTokens(liveMetrics.totalTokensEstimate)}`
            }
            subValue={liveMetrics.totalActualTokens > 0 ? 'actual' : 'estimated'}
            color="text-purple-400"
          />

          <MetricCard
            icon={<Layers className="w-3.5 h-3.5" />}
            label="Requests"
            value={String(liveMetrics.totalRequests)}
            subValue={`${liveMetrics.totalStreamingChunks} chunks`}
            color="text-blue-400"
          />
        </div>

        {/* Additional Stats Row */}
        <div className="mt-2 pt-2 border-t border-border-primary/30 grid grid-cols-2 gap-2">
          <MetricCard
            icon={<Clock className="w-3.5 h-3.5" />}
            label="Avg Response Time"
            value={formatDuration(liveMetrics.avgResponseTime)}
            color="text-cyan-400"
          />

          <MetricCard
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            label="Avg Response Size"
            value={formatChars(Math.round(liveMetrics.avgCharsPerResponse))}
            subValue="per request"
            color="text-emerald-400"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Inline metrics badge for minimal display
 */
export function LLMMetricsBadge() {
  const { currentRequest, sessionMetrics } = useLLMMetricsStore();

  if (sessionMetrics.totalRequests === 0 && !currentRequest) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-bg-tertiary/50 rounded text-[10px] text-fg-muted">
      {currentRequest?.status === 'streaming' ? (
        <>
          <RefreshCw className="w-2.5 h-2.5 text-cyan-400 animate-spin" />
          <span className="text-cyan-400">{formatChars(currentRequest.partialResponseChars)}</span>
        </>
      ) : (
        <>
          <Activity className="w-2.5 h-2.5 text-fg-tertiary" />
          <span>{formatChars(sessionMetrics.totalCharsSent + sessionMetrics.totalCharsReceived)}</span>
        </>
      )}
      <span className="text-fg-tertiary">|</span>
      <span>~{formatTokens(sessionMetrics.totalTokensEstimate)} tok</span>
    </div>
  );
}
