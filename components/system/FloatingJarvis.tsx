'use client';

/**
 * FloatingAssistant - Persistent AI avatar like Siri on macOS
 *
 * A floating avatar that:
 * - Shows in a corner of the screen
 * - Displays current agent state (idle, thinking, executing)
 * - Can be minimized to a small orb
 * - Expands on hover/click to show status
 */

import { useState, useEffect, useRef } from 'react';
import { useWorkspace, AgentState, ActivityLogEntry } from '@/contexts/WorkspaceContext';
import { MessageCircle, X, Minimize2, ChevronDown, ChevronUp, Activity } from 'lucide-react';

// ============================================================================
// STATE CONFIGURATIONS
// ============================================================================

interface StateConfig {
  color: string;
  bgColor: string;
  label: string;
  pulseSpeed: string;
}

const stateConfigs: Record<AgentState, StateConfig> = {
  idle: {
    color: '#3B82F6',
    bgColor: 'from-blue-500 to-blue-600',
    label: 'Ready',
    pulseSpeed: '3s',
  },
  thinking: {
    color: '#8B5CF6',
    bgColor: 'from-purple-500 to-purple-600',
    label: 'Thinking...',
    pulseSpeed: '1s',
  },
  executing: {
    color: '#F59E0B',
    bgColor: 'from-amber-500 to-orange-600',
    label: 'Working...',
    pulseSpeed: '0.5s',
  },
  success: {
    color: '#10B981',
    bgColor: 'from-emerald-500 to-green-600',
    label: 'Done!',
    pulseSpeed: '2s',
  },
  error: {
    color: '#EF4444',
    bgColor: 'from-red-500 to-red-600',
    label: 'Error',
    pulseSpeed: '0.3s',
  },
};

// ============================================================================
// CSS ORB COMPONENT - Simple animated orb without Three.js
// ============================================================================

function CSSOrb({ config, size = 'md' }: { config: StateConfig; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-20 h-20',
  };

  return (
    <div className={`relative ${sizes[size]}`}>
      {/* Outer glow */}
      <div
        className={`absolute inset-0 rounded-full bg-gradient-to-br ${config.bgColor} opacity-30 blur-md animate-pulse`}
        style={{ animationDuration: config.pulseSpeed }}
      />
      {/* Middle ring */}
      <div
        className={`absolute inset-1 rounded-full border-2 opacity-50 animate-spin`}
        style={{ borderColor: config.color, animationDuration: '8s' }}
      />
      {/* Core orb */}
      <div
        className={`absolute inset-2 rounded-full bg-gradient-to-br ${config.bgColor} shadow-lg animate-pulse`}
        style={{ animationDuration: config.pulseSpeed }}
      />
      {/* Inner highlight */}
      <div className="absolute inset-3 rounded-full bg-white/20" />
    </div>
  );
}

// ============================================================================
// FLOATING AI ASSISTANT COMPONENT
// ============================================================================

interface FloatingJarvisProps {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  onChatClick?: () => void;
}

export default function FloatingJarvis({
  position = 'bottom-right',
  onChatClick
}: FloatingJarvisProps) {
  const { state } = useWorkspace();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const activityLogRef = useRef<HTMLDivElement>(null);

  const config = stateConfigs[state.agentState];
  const { currentActivity, currentDetail, activityLog } = state;

  // Position classes
  const positionClasses = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
    'top-right': 'top-20 right-6',
    'top-left': 'top-20 left-6',
  };

  // Auto-expand when agent is active
  useEffect(() => {
    if (state.agentState === 'thinking' || state.agentState === 'executing') {
      setIsExpanded(true);
    } else if (state.agentState === 'success' || state.agentState === 'error') {
      // Keep expanded briefly after completion
      const timer = setTimeout(() => setIsExpanded(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [state.agentState]);

  // Auto-scroll activity log
  useEffect(() => {
    if (activityLogRef.current && showActivityLog) {
      activityLogRef.current.scrollTop = activityLogRef.current.scrollHeight;
    }
  }, [activityLog, showActivityLog]);

  // Get activity type styles
  const getActivityTypeStyle = (type: ActivityLogEntry['type']) => {
    switch (type) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'action': return 'text-amber-400';
      case 'detail': return 'text-blue-400';
      default: return 'text-fg-muted';
    }
  };

  const getActivityIcon = (type: ActivityLogEntry['type']) => {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'action': return '▸';
      case 'detail': return '  ';
      default: return '•';
    }
  };

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className={`fixed ${positionClasses[position]} z-50
                   w-12 h-12 rounded-full
                   bg-bg-elevated/90 backdrop-blur-xl
                   border border-white/20 shadow-lg shadow-black/30
                   flex items-center justify-center
                   hover:scale-110 transition-transform duration-200`}
        style={{ boxShadow: `0 0 20px ${config.color}40` }}
      >
        <div
          className="w-4 h-4 rounded-full animate-pulse"
          style={{ backgroundColor: config.color }}
        />
      </button>
    );
  }

  return (
    <div
      className={`fixed ${positionClasses[position]} z-50
                 transition-all duration-300 ease-out`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main Container */}
      <div
        className={`relative rounded-2xl overflow-hidden
                   bg-bg-elevated/90 backdrop-blur-xl
                   border border-white/20 shadow-2xl shadow-black/40
                   transition-all duration-300
                   ${isExpanded ? (showActivityLog ? 'w-80 h-96' : 'w-64 h-72') : 'w-16 h-16'}`}
        style={{
          boxShadow: `0 0 30px ${config.color}30, 0 8px 32px rgba(0,0,0,0.4)`
        }}
      >
        {/* Collapsed View - Just the orb */}
        {!isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            className="w-full h-full flex items-center justify-center
                      hover:scale-105 transition-transform"
          >
            <CSSOrb config={config} size="md" />
          </button>
        )}

        {/* Expanded View */}
        {isExpanded && (
          <div className="flex flex-col h-full">
            {/* Header with controls */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: config.color }}
                />
                <span className="text-xs font-medium text-fg-primary">AI</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsMinimized(true)}
                  className="p-1 rounded hover:bg-white/10 text-fg-muted hover:text-fg-primary transition-colors"
                  title="Minimize"
                >
                  <Minimize2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 rounded hover:bg-white/10 text-fg-muted hover:text-fg-primary transition-colors"
                  title="Collapse"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Avatar - CSS animated orb */}
            <div className="flex-1 flex items-center justify-center bg-bg-primary/30">
              <CSSOrb config={config} size="lg" />
            </div>

            {/* Current Activity - Claude Code Style */}
            {(currentActivity || currentDetail) && (
              <div className="px-3 py-2 border-t border-white/10 bg-bg-primary/50">
                <div className="flex items-start gap-2">
                  <Activity className="w-3 h-3 mt-0.5 text-amber-400 flex-shrink-0 animate-pulse" />
                  <div className="min-w-0 flex-1">
                    {currentActivity && (
                      <p className="text-xs text-fg-primary font-medium truncate">
                        {currentActivity}
                      </p>
                    )}
                    {currentDetail && (
                      <p className="text-[10px] text-fg-muted font-mono truncate mt-0.5">
                        {currentDetail}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Activity Log Toggle */}
            {activityLog.length > 0 && (
              <button
                onClick={() => setShowActivityLog(!showActivityLog)}
                className="w-full px-3 py-1.5 flex items-center justify-between
                          border-t border-white/10 bg-bg-secondary/30
                          hover:bg-white/5 transition-colors text-[10px] text-fg-muted"
              >
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" />
                  Activity Log ({activityLog.length})
                </span>
                {showActivityLog ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </button>
            )}

            {/* Activity Log - Scrollable */}
            {showActivityLog && activityLog.length > 0 && (
              <div
                ref={activityLogRef}
                className="flex-1 overflow-y-auto px-3 py-2 bg-bg-primary/30 border-t border-white/5
                          font-mono text-[10px] space-y-1 max-h-32"
              >
                {activityLog.slice(-20).map((entry) => (
                  <div key={entry.id} className="flex gap-1.5">
                    <span className={`flex-shrink-0 ${getActivityTypeStyle(entry.type)}`}>
                      {getActivityIcon(entry.type)}
                    </span>
                    <div className="min-w-0">
                      <span className={getActivityTypeStyle(entry.type)}>{entry.message}</span>
                      {entry.detail && (
                        <span className="text-fg-tertiary ml-1 truncate block">{entry.detail}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Status */}
            <div className="px-4 py-3 border-t border-white/10 bg-bg-secondary/50 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-fg-primary">{config.label}</p>
                  <p className="text-[10px] text-fg-muted">
                    {state.taskType && state.taskType !== 'idle' ? `Mode: ${state.taskType}` : 'Awaiting commands'}
                  </p>
                </div>
                {onChatClick && (
                  <button
                    onClick={onChatClick}
                    className="p-2 rounded-lg bg-accent-primary/20 hover:bg-accent-primary/30
                             text-accent-primary transition-colors"
                    title="Open Chat"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick status indicator (when collapsed but hovered) */}
      {!isExpanded && isHovered && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2
                       px-2 py-1 rounded-lg
                       bg-bg-elevated/95 backdrop-blur-xl
                       border border-white/20 shadow-lg
                       text-[10px] text-fg-secondary whitespace-nowrap
                       animate-fade-in">
          {config.label}
        </div>
      )}
    </div>
  );
}
