'use client';

import { useState, useEffect } from 'react';
import { CronAnalyzer } from '@/lib/cron-analyzer';
import { GitHubAuth } from '@/lib/github-auth';
import { CronScheduler, DEFAULT_CRONS } from '@/lib/cron-scheduler';

interface CronListProps {
  onCronClick: () => void;
}

interface CronJob {
  id: string;
  name: string;
  status: 'completed' | 'scheduled' | 'running';
  lastRun: string;
  patterns: number;
  skillsGenerated: number;
  nextRunSeconds: number; // seconds until next run
  intervalSeconds: number; // total interval in seconds
}

// Helper to convert time strings to seconds
const parseTimeToSeconds = (timeStr: string): number => {
  const match = timeStr.match(/(\d+)([smhd])/);
  if (!match) return 3600; // default 1 hour

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 3600;
  }
};

// Helper to format seconds to human readable
const formatTime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};

// Helper to format relative time from Date
const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
};

export default function CronList({ onCronClick }: CronListProps) {
  const [scheduler] = useState(() => CronScheduler.getInstance());
  const [cronStates, setCronStates] = useState<Map<string, any>>(new Map());
  const [, forceUpdate] = useState({});

  // Initialize scheduler and register crons
  useEffect(() => {
    // Register all default crons
    DEFAULT_CRONS.forEach(config => {
      scheduler.registerCron(config);
    });

    console.log('[CronList] Scheduler initialized');
  }, [scheduler]);

  // Update cron states from scheduler
  useEffect(() => {
    const updateStates = () => {
      const newStates = new Map();
      DEFAULT_CRONS.forEach(config => {
        const status = scheduler.getStatus(config.id);
        if (status) {
          newStates.set(config.id, {
            ...status,
            secondsUntilNext: scheduler.getSecondsUntilNextRun(config.id),
            config,
          });
        }
      });
      setCronStates(newStates);
    };

    // Update every second
    updateStates();
    const interval = setInterval(updateStates, 1000);

    return () => clearInterval(interval);
  }, [scheduler]);

  // Build cron jobs from scheduler state
  const crons: CronJob[] = DEFAULT_CRONS.map(config => {
    const state = cronStates.get(config.id);
    const status = state?.isRunning ? 'running' :
                   state?.lastResult ? 'completed' : 'scheduled';

    const lastRunTime = state?.lastRun ? formatRelativeTime(state.lastRun) : 'Never';
    const nextRunSeconds = state?.secondsUntilNext || 0;

    return {
      id: config.id,
      name: config.name,
      status,
      lastRun: lastRunTime,
      patterns: state?.lastResult?.patterns || 0,
      skillsGenerated: state?.lastResult?.skillsGenerated || 0,
      nextRunSeconds,
      intervalSeconds: Math.floor(config.intervalMs / 1000),
    };
  });

  const handleRunCron = async (e: React.MouseEvent, cronId: string) => {
    e.stopPropagation();

    // Check if GitHub is connected
    if (!GitHubAuth.isAuthenticated()) {
      alert('Please connect your GitHub account to run cron analysis');
      return;
    }

    try {
      // Run via scheduler
      await scheduler.runNow(cronId);

      const status = scheduler.getStatus(cronId);
      if (status?.lastResult) {
        const result = status.lastResult;
        alert(
          `Evolution Cron Complete!\n\n` +
          `Patterns detected: ${result.patterns}\n` +
          `Skills generated: ${result.skillsGenerated}\n` +
          `Analyzed ${result.totalCommits} commits\n` +
          `Time: ${(result.analysisTime / 1000).toFixed(1)}s`
        );
      } else if (status?.lastError) {
        alert(`Cron execution failed: ${status.lastError}`);
      }

      // Force re-render
      forceUpdate({});
    } catch (error) {
      console.error(`Cron ${cronId} failed:`, error);
      alert(`Cron execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleToggleSchedule = (e: React.MouseEvent, cronId: string, enabled: boolean) => {
    e.stopPropagation();

    const config = DEFAULT_CRONS.find(c => c.id === cronId);
    if (!config) return;

    if (enabled) {
      scheduler.enableCron(cronId);
      alert(`✓ ${config.name} scheduled to run every ${formatTime(Math.floor(config.intervalMs / 1000))}`);
    } else {
      scheduler.disableCron(cronId);
      alert(`✓ ${config.name} scheduling disabled`);
    }

    forceUpdate({});
  };

  return (
    <div className="space-y-3">
      {crons.map((cron) => {
        const state = cronStates.get(cron.id);
        const isRunning = state?.isRunning || false;
        const isScheduled = DEFAULT_CRONS.find(c => c.id === cron.id)?.enabled || false;
        const countdown = state?.secondsUntilNext || 0;
        const progress = countdown > 0 ? ((cron.intervalSeconds - countdown) / cron.intervalSeconds) * 100 : 0;

        return (
          <div
            key={cron.id}
            onClick={onCronClick}
            className="p-2 rounded cursor-pointer terminal-hover"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={
                isRunning ? 'status-active' :
                cron.status === 'completed' ? 'status-success' : 'status-pending'
              }>
                {isRunning ? '⏳' : cron.status === 'completed' ? '🔄' : '⏸'}
              </span>
              <span className="text-sm">{cron.name}</span>
            </div>
            <div className="ml-6 text-xs text-terminal-fg-secondary space-y-0.5">
              <div>Last run: {cron.lastRun}</div>
              {cron.status === 'completed' && (
                <>
                  <div className="text-terminal-accent-green">
                    {cron.patterns} patterns detected
                  </div>
                  <div className="text-terminal-accent-blue">
                    {cron.skillsGenerated} skills generated
                  </div>
                </>
              )}

              {/* Countdown Timer with Progress Bar */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-terminal-fg-tertiary">Next run:</span>
                  <span className={`font-mono ${countdown < 60 ? 'text-terminal-accent-yellow' : ''}`}>
                    {formatTime(countdown)}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="h-1 bg-terminal-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-terminal-accent-green transition-all duration-1000 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 ml-6 mt-2 flex-wrap">
              <button
                className="btn-terminal text-xs py-0.5 px-2"
                onClick={(e) => handleRunCron(e, cron.id)}
                disabled={isRunning}
              >
                {isRunning ? 'Running...' : 'Run Now'}
              </button>
              <button
                className={`text-xs py-0.5 px-2 ${isScheduled ? 'btn-terminal-secondary' : 'btn-terminal'}`}
                onClick={(e) => handleToggleSchedule(e, cron.id, !isScheduled)}
              >
                {isScheduled ? '⏸ Disable Auto' : '▶ Enable Auto'}
              </button>
              <button
                className="btn-terminal-secondary text-xs py-0.5 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onCronClick();
                }}
              >
                View Log
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
