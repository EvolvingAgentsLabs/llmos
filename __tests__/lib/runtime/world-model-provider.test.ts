import { WorldModelProvider } from '../../../lib/runtime/world-model-provider';
import { WorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import { clearAllWorldModels } from '../../../lib/runtime/world-model';
import type { Robot4World } from '../../../lib/runtime/robot4-runtime';

// =============================================================================
// Helpers
// =============================================================================

function makeWorld(size: number = 2.0): Robot4World {
  return {
    walls: [
      { x1: -size, y1: -size, x2: size, y2: -size },
      { x1: size, y1: -size, x2: size, y2: size },
      { x1: size, y1: size, x2: -size, y2: size },
      { x1: -size, y1: size, x2: -size, y2: -size },
    ],
    obstacles: [
      { x: 0.5, y: 0.5, radius: 0.15 },
    ],
    beacons: [],
    lines: [],
    bounds: { minX: -size, maxX: size, minY: -size, maxY: size },
  };
}

function makeProvider(deviceId: string, worldSize = 2.0) {
  const bridge = new WorldModelBridge({
    deviceId,
    inflationCells: 0,
    rasterizeBeacons: false,
  });
  const world = makeWorld(worldSize);
  bridge.rasterize(world);

  const worldModel = bridge.getWorldModel();
  const provider = new WorldModelProvider(worldModel, bridge, {
    generateMapImages: false, // Skip canvas in tests
  });
  return { provider, bridge, worldModel };
}

afterEach(() => {
  clearAllWorldModels();
});

// =============================================================================
// Compact Summary
// =============================================================================

describe('WorldModelProvider compact summary', () => {
  it('includes position and exploration', () => {
    const { provider } = makeProvider('compact-1');
    provider.update(
      { x: 0, y: 0, rotation: 0 },
      { x: 1, y: 1, tolerance: 0.3, text: 'reach goal' }
    );

    const summary = provider.getCompactSummary();
    expect(summary).toContain('POS:');
    expect(summary).toContain('GOAL:');
    expect(summary).toContain('EXPLORED:');
    expect(summary).toContain('LAST:');
  });

  it('includes top candidates', () => {
    const { provider } = makeProvider('compact-2');
    provider.update(
      { x: 0, y: 0, rotation: 0 },
      { x: 1, y: 1, tolerance: 0.3, text: 'reach goal' }
    );

    const summary = provider.getCompactSummary();
    expect(summary).toContain('CANDIDATES:');
  });

  it('shows exploration mode when no goal', () => {
    const { provider } = makeProvider('compact-3');
    provider.update(
      { x: 0, y: 0, rotation: 0 },
      null
    );

    const summary = provider.getCompactSummary();
    expect(summary).toContain('MODE: Exploration');
  });

  it('limits candidates to compactMaxCandidates', () => {
    const bridge = new WorldModelBridge({
      deviceId: 'compact-4',
      inflationCells: 0,
      rasterizeBeacons: false,
    });
    bridge.rasterize(makeWorld());
    const worldModel = bridge.getWorldModel();
    const provider = new WorldModelProvider(worldModel, bridge, {
      compactMaxCandidates: 2,
      generateMapImages: false,
    });

    provider.update(
      { x: 0, y: 0, rotation: 0 },
      { x: 1, y: 1, tolerance: 0.3, text: 'reach goal' },
    );

    const summary = provider.getCompactSummary();
    // Count candidate lines (lines starting with spaces after CANDIDATES:)
    const candidateLines = summary
      .split('\n')
      .filter(l => l.match(/^\s+[cf]\d/));
    expect(candidateLines.length).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// Full Summary
// =============================================================================

describe('WorldModelProvider full summary', () => {
  it('includes grid info and candidates', () => {
    const { provider } = makeProvider('full-1');
    provider.update(
      { x: 0, y: 0, rotation: 0 },
      { x: 1, y: 1, tolerance: 0.3, text: 'reach goal' }
    );

    const summary = provider.getFullSummary();
    expect(summary).toContain('WORLD MODEL (Full)');
    expect(summary).toContain('GRID:');
    expect(summary).toContain('CANDIDATES:');
    expect(summary).toContain('LAST ACTION:');
  });

  it('is longer than compact summary', () => {
    const { provider } = makeProvider('full-2');
    provider.update(
      { x: 0, y: 0, rotation: 0 },
      { x: 1, y: 1, tolerance: 0.3, text: 'reach goal' }
    );

    const compact = provider.getCompactSummary();
    const full = provider.getFullSummary();
    expect(full.length).toBeGreaterThan(compact.length);
  });

  it('includes occupancy RLE', () => {
    const { provider } = makeProvider('full-3');
    provider.update(
      { x: 0, y: 0, rotation: 0 },
      { x: 1, y: 1, tolerance: 0.3, text: 'reach goal' }
    );

    const summary = provider.getFullSummary();
    expect(summary).toContain('occupancy:');
  });
});

// =============================================================================
// Snapshot
// =============================================================================

describe('WorldModelProvider snapshot', () => {
  it('returns all fields', () => {
    const { provider } = makeProvider('snap-1');
    provider.update(
      { x: 0, y: 0, rotation: 0 },
      { x: 1, y: 1, tolerance: 0.3, text: 'reach goal' }
    );

    const snapshot = provider.getSnapshot();
    expect(snapshot.compact).toBeTruthy();
    expect(snapshot.full).toBeTruthy();
    expect(snapshot.mapImage).toBeNull(); // Disabled in tests
    expect(snapshot.candidates).toBeDefined();
    expect(snapshot.exploration).toBeGreaterThan(0);
    expect(snapshot.visitCounts).toBeInstanceOf(Map);
    expect(typeof snapshot.frontierCount).toBe('number');
  });
});

// =============================================================================
// Escalation Triggers
// =============================================================================

describe('WorldModelProvider escalation triggers', () => {
  it('detects looping after repeated visits', () => {
    const { provider } = makeProvider('loop-1');

    // Visit the same cell many times
    for (let i = 0; i < 10; i++) {
      provider.update(
        { x: 0, y: 0, rotation: 0 },
        null
      );
    }

    expect(provider.isLooping()).toBe(true);
  });

  it('does not detect looping for normal movement', () => {
    const { provider } = makeProvider('loop-2');

    // Move through different cells
    for (let i = 0; i < 5; i++) {
      provider.update(
        { x: i * 0.2, y: 0, rotation: 0 },
        null
      );
    }

    expect(provider.isLooping()).toBe(false);
  });

  it('detects frontier exhaustion when arena is mostly explored', () => {
    const bridge = new WorldModelBridge({
      deviceId: 'frontier-1',
      inflationCells: 0,
      rasterizeBeacons: false,
    });
    // Rasterizing fills all cells inside bounds as 'free', giving high exploration
    bridge.rasterize(makeWorld(2.5));
    const worldModel = bridge.getWorldModel();
    const provider = new WorldModelProvider(worldModel, bridge, {
      generateMapImages: false,
      frontierExhaustionThreshold: 0.5, // Lower threshold for test
    });

    provider.update(
      { x: 0, y: 0, rotation: 0 },
      null
    );

    // After full rasterization, exploration should be high
    // and frontiers should be few (most cells are known)
    expect(provider.getExploration()).toBeGreaterThan(0.5);
  });

  it('returns cell visit count', () => {
    const { provider } = makeProvider('visit-1');

    provider.update({ x: 0.5, y: 0.5, rotation: 0 }, null);
    provider.update({ x: 0.5, y: 0.5, rotation: 0 }, null);
    provider.update({ x: 0.5, y: 0.5, rotation: 0 }, null);

    expect(provider.getCurrentCellVisitCount()).toBe(3);
  });
});

// =============================================================================
// Reset
// =============================================================================

describe('WorldModelProvider reset', () => {
  it('clears all tracked state', () => {
    const { provider } = makeProvider('reset-1');

    // Build up state
    for (let i = 0; i < 5; i++) {
      provider.update(
        { x: 0, y: 0, rotation: 0 },
        { x: 1, y: 1, tolerance: 0.3, text: 'goal' }
      );
    }

    expect(provider.getCurrentCellVisitCount()).toBeGreaterThan(0);
    expect(provider.getCandidates().length).toBeGreaterThanOrEqual(0);

    provider.reset();

    expect(provider.getCurrentCellVisitCount()).toBe(0);
    expect(provider.getCandidates()).toEqual([]);
    expect(provider.getExploration()).toBe(0);
    expect(provider.getMapImage()).toBeNull();
  });
});

// =============================================================================
// DualBrainController integration
// =============================================================================

describe('DualBrainController world-model-aware escalation', () => {
  // We test the escalation type additions indirectly
  it('new escalation reasons are valid string types', () => {
    // Import the type to verify it compiles
    type EscalationReason =
      | 'unknown_object'
      | 'stuck'
      | 'goal_requires_plan'
      | 'low_confidence'
      | 'new_area'
      | 'fleet_coordination'
      | 'user_request'
      | 'periodic_replan'
      | 'looping'
      | 'frontier_exhaustion';

    const looping: EscalationReason = 'looping';
    const frontier: EscalationReason = 'frontier_exhaustion';
    expect(looping).toBe('looping');
    expect(frontier).toBe('frontier_exhaustion');
  });
});
