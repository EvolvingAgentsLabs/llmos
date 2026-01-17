'use client';

import { useEffect, useState, useMemo } from 'react';
import { useWorkspace, AgentState } from '@/contexts/WorkspaceContext';

// ============================================================================
// TYPES
// ============================================================================

export interface AgentActivity {
  type: 'thinking' | 'tool-call' | 'memory-query' | 'execution' | 'completed' | 'context-management' | 'evolution';
  agent?: string;
  action?: string;
  tool?: string;
  details?: string;
  timestamp: number;
}

interface AgentCortexProps {
  activities: AgentActivity[];
  isActive: boolean;
  compact?: boolean;
}

// ============================================================================
// NEURAL NODE VISUALIZATION
// ============================================================================

function NeuralNode({ delay, size, color, isActive }: {
  delay: number;
  size: number;
  color: string;
  isActive: boolean;
}) {
  return (
    <div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        animation: isActive ? `neural-pulse 2s ease-in-out infinite` : 'none',
        animationDelay: `${delay}s`,
        opacity: isActive ? 1 : 0.3,
        filter: isActive ? 'blur(0px)' : 'blur(1px)',
        transition: 'all 0.5s ease',
      }}
    />
  );
}

// ============================================================================
// CORTEX VISUALIZATION (The "HAL Eye" inspired visual)
// ============================================================================

function CortexVisualization({
  agentState,
  pulsePhase,
}: {
  agentState: AgentState;
  pulsePhase: number;
}) {
  // State-based color mapping (J.A.R.V.I.S. inspired)
  const stateColors: Record<AgentState, { primary: string; glow: string }> = {
    idle: { primary: 'rgb(99, 102, 241)', glow: 'rgba(99, 102, 241, 0.3)' },       // Indigo
    thinking: { primary: 'rgb(59, 130, 246)', glow: 'rgba(59, 130, 246, 0.4)' },   // Blue (pulsing)
    executing: { primary: 'rgb(245, 158, 11)', glow: 'rgba(245, 158, 11, 0.4)' },  // Amber
    error: { primary: 'rgb(239, 68, 68)', glow: 'rgba(239, 68, 68, 0.5)' },        // Red
    success: { primary: 'rgb(34, 197, 94)', glow: 'rgba(34, 197, 94, 0.4)' },      // Green
  };

  const { primary, glow } = stateColors[agentState];
  const isActive = agentState !== 'idle';

  // Calculate dynamic ring sizes based on pulse
  const outerRingScale = 1 + Math.sin(pulsePhase * 0.1) * 0.1;
  const innerRingScale = 1 + Math.cos(pulsePhase * 0.15) * 0.08;

  return (
    <div className="relative flex items-center justify-center w-16 h-16">
      {/* Outer glow ring */}
      <div
        className="absolute rounded-full transition-all duration-500"
        style={{
          width: 56,
          height: 56,
          transform: `scale(${isActive ? outerRingScale : 0.9})`,
          background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
          opacity: isActive ? 0.8 : 0.3,
        }}
      />

      {/* Middle ring */}
      <div
        className="absolute rounded-full border-2 transition-all duration-300"
        style={{
          width: 40,
          height: 40,
          borderColor: primary,
          transform: `scale(${innerRingScale})`,
          opacity: isActive ? 1 : 0.5,
        }}
      />

      {/* Core */}
      <div
        className="absolute rounded-full transition-all duration-300"
        style={{
          width: 20,
          height: 20,
          backgroundColor: primary,
          boxShadow: isActive ? `0 0 20px ${glow}, 0 0 40px ${glow}` : 'none',
          animation: isActive ? 'pulse-smooth 2s ease-in-out infinite' : 'none',
        }}
      />

      {/* Orbiting particles (when active) */}
      {isActive && (
        <>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                backgroundColor: primary,
                animation: `orbit-${i} 3s linear infinite`,
                animationDelay: `${i * 0.5}s`,
                opacity: 0.7,
              }}
            />
          ))}
        </>
      )}

      {/* Inline CSS for orbiting animation */}
      <style jsx>{`
        @keyframes orbit-0 {
          from { transform: rotate(0deg) translateX(24px) rotate(0deg); }
          to { transform: rotate(360deg) translateX(24px) rotate(-360deg); }
        }
        @keyframes orbit-1 {
          from { transform: rotate(120deg) translateX(24px) rotate(-120deg); }
          to { transform: rotate(480deg) translateX(24px) rotate(-480deg); }
        }
        @keyframes orbit-2 {
          from { transform: rotate(240deg) translateX(24px) rotate(-240deg); }
          to { transform: rotate(600deg) translateX(24px) rotate(-600deg); }
        }
        @keyframes neural-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AgentCortex({
  activities,
  isActive,
  compact = false,
}: AgentCortexProps) {
  const { state, setAgentState } = useWorkspace();
  const [pulsePhase, setPulsePhase] = useState(0);
  const [displayedActivities, setDisplayedActivities] = useState<AgentActivity[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Derive agent state from activities
  useEffect(() => {
    if (!isActive) {
      setAgentState('idle');
      return;
    }

    const lastActivity = activities[activities.length - 1];
    if (!lastActivity) {
      setAgentState('thinking');
      return;
    }

    switch (lastActivity.type) {
      case 'thinking':
        setAgentState('thinking');
        break;
      case 'execution':
      case 'tool-call':
        setAgentState('executing');
        break;
      case 'completed':
        setAgentState('success');
        break;
      default:
        setAgentState('thinking');
    }
  }, [activities, isActive, setAgentState]);

  // Pulse animation
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setPulsePhase((prev) => (prev + 1) % 100);
    }, 50);

    return () => clearInterval(interval);
  }, [isActive]);

  // Show all activities
  useEffect(() => {
    if (activities.length === 0) {
      setDisplayedActivities([]);
      return;
    }
    setDisplayedActivities(activities);
  }, [activities]);

  // Get current thinking activity for prominent display
  const currentThinkingActivity = useMemo(() => {
    return displayedActivities
      .filter(a => a.type === 'thinking')
      .slice(-1)[0];
  }, [displayedActivities]);

  // Activity icon helper
  const getActivityIcon = (type: AgentActivity['type']) => {
    const iconClasses = "w-4 h-4";
    switch (type) {
      case 'thinking':
        return <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse-smooth" />;
      case 'tool-call':
        return (
          <svg className={`${iconClasses} text-accent-info`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          </svg>
        );
      case 'execution':
        return (
          <svg className={`${iconClasses} text-accent-warning`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case 'completed':
        return (
          <svg className={`${iconClasses} text-accent-success`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      default:
        return <div className="w-2 h-2 rounded-full bg-fg-muted" />;
    }
  };

  if (!isActive && displayedActivities.length === 0) {
    return null;
  }

  // Compact mode: Just the visualization
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-2 rounded-lg bg-bg-secondary/50">
        <CortexVisualization agentState={state.agentState} pulsePhase={pulsePhase} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-fg-primary">
            {isActive ? 'SystemAgent Active' : 'Complete'}
          </div>
          {currentThinkingActivity && (
            <div className="text-xs text-fg-secondary truncate">
              {currentThinkingActivity.action}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full mode: Visualization + Activity stream
  return (
    <div className="relative my-4 rounded-xl border border-border-primary bg-bg-secondary overflow-hidden shadow-sm">
      {/* Flowing gradient background */}
      {isActive && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              background: `linear-gradient(${90 + pulsePhase * 3.6}deg,
                rgb(var(--accent-primary)) 0%,
                rgb(var(--accent-secondary)) 25%,
                rgb(var(--accent-info)) 50%,
                rgb(var(--accent-secondary)) 75%,
                rgb(var(--accent-primary)) 100%)`,
            }}
          />
        </div>
      )}

      {/* Header with cortex visualization */}
      <div className="relative z-10 flex items-center gap-4 p-4 border-b border-border-primary/50">
        <CortexVisualization agentState={state.agentState} pulsePhase={pulsePhase} />

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-fg-primary font-semibold">
              {isActive ? 'SystemAgent Active' : 'SystemAgent Complete'}
            </span>
            {isActive && (
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-accent-primary"
                    style={{
                      animation: 'pulse-smooth 1.5s ease-in-out infinite',
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Current step */}
          {currentThinkingActivity && isActive && (
            <div className="text-sm text-fg-secondary mt-1">
              {currentThinkingActivity.action}
            </div>
          )}
        </div>

        {/* Expand/collapse toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 text-fg-muted hover:text-fg-primary hover:bg-bg-tertiary rounded-lg transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Activity stream (collapsible) */}
      {isExpanded && (
        <div className="relative z-10 p-4 space-y-2 max-h-[250px] overflow-y-auto">
          {displayedActivities.length === 0 && isActive && (
            <div className="text-fg-tertiary text-xs animate-pulse-smooth">
              Initializing agent...
            </div>
          )}

          {displayedActivities.map((activity, index) => (
            <div
              key={`${activity.timestamp}-${index}`}
              className="flex items-start gap-2.5 transition-all duration-300 animate-fade-in"
            >
              <div className="w-5 h-5 flex items-center justify-center mt-0.5">
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  {activity.agent && (
                    <span className="text-fg-primary font-medium text-sm">
                      {activity.agent}
                    </span>
                  )}
                  {activity.action && (
                    <span className="text-sm text-fg-secondary">
                      {activity.action}
                    </span>
                  )}
                </div>
                {activity.tool && (
                  <div className="text-xs text-fg-tertiary mt-0.5">
                    Tool: <span className="font-mono text-accent-info">{activity.tool}</span>
                  </div>
                )}
                {activity.details && (
                  <div className="text-xs text-fg-secondary mt-0.5 truncate">
                    {activity.details}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-fg-muted whitespace-nowrap">
                {new Date(activity.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Quick stats footer */}
      {!isExpanded && displayedActivities.length > 0 && (
        <div className="relative z-10 px-4 py-2 border-t border-border-primary/50 flex items-center gap-4 text-xs text-fg-muted">
          <span>{displayedActivities.length} activities</span>
          <span className="text-fg-tertiary">|</span>
          <span>Click to expand</span>
        </div>
      )}
    </div>
  );
}
