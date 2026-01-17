'use client';

/**
 * Plan Execution Log Component
 *
 * Vercel-style build log panel showing plan execution progress.
 * Features:
 * - Collapsible phases with progress indicators
 * - Real-time log streaming
 * - Duration tracking
 * - Error highlighting
 * - Toggle button to show/hide
 */

import { useEffect, useRef, useState } from 'react';
import { usePlanLogStore, PlanLogEvent, PlanPhase, LogEventType } from '@/lib/debug/plan-log-store';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Play,
  Pause,
  Terminal,
  Maximize2,
  Minimize2,
  X,
  FileText,
  Wrench,
  Brain,
  AlertTriangle,
  Info,
  Zap,
  BarChart2,
} from 'lucide-react';
import LLMMetricsDisplay, { LLMMetricsBadge } from './LLMMetricsDisplay';

// =============================================================================
// Event Icon Component
// =============================================================================

function EventIcon({ type, isError }: { type: LogEventType; isError?: boolean }) {
  const iconClass = 'w-3.5 h-3.5';

  if (isError) {
    return <XCircle className={`${iconClass} text-red-400`} />;
  }

  switch (type) {
    case 'plan_start':
      return <Play className={`${iconClass} text-blue-400`} />;
    case 'plan_created':
      return <FileText className={`${iconClass} text-indigo-400`} />;
    case 'phase_start':
    case 'phase_end':
      return <Zap className={`${iconClass} text-purple-400`} />;
    case 'step_start':
      return <ChevronRight className={`${iconClass} text-blue-400`} />;
    case 'step_complete':
      return <CheckCircle className={`${iconClass} text-green-400`} />;
    case 'step_failed':
      return <XCircle className={`${iconClass} text-red-400`} />;
    case 'tool_call':
      return <Wrench className={`${iconClass} text-orange-400`} />;
    case 'tool_result':
      return <Wrench className={`${iconClass} text-cyan-400`} />;
    case 'agent_start':
      return <Brain className={`${iconClass} text-emerald-400`} />;
    case 'agent_complete':
      return <CheckCircle className={`${iconClass} text-emerald-400`} />;
    case 'agent_error':
      return <XCircle className={`${iconClass} text-red-400`} />;
    case 'memory_query':
    case 'memory_result':
      return <Brain className={`${iconClass} text-cyan-400`} />;
    case 'error':
      return <XCircle className={`${iconClass} text-red-400`} />;
    case 'warning':
      return <AlertTriangle className={`${iconClass} text-yellow-400`} />;
    case 'success':
      return <CheckCircle className={`${iconClass} text-green-400`} />;
    default:
      return <Info className={`${iconClass} text-gray-400`} />;
  }
}

// =============================================================================
// Phase Header Component
// =============================================================================

function PhaseHeader({
  phase,
  isExpanded,
  onToggle,
  eventCount,
  isActive,
  duration,
}: {
  phase: PlanPhase;
  isExpanded: boolean;
  onToggle: () => void;
  eventCount: number;
  isActive: boolean;
  duration?: number;
}) {
  const phaseLabels: Record<PlanPhase, string> = {
    idle: 'Idle',
    planning: 'Planning',
    executing: 'Executing',
    reflecting: 'Reflecting',
    completed: 'Completed',
    failed: 'Failed',
  };

  const phaseColors: Record<PlanPhase, string> = {
    idle: 'text-gray-400',
    planning: 'text-indigo-400',
    executing: 'text-blue-400',
    reflecting: 'text-purple-400',
    completed: 'text-green-400',
    failed: 'text-red-400',
  };

  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-tertiary/50 transition-colors"
    >
      {isExpanded ? (
        <ChevronDown className="w-4 h-4 text-fg-muted" />
      ) : (
        <ChevronRight className="w-4 h-4 text-fg-muted" />
      )}

      <span className={`text-sm font-medium ${phaseColors[phase]}`}>
        {phaseLabels[phase]}
      </span>

      {isActive && (
        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
      )}

      <span className="text-xs text-fg-muted">
        ({eventCount} events)
      </span>

      {duration !== undefined && (
        <span className="ml-auto text-xs text-fg-muted flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDuration(duration)}
        </span>
      )}
    </button>
  );
}

// =============================================================================
// Event Entry Component
// =============================================================================

function EventEntry({ event }: { event: PlanLogEvent }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDetails = event.details && Object.keys(event.details).length > 0;

  const timeStr = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

  return (
    <div
      className={`px-3 py-1.5 border-l-2 ${
        event.isError
          ? 'border-red-500/50 bg-red-500/5'
          : event.type === 'success'
          ? 'border-green-500/50 bg-green-500/5'
          : 'border-transparent hover:bg-bg-tertiary/30'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-[10px] text-fg-muted font-mono mt-0.5 shrink-0">
          {timeStr}
        </span>

        <EventIcon type={event.type} isError={event.isError} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm ${
                event.isError ? 'text-red-300' : 'text-fg-secondary'
              }`}
            >
              {event.message}
            </span>

            {event.duration !== undefined && (
              <span className="text-xs text-fg-muted">
                ({formatDuration(event.duration)})
              </span>
            )}
          </div>

          {hasDetails && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-fg-muted hover:text-fg-secondary mt-0.5 flex items-center gap-1"
            >
              {isExpanded ? (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronRight className="w-3 h-3" />
                  Show details
                </>
              )}
            </button>
          )}

          {isExpanded && hasDetails && (
            <pre className="mt-2 p-2 bg-bg-tertiary rounded text-xs text-fg-muted overflow-x-auto">
              {JSON.stringify(event.details, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Progress Bar Component
// =============================================================================

function ProgressBar({ phase, steps }: { phase: PlanPhase; steps: { status: string }[] }) {
  const totalSteps = steps.length;
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const failedSteps = steps.filter(s => s.status === 'failed').length;

  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  const hasFailures = failedSteps > 0;

  return (
    <div className="px-3 py-2 border-b border-border-primary/50">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {phase === 'executing' && (
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          )}
          {phase === 'completed' && (
            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
          )}
          {phase === 'failed' && (
            <XCircle className="w-3.5 h-3.5 text-red-400" />
          )}
          <span className="text-xs text-fg-secondary">
            {phase === 'planning' && 'Creating execution plan...'}
            {phase === 'executing' && `Step ${completedSteps + 1} of ${totalSteps}`}
            {phase === 'reflecting' && 'Evaluating results...'}
            {phase === 'completed' && 'All steps completed'}
            {phase === 'failed' && `Failed after ${completedSteps} steps`}
          </span>
        </div>
        {totalSteps > 0 && (
          <span className="text-xs text-fg-muted">
            {completedSteps}/{totalSteps} steps
          </span>
        )}
      </div>

      {totalSteps > 0 && (
        <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              hasFailures ? 'bg-red-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function PlanExecutionLog() {
  const {
    currentExecution,
    executionHistory,
    isOpen,
    isMinimized,
    expandedSections,
    autoScroll,
    toggleOpen,
    setMinimized,
    toggleSection,
    setAutoScroll,
  } = usePlanLogStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current && isOpen && !isMinimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentExecution?.events.length, autoScroll, isOpen, isMinimized]);

  // Don't render if no current execution and no history
  if (!currentExecution && executionHistory.length === 0) {
    return null;
  }

  const execution = currentExecution || executionHistory[0];
  const events = execution?.events || [];

  // Group events by phase
  const eventsByPhase = events.reduce((acc, event) => {
    if (!acc[event.phase]) {
      acc[event.phase] = [];
    }
    acc[event.phase].push(event);
    return acc;
  }, {} as Record<PlanPhase, PlanLogEvent[]>);

  const phases: PlanPhase[] = ['planning', 'executing', 'reflecting'];
  const totalDuration = execution?.endTime
    ? execution.endTime - execution.startTime
    : execution
    ? Date.now() - execution.startTime
    : 0;

  // Toggle button when closed
  if (!isOpen) {
    return (
      <button
        onClick={toggleOpen}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg shadow-lg hover:bg-bg-tertiary transition-colors"
      >
        <Terminal className="w-4 h-4 text-indigo-400" />
        <span className="text-sm text-fg-secondary">Plan Log</span>
        {currentExecution && (
          <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
        )}
      </button>
    );
  }

  return (
    <div
      className={`fixed z-50 bg-bg-primary border border-border-primary rounded-lg shadow-2xl transition-all ${
        isMinimized
          ? 'bottom-4 right-4 w-80'
          : 'bottom-4 right-4 w-[480px] max-h-[70vh]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary bg-bg-secondary/50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-fg-secondary">
            Plan Execution Log
          </span>
          {currentExecution && (
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* LLM Metrics Badge (compact) */}
          <LLMMetricsBadge />

          {/* Metrics toggle */}
          <button
            onClick={() => setShowMetrics(!showMetrics)}
            className={`p-1 rounded hover:bg-bg-tertiary transition-colors ${
              showMetrics ? 'text-purple-400' : 'text-fg-muted'
            }`}
            title={showMetrics ? 'Hide LLM metrics' : 'Show LLM metrics'}
          >
            <BarChart2 className="w-3.5 h-3.5" />
          </button>

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 rounded hover:bg-bg-tertiary transition-colors ${
              autoScroll ? 'text-blue-400' : 'text-fg-muted'
            }`}
            title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
          >
            {autoScroll ? (
              <Play className="w-3.5 h-3.5" />
            ) : (
              <Pause className="w-3.5 h-3.5" />
            )}
          </button>

          {/* History toggle */}
          {executionHistory.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-1 rounded hover:bg-bg-tertiary transition-colors ${
                showHistory ? 'text-blue-400' : 'text-fg-muted'
              }`}
              title="Show history"
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Minimize/Maximize */}
          <button
            onClick={() => setMinimized(!isMinimized)}
            className="p-1 rounded hover:bg-bg-tertiary text-fg-muted hover:text-fg-secondary transition-colors"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? (
              <Maximize2 className="w-3.5 h-3.5" />
            ) : (
              <Minimize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Close */}
          <button
            onClick={toggleOpen}
            className="p-1 rounded hover:bg-bg-tertiary text-fg-muted hover:text-fg-secondary transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Minimized view */}
      {isMinimized && execution && (
        <div className="px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-secondary truncate max-w-[200px]">
              {execution.task}
            </span>
            <span className="text-xs text-fg-muted">
              {formatDuration(totalDuration)}
            </span>
          </div>
          <ProgressBar phase={execution.phase} steps={execution.steps} />
        </div>
      )}

      {/* Full view */}
      {!isMinimized && (
        <div className="flex flex-col max-h-[calc(70vh-48px)]">
          {/* LLM Metrics Panel */}
          {showMetrics && (
            <div className="px-3 py-2 border-b border-border-primary/50 bg-bg-tertiary/20">
              <LLMMetricsDisplay compact={false} showLive={true} />
            </div>
          )}

          {/* Task info */}
          {execution && (
            <div className="px-3 py-2 border-b border-border-primary/50 bg-bg-secondary/30">
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-muted">Task:</span>
                <span className="text-xs text-fg-muted flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDuration(totalDuration)}
                </span>
              </div>
              <p className="text-sm text-fg-secondary mt-1 line-clamp-2">
                {execution.task}
              </p>
            </div>
          )}

          {/* Progress bar */}
          {execution && (
            <ProgressBar phase={execution.phase} steps={execution.steps} />
          )}

          {/* Events list */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overflow-x-hidden"
          >
            {phases.map((phase) => {
              const phaseEvents = eventsByPhase[phase] || [];
              if (phaseEvents.length === 0 && execution?.phase !== phase) return null;

              const isExpanded = expandedSections.has(phase);
              const isActive = execution?.phase === phase && !execution.endTime;

              return (
                <div key={phase}>
                  <PhaseHeader
                    phase={phase}
                    isExpanded={isExpanded}
                    onToggle={() => toggleSection(phase)}
                    eventCount={phaseEvents.length}
                    isActive={isActive}
                  />

                  {isExpanded && (
                    <div className="border-b border-border-primary/30">
                      {phaseEvents.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-fg-muted italic">
                          {isActive ? 'Waiting for events...' : 'No events'}
                        </div>
                      ) : (
                        phaseEvents.map((event) => (
                          <EventEntry key={event.id} event={event} />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Completion/Failure */}
            {execution?.endTime && (
              <div
                className={`px-3 py-3 flex items-center gap-2 ${
                  execution.success ? 'bg-green-500/10' : 'bg-red-500/10'
                }`}
              >
                {execution.success ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )}
                <span
                  className={`text-sm font-medium ${
                    execution.success ? 'text-green-300' : 'text-red-300'
                  }`}
                >
                  {execution.success
                    ? 'Execution completed successfully'
                    : `Execution failed: ${execution.error || 'Unknown error'}`}
                </span>
              </div>
            )}
          </div>

          {/* Footer stats */}
          {execution && (
            <div className="px-3 py-2 border-t border-border-primary/50 bg-bg-secondary/30 flex items-center justify-between text-xs text-fg-muted">
              <span>{execution.toolCallCount} tool calls</span>
              <span>{execution.filesCreated.length} files</span>
              <span>{events.length} events</span>
              {!showMetrics && <LLMMetricsDisplay compact={true} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
