'use client';

import { useEffect, useState } from 'react';
import { useWorkspace, AgentState } from '@/contexts/WorkspaceContext';

// ============================================================================
// AGENT CORTEX HEADER - The "HAL 9000 Eye" status indicator
// ============================================================================

const stateLabels: Record<AgentState, string> = {
  idle: 'Ready',
  thinking: 'Thinking...',
  executing: 'Executing...',
  success: 'Complete',
  error: 'Error',
};

const stateColors: Record<AgentState, { bg: string; glow: string; text: string }> = {
  idle: {
    bg: 'bg-indigo-500',
    glow: 'shadow-indigo-500/30',
    text: 'text-indigo-400',
  },
  thinking: {
    bg: 'bg-blue-500',
    glow: 'shadow-blue-500/50',
    text: 'text-blue-400',
  },
  executing: {
    bg: 'bg-amber-500',
    glow: 'shadow-amber-500/50',
    text: 'text-amber-400',
  },
  success: {
    bg: 'bg-green-500',
    glow: 'shadow-green-500/50',
    text: 'text-green-400',
  },
  error: {
    bg: 'bg-red-500',
    glow: 'shadow-red-500/50',
    text: 'text-red-400',
  },
};

export default function AgentCortexHeader() {
  const { state } = useWorkspace();
  const [pulsePhase, setPulsePhase] = useState(0);

  const isActive = state.agentState !== 'idle';
  const colors = stateColors[state.agentState];

  // Pulse animation for active states
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setPulsePhase((prev) => (prev + 1) % 100);
    }, 50);

    return () => clearInterval(interval);
  }, [isActive]);

  // Calculate dynamic scale based on pulse
  const pulseScale = isActive ? 1 + Math.sin(pulsePhase * 0.15) * 0.15 : 1;
  const glowOpacity = isActive ? 0.4 + Math.sin(pulsePhase * 0.1) * 0.3 : 0;

  return (
    <div className="flex items-center gap-3">
      {/* The Orb - HAL 9000 inspired */}
      <div className="relative flex items-center justify-center w-8 h-8">
        {/* Outer glow ring */}
        <div
          className={`absolute inset-0 rounded-full ${colors.bg} blur-md transition-all duration-300`}
          style={{
            opacity: glowOpacity,
            transform: `scale(${pulseScale * 1.2})`,
          }}
        />

        {/* Middle ring */}
        <div
          className={`absolute rounded-full border-2 ${colors.bg.replace('bg-', 'border-')} transition-all duration-300`}
          style={{
            width: 24,
            height: 24,
            opacity: isActive ? 0.6 : 0.3,
            transform: `scale(${pulseScale})`,
          }}
        />

        {/* Core orb */}
        <div
          className={`relative rounded-full ${colors.bg} transition-all duration-300 ${isActive ? `shadow-lg ${colors.glow}` : ''}`}
          style={{
            width: 12,
            height: 12,
            transform: `scale(${isActive ? pulseScale : 1})`,
          }}
        />

        {/* Orbiting particle (when active) */}
        {isActive && (
          <div
            className={`absolute w-1.5 h-1.5 rounded-full ${colors.bg}`}
            style={{
              animation: 'orbit 2s linear infinite',
            }}
          />
        )}

        <style jsx>{`
          @keyframes orbit {
            from { transform: rotate(0deg) translateX(14px) rotate(0deg); }
            to { transform: rotate(360deg) translateX(14px) rotate(-360deg); }
          }
        `}</style>
      </div>

      {/* Status text */}
      <div className="flex flex-col">
        <span className={`text-xs font-medium ${colors.text} transition-colors duration-300`}>
          {stateLabels[state.agentState]}
        </span>
        {state.taskType !== 'idle' && isActive && (
          <span className="text-[10px] text-fg-muted capitalize">
            {state.taskType}
          </span>
        )}
      </div>
    </div>
  );
}
