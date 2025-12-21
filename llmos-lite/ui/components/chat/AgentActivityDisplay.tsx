'use client';

import { useEffect, useState } from 'react';

export interface AgentActivity {
  type: 'thinking' | 'tool-call' | 'memory-query' | 'execution' | 'completed';
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
  const [matrixChars, setMatrixChars] = useState<string[]>([]);
  const [displayedActivities, setDisplayedActivities] = useState<AgentActivity[]>([]);

  // Matrix rain effect characters
  const matrixCharacters = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

  // Generate random matrix characters
  useEffect(() => {
    if (!isActive) {
      setMatrixChars([]);
      return;
    }

    const interval = setInterval(() => {
      const chars: string[] = [];
      for (let i = 0; i < 15; i++) {
        chars.push(matrixCharacters[Math.floor(Math.random() * matrixCharacters.length)]);
      }
      setMatrixChars(chars);
    }, 100);

    return () => clearInterval(interval);
  }, [isActive]);

  // Animate activity display
  useEffect(() => {
    if (activities.length === 0) {
      setDisplayedActivities([]);
      return;
    }

    // Add new activities with animation
    const lastActivity = activities[activities.length - 1];
    setDisplayedActivities((prev) => {
      const newActivities = [...prev, lastActivity];
      // Keep last 5 activities
      return newActivities.slice(-5);
    });
  }, [activities]);

  if (!isActive && displayedActivities.length === 0) {
    return null;
  }

  const getActivityIcon = (type: AgentActivity['type']) => {
    switch (type) {
      case 'thinking':
        return '🧠';
      case 'tool-call':
        return '🔧';
      case 'memory-query':
        return '📖';
      case 'execution':
        return '⚡';
      case 'completed':
        return '✅';
      default:
        return '◉';
    }
  };

  const getActivityColor = (type: AgentActivity['type']) => {
    switch (type) {
      case 'thinking':
        return 'text-blue-400';
      case 'tool-call':
        return 'text-green-400';
      case 'memory-query':
        return 'text-purple-400';
      case 'execution':
        return 'text-yellow-400';
      case 'completed':
        return 'text-emerald-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="relative my-4 rounded-lg border border-green-500/30 bg-black/90 p-4 font-mono text-sm overflow-hidden">
      {/* Matrix rain background */}
      {isActive && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
          <div className="flex gap-3 text-green-400">
            {matrixChars.map((char, i) => (
              <div
                key={i}
                className="text-lg animate-bounce"
                style={{
                  animationDuration: `${1 + Math.random()}s`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationIterationCount: 'infinite',
                }}
              >
                {char}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity header */}
      <div className="relative z-10 mb-3 flex items-center gap-2 border-b border-green-500/30 pb-2">
        <div className="flex items-center gap-2">
          {isActive && (
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          )}
          <span className="text-green-400 font-semibold">
            {isActive ? 'SystemAgent Active' : 'SystemAgent Complete'}
          </span>
        </div>
        {isActive && (
          <div className="ml-auto text-xs text-green-400/60 animate-pulse">
            Processing...
          </div>
        )}
      </div>

      {/* Activity stream */}
      <div className="relative z-10 space-y-2">
        {displayedActivities.length === 0 && isActive && (
          <div className="text-green-400/60 text-xs animate-pulse">
            Initializing agent...
          </div>
        )}

        {displayedActivities.map((activity, index) => (
          <div
            key={`${activity.timestamp}-${index}`}
            className="flex items-start gap-2 transition-all duration-300 ease-out"
          >
            <span className="text-lg">{getActivityIcon(activity.type)}</span>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                {activity.agent && (
                  <span className="text-cyan-400 font-semibold">
                    {activity.agent}
                  </span>
                )}
                {activity.action && (
                  <span className={`${getActivityColor(activity.type)}`}>
                    {activity.action}
                  </span>
                )}
              </div>
              {activity.tool && (
                <div className="text-xs text-yellow-400 mt-0.5">
                  Tool: <span className="font-mono">{activity.tool}</span>
                </div>
              )}
              {activity.details && (
                <div className="text-xs text-gray-400 mt-0.5">
                  {activity.details}
                </div>
              )}
            </div>
            <span className="text-[10px] text-gray-600">
              {new Date(activity.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
