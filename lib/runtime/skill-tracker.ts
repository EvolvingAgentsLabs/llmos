/**
 * Skill Tracker — Runtime skill usage tracking + promotion
 *
 * Wraps SkillPromotionManager with:
 * - Per-invocation recording with timing and context
 * - Configurable promotion thresholds
 * - Promotion candidate discovery
 * - Serialization for persistence
 * - Runtime integration hooks
 */

import {
  SkillPromotionManager,
  VolumeLevel,
  SkillUsageMetrics,
  PromotionEvaluation,
  PromotionEvent,
  PromotionThresholds,
  DEFAULT_PROMOTION_THRESHOLDS,
} from '../skills/skill-promotion';

// =============================================================================
// Types
// =============================================================================

export interface SkillInvocation {
  skillId: string;
  skillName: string;
  volume: VolumeLevel;
  success: boolean;
  durationMs: number;
  timestamp: number;
  context?: string;
  error?: string;
}

export interface SkillTrackerConfig {
  /** Promotion thresholds (defaults from skill-promotion.ts) */
  thresholds: PromotionThresholds;
  /** Maximum invocation history to keep per skill (default: 100) */
  maxHistoryPerSkill: number;
  /** Auto-promote when thresholds met (default: false) */
  autoPromote: boolean;
}

export interface SkillTrackerStats {
  totalInvocations: number;
  totalSuccesses: number;
  totalFailures: number;
  uniqueSkills: number;
  promotionEvents: number;
  avgDurationMs: number;
}

export interface SkillTrackerSnapshot {
  metrics: SkillUsageMetrics[];
  invocations: Record<string, SkillInvocation[]>;
  stats: SkillTrackerStats;
  timestamp: number;
}

// =============================================================================
// Default Config
// =============================================================================

const DEFAULT_SKILL_TRACKER_CONFIG: SkillTrackerConfig = {
  thresholds: DEFAULT_PROMOTION_THRESHOLDS,
  maxHistoryPerSkill: 100,
  autoPromote: false,
};

// =============================================================================
// SkillTracker
// =============================================================================

export class SkillTracker {
  private config: SkillTrackerConfig;
  private promotionManager: SkillPromotionManager;
  private invocations: Map<string, SkillInvocation[]> = new Map();
  private stats: SkillTrackerStats;
  private promotionLog: PromotionEvent[] = [];

  constructor(config: Partial<SkillTrackerConfig> = {}) {
    this.config = { ...DEFAULT_SKILL_TRACKER_CONFIG, ...config };
    this.promotionManager = new SkillPromotionManager(this.config.thresholds);
    this.stats = {
      totalInvocations: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      uniqueSkills: 0,
      promotionEvents: 0,
      avgDurationMs: 0,
    };
  }

  /**
   * Record a skill invocation with full context.
   * Updates the underlying SkillPromotionManager metrics, maintains
   * per-skill invocation history (trimmed to maxHistoryPerSkill),
   * and updates aggregate stats. If autoPromote is enabled, evaluates
   * and executes promotion when thresholds are met.
   */
  recordInvocation(invocation: SkillInvocation): void {
    // 1. Delegate to promotionManager
    this.promotionManager.recordUsage(
      invocation.skillId,
      invocation.skillName,
      invocation.volume,
      invocation.success,
    );

    // 2. Push to invocations map, trimming to max history
    let history = this.invocations.get(invocation.skillId);
    if (!history) {
      history = [];
      this.invocations.set(invocation.skillId, history);
    }
    history.push(invocation);
    if (history.length > this.config.maxHistoryPerSkill) {
      // Remove oldest entries to stay within limit
      history.splice(0, history.length - this.config.maxHistoryPerSkill);
    }

    // 3. Update stats
    const prevTotal = this.stats.totalInvocations;
    this.stats.totalInvocations += 1;
    if (invocation.success) {
      this.stats.totalSuccesses += 1;
    } else {
      this.stats.totalFailures += 1;
    }
    this.stats.uniqueSkills = this.invocations.size;

    // Rolling average for duration
    this.stats.avgDurationMs =
      (this.stats.avgDurationMs * prevTotal + invocation.durationMs) /
      this.stats.totalInvocations;

    // 4. Auto-promote if enabled
    if (this.config.autoPromote) {
      const evaluation = this.promotionManager.evaluatePromotion(invocation.skillId);
      if (evaluation?.eligible) {
        this.promoteSkill(invocation.skillId);
      }
    }
  }

  /**
   * Get all skills currently eligible for promotion.
   */
  getPromotionCandidates(): PromotionEvaluation[] {
    return this.promotionManager.getPromotionCandidates();
  }

  /**
   * Promote a skill to its next volume level.
   * Returns the PromotionEvent if successful, or null if not eligible.
   */
  promoteSkill(skillId: string): PromotionEvent | null {
    const event = this.promotionManager.promote(skillId);
    if (event) {
      this.promotionLog.push(event);
      this.stats.promotionEvents += 1;
    }
    return event;
  }

  /**
   * Get usage metrics for a specific skill.
   */
  getSkillMetrics(skillId: string): SkillUsageMetrics | undefined {
    return this.promotionManager.getMetrics(skillId);
  }

  /**
   * Get the invocation history for a specific skill.
   */
  getSkillHistory(skillId: string): SkillInvocation[] {
    return this.invocations.get(skillId) ?? [];
  }

  /**
   * Get aggregate tracker stats.
   */
  getStats(): SkillTrackerStats {
    return { ...this.stats };
  }

  /**
   * Get all tracked skill metrics.
   */
  getAllMetrics(): SkillUsageMetrics[] {
    return this.promotionManager.getAllMetrics();
  }

  /**
   * Get the full promotion event log.
   */
  getPromotionLog(): PromotionEvent[] {
    return [...this.promotionLog];
  }

  /**
   * Export a full snapshot of tracker state for persistence.
   */
  snapshot(): SkillTrackerSnapshot {
    const invocationsRecord: Record<string, SkillInvocation[]> = {};
    for (const [skillId, history] of this.invocations.entries()) {
      invocationsRecord[skillId] = [...history];
    }

    return {
      metrics: this.promotionManager.getAllMetrics(),
      invocations: invocationsRecord,
      stats: { ...this.stats },
      timestamp: Date.now(),
    };
  }

  /**
   * Restore tracker state from a previously exported snapshot.
   */
  restore(snapshot: SkillTrackerSnapshot): void {
    // Restore metrics into a fresh promotion manager
    this.promotionManager = new SkillPromotionManager(this.config.thresholds);
    this.promotionManager.loadMetrics(snapshot.metrics);

    // Restore invocations
    this.invocations.clear();
    for (const [skillId, history] of Object.entries(snapshot.invocations)) {
      this.invocations.set(skillId, [...history]);
    }

    // Restore stats
    this.stats = { ...snapshot.stats };
  }

  /**
   * Reset all tracker state to clean defaults.
   */
  reset(): void {
    this.promotionManager = new SkillPromotionManager(this.config.thresholds);
    this.invocations.clear();
    this.promotionLog = [];
    this.stats = {
      totalInvocations: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      uniqueSkills: 0,
      promotionEvents: 0,
      avgDurationMs: 0,
    };
  }

  /**
   * Get the top N skills sorted by total_uses descending.
   */
  getTopSkills(n: number = 10): SkillUsageMetrics[] {
    const all = this.promotionManager.getAllMetrics();
    return all
      .sort((a, b) => b.total_uses - a.total_uses)
      .slice(0, n);
  }

  /**
   * Get skills with success rate below the given threshold.
   */
  getFailingSkills(maxSuccessRate: number = 0.5): SkillUsageMetrics[] {
    const all = this.promotionManager.getAllMetrics();
    return all.filter((m) => m.success_rate < maxSuccessRate);
  }
}
