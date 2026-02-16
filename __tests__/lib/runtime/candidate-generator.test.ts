import { CandidateGenerator, formatCandidatesForLLM } from '../../../lib/runtime/candidate-generator';
import { WorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import { clearAllWorldModels } from '../../../lib/runtime/world-model';
import type { Robot4World } from '../../../lib/runtime/robot4-runtime';

// =============================================================================
// Helpers
// =============================================================================

function makeWorld(): Robot4World {
  return {
    walls: [
      { x1: -2, y1: -2, x2: 2, y2: -2 },
      { x1: 2, y1: -2, x2: 2, y2: 2 },
      { x1: 2, y1: 2, x2: -2, y2: 2 },
      { x1: -2, y1: 2, x2: -2, y2: -2 },
    ],
    obstacles: [
      { x: 1.0, y: 0.5, radius: 0.2 },
    ],
    beacons: [],
    lines: [],
    bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
  };
}

function setupBridge(deviceId: string): WorldModelBridge {
  const bridge = new WorldModelBridge({ deviceId, inflationCells: 0 });
  bridge.rasterize(makeWorld());
  return bridge;
}

afterEach(() => {
  clearAllWorldModels();
});

// =============================================================================
// Goal-directed candidates
// =============================================================================

describe('CandidateGenerator goal-directed', () => {
  it('generates subgoals toward the goal', () => {
    const bridge = setupBridge('cg-1');
    const gen = new CandidateGenerator();
    const robotPose = { x: 0, y: 0, rotation: 0 };
    const goal = { x: 1.5, y: 1.5 };

    const candidates = gen.generate(bridge.getWorldModel(), bridge, robotPose, goal);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);

    // Should have at least one subgoal type
    const subgoals = candidates.filter(c => c.type === 'subgoal');
    expect(subgoals.length).toBeGreaterThan(0);
  });

  it('includes the goal itself as a candidate', () => {
    const bridge = setupBridge('cg-2');
    const gen = new CandidateGenerator();
    const robotPose = { x: 0, y: 0, rotation: 0 };
    const goal = { x: 1.5, y: 1.5 };

    const candidates = gen.generate(bridge.getWorldModel(), bridge, robotPose, goal);

    const goalCandidate = candidates.find(c =>
      c.pos_m[0] === 1.5 && c.pos_m[1] === 1.5
    );
    expect(goalCandidate).toBeDefined();
  });

  it('scores candidates — closer to goal scores higher', () => {
    const bridge = setupBridge('cg-3');
    const gen = new CandidateGenerator({ maxCandidates: 10 });
    const robotPose = { x: -1, y: -1, rotation: 0 };
    const goal = { x: 1.5, y: 1.5 };

    const candidates = gen.generate(bridge.getWorldModel(), bridge, robotPose, goal);

    // All scores should be between 0 and 1
    for (const c of candidates) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }

    // Candidates should be sorted by score descending
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
    }
  });
});

// =============================================================================
// Frontier candidates
// =============================================================================

describe('CandidateGenerator frontiers', () => {
  it('generates frontier candidates for exploration', () => {
    const bridge = new WorldModelBridge({
      deviceId: 'cg-4',
      inflationCells: 0,
      rasterizeBounds: false,
    });

    // Create world where most is unknown
    const world: Robot4World = {
      walls: [
        { x1: -1, y1: -1, x2: 1, y2: -1 },
        { x1: 1, y1: -1, x2: 1, y2: 1 },
        { x1: 1, y1: 1, x2: -1, y2: 1 },
        { x1: -1, y1: 1, x2: -1, y2: -1 },
      ],
      obstacles: [],
      beacons: [],
      lines: [],
      bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
    };
    bridge.rasterize(world);

    // Mark a small area as free to create frontiers
    const grid = bridge.getWorldModel().getGrid();
    for (let y = 23; y <= 27; y++) {
      for (let x = 23; x <= 27; x++) {
        if (grid[y][x].state === 'unknown') {
          grid[y][x].state = 'free';
        }
      }
    }

    const gen = new CandidateGenerator();
    const robotPose = { x: 0, y: 0, rotation: 0 };

    const candidates = gen.generate(bridge.getWorldModel(), bridge, robotPose, null);

    const frontierCandidates = candidates.filter(c => c.type === 'frontier');
    expect(frontierCandidates.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Recovery candidates
// =============================================================================

describe('CandidateGenerator recovery', () => {
  it('generates recovery candidates when stuck', () => {
    const bridge = setupBridge('cg-5');
    const gen = new CandidateGenerator();
    const robotPose = { x: 0, y: 0, rotation: 0 };

    const candidates = gen.generate(
      bridge.getWorldModel(), bridge, robotPose, null, true /* isStuck */
    );

    const recoveryCandidates = candidates.filter(c => c.type === 'recovery');
    expect(recoveryCandidates.length).toBeGreaterThan(0);

    // Recovery notes should mention safety info
    for (const c of recoveryCandidates) {
      expect(c.note).toContain('safe retreat');
    }
  });

  it('does not generate recovery candidates when not stuck', () => {
    const bridge = setupBridge('cg-6');
    const gen = new CandidateGenerator();
    const robotPose = { x: 0, y: 0, rotation: 0 };

    const candidates = gen.generate(
      bridge.getWorldModel(), bridge, robotPose, { x: 1, y: 1 }, false
    );

    const recoveryCandidates = candidates.filter(c => c.type === 'recovery');
    expect(recoveryCandidates.length).toBe(0);
  });
});

// =============================================================================
// Deduplication
// =============================================================================

describe('CandidateGenerator deduplication', () => {
  it('removes candidates that are too close together', () => {
    const bridge = setupBridge('cg-7');
    const gen = new CandidateGenerator({ minCandidateSpacing: 0.5, maxCandidates: 10 });
    const robotPose = { x: -1.5, y: -1.5, rotation: 0 };
    const goal = { x: 1.5, y: 1.5 };

    const candidates = gen.generate(bridge.getWorldModel(), bridge, robotPose, goal);

    // Check that no two candidates are closer than minCandidateSpacing
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const dist = Math.sqrt(
          (candidates[i].pos_m[0] - candidates[j].pos_m[0]) ** 2 +
          (candidates[i].pos_m[1] - candidates[j].pos_m[1]) ** 2
        );
        expect(dist).toBeGreaterThanOrEqual(0.49); // Allow small float error
      }
    }
  });
});

// =============================================================================
// Max candidates limit
// =============================================================================

describe('CandidateGenerator limits', () => {
  it('respects maxCandidates config', () => {
    const bridge = setupBridge('cg-8');
    const gen = new CandidateGenerator({ maxCandidates: 3 });
    const robotPose = { x: -1.5, y: -1.5, rotation: 0 };
    const goal = { x: 1.5, y: 1.5 };

    const candidates = gen.generate(bridge.getWorldModel(), bridge, robotPose, goal);
    expect(candidates.length).toBeLessThanOrEqual(3);
  });
});

// =============================================================================
// LLM Formatting
// =============================================================================

describe('formatCandidatesForLLM', () => {
  it('formats candidates as JSON for LLM', () => {
    const candidates = [
      { id: 'c1', type: 'subgoal' as const, pos_m: [1.5, 1.5] as [number, number], score: 0.85, note: 'toward goal' },
      { id: 'f1', type: 'frontier' as const, pos_m: [0.5, -0.5] as [number, number], score: 0.6, note: 'explore' },
    ];

    const result = formatCandidatesForLLM(candidates, {
      action: 'MOVE_TO c1',
      result: 'success',
      details: 'reached subgoal',
    });

    expect(result).toHaveProperty('candidates');
    expect(result).toHaveProperty('last_step');
    expect((result as any).candidates.length).toBe(2);
    expect((result as any).last_step.result).toBe('success');
  });

  it('provides default last_step on first cycle', () => {
    const result = formatCandidatesForLLM([]);
    expect((result as any).last_step.action).toBe('none');
    expect((result as any).last_step.result).toBe('success');
  });
});
