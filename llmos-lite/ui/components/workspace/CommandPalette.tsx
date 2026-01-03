'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useWorkspace, ContextViewMode } from '@/contexts/WorkspaceContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import { getVFS } from '@/lib/virtual-fs';

// ============================================================================
// TYPES
// ============================================================================

interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  category: 'navigation' | 'view' | 'action' | 'session' | 'file' | 'settings';
  shortcut?: string;
  action: () => void;
}

// ============================================================================
// ICONS
// ============================================================================

const icons = {
  search: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  sidebar: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  panel: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
  ),
  code: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
  cube: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  grid: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  document: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  folder: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  plus: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  ),
  chat: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  settings: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  refresh: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  lightning: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
};

// ============================================================================
// COMPONENT
// ============================================================================

// File type to icon mapping
function getFileIcon(path: string): React.ReactNode {
  if (path.endsWith('.py')) return icons.code;
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return icons.code;
  if (path.endsWith('.js') || path.endsWith('.jsx')) return icons.code;
  if (path.endsWith('.md')) return icons.document;
  if (path.endsWith('.json')) return icons.settings;
  if (path.match(/\.(png|jpg|jpeg|svg|gif)$/i)) return icons.cube;
  return icons.document;
}

interface VFSFile {
  path: string;
  name: string;
  volume: 'system' | 'team' | 'user';
}

export default function CommandPalette() {
  const {
    state,
    closeCommandPalette,
    toggleSidebar,
    toggleContext,
    setContextViewMode,
    resetLayout,
    suggestLayout,
    setFocusedPanel,
    setActiveFile,
  } = useWorkspace();
  const { projects, addProject, setActiveProject } = useProjectContext();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [vfsFiles, setVfsFiles] = useState<VFSFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load files from VFS when opened
  useEffect(() => {
    if (state.isCommandPaletteOpen) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);

      // Load files from VFS
      const loadFiles = () => {
        try {
          const vfs = getVFS();
          const volumes: Array<'system' | 'team' | 'user'> = ['system', 'user'];
          const allFiles: VFSFile[] = [];

          for (const volume of volumes) {
            // Recursively collect files (limited depth)
            const collectFiles = (dir: string, depth: number = 0): void => {
              if (depth > 2) return; // Limit depth to avoid too many files

              const fullPath = dir ? `${volume}/${dir}` : volume;
              const result = vfs.listDirectory(fullPath);

              // Add files
              for (const file of result.files) {
                allFiles.push({
                  path: file.path,
                  name: file.path.split('/').pop() || file.path,
                  volume,
                });
              }

              // Recurse into directories
              if (depth < 2) {
                for (const subdir of result.directories) {
                  const subdirName = subdir.split('/').pop() || subdir;
                  const subdirPath = dir ? `${dir}/${subdirName}` : subdirName;
                  collectFiles(subdirPath, depth + 1);
                }
              }
            };

            collectFiles('');
          }

          setVfsFiles(allFiles.slice(0, 50)); // Limit to 50 files
        } catch (error) {
          console.error('[CommandPalette] Failed to load VFS files:', error);
        }
      };

      loadFiles();
    }
  }, [state.isCommandPaletteOpen]);

  // Build commands list
  const commands: Command[] = useMemo(() => [
    // Navigation
    {
      id: 'nav-sidebar',
      label: 'Focus Sidebar',
      description: 'Navigate to the file tree',
      icon: icons.sidebar,
      category: 'navigation',
      shortcut: '⌘1',
      action: () => { setFocusedPanel('sidebar'); closeCommandPalette(); },
    },
    {
      id: 'nav-chat',
      label: 'Focus Chat',
      description: 'Navigate to the conversation',
      icon: icons.chat,
      category: 'navigation',
      shortcut: '⌘2',
      action: () => { setFocusedPanel('chat'); closeCommandPalette(); },
    },
    {
      id: 'nav-context',
      label: 'Focus Context',
      description: 'Navigate to artifacts panel',
      icon: icons.panel,
      category: 'navigation',
      shortcut: '⌘3',
      action: () => { setFocusedPanel('context'); closeCommandPalette(); },
    },

    // View controls
    {
      id: 'view-toggle-sidebar',
      label: 'Toggle Sidebar',
      description: 'Show or hide the sidebar',
      icon: icons.sidebar,
      category: 'view',
      shortcut: '⌘B',
      action: () => { toggleSidebar(); closeCommandPalette(); },
    },
    {
      id: 'view-toggle-context',
      label: 'Toggle Context Panel',
      description: 'Show or hide the context panel',
      icon: icons.panel,
      category: 'view',
      shortcut: '⌘⇧B',
      action: () => { toggleContext(); closeCommandPalette(); },
    },
    {
      id: 'view-artifacts',
      label: 'Show Artifacts View',
      description: 'Display files and artifacts',
      icon: icons.document,
      category: 'view',
      action: () => { setContextViewMode('artifacts'); closeCommandPalette(); },
    },
    {
      id: 'view-canvas',
      label: 'Show Canvas View',
      description: 'Display 3D canvas',
      icon: icons.cube,
      category: 'view',
      action: () => { setContextViewMode('canvas'); closeCommandPalette(); },
    },
    {
      id: 'view-applets',
      label: 'Show Applets View',
      description: 'Display generated applets',
      icon: icons.grid,
      category: 'view',
      action: () => { setContextViewMode('applets'); closeCommandPalette(); },
    },
    {
      id: 'view-code-editor',
      label: 'Show Code Editor',
      description: 'Full screen code editing',
      icon: icons.code,
      category: 'view',
      action: () => { setContextViewMode('code-editor'); closeCommandPalette(); },
    },
    {
      id: 'view-split',
      label: 'Show Split View',
      description: 'Code + preview side by side',
      icon: icons.panel,
      category: 'view',
      action: () => { setContextViewMode('split-view'); closeCommandPalette(); },
    },

    // Layout presets
    {
      id: 'layout-coding',
      label: 'Coding Layout',
      description: 'Optimized for code editing',
      icon: icons.code,
      category: 'action',
      action: () => { suggestLayout('coding'); closeCommandPalette(); },
    },
    {
      id: 'layout-designing',
      label: 'Design Layout',
      description: 'Optimized for 3D/visual design',
      icon: icons.cube,
      category: 'action',
      action: () => { suggestLayout('designing'); closeCommandPalette(); },
    },
    {
      id: 'layout-exploring',
      label: 'Explorer Layout',
      description: 'Optimized for file exploration',
      icon: icons.folder,
      category: 'action',
      action: () => { suggestLayout('exploring'); closeCommandPalette(); },
    },
    {
      id: 'layout-reset',
      label: 'Reset Layout',
      description: 'Restore default layout',
      icon: icons.refresh,
      category: 'action',
      action: () => { resetLayout(); closeCommandPalette(); },
    },

    // Sessions
    {
      id: 'session-new',
      label: 'New Project',
      description: 'Create a new project',
      icon: icons.plus,
      category: 'session',
      action: () => {
        const newProject = addProject({
          name: `Project ${Date.now()}`,
          type: 'user',
          status: 'temporal',
          volume: 'user',
        });
        setActiveProject(newProject.id);
        closeCommandPalette();
      },
    },
    // Add recent projects
    ...projects.slice(0, 5).map((project, index) => ({
      id: `project-${project.id}`,
      label: project.name,
      description: `${project.messages.length} messages · ${project.timeAgo}`,
      icon: icons.chat,
      category: 'session' as const,
      action: () => { setActiveProject(project.id); closeCommandPalette(); },
    })),

    // Actions
    {
      id: 'action-quick-run',
      label: 'Quick Run',
      description: 'Execute current code',
      icon: icons.lightning,
      category: 'action',
      shortcut: '⌘↵',
      action: () => { closeCommandPalette(); /* TODO: Trigger code execution */ },
    },

    // Dynamic file commands from VFS
    ...vfsFiles.map((file) => ({
      id: `file-${file.volume}-${file.path}`,
      label: file.name,
      description: `${file.volume}:/${file.path}`,
      icon: getFileIcon(file.path),
      category: 'file' as const,
      action: () => {
        // Open file in appropriate view
        setActiveFile?.(file.path);
        if (file.path.match(/\.(py|js|ts|tsx|jsx)$/i)) {
          setContextViewMode('split-view');
        } else if (file.path.match(/\.(png|jpg|jpeg|svg|gif)$/i)) {
          setContextViewMode('canvas');
        } else {
          setContextViewMode('artifacts');
        }
        closeCommandPalette();
      },
    })),
  ], [projects, vfsFiles, toggleSidebar, toggleContext, setContextViewMode, resetLayout, suggestLayout, setFocusedPanel, setActiveFile, addProject, setActiveProject, closeCommandPalette]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const lowerQuery = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(lowerQuery) ||
      cmd.description?.toLowerCase().includes(lowerQuery) ||
      cmd.category.toLowerCase().includes(lowerQuery)
    );
  }, [commands, query]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    view: 'View',
    action: 'Actions',
    session: 'Sessions',
    file: 'Files',
    settings: 'Settings',
  };

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeCommandPalette();
        break;
    }
  }, [filteredCommands, selectedIndex, closeCommandPalette]);

  // Scroll selected item into view
  useEffect(() => {
    const selected = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!state.isCommandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bg-primary/80 backdrop-blur-sm"
        onClick={closeCommandPalette}
      />

      {/* Palette */}
      <div className="relative w-full max-w-xl mx-4 bg-bg-elevated border border-border-primary rounded-xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-primary">
          <span className="text-fg-muted">{icons.search}</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-fg-primary placeholder-fg-muted outline-none text-sm"
          />
          <kbd className="px-2 py-0.5 text-xs text-fg-muted bg-bg-tertiary rounded">ESC</kbd>
        </div>

        {/* Commands list */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto scrollbar-thin">
          {Object.entries(groupedCommands).map(([category, cmds]) => (
            <div key={category}>
              <div className="px-4 py-2 text-xs font-medium text-fg-tertiary uppercase tracking-wider bg-bg-secondary/50">
                {categoryLabels[category] || category}
              </div>
              {cmds.map((cmd) => {
                const globalIndex = filteredCommands.indexOf(cmd);
                const isSelected = globalIndex === selectedIndex;

                return (
                  <button
                    key={cmd.id}
                    data-index={globalIndex}
                    onClick={cmd.action}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-accent-primary/10 text-accent-primary'
                        : 'text-fg-primary hover:bg-bg-tertiary'
                    }`}
                  >
                    <span className={isSelected ? 'text-accent-primary' : 'text-fg-muted'}>
                      {cmd.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{cmd.label}</div>
                      {cmd.description && (
                        <div className="text-xs text-fg-tertiary truncate">{cmd.description}</div>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <kbd className="px-2 py-0.5 text-xs text-fg-muted bg-bg-tertiary rounded">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {filteredCommands.length === 0 && (
            <div className="px-4 py-8 text-center text-fg-muted text-sm">
              No commands found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border-primary bg-bg-secondary/30 flex items-center gap-4 text-xs text-fg-muted">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-bg-tertiary rounded">↑</kbd>
            <kbd className="px-1.5 py-0.5 bg-bg-tertiary rounded">↓</kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-bg-tertiary rounded">↵</kbd>
            to select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-bg-tertiary rounded">ESC</kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  );
}
