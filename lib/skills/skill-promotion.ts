/**
 * Skill Promotion Pipeline
 *
 * Skills flow upward through the three-tier volume system as they
 * prove reliable. A pattern discovered by one user can become a
 * team standard and eventually a system primitive.
 *
 * Promotion thresholds:
 * - User → Team: 5+ uses with 80%+ success rate
 * - Team → System: 10+ uses with 90%+ success rate
 *
 * The promotion process:
 * 1. Track skill usage metrics (invocations, successes, failures)
 * 2. Evaluate skills against promotion thresholds
 * 3. Copy promoted skills to the target volume
 * 4. Update skill metadata with promotion history
 */

import type { Skill } from './client-skills-manager';

// =============================================================================
// Types
// =============================================================================

/** The three-tier volume hierarchy */
export type VolumeLevel = 'user' | 'team' | 'system';

/** Usage metrics tracked for each skill */
export interface SkillUsageMetrics {
  /** Unique skill identifier */
  skill_id: string;
  /** Skill name */
  skill_name: string;
  /** Current volume level */
  current_volume: VolumeLevel;
  /** Total number of invocations */
  total_uses: number;
  /** Number of successful invocations */
  successful_uses: number;
  /** Number of failed invocations */
  failed_uses: number;
  /** Success rate (0-1) */
  success_rate: number;
  /** Timestamp of first use */
  first_used: string;
  /** Timestamp of most recent use */
  last_used: string;
  /** History of promotion events */
  promotion_history: PromotionEvent[];
}

/** Record of a promotion event */
export interface PromotionEvent {
  /** Source volume */
  from: VolumeLevel;
  /** Target volume */
  to: VolumeLevel;
  /** When the promotion occurred */
  timestamp: string;
  /** Metrics at time of promotion */
  metrics_at_promotion: {
    total_uses: number;
    success_rate: number;
  };
}

/** Promotion evaluation result */
export interface PromotionEvaluation {
  /** Skill being evaluated */
  skill_id: string;
  /** Whether the skill qualifies for promotion */
  eligible: boolean;
  /** Current volume */
  current_volume: VolumeLevel;
  /** Target volume if eligible */
  target_volume?: VolumeLevel;
  /** Current metrics */
  metrics: {
    total_uses: number;
    success_rate: number;
  };
  /** Required thresholds for next promotion */
  required: {
    min_uses: number;
    min_success_rate: number;
  };
  /** What's missing for promotion (if not eligible) */
  gap?: {
    uses_needed: number;
    success_rate_needed: number;
  };
}

/** Promotion thresholds configuration */
export interface PromotionThresholds {
  user_to_team: {
    min_uses: number;
    min_success_rate: number;
  };
  team_to_system: {
    min_uses: number;
    min_success_rate: number;
  };
}

// =============================================================================
// Default Thresholds (from README specification)
// =============================================================================

export const DEFAULT_PROMOTION_THRESHOLDS: PromotionThresholds = {
  user_to_team: {
    min_uses: 5,
    min_success_rate: 0.8,
  },
  team_to_system: {
    min_uses: 10,
    min_success_rate: 0.9,
  },
};

// =============================================================================
// Skill Promotion Manager
// =============================================================================

export class SkillPromotionManager {
  private metrics: Map<string, SkillUsageMetrics> = new Map();
  private thresholds: PromotionThresholds;

  constructor(thresholds: PromotionThresholds = DEFAULT_PROMOTION_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  /**
   * Record a skill usage event
   */
  recordUsage(skillId: string, skillName: string, volume: VolumeLevel, success: boolean): void {
    let metrics = this.metrics.get(skillId);
    const now = new Date().toISOString();

    if (!metrics) {
      metrics = {
        skill_id: skillId,
        skill_name: skillName,
        current_volume: volume,
        total_uses: 0,
        successful_uses: 0,
        failed_uses: 0,
        success_rate: 0,
        first_used: now,
        last_used: now,
        promotion_history: [],
      };
    }

    metrics.total_uses += 1;
    if (success) {
      metrics.successful_uses += 1;
    } else {
      metrics.failed_uses += 1;
    }
    metrics.success_rate = metrics.successful_uses / metrics.total_uses;
    metrics.last_used = now;

    this.metrics.set(skillId, metrics);
  }

  /**
   * Evaluate whether a skill is eligible for promotion
   */
  evaluatePromotion(skillId: string): PromotionEvaluation | null {
    const metrics = this.metrics.get(skillId);
    if (!metrics) return null;

    const currentVolume = metrics.current_volume;

    // System-level skills cannot be promoted further
    if (currentVolume === 'system') {
      return {
        skill_id: skillId,
        eligible: false,
        current_volume: currentVolume,
        metrics: {
          total_uses: metrics.total_uses,
          success_rate: metrics.success_rate,
        },
        required: {
          min_uses: 0,
          min_success_rate: 0,
        },
      };
    }

    const threshold = currentVolume === 'user'
      ? this.thresholds.user_to_team
      : this.thresholds.team_to_system;

    const targetVolume: VolumeLevel = currentVolume === 'user' ? 'team' : 'system';

    const eligible =
      metrics.total_uses >= threshold.min_uses &&
      metrics.success_rate >= threshold.min_success_rate;

    const evaluation: PromotionEvaluation = {
      skill_id: skillId,
      eligible,
      current_volume: currentVolume,
      target_volume: eligible ? targetVolume : undefined,
      metrics: {
        total_uses: metrics.total_uses,
        success_rate: metrics.success_rate,
      },
      required: {
        min_uses: threshold.min_uses,
        min_success_rate: threshold.min_success_rate,
      },
    };

    if (!eligible) {
      evaluation.gap = {
        uses_needed: Math.max(0, threshold.min_uses - metrics.total_uses),
        success_rate_needed: Math.max(0, threshold.min_success_rate - metrics.success_rate),
      };
    }

    return evaluation;
  }

  /**
   * Execute promotion for a skill.
   * Returns the promotion event if successful.
   */
  promote(skillId: string): PromotionEvent | null {
    const evaluation = this.evaluatePromotion(skillId);
    if (!evaluation || !evaluation.eligible || !evaluation.target_volume) {
      return null;
    }

    const metrics = this.metrics.get(skillId)!;
    const now = new Date().toISOString();

    const event: PromotionEvent = {
      from: metrics.current_volume,
      to: evaluation.target_volume,
      timestamp: now,
      metrics_at_promotion: {
        total_uses: metrics.total_uses,
        success_rate: metrics.success_rate,
      },
    };

    metrics.promotion_history.push(event);
    metrics.current_volume = evaluation.target_volume;
    this.metrics.set(skillId, metrics);

    return event;
  }

  /**
   * Get all skills eligible for promotion
   */
  getPromotionCandidates(): PromotionEvaluation[] {
    const candidates: PromotionEvaluation[] = [];

    for (const skillId of this.metrics.keys()) {
      const evaluation = this.evaluatePromotion(skillId);
      if (evaluation?.eligible) {
        candidates.push(evaluation);
      }
    }

    return candidates;
  }

  /**
   * Get usage metrics for a skill
   */
  getMetrics(skillId: string): SkillUsageMetrics | undefined {
    return this.metrics.get(skillId);
  }

  /**
   * Get all tracked metrics
   */
  getAllMetrics(): SkillUsageMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Load metrics from serialized data (e.g., from localStorage or file)
   */
  loadMetrics(data: SkillUsageMetrics[]): void {
    for (const metric of data) {
      this.metrics.set(metric.skill_id, metric);
    }
  }

  /**
   * Export all metrics for persistence
   */
  exportMetrics(): SkillUsageMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get the volume path for a given level
   */
  static getVolumePath(level: VolumeLevel): string {
    switch (level) {
      case 'system':
        return 'volumes/system/skills';
      case 'team':
        return 'volumes/team/skills';
      case 'user':
        return 'volumes/user/skills';
    }
  }
}
