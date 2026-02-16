/**
 * End-to-End Navigation Integration Tests
 *
 * Wires together the full navigation pipeline with a mock LLM:
 *   Arena → Bridge → WorldModel → Provider → NavigationLoop → Mock LLM
 *   → Local Planner → Logger → Evaluator
 *
 * These tests verify the complete system works end-to-end without
 * a real LLM inference backend. The mock LLM uses a deterministic
 * strategy: always pick the highest-scoring candidate.
 */

import { WorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import { WorldModelProvider } from '../../../lib/runtime/world-model-provider';
import { NavigationLoop, type InferenceFunction } from '../../../lib/runtime/navigation-loop';
import { NavigationLogger, type CycleLogEntry } from '../../../lib/runtime/navigation-logger';
import { evaluateRun, formatEvaluationReport } from '../../../lib/runtime/navigation-evaluator';
import { clearAllWorldModels } from '../../../lib/runtime/world-model';
import {
  ARENA_SIMPLE_NAVIGATION,
  ARENA_EXPLORATION,
  ARENA_DEAD_END,
  ARENA_NARROW_CORRIDOR,
  type TestArenaConfig,
} from '../../../lib/runtime/test-arenas';
import type { LLMNavigationDecision } from '../../../lib/runtime/navigation-types';

// =============================================================================
// Mock LLM
// =============================================================================

/**
 * Deterministic mock LLM for testing.
 * Strategy: parse the candidates from the prompt and pick the highest-scoring one.
 * Falls back to STOP if no candidates found.
 */
function createMockLLM(): InferenceFunction {
  return async (_systemPrompt: string, userMessage: string, _images?: string[]): Promise<string> => {
    // Parse candidates from the prompt text
    const candidateRegex = /(\w+)\s+\[(\w+)\]\s+\(([^)]+)\)\s+score=([0-9.]+)/g;
    const candidates: Array<{ id: string; type: string; pos: string; score: number }> = [];

    let match;
    while ((match = candidateRegex.exec(userMessage)) !== null) {
      candidates.push({
        id: match[1],
        type: match[2],
        pos: match[3],
        score: parseFloat(match[4]),
      });
    }

    // Check if goal is nearby (from the prompt)
    const goalDistMatch = userMessage.match(/dist=([0-9.]+)m/);
    const goalDist = goalDistMatch ? parseFloat(goalDistMatch[1]) : Infinity;

    // Check if stuck
    const isStuck = userMessage.includes('STUCK');

    // Decision logic
    let decision: LLMNavigationDecision;

    if (goalDist < 0.5 && candidates.length > 0) {
      // Goal is close — move directly to the goal-type candidate
      const goalCandidate = candidates.find(c => c.type === 'subgoal') ?? candidates[0];
      decision = {
        action: { type: 'MOVE_TO', target_id: goalCandidate.id },
        fallback: { if_failed: 'STOP' },
        explanation: `Moving toward goal, distance ${goalDist.toFixed(2)}m`,
      };
    } else if (isStuck && candidates.length > 0) {
      // Stuck — prefer recovery candidates
      const recovery = candidates.find(c => c.type === 'recovery');
      const frontier = candidates.find(c => c.type === 'frontier');
      const target = recovery ?? frontier ?? candidates[0];
      decision = {
        action: { type: 'EXPLORE', target_id: target.id },
        fallback: { if_failed: 'ROTATE_TO' },
        explanation: `Stuck recovery: exploring ${target.type} candidate ${target.id}`,
      };
    } else if (candidates.length > 0) {
      // Normal: pick the highest-scoring candidate
      const sorted = [...candidates].sort((a, b) => b.score - a.score);
      const best = sorted[0];

      const actionType = best.type === 'frontier' ? 'EXPLORE' : 'MOVE_TO';
      decision = {
        action: { type: actionType, target_id: best.id },
        fallback: { if_failed: 'EXPLORE' },
        explanation: `Moving to best candidate ${best.id} (${best.type}, score=${best.score.toFixed(2)})`,
      };
    } else {
      // No candidates — rotate to scan
      decision = {
        action: { type: 'ROTATE_TO', yaw_deg: 90 },
        fallback: { if_failed: 'STOP' },
        explanation: 'No candidates available, rotating to scan',
      };
    }

    return JSON.stringify(decision);
  };
}

// =============================================================================
// Test Runner Helper
// =============================================================================

/**
 * Run a full navigation simulation on a test arena.
 * Returns the logger with all cycle data and the evaluation result.
 */
async function runSimulation(
  arena: TestArenaConfig,
  deviceId: string
): Promise<{
  logger: NavigationLogger;
  evaluation: ReturnType<typeof evaluateRun>;
}> {
  // 1. Setup
  const bridge = new WorldModelBridge({
    deviceId,
    inflationCells: 0, // No inflation for cleaner paths in test
    rasterizeBeacons: false,
  });
  bridge.rasterize(arena.world);

  const worldModel = bridge.getWorldModel();
  const provider = new WorldModelProvider(worldModel, bridge, {
    generateMapImages: false, // Skip canvas rendering in tests
  });

  const mockLLM = createMockLLM();
  const loop = new NavigationLoop(bridge, mockLLM, {
    maxCycles: arena.criteria.maxCycles,
    goalToleranceM: arena.criteria.goalToleranceM,
    generateMapImages: false,
    inferenceTimeoutMs: 2000,
  });

  const logger = new NavigationLogger(arena.name);

  // 2. Configure goal
  if (arena.goal) {
    loop.setGoal(arena.goal.x, arena.goal.y, arena.goal.text);
  } else {
    loop.setExplorationMode('Explore the entire arena');
  }

  // 3. Set initial pose
  loop.updatePose(
    arena.startPose.x,
    arena.startPose.y,
    arena.startPose.rotation
  );

  // 4. Run cycles
  let collision = false;
  for (let i = 0; i < arena.criteria.maxCycles; i++) {
    // Update provider
    provider.update(
      {
        x: loop.getState().position.x,
        y: loop.getState().position.y,
        rotation: loop.getState().yaw,
      },
      arena.goal ? {
        x: arena.goal.x,
        y: arena.goal.y,
        tolerance: arena.criteria.goalToleranceM,
        text: arena.goal.text,
      } : null,
      undefined,
      loop.getState().isStuck
    );

    // Run one cycle
    const result = await loop.runCycle();

    // Simulate movement: if path was planned, move toward first waypoint
    if (result.path?.success && result.path.waypoints.length > 1) {
      const wp = result.path.waypoints[1]; // Next waypoint (0 is current)
      // Move a fraction toward the waypoint (simulate ~0.3m per cycle)
      const state = loop.getState();
      const dx = wp.x - state.position.x;
      const dy = wp.y - state.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.min(0.3, dist);

      if (dist > 0.01) {
        const nx = state.position.x + (dx / dist) * step;
        const ny = state.position.y + (dy / dist) * step;
        const newYaw = Math.atan2(dx, dy); // sin=x, cos=y for heading
        loop.updatePose(nx, ny, newYaw, step);
      }

      // Report success
      loop.reportActionResult('success', `Moved ${step.toFixed(2)}m toward waypoint`);
    } else if (result.decision.action.type === 'ROTATE_TO') {
      // Simulate rotation + small forward step to avoid stuck loops
      const yawRad = ((result.decision.action.yaw_deg ?? 0) * Math.PI) / 180;
      const state = loop.getState();
      // Move a small amount in the new heading direction
      const nx = state.position.x + Math.sin(yawRad) * 0.15;
      const ny = state.position.y + Math.cos(yawRad) * 0.15;
      // Clamp to arena bounds
      const cx = Math.max(-2.3, Math.min(2.3, nx));
      const cy = Math.max(-2.3, Math.min(2.3, ny));
      loop.updatePose(cx, cy, yawRad, 0.15);
      loop.reportActionResult('success', 'Rotated and moved');
    } else if (result.decision.action.type === 'STOP') {
      loop.reportActionResult('success', 'Stopped');
    } else if (result.decision.action.type === 'EXPLORE' || result.decision.action.type === 'FOLLOW_WALL') {
      // For EXPLORE/FOLLOW_WALL without a planned path, move a small step in current heading
      const state = loop.getState();
      const nx = state.position.x + Math.sin(state.yaw) * 0.2;
      const ny = state.position.y + Math.cos(state.yaw) * 0.2;
      const cx = Math.max(-2.3, Math.min(2.3, nx));
      const cy = Math.max(-2.3, Math.min(2.3, ny));
      loop.updatePose(cx, cy, state.yaw, 0.2);
      loop.reportActionResult('success', 'Exploring forward');
    } else {
      // No path or failed — report blocked
      loop.reportActionResult('blocked', 'No valid path');
    }

    // Compute goal distance
    let goalDistanceM: number | null = null;
    if (arena.goal) {
      const dx = loop.getState().position.x - arena.goal.x;
      const dy = loop.getState().position.y - arena.goal.y;
      goalDistanceM = Math.sqrt(dx * dx + dy * dy);
    }

    // Log cycle
    const logEntry: CycleLogEntry = {
      cycle: result.cycle,
      timestamp: Date.now(),
      pose: {
        x: loop.getState().position.x,
        y: loop.getState().position.y,
        rotation: loop.getState().yaw,
      },
      mode: result.mode,
      isStuck: result.isStuck,
      stuckCounter: loop.getState().stuckCounter,
      exploration: provider.getExploration(),
      cellCounts: getCellCounts(worldModel),
      frontierCount: bridge.findFrontiers().length,
      candidates: provider.getCandidates().map(c => ({
        id: c.id,
        type: c.type,
        pos_m: c.pos_m,
        score: c.score,
      })),
      decision: {
        actionType: result.decision.action.type,
        targetId: result.decision.action.target_id,
        targetM: result.decision.action.target_m,
        fallback: result.decision.fallback.if_failed,
        explanation: result.decision.explanation,
      },
      pathResult: result.path ? {
        success: result.path.success,
        waypointCount: result.path.waypoints.length,
        pathLengthM: result.path.pathLengthM,
        planningTimeMs: result.path.planningTimeMs,
        error: result.path.error,
      } : null,
      cycleTimeMs: result.cycleTimeMs,
      goalDistanceM,
      goalReached: result.goalReached,
      collision: false,
    };

    logger.logCycle(logEntry);

    // Stop if goal reached
    if (result.goalReached) break;
  }

  // 5. Evaluate
  const summary = logger.getSummary();
  const evaluation = evaluateRun(summary, arena.criteria, !!arena.goal);

  return { logger, evaluation };
}

function getCellCounts(worldModel: ReturnType<typeof WorldModelBridge.prototype.getWorldModel>) {
  const grid = worldModel.getGrid();
  const counts = { free: 0, obstacle: 0, wall: 0, unknown: 0, explored: 0 };
  for (const row of grid) {
    for (const cell of row) {
      switch (cell.state) {
        case 'free': counts.free++; break;
        case 'obstacle': counts.obstacle++; break;
        case 'wall': counts.wall++; break;
        case 'unknown': counts.unknown++; break;
        case 'explored': counts.explored++; break;
      }
    }
  }
  return counts;
}

// =============================================================================
// Cleanup
// =============================================================================

afterEach(() => {
  clearAllWorldModels();
});

// =============================================================================
// Tests: Individual Module Checks
// =============================================================================

describe('Test Arenas', () => {
  it('ARENA_SIMPLE_NAVIGATION has valid structure', () => {
    expect(ARENA_SIMPLE_NAVIGATION.world.walls.length).toBe(4);
    expect(ARENA_SIMPLE_NAVIGATION.world.obstacles.length).toBe(3);
    expect(ARENA_SIMPLE_NAVIGATION.goal).not.toBeNull();
    expect(ARENA_SIMPLE_NAVIGATION.criteria.maxCycles).toBeGreaterThan(0);
  });

  it('ARENA_EXPLORATION has no goal', () => {
    expect(ARENA_EXPLORATION.goal).toBeNull();
    expect(ARENA_EXPLORATION.criteria.minExploration).toBeGreaterThan(0);
  });

  it('ARENA_DEAD_END has internal walls', () => {
    expect(ARENA_DEAD_END.world.walls.length).toBeGreaterThan(4);
  });

  it('ARENA_NARROW_CORRIDOR has corridor walls', () => {
    expect(ARENA_NARROW_CORRIDOR.world.walls.length).toBe(6);
  });
});

describe('Mock LLM', () => {
  it('returns valid JSON for a prompt with candidates', async () => {
    const mockLLM = createMockLLM();
    const prompt = `CANDIDATES:
  c1 [subgoal] (1.50, 1.50) score=0.85 — Direct path to goal
  f1 [frontier] (0.50, 2.00) score=0.60 — Unexplored area`;

    const response = await mockLLM('system', prompt);
    const parsed = JSON.parse(response);

    expect(parsed.action.type).toBeDefined();
    expect(parsed.fallback.if_failed).toBeDefined();
    expect(parsed.explanation).toBeDefined();
  });

  it('picks the highest-scoring candidate', async () => {
    const mockLLM = createMockLLM();
    const prompt = `CANDIDATES:
  c1 [subgoal] (1.50, 1.50) score=0.60 — Path A
  c2 [subgoal] (2.00, 2.00) score=0.90 — Path B`;

    const response = await mockLLM('system', prompt);
    const parsed = JSON.parse(response);

    expect(parsed.action.target_id).toBe('c2');
  });

  it('returns ROTATE_TO when no candidates', async () => {
    const mockLLM = createMockLLM();
    const response = await mockLLM('system', 'No candidates here.');
    const parsed = JSON.parse(response);

    expect(parsed.action.type).toBe('ROTATE_TO');
  });

  it('prefers recovery candidate when stuck', async () => {
    const mockLLM = createMockLLM();
    const prompt = `STUCK for 5 cycles
CANDIDATES:
  c1 [subgoal] (1.50, 1.50) score=0.85 — Path
  r1 [recovery] (0.00, 0.00) score=0.50 — Safe retreat`;

    const response = await mockLLM('system', prompt);
    const parsed = JSON.parse(response);

    expect(parsed.action.target_id).toBe('r1');
    expect(parsed.explanation).toContain('recovery');
  });
});

describe('NavigationLogger', () => {
  it('tracks cumulative distance', () => {
    const logger = new NavigationLogger('test');

    const baseEntry: CycleLogEntry = {
      cycle: 1,
      timestamp: Date.now(),
      pose: { x: 0, y: 0, rotation: 0 },
      mode: 'navigating',
      isStuck: false,
      stuckCounter: 0,
      exploration: 0.5,
      cellCounts: { free: 100, obstacle: 10, wall: 40, unknown: 350, explored: 0 },
      frontierCount: 20,
      candidates: [],
      decision: { actionType: 'MOVE_TO', fallback: 'STOP', explanation: 'Moving forward' },
      pathResult: null,
      cycleTimeMs: 10,
      goalDistanceM: 2.0,
      goalReached: false,
      collision: false,
    };

    logger.logCycle({ ...baseEntry, pose: { x: 0, y: 0, rotation: 0 } });
    logger.logCycle({ ...baseEntry, cycle: 2, pose: { x: 1, y: 0, rotation: 0 } });
    logger.logCycle({ ...baseEntry, cycle: 3, pose: { x: 1, y: 1, rotation: 0 } });

    const summary = logger.getSummary();
    expect(summary.totalDistanceTraveled).toBe(2);
  });

  it('tracks collision count', () => {
    const logger = new NavigationLogger('test');
    const base: CycleLogEntry = {
      cycle: 1,
      timestamp: Date.now(),
      pose: { x: 0, y: 0, rotation: 0 },
      mode: 'navigating',
      isStuck: false,
      stuckCounter: 0,
      exploration: 0.5,
      cellCounts: { free: 100, obstacle: 10, wall: 40, unknown: 350, explored: 0 },
      frontierCount: 20,
      candidates: [],
      decision: { actionType: 'MOVE_TO', fallback: 'STOP', explanation: 'Moving forward' },
      pathResult: null,
      cycleTimeMs: 10,
      goalDistanceM: 2.0,
      goalReached: false,
      collision: false,
    };

    logger.logCycle(base);
    logger.logCycle({ ...base, cycle: 2, collision: true });
    logger.logCycle({ ...base, cycle: 3, collision: true });

    expect(logger.getSummary().totalCollisions).toBe(2);
  });

  it('getTrajectory returns path', () => {
    const logger = new NavigationLogger('test');
    const base: CycleLogEntry = {
      cycle: 1,
      timestamp: Date.now(),
      pose: { x: 0, y: 0, rotation: 0 },
      mode: 'navigating',
      isStuck: false,
      stuckCounter: 0,
      exploration: 0.5,
      cellCounts: { free: 100, obstacle: 10, wall: 40, unknown: 350, explored: 0 },
      frontierCount: 20,
      candidates: [],
      decision: { actionType: 'MOVE_TO', fallback: 'STOP', explanation: 'Moving forward' },
      pathResult: null,
      cycleTimeMs: 10,
      goalDistanceM: 2.0,
      goalReached: false,
      collision: false,
    };

    logger.logCycle({ ...base, pose: { x: 0, y: 0, rotation: 0 } });
    logger.logCycle({ ...base, cycle: 2, pose: { x: 1, y: 1, rotation: 0 } });

    const traj = logger.getTrajectory();
    expect(traj.length).toBe(2);
    expect(traj[0]).toEqual({ x: 0, y: 0 });
    expect(traj[1]).toEqual({ x: 1, y: 1 });
  });

  it('passedNear detects proximity', () => {
    const logger = new NavigationLogger('test');
    const base: CycleLogEntry = {
      cycle: 1,
      timestamp: Date.now(),
      pose: { x: 1.0, y: 1.0, rotation: 0 },
      mode: 'navigating',
      isStuck: false,
      stuckCounter: 0,
      exploration: 0.5,
      cellCounts: { free: 100, obstacle: 10, wall: 40, unknown: 350, explored: 0 },
      frontierCount: 20,
      candidates: [],
      decision: { actionType: 'MOVE_TO', fallback: 'STOP', explanation: 'Moving forward' },
      pathResult: null,
      cycleTimeMs: 10,
      goalDistanceM: 1.0,
      goalReached: false,
      collision: false,
    };

    logger.logCycle(base);

    expect(logger.passedNear(1.1, 1.1, 0.3)).toBe(true);
    expect(logger.passedNear(5.0, 5.0, 0.3)).toBe(false);
  });
});

describe('NavigationEvaluator', () => {
  it('passes when all criteria met', () => {
    const summary = {
      arenaName: 'test',
      totalCycles: 50,
      goalReached: true,
      goalReachedAtCycle: 45,
      totalCollisions: 0,
      finalExploration: 0.6,
      peakStuckCounter: 2,
      totalDistanceTraveled: 5.0,
      averageCycleTimeMs: 15,
      actionDistribution: { MOVE_TO: 40, EXPLORE: 10 },
      fallbackCount: 0,
      coherenceScore: 0.9,
    };

    const criteria = {
      goalToleranceM: 0.3,
      maxCollisions: 0,
      minExploration: 0,
      maxCycles: 100,
      maxStuckCounter: 10,
    };

    const result = evaluateRun(summary, criteria, true);
    expect(result.passed).toBe(true);
  });

  it('fails when goal not reached', () => {
    const summary = {
      arenaName: 'test',
      totalCycles: 100,
      goalReached: false,
      goalReachedAtCycle: -1,
      totalCollisions: 0,
      finalExploration: 0.6,
      peakStuckCounter: 5,
      totalDistanceTraveled: 8.0,
      averageCycleTimeMs: 15,
      actionDistribution: { MOVE_TO: 80, EXPLORE: 20 },
      fallbackCount: 5,
      coherenceScore: 0.8,
    };

    const criteria = {
      goalToleranceM: 0.3,
      maxCollisions: 0,
      minExploration: 0,
      maxCycles: 100,
      maxStuckCounter: 10,
    };

    const result = evaluateRun(summary, criteria, true);
    expect(result.passed).toBe(false);
    expect(result.criteria.find(c => c.name === 'Goal Reached')?.passed).toBe(false);
  });

  it('fails when collisions exceed threshold', () => {
    const summary = {
      arenaName: 'test',
      totalCycles: 50,
      goalReached: true,
      goalReachedAtCycle: 45,
      totalCollisions: 2,
      finalExploration: 0.6,
      peakStuckCounter: 0,
      totalDistanceTraveled: 5.0,
      averageCycleTimeMs: 15,
      actionDistribution: { MOVE_TO: 50 },
      fallbackCount: 0,
      coherenceScore: 0.9,
    };

    const result = evaluateRun(summary, {
      goalToleranceM: 0.3,
      maxCollisions: 0,
      minExploration: 0,
      maxCycles: 100,
      maxStuckCounter: 10,
    }, true);

    expect(result.passed).toBe(false);
    expect(result.criteria.find(c => c.name === 'Collisions')?.passed).toBe(false);
  });

  it('formats report string', () => {
    const summary = {
      arenaName: 'Test Arena',
      totalCycles: 30,
      goalReached: true,
      goalReachedAtCycle: 25,
      totalCollisions: 0,
      finalExploration: 0.7,
      peakStuckCounter: 1,
      totalDistanceTraveled: 4.5,
      averageCycleTimeMs: 12,
      actionDistribution: { MOVE_TO: 25, STOP: 5 },
      fallbackCount: 1,
      coherenceScore: 0.85,
    };

    const result = evaluateRun(summary, {
      goalToleranceM: 0.3,
      maxCollisions: 0,
      minExploration: 0,
      maxCycles: 100,
      maxStuckCounter: 10,
    }, true);

    const report = formatEvaluationReport(result);
    expect(report).toContain('PASS');
    expect(report).toContain('Test Arena');
    expect(report).toContain('Goal Reached');
  });
});

// =============================================================================
// End-to-End Integration Tests
// =============================================================================

describe('E2E: Simple Navigation', () => {
  it('runs simulation and produces evaluation', async () => {
    const { logger, evaluation } = await runSimulation(
      ARENA_SIMPLE_NAVIGATION,
      'e2e-simple-1'
    );

    // Verify we got log entries
    expect(logger.getEntries().length).toBeGreaterThan(0);

    // Verify evaluation has all expected criteria
    expect(evaluation.criteria.length).toBeGreaterThanOrEqual(5);

    // Check that the simulation actually moved the robot
    const trajectory = logger.getTrajectory();
    expect(trajectory.length).toBeGreaterThan(1);

    // Robot should have moved from start position
    const lastPos = trajectory[trajectory.length - 1];
    const startPos = trajectory[0];
    const totalMovement = Math.sqrt(
      (lastPos.x - startPos.x) ** 2 + (lastPos.y - startPos.y) ** 2
    );
    expect(totalMovement).toBeGreaterThan(0);
  }, 15000);

  it('robot makes progress toward goal', async () => {
    const { logger } = await runSimulation(
      ARENA_SIMPLE_NAVIGATION,
      'e2e-simple-2'
    );

    const entries = logger.getEntries();
    const firstGoalDist = entries[0].goalDistanceM!;
    const lastGoalDist = entries[entries.length - 1].goalDistanceM!;

    // Robot should be closer to goal at end than at start
    expect(lastGoalDist).toBeLessThan(firstGoalDist);
  }, 15000);

  it('produces coherent decisions', async () => {
    const { evaluation } = await runSimulation(
      ARENA_SIMPLE_NAVIGATION,
      'e2e-simple-3'
    );

    const coherence = evaluation.criteria.find(c => c.name === 'Decision Coherence');
    expect(coherence).toBeDefined();
    expect(coherence!.passed).toBe(true);
  }, 15000);
});

describe('E2E: Dead-End Recovery', () => {
  it('runs simulation with internal walls', async () => {
    const { logger, evaluation } = await runSimulation(
      ARENA_DEAD_END,
      'e2e-deadend-1'
    );

    expect(logger.getEntries().length).toBeGreaterThan(0);
    expect(evaluation.criteria.length).toBeGreaterThanOrEqual(5);

    // Verify robot moved
    const trajectory = logger.getTrajectory();
    expect(trajectory.length).toBeGreaterThan(1);
  }, 15000);
});

describe('E2E: Narrow Corridor', () => {
  it('runs simulation through corridor', async () => {
    const { logger, evaluation } = await runSimulation(
      ARENA_NARROW_CORRIDOR,
      'e2e-corridor-1'
    );

    expect(logger.getEntries().length).toBeGreaterThan(0);
    expect(evaluation.criteria.length).toBeGreaterThanOrEqual(5);
  }, 15000);
});

describe('E2E: Exploration', () => {
  it('runs exploration simulation without goal', async () => {
    const { logger, evaluation } = await runSimulation(
      ARENA_EXPLORATION,
      'e2e-explore-1'
    );

    expect(logger.getEntries().length).toBeGreaterThan(0);

    // Should NOT have a "Goal Reached" criterion (no goal)
    expect(evaluation.criteria.find(c => c.name === 'Goal Reached')).toBeUndefined();

    // Should have exploration criterion
    const exploration = evaluation.criteria.find(c => c.name === 'Exploration Coverage');
    expect(exploration).toBeDefined();
  }, 15000);

  it('exploration increases over time', async () => {
    const { logger } = await runSimulation(
      ARENA_EXPLORATION,
      'e2e-explore-2'
    );

    const entries = logger.getEntries();
    if (entries.length > 5) {
      const earlyExploration = entries[2].exploration;
      const lateExploration = entries[entries.length - 1].exploration;
      // Exploration should not decrease (may stay same if bridge already rasterized)
      expect(lateExploration).toBeGreaterThanOrEqual(earlyExploration);
    }
  }, 15000);
});

// =============================================================================
// Performance
// =============================================================================

describe('E2E: Performance', () => {
  it('single cycle completes in under 50ms (no real LLM)', async () => {
    const { logger } = await runSimulation(
      ARENA_SIMPLE_NAVIGATION,
      'e2e-perf-1'
    );

    const entries = logger.getEntries();
    const avgCycleTime = entries.reduce((sum, e) => sum + e.cycleTimeMs, 0) / entries.length;

    // Without real LLM inference, cycles should be very fast
    expect(avgCycleTime).toBeLessThan(50);
  }, 15000);
});
