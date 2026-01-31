/**
 * Robot Logs Monitor - Zustand Store
 *
 * State management for the robot logs monitor panel.
 * Tracks selected sessions, view preferences, and export history.
 */

import { create } from 'zustand';
import { RecordingSession, SessionAnalysis } from '@/lib/evolution/black-box-recorder';

type ViewTab = 'trajectory' | 'timeline' | 'tools' | 'export';

interface LogsMonitorState {
  // Panel UI state
  isOpen: boolean;
  width: number; // Panel width in pixels

  // Session state
  selectedSessionId: string | null;
  selectedFrameIndex: number | null;

  // View preferences
  activeTab: ViewTab;
  timelineFilter: 'all' | 'tool_call' | 'reasoning' | 'failure' | 'confidence_change';

  // Comparison mode
  compareMode: boolean;
  compareSessionId: string | null;

  // Export history
  lastExportedSessionId: string | null;
  lastExportFormat: 'json' | 'csv' | 'analysis' | null;
  lastExportTime: number | null;

  // Actions
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setWidth: (width: number) => void;

  selectSession: (sessionId: string | null) => void;
  selectFrame: (frameIndex: number | null) => void;

  setActiveTab: (tab: ViewTab) => void;
  setTimelineFilter: (filter: LogsMonitorState['timelineFilter']) => void;

  enableCompareMode: (sessionId: string) => void;
  disableCompareMode: () => void;

  recordExport: (sessionId: string, format: 'json' | 'csv' | 'analysis') => void;

  reset: () => void;
}

// Load persisted state from localStorage
const loadPersistedState = (): Partial<LogsMonitorState> => {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const saved = localStorage.getItem('robot-logs-monitor-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        isOpen: parsed.isOpen ?? false,
        width: parsed.width ?? 400,
        activeTab: parsed.activeTab ?? 'trajectory',
        timelineFilter: parsed.timelineFilter ?? 'all',
      };
    }
  } catch {
    // Ignore errors
  }
  return {};
};

// Save state to localStorage
const persistState = (state: Partial<LogsMonitorState>) => {
  if (typeof window === 'undefined') return;
  try {
    const existing = localStorage.getItem('robot-logs-monitor-state');
    const existingParsed = existing ? JSON.parse(existing) : {};
    localStorage.setItem(
      'robot-logs-monitor-state',
      JSON.stringify({ ...existingParsed, ...state })
    );
  } catch {
    // Ignore errors
  }
};

export const useLogsMonitorStore = create<LogsMonitorState>((set, get) => {
  const persisted = loadPersistedState();

  return {
    // Initial state
    isOpen: persisted.isOpen ?? false,
    width: persisted.width ?? 400,
    selectedSessionId: null,
    selectedFrameIndex: null,
    activeTab: persisted.activeTab ?? 'trajectory',
    timelineFilter: persisted.timelineFilter ?? 'all',
    compareMode: false,
    compareSessionId: null,
    lastExportedSessionId: null,
    lastExportFormat: null,
    lastExportTime: null,

    // Actions
    setOpen: (open) => {
      set({ isOpen: open });
      persistState({ isOpen: open });
    },

    toggleOpen: () => {
      const newIsOpen = !get().isOpen;
      set({ isOpen: newIsOpen });
      persistState({ isOpen: newIsOpen });
    },

    setWidth: (width) => {
      const clampedWidth = Math.max(300, Math.min(800, width));
      set({ width: clampedWidth });
      persistState({ width: clampedWidth });
    },

    selectSession: (sessionId) => {
      set({
        selectedSessionId: sessionId,
        selectedFrameIndex: null, // Reset frame selection when session changes
      });
    },

    selectFrame: (frameIndex) => {
      set({ selectedFrameIndex: frameIndex });
    },

    setActiveTab: (tab) => {
      set({ activeTab: tab });
      persistState({ activeTab: tab });
    },

    setTimelineFilter: (filter) => {
      set({ timelineFilter: filter });
      persistState({ timelineFilter: filter });
    },

    enableCompareMode: (sessionId) => {
      set({
        compareMode: true,
        compareSessionId: sessionId,
      });
    },

    disableCompareMode: () => {
      set({
        compareMode: false,
        compareSessionId: null,
      });
    },

    recordExport: (sessionId, format) => {
      set({
        lastExportedSessionId: sessionId,
        lastExportFormat: format,
        lastExportTime: Date.now(),
      });
    },

    reset: () => {
      set({
        selectedSessionId: null,
        selectedFrameIndex: null,
        compareMode: false,
        compareSessionId: null,
      });
    },
  };
});

// Selector hooks for common patterns
export const useIsLogsMonitorOpen = () =>
  useLogsMonitorStore((state) => state.isOpen);

export const useSelectedSession = () =>
  useLogsMonitorStore((state) => state.selectedSessionId);

export const useSelectedFrame = () =>
  useLogsMonitorStore((state) => state.selectedFrameIndex);

export const useActiveTab = () =>
  useLogsMonitorStore((state) => state.activeTab);
