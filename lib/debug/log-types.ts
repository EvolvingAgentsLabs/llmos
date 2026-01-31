/**
 * Debug Console - Type Definitions
 *
 * Structured logging types for LLMos debug console
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

export type LogCategory =
  | 'system'    // Boot, kernel, general system events
  | 'python'    // Pyodide execution
  | 'applet'    // Applet compilation and execution
  | 'llm'       // LLM API calls and tool usage
  | 'vfs'       // Virtual file system operations
  | 'git'       // Git operations
  | 'memory'    // Memory system operations
  | 'plan'      // Plan creation and execution
  | 'agent'     // Agent execution and orchestration
  | 'hal'       // Hardware Abstraction Layer
  | 'skills'    // Physical skill loading
  | 'blackbox'  // BlackBox recorder
  | 'replayer'  // Simulation replayer
  | 'evolution' // Evolutionary patcher
  | 'dreaming'  // Dreaming engine
  | 'robot';    // Robot navigation debugging

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: unknown;
  duration?: number;      // For timed operations (ms)
  expandable?: boolean;   // Whether entry has expandable details
  source?: string;        // Source file/function
  groupId?: string;       // For grouping related logs
}

export interface LogFilter {
  levels: LogLevel[];
  categories: LogCategory[];
  search: string;
}

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-gray-400',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  success: 'text-green-400',
};

export const LOG_LEVEL_ICONS: Record<LogLevel, string> = {
  debug: '○',
  info: 'ℹ',
  warn: '⚠',
  error: '✗',
  success: '✓',
};

export const LOG_CATEGORY_COLORS: Record<LogCategory, string> = {
  system: 'bg-purple-500/20 text-purple-400',
  python: 'bg-yellow-500/20 text-yellow-400',
  applet: 'bg-pink-500/20 text-pink-400',
  llm: 'bg-blue-500/20 text-blue-400',
  vfs: 'bg-green-500/20 text-green-400',
  git: 'bg-orange-500/20 text-orange-400',
  memory: 'bg-cyan-500/20 text-cyan-400',
  plan: 'bg-indigo-500/20 text-indigo-400',
  agent: 'bg-emerald-500/20 text-emerald-400',
  hal: 'bg-rose-500/20 text-rose-400',
  skills: 'bg-amber-500/20 text-amber-400',
  blackbox: 'bg-slate-500/20 text-slate-400',
  replayer: 'bg-sky-500/20 text-sky-400',
  evolution: 'bg-violet-500/20 text-violet-400',
  dreaming: 'bg-fuchsia-500/20 text-fuchsia-400',
  robot: 'bg-red-500/20 text-red-400',
};

export const LOG_CATEGORY_LABELS: Record<LogCategory, string> = {
  system: 'SYSTEM',
  python: 'PYTHON',
  applet: 'APPLET',
  llm: 'LLM',
  vfs: 'VFS',
  git: 'GIT',
  memory: 'MEMORY',
  plan: 'PLAN',
  agent: 'AGENT',
  hal: 'HAL',
  skills: 'SKILLS',
  blackbox: 'BLACKBOX',
  replayer: 'REPLAYER',
  evolution: 'EVOLUTION',
  dreaming: 'DREAMING',
  robot: 'ROBOT',
};
