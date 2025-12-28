/**
 * Debug Console - Logger Utility
 *
 * Central logging utility for LLMos. Use this instead of console.log
 * to get structured, filterable logs in the debug console.
 *
 * Usage:
 *   import { logger } from '@/lib/debug/logger';
 *
 *   logger.info('system', 'Application started');
 *   logger.python('Executing script', { file: 'main.py' });
 *   logger.error('applet', 'Compilation failed', { error: err.message });
 *   logger.success('llm', 'Tool call completed', { tool: 'write_file', duration: 150 });
 */

import { LogLevel, LogCategory, LogEntry } from './log-types';
import { useConsoleStore } from './console-store';

type LogData = Record<string, unknown> | unknown;

interface TimerContext {
  category: LogCategory;
  message: string;
  startTime: number;
  data?: LogData;
}

class Logger {
  private timers: Map<string, TimerContext> = new Map();
  private enabled: boolean = true;
  private alsoBrowserConsole: boolean = true;

  /**
   * Enable or disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Also log to browser console
   */
  setAlsoBrowserConsole(enabled: boolean): void {
    this.alsoBrowserConsole = enabled;
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: LogData,
    options?: Partial<Pick<LogEntry, 'duration' | 'expandable' | 'source' | 'groupId'>>
  ): void {
    if (!this.enabled) return;

    // Add to store
    const store = useConsoleStore.getState();
    store.addEntry({
      level,
      category,
      message,
      data,
      expandable: data !== undefined,
      ...options,
    });

    // Also log to browser console if enabled
    if (this.alsoBrowserConsole) {
      const prefix = `[${category.toUpperCase()}]`;
      const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';

      if (data) {
        console[consoleMethod](prefix, message, data);
      } else {
        console[consoleMethod](prefix, message);
      }
    }
  }

  // Level-specific methods
  debug(category: LogCategory, message: string, data?: LogData): void {
    this.log('debug', category, message, data);
  }

  info(category: LogCategory, message: string, data?: LogData): void {
    this.log('info', category, message, data);
  }

  warn(category: LogCategory, message: string, data?: LogData): void {
    this.log('warn', category, message, data);
  }

  error(category: LogCategory, message: string, data?: LogData): void {
    this.log('error', category, message, data);
  }

  success(category: LogCategory, message: string, data?: LogData): void {
    this.log('success', category, message, data);
  }

  // Category-specific convenience methods
  system(message: string, data?: LogData): void {
    this.log('info', 'system', message, data);
  }

  python(message: string, data?: LogData): void {
    this.log('info', 'python', message, data);
  }

  applet(message: string, data?: LogData): void {
    this.log('info', 'applet', message, data);
  }

  llm(message: string, data?: LogData): void {
    this.log('info', 'llm', message, data);
  }

  vfs(message: string, data?: LogData): void {
    this.log('info', 'vfs', message, data);
  }

  git(message: string, data?: LogData): void {
    this.log('info', 'git', message, data);
  }

  memory(message: string, data?: LogData): void {
    this.log('info', 'memory', message, data);
  }

  // Timer methods for measuring duration
  /**
   * Start a timer for measuring operation duration
   *
   * Usage:
   *   logger.time('python-exec', 'python', 'Executing script');
   *   // ... do work ...
   *   logger.timeEnd('python-exec'); // Logs with duration
   */
  time(timerId: string, category: LogCategory, message: string, data?: LogData): void {
    this.timers.set(timerId, {
      category,
      message,
      startTime: performance.now(),
      data,
    });

    this.log('info', category, `▶ ${message}`, data);
  }

  /**
   * End a timer and log the result with duration
   */
  timeEnd(timerId: string, success: boolean = true, additionalData?: LogData): void {
    const timer = this.timers.get(timerId);
    if (!timer) {
      this.warn('system', `Timer "${timerId}" not found`);
      return;
    }

    const duration = Math.round(performance.now() - timer.startTime);
    const level: LogLevel = success ? 'success' : 'error';
    const icon = success ? '✓' : '✗';
    const mergedData = { ...((timer.data as object) || {}), ...((additionalData as object) || {}) };

    this.log(
      level,
      timer.category,
      `${icon} ${timer.message} (${duration}ms)`,
      Object.keys(mergedData).length > 0 ? mergedData : undefined,
      { duration }
    );

    this.timers.delete(timerId);
  }

  /**
   * Log a group of related entries
   */
  group(groupId: string, category: LogCategory, title: string): void {
    this.log('info', category, `┌─ ${title}`, undefined, { groupId });
  }

  groupEnd(groupId: string, category: LogCategory, summary?: string): void {
    this.log('info', category, `└─ ${summary || 'Done'}`, undefined, { groupId });
  }

  /**
   * Log LLM tool calls with structured data
   */
  toolCall(toolName: string, input: unknown, direction: 'request' | 'response' = 'request'): void {
    const icon = direction === 'request' ? '→' : '←';
    const message = `${icon} Tool: ${toolName}`;
    this.log('info', 'llm', message, input, { expandable: true });
  }

  /**
   * Log file operations
   */
  fileOp(operation: 'read' | 'write' | 'edit' | 'delete', path: string, success: boolean = true): void {
    const icons = { read: '📖', write: '📝', edit: '✏️', delete: '🗑️' };
    const level: LogLevel = success ? 'success' : 'error';
    this.log(level, 'vfs', `${icons[operation]} ${operation}: ${path}`);
  }

  /**
   * Log boot stages
   */
  boot(stage: string, status: 'start' | 'complete' | 'error', details?: string): void {
    const icons = { start: '◐', complete: '●', error: '○' };
    const levels: Record<string, LogLevel> = { start: 'info', complete: 'success', error: 'error' };
    const message = details ? `${icons[status]} ${stage}: ${details}` : `${icons[status]} ${stage}`;
    this.log(levels[status], 'system', message);
  }
}

// Singleton instance
export const logger = new Logger();

// Export type for external use
export type { Logger };
