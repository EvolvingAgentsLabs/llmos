'use client';

import { useState, useEffect } from 'react';
import { CronAnalyzer } from '@/lib/cron-analyzer';
import { GitHubAuth } from '@/lib/github-auth';

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

export default function CronList({ onCronClick }: CronListProps) {
  const [runningCrons, setRunningCrons] = useState<Set<string>>(new Set());
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  const crons: CronJob[] = [
    {
      id: 'evolution-user',
      name: 'Evolution (User)',
      status: 'completed',
      lastRun: '2h ago',
      patterns: 5,
      skillsGenerated: 2,
      nextRunSeconds: 79200, // 22 hours
      intervalSeconds: 86400, // 24 hours
    },
    {
      id: 'evolution-team',
      name: 'Evolution (Team)',
      status: 'scheduled',
      lastRun: '12h ago',
      patterns: 3,
      skillsGenerated: 0,
      nextRunSeconds: 43200, // 12 hours
      intervalSeconds: 86400, // 24 hours
    },
    {
      id: 'evolution-system',
      name: 'Evolution (System)',
      status: 'scheduled',
      lastRun: '1d ago',
      patterns: 12,
      skillsGenerated: 4,
      nextRunSeconds: 518400, // 6 days
      intervalSeconds: 604800, // 7 days
    },
  ];

  // Initialize countdowns
  useEffect(() => {
    const initial: Record<string, number> = {};
    crons.forEach(cron => {
      initial[cron.id] = cron.nextRunSeconds;
    });
    setCountdowns(initial);
  }, []);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdowns(prev => {
        const next = { ...prev };
        crons.forEach(cron => {
          if (next[cron.id] > 0 && !runningCrons.has(cron.id)) {
            next[cron.id] = Math.max(0, next[cron.id] - 1);
          }
        });
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [runningCrons]);

  const handleRunCron = async (e: React.MouseEvent, cronId: string) => {
    e.stopPropagation();

    // Check if GitHub is connected
    if (!GitHubAuth.isAuthenticated()) {
      alert('Please connect your GitHub account to run cron analysis');
      return;
    }

    setRunningCrons(prev => new Set([...prev, cronId]));

    try {
      // Determine volume based on cron ID
      const volumeMap: Record<string, 'user' | 'team' | 'system'> = {
        'evolution-user': 'user',
        'evolution-team': 'team',
        'evolution-system': 'system',
      };

      const volume = volumeMap[cronId];

      console.log(`Running ${cronId} cron: analyzing ${volume} volume...`);

      // Run the actual analysis
      const result = await CronAnalyzer.analyzeVolume(volume, {
        minOccurrences: 2,
        minConfidence: 0.7,
      });

      console.log(`Cron ${cronId} completed:`, {
        patterns: result.patterns.length,
        commits: result.totalCommits,
        traces: result.totalTraces,
        skills: result.skillsGenerated.length,
        time: `${(result.analysisTime / 1000).toFixed(1)}s`,
      });

      // Show success notification
      alert(
        `Evolution Cron Complete!\n\n` +
        `Patterns detected: ${result.patterns.length}\n` +
        `Skills generated: ${result.skillsGenerated.length}\n` +
        `Analyzed ${result.totalCommits} commits, ${result.totalTraces} traces\n\n` +
        `${result.patterns.map(p => `• ${p.name} (${p.occurrences}x, ${(p.confidence * 100).toFixed(0)}%)`).join('\n')}`
      );
    } catch (error) {
      console.error(`Cron ${cronId} failed:`, error);
      alert(`Cron execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRunningCrons(prev => {
        const newSet = new Set(prev);
        newSet.delete(cronId);
        return newSet;
      });

      // Reset countdown
      setCountdowns(prev => ({
        ...prev,
        [cronId]: crons.find(c => c.id === cronId)?.intervalSeconds || 86400,
      }));
    }
  };

  return (
    <div className="space-y-3">
      {crons.map((cron) => {
        const isRunning = runningCrons.has(cron.id);
        const countdown = countdowns[cron.id] || cron.nextRunSeconds;
        const progress = ((cron.intervalSeconds - countdown) / cron.intervalSeconds) * 100;

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
            <div className="flex gap-2 ml-6 mt-2">
              <button
                className="btn-terminal text-xs py-0.5 px-2"
                onClick={(e) => handleRunCron(e, cron.id)}
                disabled={isRunning}
              >
                {isRunning ? 'Running...' : 'Run Now'}
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
