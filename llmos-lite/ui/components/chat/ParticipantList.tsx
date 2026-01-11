'use client';

import { ChatParticipant } from '@/lib/chat/types';

interface ParticipantListProps {
  participants: ChatParticipant[];
  currentUserId?: string;
  compact?: boolean;
  onParticipantClick?: (participant: ChatParticipant) => void;
}

export default function ParticipantList({
  participants,
  currentUserId,
  compact = false,
  onParticipantClick,
}: ParticipantListProps) {
  const users = participants.filter((p) => p.type === 'user');
  const agents = participants.filter((p) => p.type === 'agent');
  const onlineCount = participants.filter((p) => p.online).length;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'user':
        return (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      case 'agent':
        return (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      default:
        return (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'proposer':
        return 'bg-accent-primary/20 text-accent-primary';
      case 'voter':
        return 'bg-accent-secondary/20 text-accent-secondary';
      case 'moderator':
        return 'bg-accent-warning/20 text-accent-warning';
      case 'observer':
        return 'bg-bg-tertiary text-fg-muted';
      default:
        return 'bg-bg-tertiary text-fg-muted';
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">
          {participants.slice(0, 5).map((participant) => (
            <div
              key={participant.id}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-bg-primary ${
                participant.type === 'agent'
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'bg-accent-secondary/20 text-accent-secondary'
              } ${!participant.online ? 'opacity-50' : ''}`}
              title={`${participant.name}${participant.id === currentUserId ? ' (you)' : ''}`}
            >
              {participant.name.charAt(0).toUpperCase()}
            </div>
          ))}
          {participants.length > 5 && (
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-bg-primary bg-bg-tertiary text-fg-muted">
              +{participants.length - 5}
            </div>
          )}
        </div>
        <span className="text-[10px] text-fg-muted">
          {onlineCount} online
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-fg-secondary uppercase tracking-wider">
          Participants
        </h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-success/20 text-accent-success">
          {onlineCount} online
        </span>
      </div>

      {/* Users */}
      {users.length > 0 && (
        <div>
          <h4 className="text-[10px] text-fg-muted mb-1.5 flex items-center gap-1">
            {getTypeIcon('user')}
            <span>Users ({users.length})</span>
          </h4>
          <div className="space-y-1">
            {users.map((participant) => (
              <ParticipantRow
                key={participant.id}
                participant={participant}
                isCurrentUser={participant.id === currentUserId}
                onClick={onParticipantClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Agents */}
      {agents.length > 0 && (
        <div>
          <h4 className="text-[10px] text-fg-muted mb-1.5 flex items-center gap-1">
            {getTypeIcon('agent')}
            <span>Agents ({agents.length})</span>
          </h4>
          <div className="space-y-1">
            {agents.map((participant) => (
              <ParticipantRow
                key={participant.id}
                participant={participant}
                isCurrentUser={false}
                onClick={onParticipantClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ParticipantRowProps {
  participant: ChatParticipant;
  isCurrentUser: boolean;
  onClick?: (participant: ChatParticipant) => void;
}

function ParticipantRow({ participant, isCurrentUser, onClick }: ParticipantRowProps) {
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'proposer':
        return 'text-accent-primary';
      case 'voter':
        return 'text-accent-secondary';
      case 'moderator':
        return 'text-accent-warning';
      default:
        return 'text-fg-muted';
    }
  };

  return (
    <button
      onClick={() => onClick?.(participant)}
      className={`w-full flex items-center gap-2 p-1.5 rounded-lg transition-colors ${
        onClick ? 'hover:bg-bg-elevated cursor-pointer' : 'cursor-default'
      } ${!participant.online ? 'opacity-50' : ''}`}
    >
      {/* Avatar */}
      <div className="relative">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          participant.type === 'agent'
            ? 'bg-accent-primary/20 text-accent-primary'
            : 'bg-accent-secondary/20 text-accent-secondary'
        }`}>
          {participant.avatar ? (
            <img
              src={participant.avatar}
              alt={participant.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            participant.name.charAt(0).toUpperCase()
          )}
        </div>
        {/* Online indicator */}
        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-bg-primary ${
          participant.online ? 'bg-accent-success' : 'bg-fg-muted'
        }`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-fg-primary truncate">
            {participant.name}
          </span>
          {isCurrentUser && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-accent-secondary/20 text-accent-secondary">
              you
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] ${getRoleColor(participant.role)}`}>
            {participant.role}
          </span>
          {participant.capabilities && participant.capabilities.length > 0 && (
            <span className="text-[9px] text-fg-muted truncate">
              · {participant.capabilities.slice(0, 2).join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* Type indicator */}
      <div className={`w-4 h-4 rounded flex items-center justify-center ${
        participant.type === 'agent'
          ? 'bg-accent-primary/10 text-accent-primary'
          : 'bg-accent-secondary/10 text-accent-secondary'
      }`}>
        {participant.type === 'agent' ? (
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ) : (
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        )}
      </div>
    </button>
  );
}
