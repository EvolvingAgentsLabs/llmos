'use client';

/**
 * Log Entry Component
 *
 * Renders a single log entry with level indicator, category badge,
 * timestamp, message, and expandable data section.
 */

import { useState, memo } from 'react';
import {
  LogEntry as LogEntryType,
  LOG_LEVEL_COLORS,
  LOG_LEVEL_ICONS,
  LOG_CATEGORY_COLORS,
  LOG_CATEGORY_LABELS,
} from '@/lib/debug/log-types';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface LogEntryProps {
  entry: LogEntryType;
}

function LogEntryComponent({ entry }: LogEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  const formatData = (data: unknown): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const hasExpandableData = entry.expandable && entry.data !== undefined;

  return (
    <div className="group hover:bg-bg-secondary/30 transition-colors">
      {/* Main log line */}
      <div
        className={`flex items-start gap-2 px-3 py-1 font-mono text-xs ${
          hasExpandableData ? 'cursor-pointer' : ''
        }`}
        onClick={() => hasExpandableData && setIsExpanded(!isExpanded)}
      >
        {/* Expand/collapse icon */}
        <div className="w-4 flex-shrink-0 pt-0.5">
          {hasExpandableData ? (
            isExpanded ? (
              <ChevronDown className="w-3 h-3 text-fg-tertiary" />
            ) : (
              <ChevronRight className="w-3 h-3 text-fg-tertiary" />
            )
          ) : null}
        </div>

        {/* Timestamp */}
        <span className="text-fg-muted flex-shrink-0 w-24">
          {formatTimestamp(entry.timestamp)}
        </span>

        {/* Level icon */}
        <span className={`flex-shrink-0 w-4 ${LOG_LEVEL_COLORS[entry.level]}`}>
          {LOG_LEVEL_ICONS[entry.level]}
        </span>

        {/* Category badge */}
        <span
          className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${LOG_CATEGORY_COLORS[entry.category]}`}
        >
          {LOG_CATEGORY_LABELS[entry.category]}
        </span>

        {/* Message */}
        <span className={`flex-1 ${LOG_LEVEL_COLORS[entry.level]} break-all`}>
          {entry.message}
        </span>

        {/* Duration badge if present */}
        {entry.duration !== undefined && (
          <span className="flex-shrink-0 text-fg-muted px-1.5 py-0.5 rounded bg-bg-tertiary">
            {entry.duration}ms
          </span>
        )}
      </div>

      {/* Expanded data section */}
      {isExpanded && hasExpandableData && (
        <div className="ml-12 mr-3 mb-2 p-2 bg-bg-tertiary/50 rounded border border-border-primary/30">
          <pre className="text-[11px] text-fg-secondary overflow-x-auto whitespace-pre-wrap">
            {formatData(entry.data)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(LogEntryComponent);
