'use client';

/**
 * Debug Console Component
 *
 * Bottom panel console similar to Chrome DevTools or VS Code terminal.
 * Features:
 * - Collapsible panel with drag-to-resize
 * - Filterable by category and level
 * - Searchable logs
 * - Clear and export functionality
 * - Keyboard shortcut (Ctrl+`) to toggle
 */

import { useEffect, useRef, useCallback } from 'react';
import { useConsoleStore, useFilteredEntries } from '@/lib/debug/console-store';
import LogEntry from './LogEntry';
import LogFilters from './LogFilters';
import {
  Terminal,
  ChevronDown,
  ChevronUp,
  Trash2,
  Download,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export default function DebugConsole() {
  const {
    isOpen,
    height,
    entries,
    toggleConsole,
    setHeight,
    clearEntries,
    exportLogs,
  } = useConsoleStore();

  const filteredEntries = useFilteredEntries();
  const scrollRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = 0; // Scroll to top since entries are newest-first
    }
  }, [entries.length, isOpen]);

  // Keyboard shortcut: Ctrl+` to toggle console
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        toggleConsole();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleConsole]);

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;

    const startY = e.clientY;
    const startHeight = height;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const deltaY = startY - e.clientY;
      const newHeight = startHeight + deltaY;
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [height, setHeight]);

  // Export logs to file
  const handleExport = useCallback(() => {
    const data = exportLogs();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `llmos-logs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportLogs]);

  // Quick expand to max height
  const handleMaximize = useCallback(() => {
    setHeight(height === 500 ? 200 : 500);
  }, [height, setHeight]);

  return (
    <div className="flex-shrink-0 border-t border-border-primary bg-bg-primary">
      {/* Header bar - always visible */}
      <div
        ref={resizeRef}
        className="flex items-center justify-between px-3 py-1.5 bg-bg-secondary/50 cursor-ns-resize select-none"
        onMouseDown={handleMouseDown}
        onDoubleClick={toggleConsole}
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-fg-tertiary" />
          <span className="text-xs font-medium text-fg-secondary">Console</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-fg-muted">
            {filteredEntries.length} / {entries.length}
          </span>
          <span className="text-[10px] text-fg-muted hidden sm:inline">
            Ctrl+` to toggle
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Clear button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearEntries();
            }}
            className="p-1 rounded hover:bg-bg-tertiary text-fg-muted hover:text-fg-secondary transition-colors"
            title="Clear console"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Export button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleExport();
            }}
            className="p-1 rounded hover:bg-bg-tertiary text-fg-muted hover:text-fg-secondary transition-colors"
            title="Export logs"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Maximize/minimize button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleMaximize();
            }}
            className="p-1 rounded hover:bg-bg-tertiary text-fg-muted hover:text-fg-secondary transition-colors"
            title={height === 500 ? 'Restore' : 'Maximize'}
          >
            {height === 500 ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Toggle button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleConsole();
            }}
            className="p-1 rounded hover:bg-bg-tertiary text-fg-muted hover:text-fg-secondary transition-colors"
            title={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Console content - collapsible */}
      {isOpen && (
        <div
          className="flex flex-col overflow-hidden transition-all"
          style={{ height: `${height}px` }}
        >
          {/* Filters */}
          <LogFilters />

          {/* Log entries */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overflow-x-hidden"
          >
            {filteredEntries.length === 0 ? (
              <div className="flex items-center justify-center h-full text-fg-muted text-sm">
                {entries.length === 0 ? (
                  <span>No logs yet. Activity will appear here.</span>
                ) : (
                  <span>No logs match the current filters.</span>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border-primary/10">
                {filteredEntries.map((entry) => (
                  <LogEntry key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
