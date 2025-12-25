'use client';

import { useEffect, useState } from 'react';

export interface AgentActivity {
  type: 'thinking' | 'tool-call' | 'memory-query' | 'execution' | 'completed' | 'context-management';
  agent?: string;
  action?: string;
  tool?: string;
  details?: string;
  timestamp: number;
}

interface AgentActivityDisplayProps {
  activities: AgentActivity[];
  isActive: boolean;
}

export default function AgentActivityDisplay({
  activities,
  isActive,
}: AgentActivityDisplayProps) {
  const [displayedActivities, setDisplayedActivities] = useState<AgentActivity[]>([]);
  const [pulsePhase, setPulsePhase] = useState(0);

  // Anthropic-style flowing pulse animation
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const interval = setInterval(() => {
      setPulsePhase((prev) => (prev + 1) % 100);
    }, 50);

    return () => clearInterval(interval);
  }, [isActive]);

  // Animate activity display - show ALL activities for plan visibility
  useEffect(() => {
    if (activities.length === 0) {
      setDisplayedActivities([]);
      return;
    }

    // Show all activities to display the full plan
    setDisplayedActivities(activities);
  }, [activities]);

  if (!isActive && displayedActivities.length === 0) {
    return null;
  }

  const getActivityIcon = (type: AgentActivity['type']) => {
    switch (type) {
      case 'thinking':
        return (
          <div className="w-5 h-5 rounded-full bg-accent-primary/20 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-accent-primary animate-pulse-smooth" />
          </div>
        );
      case 'tool-call':
        return (
          <div className="w-5 h-5 rounded-full bg-accent-info/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-accent-info" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        );
      case 'memory-query':
        return (
          <div className="w-5 h-5 rounded-full bg-accent-secondary/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-accent-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        );
      case 'execution':
        return (
          <div className="w-5 h-5 rounded-full bg-accent-warning/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-accent-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        );
      case 'completed':
        return (
          <div className="w-5 h-5 rounded-full bg-accent-success/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-accent-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'context-management':
        return (
          <div className="w-5 h-5 rounded-full bg-accent-primary/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-5 h-5 rounded-full bg-fg-muted/20 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-fg-muted" />
          </div>
        );
    }
  };

  const getActivityColor = (type: AgentActivity['type']) => {
    switch (type) {
      case 'thinking':
        return 'text-accent-primary';
      case 'tool-call':
        return 'text-accent-info';
      case 'memory-query':
        return 'text-accent-secondary';
      case 'execution':
        return 'text-accent-warning';
      case 'completed':
        return 'text-accent-success';
      case 'context-management':
        return 'text-accent-primary';
      default:
        return 'text-fg-tertiary';
    }
  };

  // Get current planning step for prominent display
  const currentThinkingActivity = displayedActivities
    .filter(a => a.type === 'thinking')
    .slice(-1)[0];

  return (
    <div className="relative my-4 rounded-xl border border-border-primary bg-bg-secondary p-4 text-sm overflow-hidden shadow-sm">
      {/* Anthropic-style flowing gradient background */}
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
          {/* Flowing wave lines */}
          <div className="absolute inset-0 flex items-center justify-center">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="absolute h-[1px] bg-gradient-to-r from-transparent via-accent-primary/30 to-transparent"
                style={{
                  width: '200%',
                  left: '-50%',
                  top: `${30 + i * 20}%`,
                  transform: `translateX(${Math.sin((pulsePhase + i * 30) * 0.1) * 10}%)`,
                  opacity: 0.3 - i * 0.08,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Activity header */}
      <div className="relative z-10 mb-3 flex items-center gap-3 border-b border-border-primary pb-3">
        <div className="flex items-center gap-2">
          {isActive && (
            <div className="relative">
              <div className="h-2.5 w-2.5 rounded-full bg-accent-primary animate-pulse-smooth" />
              <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-accent-primary/50 animate-ping" />
            </div>
          )}
          <span className="text-fg-primary font-semibold">
            {isActive ? 'SystemAgent Active' : 'SystemAgent Complete'}
          </span>
        </div>
        {isActive && (
          <div className="ml-auto flex items-center gap-2">
            <div className="flex gap-1">
              {[...Array(3)].map((_, i) => (
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
            <span className="text-xs text-fg-tertiary">Processing</span>
          </div>
        )}
      </div>

      {/* Current Plan Step - Prominent Display */}
      {currentThinkingActivity && isActive && (
        <div className="relative z-10 mb-4 p-3 rounded-lg bg-accent-primary/5 border border-accent-primary/20">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-4 h-4 rounded-full bg-accent-primary/20 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse-smooth" />
            </div>
            <span className="text-xs font-medium text-accent-primary uppercase tracking-wide">
              Current Step
            </span>
          </div>
          <div className="text-fg-primary font-medium">
            {currentThinkingActivity.action}
          </div>
          {currentThinkingActivity.details && (
            <div className="text-xs text-fg-secondary mt-1">
              {currentThinkingActivity.details}
            </div>
          )}
        </div>
      )}

      {/* Activity stream */}
      <div className="relative z-10 space-y-2 max-h-[200px] overflow-y-auto">
        {displayedActivities.length === 0 && isActive && (
          <div className="text-fg-tertiary text-xs animate-pulse-smooth">
            Initializing agent...
          </div>
        )}

        {displayedActivities.map((activity, index) => (
          <div
            key={`${activity.timestamp}-${index}`}
            className="flex items-start gap-2.5 transition-all duration-300 ease-out animate-fade-in"
          >
            {getActivityIcon(activity.type)}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                {activity.agent && (
                  <span className="text-fg-primary font-medium text-sm">
                    {activity.agent}
                  </span>
                )}
                {activity.action && (
                  <span className={`text-sm ${getActivityColor(activity.type)}`}>
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
    </div>
  );
}
