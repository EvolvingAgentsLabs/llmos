'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ============================================================================
// TYPES: Adaptive Workbench State Management
// ============================================================================

/** The current task type determines the optimal layout configuration */
export type TaskType =
  | 'idle'           // No active task
  | 'coding'         // Writing/editing code
  | 'debugging'      // Debugging with logs/traces
  | 'designing'      // 3D/visual design work
  | 'analyzing'      // Data analysis/visualization
  | 'chatting'       // Conversational interaction
  | 'exploring';     // File system exploration

/** Which panel currently has focus */
export type FocusedPanel =
  | 'sidebar'        // Left: File tree, sessions
  | 'chat'           // Center: Conversation with agent
  | 'context'        // Right: Artifacts, canvas, applets
  | 'command-palette'; // Command palette overlay

/** View mode for the right panel (The "Reality" panel) */
export type ContextViewMode =
  | 'artifacts'      // File/artifact viewer
  | 'canvas'         // 3D/visual canvas
  | 'applets'        // Generated applets
  | 'code-editor'    // Full code editing
  | 'split-view';    // Code + preview side-by-side

/** Agent state for visualization */
export type AgentState =
  | 'idle'
  | 'thinking'
  | 'executing'
  | 'error'
  | 'success';

/** Panel size configuration */
export interface PanelSizes {
  sidebar: number;    // Width in pixels (default: 288 = w-72)
  context: number;    // Width in pixels (default: 320 = w-80)
  chatMinWidth: number; // Minimum chat width (default: 400)
}

/** Collapsed state for panels */
export interface CollapsedPanels {
  sidebar: boolean;
  context: boolean;
}

/** Workspace preferences (persisted) */
export interface WorkspacePreferences {
  panelSizes: PanelSizes;
  collapsedPanels: CollapsedPanels;
  defaultContextView: ContextViewMode;
  showAgentVisualization: boolean;
  enableKeyboardShortcuts: boolean;
  autoSwitchContext: boolean; // Auto-switch context panel based on task
}

/** Full workspace state */
export interface WorkspaceState {
  // Current context
  taskType: TaskType;
  focusedPanel: FocusedPanel;
  contextViewMode: ContextViewMode;
  agentState: AgentState;

  // Command palette
  isCommandPaletteOpen: boolean;

  // Layout preferences
  preferences: WorkspacePreferences;

  // Active content
  activeFilePath: string | null;
  activeArtifactId: string | null;
  activeAppletId: string | null;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const defaultPanelSizes: PanelSizes = {
  sidebar: 288,
  context: 320,
  chatMinWidth: 400,
};

const defaultPreferences: WorkspacePreferences = {
  panelSizes: defaultPanelSizes,
  collapsedPanels: { sidebar: false, context: true }, // Right panel closed by default for clean start
  defaultContextView: 'artifacts',
  showAgentVisualization: true,
  enableKeyboardShortcuts: true,
  autoSwitchContext: true,
};

const defaultWorkspaceState: WorkspaceState = {
  taskType: 'idle',
  focusedPanel: 'chat',
  contextViewMode: 'artifacts',
  agentState: 'idle',
  isCommandPaletteOpen: false,
  preferences: defaultPreferences,
  activeFilePath: null,
  activeArtifactId: null,
  activeAppletId: null,
};

// ============================================================================
// CONTEXT
// ============================================================================

interface WorkspaceContextType {
  state: WorkspaceState;

  // Task & Focus
  setTaskType: (type: TaskType) => void;
  setFocusedPanel: (panel: FocusedPanel) => void;
  setAgentState: (state: AgentState) => void;

  // View modes
  setContextViewMode: (mode: ContextViewMode) => void;
  toggleContextView: () => void;

  // Command palette
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;

  // Panel management
  toggleSidebar: () => void;
  toggleContext: () => void;
  resizePanel: (panel: 'sidebar' | 'context', size: number) => void;
  resetLayout: () => void;

  // Active content
  setActiveFile: (path: string | null) => void;
  setActiveArtifact: (id: string | null) => void;
  setActiveApplet: (id: string | null) => void;

  // Preferences
  updatePreferences: (updates: Partial<WorkspacePreferences>) => void;

  // Smart layout (agent-driven)
  suggestLayout: (taskType: TaskType) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

// ============================================================================
// STORAGE
// ============================================================================

const WORKSPACE_PREFERENCES_KEY = 'llmos_workspace_preferences';

function loadPreferences(): WorkspacePreferences {
  if (typeof window === 'undefined') return defaultPreferences;

  try {
    const stored = localStorage.getItem(WORKSPACE_PREFERENCES_KEY);
    if (stored) {
      return { ...defaultPreferences, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to load workspace preferences:', e);
  }
  return defaultPreferences;
}

function savePreferences(preferences: WorkspacePreferences) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (e) {
    console.error('Failed to save workspace preferences:', e);
  }
}

// ============================================================================
// PROVIDER
// ============================================================================

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(() => ({
    ...defaultWorkspaceState,
    preferences: loadPreferences(),
  }));

  // Save preferences whenever they change
  useEffect(() => {
    savePreferences(state.preferences);
  }, [state.preferences]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!state.preferences.enableKeyboardShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Command Palette: Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setState(prev => ({ ...prev, isCommandPaletteOpen: !prev.isCommandPaletteOpen }));
        return;
      }

      // Toggle sidebar: Ctrl+B or Cmd+B
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setState(prev => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            collapsedPanels: {
              ...prev.preferences.collapsedPanels,
              sidebar: !prev.preferences.collapsedPanels.sidebar,
            },
          },
        }));
        return;
      }

      // Toggle context: Ctrl+Shift+B or Cmd+Shift+B
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        setState(prev => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            collapsedPanels: {
              ...prev.preferences.collapsedPanels,
              context: !prev.preferences.collapsedPanels.context,
            },
          },
        }));
        return;
      }

      // Focus navigation: Ctrl+1/2/3
      if ((e.ctrlKey || e.metaKey) && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        const panels: FocusedPanel[] = ['sidebar', 'chat', 'context'];
        const index = parseInt(e.key) - 1;
        setState(prev => ({ ...prev, focusedPanel: panels[index] }));
        return;
      }

      // Escape to close command palette
      if (e.key === 'Escape' && state.isCommandPaletteOpen) {
        setState(prev => ({ ...prev, isCommandPaletteOpen: false }));
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.preferences.enableKeyboardShortcuts, state.isCommandPaletteOpen]);

  // ========== Actions ==========

  const setTaskType = useCallback((type: TaskType) => {
    setState(prev => {
      const newState = { ...prev, taskType: type };

      // Auto-switch context view based on task type (if enabled)
      if (prev.preferences.autoSwitchContext) {
        switch (type) {
          case 'coding':
            newState.contextViewMode = 'code-editor';
            break;
          case 'designing':
            newState.contextViewMode = 'canvas';
            break;
          case 'analyzing':
            newState.contextViewMode = 'split-view';
            break;
          case 'exploring':
            newState.contextViewMode = 'artifacts';
            break;
        }
      }

      return newState;
    });
  }, []);

  const setFocusedPanel = useCallback((panel: FocusedPanel) => {
    setState(prev => ({ ...prev, focusedPanel: panel }));
  }, []);

  const setAgentState = useCallback((agentState: AgentState) => {
    setState(prev => ({ ...prev, agentState }));
  }, []);

  const setContextViewMode = useCallback((mode: ContextViewMode) => {
    setState(prev => ({ ...prev, contextViewMode: mode }));
  }, []);

  const toggleContextView = useCallback(() => {
    setState(prev => {
      const modes: ContextViewMode[] = ['artifacts', 'canvas', 'applets', 'code-editor', 'split-view'];
      const currentIndex = modes.indexOf(prev.contextViewMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      return { ...prev, contextViewMode: modes[nextIndex] };
    });
  }, []);

  const openCommandPalette = useCallback(() => {
    setState(prev => ({ ...prev, isCommandPaletteOpen: true, focusedPanel: 'command-palette' }));
  }, []);

  const closeCommandPalette = useCallback(() => {
    setState(prev => ({ ...prev, isCommandPaletteOpen: false, focusedPanel: 'chat' }));
  }, []);

  const toggleCommandPalette = useCallback(() => {
    setState(prev => ({
      ...prev,
      isCommandPaletteOpen: !prev.isCommandPaletteOpen,
      focusedPanel: !prev.isCommandPaletteOpen ? 'command-palette' : 'chat',
    }));
  }, []);

  const toggleSidebar = useCallback(() => {
    setState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        collapsedPanels: {
          ...prev.preferences.collapsedPanels,
          sidebar: !prev.preferences.collapsedPanels.sidebar,
        },
      },
    }));
  }, []);

  const toggleContext = useCallback(() => {
    setState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        collapsedPanels: {
          ...prev.preferences.collapsedPanels,
          context: !prev.preferences.collapsedPanels.context,
        },
      },
    }));
  }, []);

  const resizePanel = useCallback((panel: 'sidebar' | 'context', size: number) => {
    setState(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        panelSizes: {
          ...prev.preferences.panelSizes,
          [panel]: Math.max(200, Math.min(600, size)), // Clamp between 200-600px
        },
      },
    }));
  }, []);

  const resetLayout = useCallback(() => {
    setState(prev => ({
      ...prev,
      preferences: defaultPreferences,
    }));
  }, []);

  const setActiveFile = useCallback((path: string | null) => {
    setState(prev => ({ ...prev, activeFilePath: path }));
  }, []);

  const setActiveArtifact = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, activeArtifactId: id }));
  }, []);

  const setActiveApplet = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, activeAppletId: id }));
  }, []);

  const updatePreferences = useCallback((updates: Partial<WorkspacePreferences>) => {
    setState(prev => ({
      ...prev,
      preferences: { ...prev.preferences, ...updates },
    }));
  }, []);

  // Smart layout suggestion based on agent's task
  const suggestLayout = useCallback((taskType: TaskType) => {
    setState(prev => {
      const newState = { ...prev, taskType };

      switch (taskType) {
        case 'coding':
          // Collapse sidebar, expand context for code editing
          newState.contextViewMode = 'split-view';
          newState.preferences = {
            ...prev.preferences,
            collapsedPanels: { sidebar: true, context: false },
            panelSizes: { ...prev.preferences.panelSizes, context: 480 },
          };
          break;

        case 'designing':
          // Maximize canvas, minimize distractions
          newState.contextViewMode = 'canvas';
          newState.preferences = {
            ...prev.preferences,
            collapsedPanels: { sidebar: true, context: false },
            panelSizes: { ...prev.preferences.panelSizes, context: 560 },
          };
          break;

        case 'debugging':
          // Show all panels for debugging context
          newState.contextViewMode = 'split-view';
          newState.preferences = {
            ...prev.preferences,
            collapsedPanels: { sidebar: false, context: false },
          };
          break;

        case 'exploring':
          // Expand sidebar, show artifacts
          newState.contextViewMode = 'artifacts';
          newState.preferences = {
            ...prev.preferences,
            collapsedPanels: { sidebar: false, context: false },
            panelSizes: { ...prev.preferences.panelSizes, sidebar: 360 },
          };
          break;

        case 'chatting':
        case 'idle':
        default:
          // Balanced layout
          newState.preferences = {
            ...prev.preferences,
            collapsedPanels: { sidebar: false, context: false },
            panelSizes: defaultPanelSizes,
          };
          break;
      }

      return newState;
    });
  }, []);

  const value: WorkspaceContextType = {
    state,
    setTaskType,
    setFocusedPanel,
    setAgentState,
    setContextViewMode,
    toggleContextView,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    toggleSidebar,
    toggleContext,
    resizePanel,
    resetLayout,
    setActiveFile,
    setActiveArtifact,
    setActiveApplet,
    updatePreferences,
    suggestLayout,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
}

// ============================================================================
// UTILITY HOOK: Get layout classes based on workspace state
// ============================================================================

export function useWorkspaceLayout() {
  const { state } = useWorkspace();
  const { preferences } = state;

  return {
    sidebarWidth: preferences.collapsedPanels.sidebar ? 0 : preferences.panelSizes.sidebar,
    contextWidth: preferences.collapsedPanels.context ? 0 : preferences.panelSizes.context,
    isSidebarCollapsed: preferences.collapsedPanels.sidebar,
    isContextCollapsed: preferences.collapsedPanels.context,
    focusedPanel: state.focusedPanel,
    contextViewMode: state.contextViewMode,
    agentState: state.agentState,
  };
}
