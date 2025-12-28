/**
 * Debug Console - Zustand Store
 *
 * State management for debug console logs
 */

import { create } from 'zustand';
import { LogEntry, LogLevel, LogCategory, LogFilter } from './log-types';

const MAX_LOG_ENTRIES = 1000; // Prevent memory issues

interface ConsoleState {
  // Log entries
  entries: LogEntry[];

  // UI state
  isOpen: boolean;
  height: number; // Panel height in pixels
  filter: LogFilter;

  // Actions
  addEntry: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearEntries: () => void;
  toggleConsole: () => void;
  setOpen: (open: boolean) => void;
  setHeight: (height: number) => void;
  setFilter: (filter: Partial<LogFilter>) => void;
  exportLogs: () => string;

  // Filtered entries getter
  getFilteredEntries: () => LogEntry[];
}

// Generate unique ID
const generateId = () => `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Load persisted state from localStorage
const loadPersistedState = (): { isOpen: boolean; height: number } => {
  if (typeof window === 'undefined') {
    return { isOpen: false, height: 200 };
  }
  try {
    const saved = localStorage.getItem('debug-console-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        isOpen: parsed.isOpen ?? false,
        height: parsed.height ?? 200,
      };
    }
  } catch {
    // Ignore errors
  }
  return { isOpen: false, height: 200 };
};

// Save state to localStorage
const persistState = (isOpen: boolean, height: number) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('debug-console-state', JSON.stringify({ isOpen, height }));
  } catch {
    // Ignore errors
  }
};

export const useConsoleStore = create<ConsoleState>((set, get) => {
  const persisted = loadPersistedState();

  return {
    entries: [],
    isOpen: persisted.isOpen,
    height: persisted.height,
    filter: {
      levels: ['debug', 'info', 'warn', 'error', 'success'],
      categories: ['system', 'python', 'applet', 'llm', 'vfs', 'git', 'memory'],
      search: '',
    },

    addEntry: (entry) => {
      const newEntry: LogEntry = {
        ...entry,
        id: generateId(),
        timestamp: new Date(),
      };

      set((state) => {
        const entries = [newEntry, ...state.entries];
        // Trim old entries if exceeding max
        if (entries.length > MAX_LOG_ENTRIES) {
          entries.length = MAX_LOG_ENTRIES;
        }
        return { entries };
      });
    },

    clearEntries: () => {
      set({ entries: [] });
    },

    toggleConsole: () => {
      set((state) => {
        const newIsOpen = !state.isOpen;
        persistState(newIsOpen, state.height);
        return { isOpen: newIsOpen };
      });
    },

    setOpen: (open) => {
      set((state) => {
        persistState(open, state.height);
        return { isOpen: open };
      });
    },

    setHeight: (height) => {
      const clampedHeight = Math.max(100, Math.min(600, height));
      set((state) => {
        persistState(state.isOpen, clampedHeight);
        return { height: clampedHeight };
      });
    },

    setFilter: (filterUpdate) => {
      set((state) => ({
        filter: { ...state.filter, ...filterUpdate },
      }));
    },

    exportLogs: () => {
      const { entries } = get();
      const exportData = {
        exportedAt: new Date().toISOString(),
        totalEntries: entries.length,
        entries: entries.map((e) => ({
          ...e,
          timestamp: e.timestamp.toISOString(),
        })),
      };
      return JSON.stringify(exportData, null, 2);
    },

    getFilteredEntries: () => {
      const { entries, filter } = get();

      return entries.filter((entry) => {
        // Filter by level
        if (!filter.levels.includes(entry.level)) {
          return false;
        }

        // Filter by category
        if (!filter.categories.includes(entry.category)) {
          return false;
        }

        // Filter by search
        if (filter.search) {
          const searchLower = filter.search.toLowerCase();
          const matchesMessage = entry.message.toLowerCase().includes(searchLower);
          const matchesData = entry.data
            ? JSON.stringify(entry.data).toLowerCase().includes(searchLower)
            : false;
          if (!matchesMessage && !matchesData) {
            return false;
          }
        }

        return true;
      });
    },
  };
});

// Export a hook for getting filtered entries (reactive)
export const useFilteredEntries = () => {
  const entries = useConsoleStore((state) => state.entries);
  const filter = useConsoleStore((state) => state.filter);

  return entries.filter((entry) => {
    if (!filter.levels.includes(entry.level)) return false;
    if (!filter.categories.includes(entry.category)) return false;
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      const matchesMessage = entry.message.toLowerCase().includes(searchLower);
      const matchesData = entry.data
        ? JSON.stringify(entry.data).toLowerCase().includes(searchLower)
        : false;
      if (!matchesMessage && !matchesData) return false;
    }
    return true;
  });
};
