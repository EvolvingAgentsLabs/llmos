'use client';

import { SessionStatus, SessionType } from '@/contexts/SessionContext';

interface SessionStatusBadgeProps {
  status: SessionStatus;
  type: SessionType;
  className?: string;
  showType?: boolean;
  showStatus?: boolean;
}

export default function SessionStatusBadge({
  status,
  type,
  className = '',
  showType = true,
  showStatus = true,
}: SessionStatusBadgeProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Type Badge */}
      {showType && (
        <span
          className={`
          inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
          ${
            type === 'user'
              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
          }
        `}
        >
          {type === 'user' ? '🔒 User' : '👥 Team'}
        </span>
      )}

      {/* Status Badge */}
      {showStatus && (
        <span
          className={`
          inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
          ${
            status === 'temporal'
              ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
              : 'bg-green-500/10 text-green-400 border border-green-500/20'
          }
        `}
        >
          {status === 'temporal' ? '⚠️ Temporal' : '✓ Saved'}
        </span>
      )}
    </div>
  );
}
