import { NavigationRuntime, runNavigation } from '../../../lib/runtime/navigation-runtime';
import { createMockInference } from '../../../lib/runtime/llm-inference';
import {
  ARENA_SIMPLE_NAVIGATION,
  ARENA_EXPLORATION,
  ARENA_DEAD_END,
  ARENA_NARROW_CORRIDOR,
  ALL_TEST_ARENAS,
} from '../../../lib/runtime/test-arenas';

// =============================================================================
// Tests
// =============================================================================

describe('NavigationRuntime', () => {
  describe('basic functionality', () => {
    it('runs a complete navigation session', async () => {
      const result = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference()
      );

      expect(result.evaluation).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.report).toContain('Simple Navigation');
      expect(result.totalTimeMs).toBeGreaterThan(0);
    });

    it('returns evaluation with all criteria', async () => {
      const result = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference()
      );

      // Should have multiple criteria evaluated
      expect(result.evaluation.criteria.length).toBeGreaterThanOrEqual(4);
      expect(result.evaluation.totalCount).toBeGreaterThanOrEqual(4);
    });

    it('logs cycle-by-cycle data', async () => {
      const result = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference()
      );

      const entries = result.entries;
      expect(entries.length).toBeGreaterThan(0);

      // First entry should have valid data
      const first = entries[0];
      expect(first.cycle).toBe(1);
      expect(first.pose).toBeDefined();
      expect(first.decision).toBeDefined();
      expect(first.decision.actionType).toBeDefined();
    });

    it('calls onCycle callback each cycle', async () => {
      const cycles: number[] = [];

      await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference(),
        {
          onCycle: (cycle) => cycles.push(cycle),
        }
      );

      expect(cycles.length).toBeGreaterThan(0);
      // Cycles should be sequential
      for (let i = 1; i < cycles.length; i++) {
        expect(cycles[i]).toBe(cycles[i - 1] + 1);
      }
    });
  });

  describe('goal navigation', () => {
    it('makes progress toward goal over time', async () => {
      const result = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference()
      );

      const entries = result.entries;
      const goalEntries = entries.filter(e => e.goalDistanceM !== null);

      if (goalEntries.length >= 2) {
        const firstDist = goalEntries[0].goalDistanceM!;
        const lastDist = goalEntries[goalEntries.length - 1].goalDistanceM!;
        // Should have made some progress (or reached goal)
        expect(lastDist).toBeLessThan(firstDist + 0.5);
      }
    });

    it('robot actually moves from start position', async () => {
      const result = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference()
      );

      const entries = result.entries;
      const start = entries[0].pose;
      const end = entries[entries.length - 1].pose;

      const moved = Math.sqrt(
        (end.x - start.x) ** 2 + (end.y - start.y) ** 2
      );
      expect(moved).toBeGreaterThan(0.1);
    });

    it('respects cycle limit', async () => {
      const result = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference()
      );

      expect(result.summary.totalCycles).toBeLessThanOrEqual(
        ARENA_SIMPLE_NAVIGATION.criteria.maxCycles
      );
    });
  });

  describe('exploration mode', () => {
    it('runs exploration without goal', async () => {
      const result = await runNavigation(
        ARENA_EXPLORATION,
        createMockInference()
      );

      expect(result.evaluation).toBeDefined();
      expect(result.summary.goalReached).toBe(false);
      expect(result.summary.totalCycles).toBeGreaterThan(0);
    });

    it('increases exploration over time', async () => {
      const result = await runNavigation(
        ARENA_EXPLORATION,
        createMockInference()
      );

      const entries = result.entries;
      if (entries.length >= 5) {
        const earlyExploration = entries[0].exploration;
        const lateExploration = entries[entries.length - 1].exploration;
        expect(lateExploration).toBeGreaterThanOrEqual(earlyExploration);
      }
    });
  });

  describe('collision detection', () => {
    it('detects collisions with arena boundary', async () => {
      // This test verifies collision detection works by checking
      // the robot stays within bounds
      const result = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference()
      );

      for (const entry of result.entries) {
        const { x, y } = entry.pose;
        const b = ARENA_SIMPLE_NAVIGATION.world.bounds;
        // Robot should stay within bounds (with some margin)
        expect(x).toBeGreaterThan(b.minX - 0.1);
        expect(x).toBeLessThan(b.maxX + 0.1);
        expect(y).toBeGreaterThan(b.minY - 0.1);
        expect(y).toBeLessThan(b.maxY + 0.1);
      }
    });
  });

  describe('multiple arenas', () => {
    it('can run different arena configurations', async () => {
      const arenas = [ARENA_SIMPLE_NAVIGATION, ARENA_EXPLORATION];
      const infer = createMockInference();

      for (const arena of arenas) {
        const result = await runNavigation(arena, infer);
        expect(result.evaluation.arenaName).toBe(arena.name);
        expect(result.summary.totalCycles).toBeGreaterThan(0);
      }
    });
  });

  describe('report formatting', () => {
    it('produces readable evaluation report', async () => {
      const result = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference()
      );

      expect(result.report).toContain('Simple Navigation');
      expect(result.report).toContain('Collisions');
      expect(result.report).toContain('Cycle Limit');
      expect(result.report).toContain('Stuck Recovery');
    });
  });
});

describe('createMockInference', () => {
  it('returns valid JSON decisions', async () => {
    const infer = createMockInference();
    const response = await infer(
      'system prompt',
      'Some prompt with c1 [subgoal] (1.50, 1.50) score=0.85 and f2 [frontier] (2.0, 0.5) score=0.60'
    );

    const parsed = JSON.parse(response);
    expect(parsed.action).toBeDefined();
    expect(parsed.action.type).toBeDefined();
    expect(parsed.fallback).toBeDefined();
    expect(parsed.explanation).toBeDefined();
  });

  it('picks highest-scoring candidate', async () => {
    const infer = createMockInference();
    const response = await infer(
      'system',
      'c1 [subgoal] (0.0, 0.0) score=0.30 and c2 [subgoal] (1.0, 1.0) score=0.95'
    );

    const parsed = JSON.parse(response);
    expect(parsed.action.target_id).toBe('c2');
  });

  it('prefers recovery when stuck', async () => {
    const infer = createMockInference();
    const response = await infer(
      'system',
      'c1 [subgoal] (0.0, 0.0) score=0.90 and r1 [recovery] (1.0, 1.0) score=0.50 "is_stuck": true'
    );

    const parsed = JSON.parse(response);
    expect(parsed.action.target_id).toBe('r1');
  });

  it('rotates when no candidates', async () => {
    const infer = createMockInference();
    const response = await infer('system', 'No candidates available');

    const parsed = JSON.parse(response);
    expect(parsed.action.type).toBe('ROTATE_TO');
  });
});
