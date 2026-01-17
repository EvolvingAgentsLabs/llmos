// Adaptive Workbench - Main exports
// The "J.A.R.V.I.S.-like" interface for LLMOS

export { default as AdaptiveLayout } from './AdaptiveLayout';
export { default as CommandPalette } from './CommandPalette';
export { default as ViewManager, ViewLoader, EmptyView } from './ViewManager';
export { default as AgentCortex } from './AgentCortex';
export { default as ResizablePanel, PanelDivider } from './ResizablePanel';

// Re-export context
export {
  WorkspaceProvider,
  useWorkspace,
  useWorkspaceLayout,
} from '@/contexts/WorkspaceContext';

export type {
  TaskType,
  FocusedPanel,
  ContextViewMode,
  AgentState,
  WorkspaceState,
  WorkspacePreferences,
} from '@/contexts/WorkspaceContext';

// Re-export activity types
export type { AgentActivity } from './AgentCortex';
