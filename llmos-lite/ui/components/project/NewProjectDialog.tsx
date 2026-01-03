'use client';

import { useState, useEffect, useRef } from 'react';
import { ProjectType } from '@/contexts/ProjectContext';
import { Users, User, FolderKanban, X } from 'lucide-react';

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
  const [isVisible, setIsVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle animation on open/close
  useEffect(() => {
    if (isOpen) {
      // Small delay for animation
      requestAnimationFrame(() => setIsVisible(true));
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 150);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

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
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

      {/* Dialog - Material Design inspired with elevation and smooth transitions */}
      <div
        className={`relative w-full max-w-lg mx-4 bg-bg-primary rounded-2xl shadow-2xl border border-white/10 overflow-hidden transition-all duration-300 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header with gradient accent */}
        <div className="relative px-6 py-5 border-b border-border-primary bg-gradient-to-r from-purple-500/10 via-violet-500/5 to-transparent">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center text-fg-tertiary hover:text-fg-primary hover:bg-white/10 transition-all duration-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <FolderKanban className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-fg-primary">
                Create New Project
              </h2>
              <p className="text-sm text-fg-tertiary">
                Start a new workspace with memory tracking
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Project Name - Material Design text field style */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-fg-secondary">
              Project Name
            </label>
            <div className="relative group">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., VQE Optimization, 3D Molecule Viz"
                className="w-full px-4 py-3 bg-bg-secondary border-2 border-border-primary rounded-xl text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/10 transition-all duration-200"
              />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/20 to-violet-500/20 opacity-0 group-focus-within:opacity-100 transition-opacity duration-200 -z-10 blur-xl" />
            </div>
          </div>

          {/* Project Type - Material Design card selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-fg-secondary">
              Project Type
            </label>
            <div className="grid grid-cols-2 gap-4">
              {/* User Project Card */}
              <button
                type="button"
                onClick={() => setProjectType('user')}
                className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left group ${
                  projectType === 'user'
                    ? 'border-purple-500/60 bg-purple-500/10 shadow-lg shadow-purple-500/10'
                    : 'border-border-primary bg-bg-secondary hover:border-border-secondary hover:bg-bg-tertiary'
                }`}
              >
                {/* Selection indicator */}
                <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                  projectType === 'user'
                    ? 'border-purple-500 bg-purple-500'
                    : 'border-border-secondary bg-transparent'
                }`}>
                  {projectType === 'user' && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M3.707 5.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L5 6.586 3.707 5.293z" />
                    </svg>
                  )}
                </div>

                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-all duration-200 ${
                  projectType === 'user'
                    ? 'bg-purple-500/20'
                    : 'bg-bg-tertiary group-hover:bg-bg-elevated'
                }`}>
                  <User className={`w-5 h-5 ${projectType === 'user' ? 'text-purple-400' : 'text-fg-tertiary'}`} />
                </div>
                <div className="font-medium text-fg-primary text-sm mb-1">
                  User Project
                </div>
                <div className="text-xs text-fg-tertiary">
                  Private workspace
                </div>
                <div className="text-[10px] text-fg-muted mt-1 font-mono">
                  user/projects/
                </div>
              </button>

              {/* Team Project Card */}
              <button
                type="button"
                onClick={() => setProjectType('team')}
                className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left group ${
                  projectType === 'team'
                    ? 'border-blue-500/60 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                    : 'border-border-primary bg-bg-secondary hover:border-border-secondary hover:bg-bg-tertiary'
                }`}
              >
                {/* Selection indicator */}
                <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                  projectType === 'team'
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-border-secondary bg-transparent'
                }`}>
                  {projectType === 'team' && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M3.707 5.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L5 6.586 3.707 5.293z" />
                    </svg>
                  )}
                </div>

                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-all duration-200 ${
                  projectType === 'team'
                    ? 'bg-blue-500/20'
                    : 'bg-bg-tertiary group-hover:bg-bg-elevated'
                }`}>
                  <Users className={`w-5 h-5 ${projectType === 'team' ? 'text-blue-400' : 'text-fg-tertiary'}`} />
                </div>
                <div className="font-medium text-fg-primary text-sm mb-1">
                  Team Project
                </div>
                <div className="text-xs text-fg-tertiary">
                  Shared workspace
                </div>
                <div className="text-[10px] text-fg-muted mt-1 font-mono">
                  team/projects/
                </div>
              </button>
            </div>
          </div>

          {/* Goal - Material Design textarea */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-fg-secondary">
              Goal <span className="text-fg-tertiary font-normal">(optional)</span>
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe what you want to accomplish in this project"
              className="w-full px-4 py-3 bg-bg-secondary border-2 border-border-primary rounded-xl text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/10 transition-all duration-200 resize-none"
              rows={3}
            />
          </div>
        </div>

        {/* Footer with Material Design button styles */}
        <div className="px-6 py-4 border-t border-border-primary bg-bg-secondary/50 flex items-center justify-between">
          <div className="text-xs text-fg-tertiary flex items-center gap-2">
            {projectType === 'user' ? (
              <>
                <User className="w-3 h-3" />
                <span>Private project</span>
              </>
            ) : (
              <>
                <Users className="w-3 h-3" />
                <span>Shared with team</span>
              </>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium rounded-xl text-fg-secondary bg-transparent border border-border-primary hover:bg-bg-tertiary hover:border-border-secondary active:scale-[0.98] transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!name.trim()}
              className="px-5 py-2.5 text-sm font-medium rounded-xl text-white bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.98] transition-all duration-200"
            >
              Create Project
            </button>
          </div>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="px-6 pb-4 bg-bg-secondary/50 text-xs text-fg-muted text-center flex items-center justify-center gap-2">
          <kbd className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-primary font-mono text-[10px]">⌘</kbd>
          <span>+</span>
          <kbd className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-primary font-mono text-[10px]">Enter</kbd>
          <span className="mx-1">to create</span>
          <span className="text-fg-muted/50">·</span>
          <kbd className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-primary font-mono text-[10px]">Esc</kbd>
          <span>to cancel</span>
        </div>
      </div>
    </div>
  );
}
