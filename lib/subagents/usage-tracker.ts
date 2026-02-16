/**
 * Sub-Agent Usage Tracker
 *
 * Tracks usage statistics for sub-agents to support system evolution analysis.
 * Separated from system-evolution.ts to avoid circular imports.
 */

type VolumeType = 'system' | 'team' | 'user';

export interface SubAgentUsageRecord {
  agentPath: string;
  agentName: string;
  volume: VolumeType;
  executionCount: number;
  successCount: number;
  failureCount: number;
  totalExecutionTime: number;
  lastExecuted: string;
  tasks: string[];
}

const USAGE_STORAGE_KEY = 'llmos_subagent_usage';

/**
 * Get sub-agent usage records from localStorage
 */
export function getSubAgentUsage(): SubAgentUsageRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(USAGE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Record a sub-agent execution
 */
export function recordSubAgentExecution(
  agentPath: string,
  agentName: string,
  volume: VolumeType,
  task: string,
  success: boolean,
  executionTime: number
): void {
  if (typeof window === 'undefined') return;

  const records = getSubAgentUsage();
  const key = `${volume}:${agentPath}`;

  let record = records.find(r => `${r.volume}:${r.agentPath}` === key);

  if (!record) {
    record = {
      agentPath,
      agentName,
      volume,
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      totalExecutionTime: 0,
      lastExecuted: new Date().toISOString(),
      tasks: [],
    };
    records.push(record);
  }

  record.executionCount++;
  if (success) {
    record.successCount++;
  } else {
    record.failureCount++;
  }
  record.totalExecutionTime += executionTime;
  record.lastExecuted = new Date().toISOString();

  // Keep last 20 unique tasks
  if (!record.tasks.includes(task)) {
    record.tasks.push(task);
    if (record.tasks.length > 20) {
      record.tasks.shift();
    }
  }

  localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(records));
}

/**
 * Clear all usage records
 */
export function clearSubAgentUsage(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USAGE_STORAGE_KEY);
}

/**
 * Get usage summary for a specific agent
 */
export function getAgentUsageSummary(volume: VolumeType, agentPath: string): SubAgentUsageRecord | null {
  const records = getSubAgentUsage();
  return records.find(r => r.volume === volume && r.agentPath === agentPath) || null;
}

/**
 * Get top used agents
 */
export function getTopUsedAgents(limit: number = 10): SubAgentUsageRecord[] {
  const records = getSubAgentUsage();
  return records
    .sort((a, b) => b.executionCount - a.executionCount)
    .slice(0, limit);
}

/**
 * Get agents with high success rates
 */
export function getSuccessfulAgents(minExecutions: number = 3, minSuccessRate: number = 0.7): SubAgentUsageRecord[] {
  const records = getSubAgentUsage();
  return records
    .filter(r => r.executionCount >= minExecutions)
    .filter(r => (r.successCount / r.executionCount) >= minSuccessRate)
    .sort((a, b) => {
      const rateA = a.successCount / a.executionCount;
      const rateB = b.successCount / b.executionCount;
      return rateB - rateA;
    });
}
