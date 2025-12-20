/**
 * Cron Scheduler Service
 * Manages automatic execution of evolution cron jobs on scheduled intervals
 */

import { CronAnalyzer } from './cron-analyzer';
import type { VolumeType } from './git-service';

export interface CronConfig {
  id: string;
  name: string;
  volume: VolumeType;
  intervalMs: number; // milliseconds between runs
  minOccurrences?: number;
  minConfidence?: number;
  enabled: boolean;
}

export interface CronStatus {
  id: string;
  lastRun: Date | null;
  nextRun: Date | null;
  isRunning: boolean;
  lastResult?: {
    patterns: number;
    skillsGenerated: number;
    totalCommits: number;
    analysisTime: number;
  };
  lastError?: string;
}

export class CronScheduler {
  private static instance: CronScheduler | null = null;
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private statuses: Map<string, CronStatus> = new Map();
  private configs: Map<string, CronConfig> = new Map();
  private storageKey = 'llmos_cron_scheduler_state';

  private constructor() {
    this.loadState();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CronScheduler {
    if (!this.instance) {
      this.instance = new CronScheduler();
    }
    return this.instance;
  }

  /**
   * Register a cron job
   */
  registerCron(config: CronConfig): void {
    console.log(`[CronScheduler] Registering cron: ${config.id}`);

    this.configs.set(config.id, config);

    // Initialize status if not exists
    if (!this.statuses.has(config.id)) {
      const savedState = this.loadCronState(config.id);
      this.statuses.set(config.id, savedState || {
        id: config.id,
        lastRun: null,
        nextRun: null,
        isRunning: false,
      });
    }

    // Start if enabled
    if (config.enabled) {
      this.startCron(config.id);
    }
  }

  /**
   * Start a specific cron job
   */
  startCron(cronId: string): void {
    const config = this.configs.get(cronId);
    if (!config) {
      console.error(`[CronScheduler] Cron not found: ${cronId}`);
      return;
    }

    // Stop existing timer if any
    this.stopCron(cronId);

    console.log(`[CronScheduler] Starting cron: ${cronId} (interval: ${config.intervalMs / 1000}s)`);

    const status = this.statuses.get(cronId);

    // Calculate next run time
    const now = new Date();
    const nextRun = new Date(now.getTime() + config.intervalMs);

    if (status) {
      status.nextRun = nextRun;
      this.saveState();
    }

    // Schedule the job
    const timer = setInterval(() => {
      this.executeCron(cronId);
    }, config.intervalMs);

    this.timers.set(cronId, timer);

    // Run immediately on first start if never run before
    if (!status?.lastRun) {
      console.log(`[CronScheduler] Running ${cronId} immediately (first time)`);
      setTimeout(() => this.executeCron(cronId), 5000); // 5s delay for initialization
    }
  }

  /**
   * Stop a specific cron job
   */
  stopCron(cronId: string): void {
    const timer = this.timers.get(cronId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(cronId);
      console.log(`[CronScheduler] Stopped cron: ${cronId}`);
    }

    const status = this.statuses.get(cronId);
    if (status) {
      status.nextRun = null;
      this.saveState();
    }
  }

  /**
   * Execute a cron job
   */
  private async executeCron(cronId: string): Promise<void> {
    const config = this.configs.get(cronId);
    const status = this.statuses.get(cronId);

    if (!config || !status) {
      console.error(`[CronScheduler] Cannot execute cron: ${cronId} (not found)`);
      return;
    }

    if (status.isRunning) {
      console.warn(`[CronScheduler] Cron ${cronId} is already running, skipping...`);
      return;
    }

    console.log(`[CronScheduler] Executing cron: ${cronId}`);

    status.isRunning = true;
    status.lastRun = new Date();
    status.lastError = undefined;
    this.saveState();

    try {
      const result = await CronAnalyzer.analyzeVolume(config.volume, {
        minOccurrences: config.minOccurrences || 2,
        minConfidence: config.minConfidence || 0.7,
      });

      status.lastResult = {
        patterns: result.patterns.length,
        skillsGenerated: result.skillsGenerated.length,
        totalCommits: result.totalCommits,
        analysisTime: result.analysisTime,
      };

      console.log(`[CronScheduler] ✓ Cron ${cronId} completed:`, {
        patterns: result.patterns.length,
        skills: result.skillsGenerated.length,
        commits: result.totalCommits,
        time: `${(result.analysisTime / 1000).toFixed(1)}s`,
      });

      // Trigger browser notification if available
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`🔄 Evolution Complete: ${config.name}`, {
          body: `${result.patterns.length} patterns detected, ${result.skillsGenerated.length} skills generated`,
          icon: '/favicon.ico',
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      status.lastError = errorMessage;
      console.error(`[CronScheduler] ✗ Cron ${cronId} failed:`, error);
    } finally {
      status.isRunning = false;

      // Update next run time
      const now = new Date();
      status.nextRun = new Date(now.getTime() + config.intervalMs);

      this.saveState();
    }
  }

  /**
   * Run a cron job immediately (manual trigger)
   */
  async runNow(cronId: string): Promise<void> {
    console.log(`[CronScheduler] Manual trigger for cron: ${cronId}`);
    await this.executeCron(cronId);
  }

  /**
   * Get status for a specific cron
   */
  getStatus(cronId: string): CronStatus | undefined {
    return this.statuses.get(cronId);
  }

  /**
   * Get all cron statuses
   */
  getAllStatuses(): Map<string, CronStatus> {
    return new Map(this.statuses);
  }

  /**
   * Get seconds until next run for a cron
   */
  getSecondsUntilNextRun(cronId: string): number | null {
    const status = this.statuses.get(cronId);
    if (!status?.nextRun) return null;

    const now = new Date();
    const diff = status.nextRun.getTime() - now.getTime();
    return Math.max(0, Math.floor(diff / 1000));
  }

  /**
   * Enable a cron job
   */
  enableCron(cronId: string): void {
    const config = this.configs.get(cronId);
    if (config) {
      config.enabled = true;
      this.startCron(cronId);
      this.saveState();
    }
  }

  /**
   * Disable a cron job
   */
  disableCron(cronId: string): void {
    const config = this.configs.get(cronId);
    if (config) {
      config.enabled = false;
      this.stopCron(cronId);
      this.saveState();
    }
  }

  /**
   * Stop all cron jobs
   */
  stopAll(): void {
    console.log('[CronScheduler] Stopping all cron jobs');
    this.timers.forEach((_, cronId) => {
      this.stopCron(cronId);
    });
  }

  /**
   * Request notification permission
   */
  static async requestNotificationPermission(): Promise<void> {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    }
  }

  /**
   * Save state to localStorage
   */
  private saveState(): void {
    if (typeof window === 'undefined') return;

    const state = {
      statuses: Array.from(this.statuses.entries()).map(([id, status]) => ({
        id,
        lastRun: status.lastRun?.toISOString() || null,
        nextRun: status.nextRun?.toISOString() || null,
        isRunning: status.isRunning,
        lastResult: status.lastResult,
        lastError: status.lastError,
      })),
      configs: Array.from(this.configs.entries()).map(([id, config]) => ({
        ...config,
      })),
    };

    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  /**
   * Load state from localStorage
   */
  private loadState(): void {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem(this.storageKey);
      if (!saved) return;

      const state = JSON.parse(saved);

      // Restore statuses
      if (state.statuses) {
        state.statuses.forEach((statusData: any) => {
          this.statuses.set(statusData.id, {
            id: statusData.id,
            lastRun: statusData.lastRun ? new Date(statusData.lastRun) : null,
            nextRun: statusData.nextRun ? new Date(statusData.nextRun) : null,
            isRunning: false, // Never restore running state
            lastResult: statusData.lastResult,
            lastError: statusData.lastError,
          });
        });
      }

      // Restore configs
      if (state.configs) {
        state.configs.forEach((config: CronConfig) => {
          this.configs.set(config.id, config);
        });
      }

      console.log('[CronScheduler] State loaded from localStorage');
    } catch (error) {
      console.error('[CronScheduler] Failed to load state:', error);
    }
  }

  /**
   * Load specific cron state
   */
  private loadCronState(cronId: string): CronStatus | null {
    if (typeof window === 'undefined') return null;

    try {
      const saved = localStorage.getItem(this.storageKey);
      if (!saved) return null;

      const state = JSON.parse(saved);
      const statusData = state.statuses?.find((s: any) => s.id === cronId);

      if (!statusData) return null;

      return {
        id: statusData.id,
        lastRun: statusData.lastRun ? new Date(statusData.lastRun) : null,
        nextRun: statusData.nextRun ? new Date(statusData.nextRun) : null,
        isRunning: false,
        lastResult: statusData.lastResult,
        lastError: statusData.lastError,
      };
    } catch (error) {
      console.error('[CronScheduler] Failed to load cron state:', error);
      return null;
    }
  }
}

/**
 * Default cron configurations
 */
export const DEFAULT_CRONS: CronConfig[] = [
  {
    id: 'evolution-user',
    name: 'Evolution (User)',
    volume: 'user',
    intervalMs: 24 * 60 * 60 * 1000, // 24 hours
    minOccurrences: 2,
    minConfidence: 0.7,
    enabled: false, // User must opt-in
  },
  {
    id: 'evolution-team',
    name: 'Evolution (Team)',
    volume: 'team',
    intervalMs: 24 * 60 * 60 * 1000, // 24 hours
    minOccurrences: 3,
    minConfidence: 0.75,
    enabled: false, // User must opt-in
  },
  {
    id: 'evolution-system',
    name: 'Evolution (System)',
    volume: 'system',
    intervalMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    minOccurrences: 5,
    minConfidence: 0.85,
    enabled: false, // User must opt-in
  },
];

/**
 * Initialize scheduler with default crons
 */
export function initializeCronScheduler(): CronScheduler {
  const scheduler = CronScheduler.getInstance();

  // Register default crons
  DEFAULT_CRONS.forEach(config => {
    scheduler.registerCron(config);
  });

  // Request notification permission
  CronScheduler.requestNotificationPermission();

  console.log('[CronScheduler] Initialized with', DEFAULT_CRONS.length, 'crons');

  return scheduler;
}
