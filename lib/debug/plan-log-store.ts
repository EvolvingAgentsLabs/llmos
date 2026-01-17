/**
 * Plan Execution Log Store
 *
 * Tracks plan execution events with a Vercel-style build log structure.
 * Shows plan phases, steps, tool calls, and errors in a collapsible tree.
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export type PlanPhase = 'idle' | 'planning' | 'executing' | 'reflecting' | 'completed' | 'failed';

export type LogEventType =
  | 'plan_start'
  | 'plan_created'
  | 'phase_start'
  | 'phase_end'
  | 'step_start'
  | 'step_complete'
  | 'step_failed'
  | 'tool_call'
  | 'tool_result'
  | 'agent_start'
  | 'agent_complete'
  | 'agent_error'
  | 'memory_query'
  | 'memory_result'
  | 'error'
  | 'warning'
  | 'info'
  | 'success';

export interface PlanStep {
  id: string;
  description: string;
  toolHint?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  error?: string;
  result?: string;
}

export interface PlanLogEvent {
  id: string;
  timestamp: number;
  type: LogEventType;
  phase: PlanPhase;
  message: string;
  details?: Record<string, unknown>;
  stepId?: string;
  toolName?: string;
  agentName?: string;
  duration?: number;
  isError?: boolean;
  isCollapsed?: boolean;
  children?: PlanLogEvent[];
}

export interface PlanExecution {
  id: string;
  task: string;
  startTime: number;
  endTime?: number;
  phase: PlanPhase;
  steps: PlanStep[];
  events: PlanLogEvent[];
  toolCallCount: number;
  filesCreated: string[];
  success?: boolean;
  error?: string;
  modelId?: string;
}

interface PlanLogState {
  // Current execution
  currentExecution: PlanExecution | null;

  // History of executions
  executionHistory: PlanExecution[];

  // UI state
  isOpen: boolean;
  isMinimized: boolean;
  expandedSections: Set<string>;
  autoScroll: boolean;

  // Max history size
  maxHistory: number;

  // Actions
  startExecution: (task: string, modelId?: string) => string;
  endExecution: (success: boolean, error?: string) => void;
  setPhase: (phase: PlanPhase) => void;
  setPlan: (steps: PlanStep[]) => void;
  updateStep: (stepId: string, updates: Partial<PlanStep>) => void;
  addEvent: (event: Omit<PlanLogEvent, 'id' | 'timestamp'>) => void;

  // UI actions
  toggleOpen: () => void;
  setMinimized: (minimized: boolean) => void;
  toggleSection: (sectionId: string) => void;
  setAutoScroll: (autoScroll: boolean) => void;
  clearHistory: () => void;

  // Getters
  getCurrentEvents: () => PlanLogEvent[];
  getEventsByPhase: (phase: PlanPhase) => PlanLogEvent[];
}

// =============================================================================
// Helper Functions
// =============================================================================

const generateId = () => `plog_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const loadPersistedState = (): { isOpen: boolean; isMinimized: boolean } => {
  if (typeof window === 'undefined') {
    return { isOpen: false, isMinimized: true };
  }
  try {
    const saved = localStorage.getItem('plan-log-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        isOpen: parsed.isOpen ?? false,
        isMinimized: parsed.isMinimized ?? true,
      };
    }
  } catch {
    // Ignore errors
  }
  return { isOpen: false, isMinimized: true };
};

const persistState = (isOpen: boolean, isMinimized: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('plan-log-state', JSON.stringify({ isOpen, isMinimized }));
  } catch {
    // Ignore errors
  }
};

// =============================================================================
// Store
// =============================================================================

export const usePlanLogStore = create<PlanLogState>((set, get) => {
  const persisted = loadPersistedState();

  return {
    currentExecution: null,
    executionHistory: [],
    isOpen: persisted.isOpen,
    isMinimized: persisted.isMinimized,
    expandedSections: new Set(['planning', 'executing']),
    autoScroll: true,
    maxHistory: 20,

    startExecution: (task: string, modelId?: string) => {
      const id = generateId();
      const execution: PlanExecution = {
        id,
        task,
        startTime: Date.now(),
        phase: 'planning',
        steps: [],
        events: [],
        toolCallCount: 0,
        filesCreated: [],
        modelId,
      };

      set({
        currentExecution: execution,
        isOpen: true,
        isMinimized: false,
      });
      persistState(true, false);

      // Add start event
      get().addEvent({
        type: 'plan_start',
        phase: 'planning',
        message: `Starting execution: ${task.substring(0, 100)}${task.length > 100 ? '...' : ''}`,
        details: { task, modelId },
      });

      return id;
    },

    endExecution: (success: boolean, error?: string) => {
      set((state) => {
        if (!state.currentExecution) return state;

        const completedExecution: PlanExecution = {
          ...state.currentExecution,
          endTime: Date.now(),
          phase: success ? 'completed' : 'failed',
          success,
          error,
        };

        // Add to history (limit size)
        const newHistory = [completedExecution, ...state.executionHistory].slice(0, state.maxHistory);

        return {
          currentExecution: null,
          executionHistory: newHistory,
        };
      });

      // Add end event
      get().addEvent({
        type: success ? 'success' : 'error',
        phase: success ? 'completed' : 'failed',
        message: success ? 'Execution completed successfully' : `Execution failed: ${error}`,
        isError: !success,
        details: error ? { error } : undefined,
      });
    },

    setPhase: (phase: PlanPhase) => {
      set((state) => {
        if (!state.currentExecution) return state;

        return {
          currentExecution: {
            ...state.currentExecution,
            phase,
          },
        };
      });

      get().addEvent({
        type: 'phase_start',
        phase,
        message: `Phase: ${phase}`,
      });
    },

    setPlan: (steps: PlanStep[]) => {
      set((state) => {
        if (!state.currentExecution) return state;

        return {
          currentExecution: {
            ...state.currentExecution,
            steps,
          },
        };
      });

      get().addEvent({
        type: 'plan_created',
        phase: 'planning',
        message: `Plan created with ${steps.length} steps`,
        details: { stepCount: steps.length, steps: steps.map(s => s.description) },
      });
    },

    updateStep: (stepId: string, updates: Partial<PlanStep>) => {
      set((state) => {
        if (!state.currentExecution) return state;

        const steps = state.currentExecution.steps.map(step =>
          step.id === stepId ? { ...step, ...updates } : step
        );

        return {
          currentExecution: {
            ...state.currentExecution,
            steps,
          },
        };
      });
    },

    addEvent: (event: Omit<PlanLogEvent, 'id' | 'timestamp'>) => {
      const newEvent: PlanLogEvent = {
        ...event,
        id: generateId(),
        timestamp: Date.now(),
      };

      set((state) => {
        if (!state.currentExecution) {
          // If no current execution, still capture events in history
          return state;
        }

        const toolCallCount = event.type === 'tool_call'
          ? state.currentExecution.toolCallCount + 1
          : state.currentExecution.toolCallCount;

        const filesCreated = event.details?.path && event.toolName === 'write_file'
          ? [...state.currentExecution.filesCreated, event.details.path as string]
          : state.currentExecution.filesCreated;

        return {
          currentExecution: {
            ...state.currentExecution,
            events: [...state.currentExecution.events, newEvent],
            toolCallCount,
            filesCreated,
          },
        };
      });
    },

    toggleOpen: () => {
      set((state) => {
        const newIsOpen = !state.isOpen;
        persistState(newIsOpen, state.isMinimized);
        return { isOpen: newIsOpen };
      });
    },

    setMinimized: (minimized: boolean) => {
      set((state) => {
        persistState(state.isOpen, minimized);
        return { isMinimized: minimized };
      });
    },

    toggleSection: (sectionId: string) => {
      set((state) => {
        const expanded = new Set(state.expandedSections);
        if (expanded.has(sectionId)) {
          expanded.delete(sectionId);
        } else {
          expanded.add(sectionId);
        }
        return { expandedSections: expanded };
      });
    },

    setAutoScroll: (autoScroll: boolean) => {
      set({ autoScroll });
    },

    clearHistory: () => {
      set({ executionHistory: [] });
    },

    getCurrentEvents: () => {
      const state = get();
      return state.currentExecution?.events || [];
    },

    getEventsByPhase: (phase: PlanPhase) => {
      const state = get();
      return (state.currentExecution?.events || []).filter(e => e.phase === phase);
    },
  };
});

// =============================================================================
// Plan Logger Utility
// =============================================================================

/**
 * Convenience class for logging plan execution events
 */
class PlanLogger {
  startPlan(task: string, modelId?: string): string {
    return usePlanLogStore.getState().startExecution(task, modelId);
  }

  endPlan(success: boolean, error?: string): void {
    usePlanLogStore.getState().endExecution(success, error);
  }

  setPhase(phase: PlanPhase): void {
    usePlanLogStore.getState().setPhase(phase);
  }

  setPlan(steps: PlanStep[]): void {
    usePlanLogStore.getState().setPlan(steps);
  }

  updateStep(stepId: string, updates: Partial<PlanStep>): void {
    usePlanLogStore.getState().updateStep(stepId, updates);
  }

  // Logging methods
  planCreated(stepCount: number, steps: string[]): void {
    usePlanLogStore.getState().addEvent({
      type: 'plan_created',
      phase: 'planning',
      message: `Plan created with ${stepCount} steps`,
      details: { stepCount, steps },
    });
  }

  stepStart(stepId: string, description: string): void {
    usePlanLogStore.getState().addEvent({
      type: 'step_start',
      phase: 'executing',
      message: `Starting: ${description}`,
      stepId,
    });
  }

  stepComplete(stepId: string, description: string, duration?: number): void {
    usePlanLogStore.getState().addEvent({
      type: 'step_complete',
      phase: 'executing',
      message: `Completed: ${description}`,
      stepId,
      duration,
    });
  }

  stepFailed(stepId: string, description: string, error: string): void {
    usePlanLogStore.getState().addEvent({
      type: 'step_failed',
      phase: 'executing',
      message: `Failed: ${description}`,
      stepId,
      isError: true,
      details: { error },
    });
  }

  toolCall(toolName: string, args: Record<string, unknown>): void {
    usePlanLogStore.getState().addEvent({
      type: 'tool_call',
      phase: 'executing',
      message: `Calling: ${toolName}`,
      toolName,
      details: args,
    });
  }

  toolResult(toolName: string, success: boolean, result?: unknown, duration?: number): void {
    usePlanLogStore.getState().addEvent({
      type: 'tool_result',
      phase: 'executing',
      message: success ? `${toolName} completed` : `${toolName} failed`,
      toolName,
      isError: !success,
      duration,
      details: result ? { result } : undefined,
    });
  }

  agentStart(agentName: string, task: string): void {
    usePlanLogStore.getState().addEvent({
      type: 'agent_start',
      phase: 'executing',
      message: `Agent ${agentName} starting`,
      agentName,
      details: { task },
    });
  }

  agentComplete(agentName: string, success: boolean, duration?: number): void {
    usePlanLogStore.getState().addEvent({
      type: success ? 'agent_complete' : 'agent_error',
      phase: 'executing',
      message: success ? `Agent ${agentName} completed` : `Agent ${agentName} failed`,
      agentName,
      isError: !success,
      duration,
    });
  }

  memoryQuery(query: string): void {
    usePlanLogStore.getState().addEvent({
      type: 'memory_query',
      phase: 'planning',
      message: `Searching memory for relevant experiences`,
      details: { query },
    });
  }

  memoryResult(count: number, matches?: string[]): void {
    usePlanLogStore.getState().addEvent({
      type: 'memory_result',
      phase: 'planning',
      message: count > 0 ? `Found ${count} relevant memories` : 'No relevant memories found',
      details: { count, matches },
    });
  }

  info(message: string, details?: Record<string, unknown>): void {
    usePlanLogStore.getState().addEvent({
      type: 'info',
      phase: usePlanLogStore.getState().currentExecution?.phase || 'idle',
      message,
      details,
    });
  }

  warning(message: string, details?: Record<string, unknown>): void {
    usePlanLogStore.getState().addEvent({
      type: 'warning',
      phase: usePlanLogStore.getState().currentExecution?.phase || 'idle',
      message,
      details,
    });
  }

  error(message: string, error?: unknown): void {
    usePlanLogStore.getState().addEvent({
      type: 'error',
      phase: usePlanLogStore.getState().currentExecution?.phase || 'failed',
      message,
      isError: true,
      details: error ? { error: error instanceof Error ? error.message : String(error) } : undefined,
    });
  }

  success(message: string, details?: Record<string, unknown>): void {
    usePlanLogStore.getState().addEvent({
      type: 'success',
      phase: usePlanLogStore.getState().currentExecution?.phase || 'completed',
      message,
      details,
    });
  }
}

// Singleton instance
export const planLogger = new PlanLogger();
