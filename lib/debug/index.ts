/**
 * Debug Console Module
 *
 * Central export for all debug utilities
 */

export * from './log-types';
export * from './console-store';
export { logger } from './logger';
export type { Logger } from './logger';

// Robot Navigation Debugger
export {
  getRobotDebugger,
  createRobotDebugger,
  RobotNavigationDebugger,
} from './robot-navigation-debugger';
export type {
  DebugVerbosity,
  SensorSnapshot,
  NavigationDecisionLog,
} from './robot-navigation-debugger';
