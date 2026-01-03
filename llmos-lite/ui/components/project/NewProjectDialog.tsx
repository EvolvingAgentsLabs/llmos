'use client';

import { useState } from 'react';
import { ProjectType } from '@/contexts/ProjectContext';

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    type: ProjectType;
    goal?: string;
  }) => void;
  defaultVolume: 'system' | 'user' | 'team';
}

export default function NewProjectDialog({
  isOpen,
  onClose,
  onCreate,
  defaultVolume,
}: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>(
    defaultVolume === 'team' ? 'team' : 'user'
  );
  const [goal, setGoal] = useState('');

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!name.trim()) return;

    onCreate({
      name: name.trim(),
      type: projectType,
      goal: goal.trim() || undefined,
    });

    // Reset form
    setName('');
    setGoal('');
    setProjectType(defaultVolume === 'team' ? 'team' : 'user');
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
            Create New Project
          </h2>
          <p className="text-sm text-fg-tertiary mt-1">
            Start a new project with artifact generation and memory tracking
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Project Name */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Project Name
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

          {/* Project Type */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-3">
              Project Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* User Project */}
              <button
                onClick={() => setProjectType('user')}
                className={`
                  relative p-4 rounded-lg border-2 transition-all duration-200
                  ${
                    projectType === 'user'
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
                      projectType === 'user'
                        ? 'border-accent-primary'
                        : 'border-border-secondary'
                    }
                  `}
                  >
                    {projectType === 'user' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-accent-primary" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-fg-primary text-sm mb-1">
                      User Project
                    </div>
                    <div className="text-xs text-fg-tertiary">
                      Private workspace
                      <br />
                      Saved to: user/projects/
                    </div>
                  </div>
                </div>
              </button>

              {/* Team Project */}
              <button
                onClick={() => setProjectType('team')}
                className={`
                  relative p-4 rounded-lg border-2 transition-all duration-200
                  ${
                    projectType === 'team'
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
                      projectType === 'team'
                        ? 'border-accent-primary'
                        : 'border-border-secondary'
                    }
                  `}
                  >
                    {projectType === 'team' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-accent-primary" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-fg-primary text-sm mb-1">
                      Team Project
                    </div>
                    <div className="text-xs text-fg-tertiary">
                      Shared workspace
                      <br />
                      Saved to: team/projects/
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
              placeholder="Describe what you want to accomplish in this project"
              className="input-primary w-full resize-none"
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-primary flex items-center justify-between">
          <div className="text-xs text-fg-tertiary">
            {projectType === 'user' ? 'Private project' : 'Shared with team'}
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
              Create Project
            </button>
          </div>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="px-6 pb-4 text-xs text-fg-tertiary text-center">
          <kbd className="kbd">Cmd</kbd> + <kbd className="kbd">Enter</kbd> to create
          {' · '}
          <kbd className="kbd">Esc</kbd> to cancel
        </div>
      </div>
    </div>
  );
}
