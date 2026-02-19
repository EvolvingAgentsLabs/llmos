import { SkillTracker, SkillInvocation, SkillTrackerSnapshot } from '../../../lib/runtime/skill-tracker';
import { VolumeLevel } from '../../../lib/skills/skill-promotion';

// =============================================================================
// Helpers
// =============================================================================

function makeInvocation(
  skillId: string,
  success: boolean,
  opts?: Partial<SkillInvocation>,
): SkillInvocation {
  return {
    skillId,
    skillName: skillId,
    volume: 'user',
    success,
    durationMs: 100,
    timestamp: Date.now(),
    ...opts,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('SkillTracker', () => {
  let tracker: SkillTracker;

  beforeEach(() => {
    tracker = new SkillTracker();
  });

  test('records invocations and updates stats', () => {
    tracker.recordInvocation(makeInvocation('skill-A', true));
    tracker.recordInvocation(makeInvocation('skill-A', true));
    tracker.recordInvocation(makeInvocation('skill-A', false));

    const stats = tracker.getStats();
    expect(stats.totalInvocations).toBe(3);
    expect(stats.totalSuccesses).toBe(2);
    expect(stats.totalFailures).toBe(1);
    expect(stats.uniqueSkills).toBe(1);
  });

  test('tracks per-skill invocation history', () => {
    for (let i = 0; i < 5; i++) {
      tracker.recordInvocation(makeInvocation('skill-A', true));
    }

    const history = tracker.getSkillHistory('skill-A');
    expect(history).toHaveLength(5);
    expect(history.every((inv) => inv.skillId === 'skill-A')).toBe(true);
  });

  test('trims history to maxHistoryPerSkill', () => {
    tracker = new SkillTracker({ maxHistoryPerSkill: 3 });

    for (let i = 0; i < 5; i++) {
      tracker.recordInvocation(
        makeInvocation('skill-A', true, { timestamp: 1000 + i }),
      );
    }

    const history = tracker.getSkillHistory('skill-A');
    expect(history).toHaveLength(3);
    // Should keep the most recent 3 (timestamps 1002, 1003, 1004)
    expect(history[0].timestamp).toBe(1002);
    expect(history[1].timestamp).toBe(1003);
    expect(history[2].timestamp).toBe(1004);
  });

  test('gets promotion candidates when threshold met', () => {
    // Default user->team threshold: 5 uses, 80% success rate
    // Record 5 successful uses for a user-level skill
    for (let i = 0; i < 5; i++) {
      tracker.recordInvocation(makeInvocation('skill-A', true));
    }

    const candidates = tracker.getPromotionCandidates();
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates.some((c) => c.skill_id === 'skill-A')).toBe(true);
    expect(candidates.find((c) => c.skill_id === 'skill-A')?.eligible).toBe(true);
    expect(candidates.find((c) => c.skill_id === 'skill-A')?.target_volume).toBe('team');
  });

  test('promotes skill from user to team', () => {
    // Record enough successful uses to be eligible
    for (let i = 0; i < 5; i++) {
      tracker.recordInvocation(makeInvocation('skill-A', true));
    }

    const event = tracker.promoteSkill('skill-A');
    expect(event).not.toBeNull();
    expect(event!.from).toBe('user');
    expect(event!.to).toBe('team');

    const stats = tracker.getStats();
    expect(stats.promotionEvents).toBe(1);

    // Verify the skill is now at team level
    const metrics = tracker.getSkillMetrics('skill-A');
    expect(metrics?.current_volume).toBe('team');
  });

  test('auto-promotes when enabled', () => {
    tracker = new SkillTracker({ autoPromote: true });

    // Record 5 successful uses — should auto-promote user -> team
    for (let i = 0; i < 5; i++) {
      tracker.recordInvocation(makeInvocation('skill-A', true));
    }

    const metrics = tracker.getSkillMetrics('skill-A');
    expect(metrics?.current_volume).toBe('team');

    const stats = tracker.getStats();
    expect(stats.promotionEvents).toBe(1);
  });

  test('getTopSkills returns sorted by usage', () => {
    // Record different usage counts for different skills
    for (let i = 0; i < 10; i++) {
      tracker.recordInvocation(makeInvocation('skill-A', true));
    }
    for (let i = 0; i < 3; i++) {
      tracker.recordInvocation(makeInvocation('skill-B', true));
    }
    for (let i = 0; i < 7; i++) {
      tracker.recordInvocation(makeInvocation('skill-C', true));
    }

    const top = tracker.getTopSkills(3);
    expect(top).toHaveLength(3);
    expect(top[0].skill_id).toBe('skill-A');
    expect(top[0].total_uses).toBe(10);
    expect(top[1].skill_id).toBe('skill-C');
    expect(top[1].total_uses).toBe(7);
    expect(top[2].skill_id).toBe('skill-B');
    expect(top[2].total_uses).toBe(3);
  });

  test('getFailingSkills returns low success rate skills', () => {
    // skill-A: 100% success
    for (let i = 0; i < 5; i++) {
      tracker.recordInvocation(makeInvocation('skill-A', true));
    }

    // skill-B: 20% success (1 success, 4 failures)
    tracker.recordInvocation(makeInvocation('skill-B', true));
    for (let i = 0; i < 4; i++) {
      tracker.recordInvocation(makeInvocation('skill-B', false));
    }

    // skill-C: 40% success (2 success, 3 failures)
    tracker.recordInvocation(makeInvocation('skill-C', true));
    tracker.recordInvocation(makeInvocation('skill-C', true));
    for (let i = 0; i < 3; i++) {
      tracker.recordInvocation(makeInvocation('skill-C', false));
    }

    const failing = tracker.getFailingSkills(0.5);
    expect(failing).toHaveLength(2);
    const ids = failing.map((m) => m.skill_id).sort();
    expect(ids).toEqual(['skill-B', 'skill-C']);
  });

  test('snapshot and restore round-trip', () => {
    // Build up some state
    for (let i = 0; i < 5; i++) {
      tracker.recordInvocation(makeInvocation('skill-A', true, { durationMs: 200 }));
    }
    tracker.recordInvocation(makeInvocation('skill-B', false, { durationMs: 50 }));
    tracker.promoteSkill('skill-A');

    const snap = tracker.snapshot();

    // Create a new tracker and restore
    const tracker2 = new SkillTracker();
    tracker2.restore(snap);

    // Verify metrics match
    const metricsA = tracker2.getSkillMetrics('skill-A');
    expect(metricsA).toBeDefined();
    expect(metricsA!.total_uses).toBe(5);
    expect(metricsA!.current_volume).toBe('team');

    const metricsB = tracker2.getSkillMetrics('skill-B');
    expect(metricsB).toBeDefined();
    expect(metricsB!.total_uses).toBe(1);

    // Verify invocation history
    expect(tracker2.getSkillHistory('skill-A')).toHaveLength(5);
    expect(tracker2.getSkillHistory('skill-B')).toHaveLength(1);

    // Verify stats
    const stats = tracker2.getStats();
    expect(stats.totalInvocations).toBe(6);
    expect(stats.totalSuccesses).toBe(5);
    expect(stats.totalFailures).toBe(1);
    expect(stats.uniqueSkills).toBe(2);
    expect(stats.promotionEvents).toBe(1);
  });

  test('reset clears all state', () => {
    // Add some data
    for (let i = 0; i < 5; i++) {
      tracker.recordInvocation(makeInvocation('skill-A', true));
    }
    tracker.promoteSkill('skill-A');

    // Reset
    tracker.reset();

    // Verify everything is clean
    expect(tracker.getAllMetrics()).toHaveLength(0);
    expect(tracker.getSkillHistory('skill-A')).toHaveLength(0);
    expect(tracker.getPromotionLog()).toHaveLength(0);
    const stats = tracker.getStats();
    expect(stats.totalInvocations).toBe(0);
    expect(stats.totalSuccesses).toBe(0);
    expect(stats.totalFailures).toBe(0);
    expect(stats.uniqueSkills).toBe(0);
    expect(stats.promotionEvents).toBe(0);
    expect(stats.avgDurationMs).toBe(0);
  });

  test('getSkillMetrics returns undefined for unknown skill', () => {
    expect(tracker.getSkillMetrics('nonexistent')).toBeUndefined();
  });

  test('promotion log tracks all promotions', () => {
    // Prepare two skills for promotion
    for (let i = 0; i < 5; i++) {
      tracker.recordInvocation(makeInvocation('skill-A', true));
      tracker.recordInvocation(makeInvocation('skill-B', true));
    }

    tracker.promoteSkill('skill-A');
    tracker.promoteSkill('skill-B');

    const log = tracker.getPromotionLog();
    expect(log).toHaveLength(2);
    expect(log[0].from).toBe('user');
    expect(log[0].to).toBe('team');
    expect(log[1].from).toBe('user');
    expect(log[1].to).toBe('team');
  });

  test('avgDurationMs updates correctly', () => {
    tracker.recordInvocation(makeInvocation('skill-A', true, { durationMs: 100 }));
    expect(tracker.getStats().avgDurationMs).toBe(100);

    tracker.recordInvocation(makeInvocation('skill-A', true, { durationMs: 200 }));
    expect(tracker.getStats().avgDurationMs).toBe(150);

    tracker.recordInvocation(makeInvocation('skill-A', true, { durationMs: 300 }));
    expect(tracker.getStats().avgDurationMs).toBe(200);

    // (100 + 200 + 300 + 0) / 4 = 150
    tracker.recordInvocation(makeInvocation('skill-B', false, { durationMs: 0 }));
    expect(tracker.getStats().avgDurationMs).toBe(150);
  });
});
