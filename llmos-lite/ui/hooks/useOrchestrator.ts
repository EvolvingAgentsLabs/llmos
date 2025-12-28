'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useWorkspace, AgentState, TaskType, ContextViewMode } from '@/contexts/WorkspaceContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useApplets } from '@/contexts/AppletContext';

// ============================================================================
// TYPES
// ============================================================================

export interface AgentOutput {
  type: 'text' | 'code' | 'file' | 'applet' | 'error' | 'tool-result';
  content: string;
  metadata?: {
    language?: string;
    filePath?: string;
    fileType?: string;
    appletId?: string;
    toolName?: string;
  };
}

export interface OrchestratorState {
  // Workspace state
  isProcessing: boolean;
  agentState: AgentState;
  taskType: TaskType;
  contextViewMode: ContextViewMode;

  // Session state
  activeSessionId: string | null;
  hasMessages: boolean;

  // Applet state
  hasActiveApplets: boolean;
  activeAppletCount: number;
}

// ============================================================================
// FILE TYPE DETECTION
// ============================================================================

function detectFileType(filePath: string): 'code' | 'image' | 'document' | 'applet' | 'unknown' {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const codeExts = ['py', 'js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'yaml', 'yml', 'sh', 'bash'];
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'];
  const documentExts = ['md', 'txt', 'pdf', 'doc', 'docx'];

  if (filePath.endsWith('.app')) return 'applet';
  if (codeExts.includes(ext)) return 'code';
  if (imageExts.includes(ext)) return 'image';
  if (documentExts.includes(ext)) return 'document';

  return 'unknown';
}

function inferTaskType(output: AgentOutput): TaskType {
  if (output.type === 'error') return 'debugging';
  if (output.type === 'applet') return 'designing';
  if (output.type === 'code') return 'coding';
  if (output.metadata?.toolName?.includes('file') || output.metadata?.toolName?.includes('vfs')) return 'exploring';
  if (output.metadata?.language) return 'coding';

  return 'chatting';
}

function inferViewMode(output: AgentOutput): ContextViewMode | null {
  // Applet output -> show applets view
  if (output.type === 'applet') return 'applets';

  // File output -> determine by file type
  if (output.type === 'file' && output.metadata?.filePath) {
    const fileType = detectFileType(output.metadata.filePath);

    switch (fileType) {
      case 'code':
        return 'split-view';
      case 'image':
        return 'canvas';
      case 'applet':
        return 'applets';
      default:
        return 'artifacts';
    }
  }

  // Code output without file -> show split view for editing
  if (output.type === 'code') return 'split-view';

  return null; // No view change needed
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * useOrchestrator - Coordinates WorkspaceContext, SessionContext, and AppletContext
 *
 * This hook provides a unified interface for:
 * - Handling agent outputs and auto-switching views
 * - Managing agent state transitions
 * - Coordinating between chat, workspace, and applets
 * - Providing derived state for UI components
 */
export function useOrchestrator() {
  const workspace = useWorkspace();
  const session = useSessionContext();
  const applets = useApplets();

  const lastOutputRef = useRef<AgentOutput | null>(null);

  // Get the current session object from the ID
  const currentSession = session.sessions.find(s => s.id === session.activeSession);

  // Derived state
  const orchestratorState: OrchestratorState = {
    isProcessing: workspace.state.agentState === 'thinking' || workspace.state.agentState === 'executing',
    agentState: workspace.state.agentState,
    taskType: workspace.state.taskType,
    contextViewMode: workspace.state.contextViewMode,
    activeSessionId: session.activeSession,
    hasMessages: (currentSession?.messages.length || 0) > 0,
    hasActiveApplets: applets.activeApplets.length > 0,
    activeAppletCount: applets.activeApplets.length,
  };

  /**
   * Handle agent output - updates workspace state and switches views as needed
   */
  const handleAgentOutput = useCallback((output: AgentOutput) => {
    lastOutputRef.current = output;

    // Infer task type from output
    const inferredTask = inferTaskType(output);
    workspace.setTaskType(inferredTask);

    // Update agent state based on output type
    if (output.type === 'error') {
      workspace.setAgentState('error');
    }

    // Auto-switch view if appropriate
    const suggestedView = inferViewMode(output);
    if (suggestedView) {
      workspace.setContextViewMode(suggestedView);
    }

    // If there's a file, set it as active
    if (output.metadata?.filePath) {
      workspace.setActiveFile(output.metadata.filePath);
    }

    // If it's an applet, create it in the applet store
    if (output.type === 'applet' && output.metadata?.appletId) {
      // Applet creation is handled by AppletContext callback
      // Just ensure we're showing the applets view
      workspace.setContextViewMode('applets');
    }
  }, [workspace]);

  /**
   * Start agent processing - sets thinking state
   */
  const startProcessing = useCallback((type: TaskType = 'chatting') => {
    workspace.setAgentState('thinking');
    workspace.setTaskType(type);
  }, [workspace]);

  /**
   * Mark execution phase - agent is executing tools/code
   */
  const startExecution = useCallback(() => {
    workspace.setAgentState('executing');
  }, [workspace]);

  /**
   * Complete processing - sets success state
   */
  const completeProcessing = useCallback(() => {
    workspace.setAgentState('success');

    // Reset to idle after a delay
    setTimeout(() => {
      workspace.setAgentState('idle');
    }, 2000);
  }, [workspace]);

  /**
   * Handle error - sets error state
   */
  const handleError = useCallback((error?: Error | string) => {
    workspace.setAgentState('error');
    console.error('[Orchestrator] Agent error:', error);

    // Reset to idle after showing error
    setTimeout(() => {
      workspace.setAgentState('idle');
    }, 3000);
  }, [workspace]);

  /**
   * Navigate to file - opens file in appropriate view
   */
  const navigateToFile = useCallback((filePath: string) => {
    const fileType = detectFileType(filePath);

    workspace.setActiveFile(filePath);

    switch (fileType) {
      case 'code':
        workspace.setContextViewMode('split-view');
        break;
      case 'image':
        workspace.setContextViewMode('canvas');
        break;
      case 'applet':
        workspace.setContextViewMode('applets');
        break;
      default:
        workspace.setContextViewMode('artifacts');
    }
  }, [workspace]);

  /**
   * Create a new session and make it active
   */
  const createSession = useCallback((name?: string) => {
    const newSession = session.addSession({
      name: name || `Session ${Date.now()}`,
      type: 'user',
      status: 'temporal',
      volume: 'user',
    });
    session.setActiveSession(newSession.id);
    return newSession;
  }, [session]);

  /**
   * Switch to a different context view
   */
  const switchView = useCallback((mode: ContextViewMode) => {
    workspace.setContextViewMode(mode);
    workspace.setFocusedPanel('context');
  }, [workspace]);

  /**
   * Suggest layout based on current activity
   */
  const autoLayout = useCallback(() => {
    if (orchestratorState.hasActiveApplets) {
      workspace.suggestLayout('designing');
    } else if (workspace.state.activeFilePath) {
      workspace.suggestLayout('coding');
    } else {
      workspace.suggestLayout('chatting');
    }
  }, [workspace, orchestratorState.hasActiveApplets]);

  // Auto-adjust layout when significant state changes occur
  useEffect(() => {
    // Don't auto-layout if user manually adjusted panels
    if (workspace.state.preferences.autoSwitchViews) {
      // Could add more sophisticated auto-layout logic here
    }
  }, [workspace.state.preferences.autoSwitchViews, orchestratorState.hasActiveApplets]);

  return {
    // State
    state: orchestratorState,
    workspace: workspace.state,
    activeSessionId: session.activeSession,
    activeSession: currentSession,
    sessions: session.sessions,
    applets: applets.activeApplets,

    // Agent lifecycle
    startProcessing,
    startExecution,
    completeProcessing,
    handleError,
    handleAgentOutput,

    // Navigation
    navigateToFile,
    switchView,

    // Sessions
    createSession,
    setActiveSession: session.setActiveSession,

    // Layout
    autoLayout,
    suggestLayout: workspace.suggestLayout,
    resetLayout: workspace.resetLayout,

    // Panel controls
    toggleSidebar: workspace.toggleSidebar,
    toggleContext: workspace.toggleContext,
    setFocusedPanel: workspace.setFocusedPanel,

    // Command palette
    openCommandPalette: workspace.openCommandPalette,
    closeCommandPalette: workspace.closeCommandPalette,

    // Applets
    createApplet: applets.createApplet,
    closeApplet: applets.closeApplet,

    // Raw contexts (for advanced usage)
    _workspace: workspace,
    _session: session,
    _applets: applets,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { AgentState, TaskType, ContextViewMode } from '@/contexts/WorkspaceContext';
export default useOrchestrator;
