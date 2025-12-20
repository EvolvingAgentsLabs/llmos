'use client';

import { useState } from 'react';
import { SessionType } from '@/contexts/SessionContext';

interface NewSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    type: SessionType;
    goal?: string;
  }) => void;
  defaultVolume: 'system' | 'user' | 'team';
}

export default function NewSessionDialog({
  isOpen,
  onClose,
  onCreate,
  defaultVolume,
}: NewSessionDialogProps) {
  const [name, setName] = useState('');
  const [sessionType, setSessionType] = useState<SessionType>(
    defaultVolume === 'team' ? 'team' : 'user'
  );
  const [goal, setGoal] = useState('');

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!name.trim()) return;

    onCreate({
      name: name.trim(),
      type: sessionType,
      goal: goal.trim() || undefined,
    });

    // Reset form
    setName('');
    setGoal('');
    setSessionType(defaultVolume === 'team' ? 'team' : 'user');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleCreate();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="glass-panel w-full max-w-lg mx-4"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-primary">
          <h2 className="text-lg font-semibold text-fg-primary">
            Create New Session
          </h2>
          <p className="text-sm text-fg-tertiary mt-1">
            Start a new chat session with artifact generation
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Session Name */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Session Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., VQE Optimization, 3D Molecule Viz"
              className="input-primary w-full"
              autoFocus
            />
          </div>

          {/* Session Type */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-3">
              Session Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* User Session */}
              <button
                onClick={() => setSessionType('user')}
                className={`
                  relative p-4 rounded-lg border-2 transition-all duration-200
                  ${
                    sessionType === 'user'
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-border-primary hover:border-border-secondary bg-bg-secondary'
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`
                    w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5
                    ${
                      sessionType === 'user'
                        ? 'border-accent-primary'
                        : 'border-border-secondary'
                    }
                  `}
                  >
                    {sessionType === 'user' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-accent-primary" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-fg-primary text-sm mb-1">
                      User Session
                    </div>
                    <div className="text-xs text-fg-tertiary">
                      Private workspace
                      <br />
                      Saved to: user/
                    </div>
                  </div>
                </div>
              </button>

              {/* Team Session */}
              <button
                onClick={() => setSessionType('team')}
                className={`
                  relative p-4 rounded-lg border-2 transition-all duration-200
                  ${
                    sessionType === 'team'
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-border-primary hover:border-border-secondary bg-bg-secondary'
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`
                    w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5
                    ${
                      sessionType === 'team'
                        ? 'border-accent-primary'
                        : 'border-border-secondary'
                    }
                  `}
                  >
                    {sessionType === 'team' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-accent-primary" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-fg-primary text-sm mb-1">
                      Team Session
                    </div>
                    <div className="text-xs text-fg-tertiary">
                      Shared workspace
                      <br />
                      Saved to: team/
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Goal (Optional) */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Goal <span className="text-fg-tertiary font-normal">(optional)</span>
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe what you want to accomplish in this session"
              className="input-primary w-full resize-none"
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-primary flex items-center justify-between">
          <div className="text-xs text-fg-tertiary">
            {sessionType === 'user' ? '🔒 Private' : '👥 Shared with team'}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="btn-secondary px-4 py-2"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Session
            </button>
          </div>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="px-6 pb-4 text-xs text-fg-tertiary text-center">
          <kbd className="kbd">⌘</kbd> + <kbd className="kbd">Enter</kbd> to create
          {' · '}
          <kbd className="kbd">Esc</kbd> to cancel
        </div>
      </div>
    </div>
  );
}
