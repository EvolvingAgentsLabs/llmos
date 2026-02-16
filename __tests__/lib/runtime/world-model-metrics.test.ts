import {
  compareGrids,
  computeDecisionQuality,
  formatAccuracyReport,
  formatDecisionReport,
} from '../../../lib/runtime/world-model-metrics';
import { WorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import { VisionWorldModelBridge } from '../../../lib/runtime/sensor-bridge';
import type { NavigationRunSummary } from '../../../lib/runtime/navigation-logger';

// =============================================================================
// Helpers
// =============================================================================

function makeWorld() {
  return {
    walls: [
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },
    ],
    obstacles: [
      { x: 0.5, y: 0.5, radius: 0.2 },
    ],
    beacons: [],
    lines: [],
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
  };
}

function makeRunSummary(overrides: Partial<NavigationRunSummary> = {}): NavigationRunSummary {
  return {
    arenaName: 'Test',
    totalCycles: 50,
    goalReached: true,
    goalReachedAtCycle: 45,
    totalCollisions: 0,
    finalExploration: 0.6,
    peakStuckCounter: 2,
    totalDistanceTraveled: 5.5,
    averageCycleTimeMs: 10,
    actionDistribution: { MOVE_TO: 30, EXPLORE: 15, ROTATE_TO: 5 },
    fallbackCount: 2,
    coherenceScore: 0.8,
    ...overrides,
  };
}

// =============================================================================
// Grid Accuracy Tests
// =============================================================================

describe('compareGrids', () => {
  it('returns 100% accuracy when comparing identical grids', () => {
    const bridge1 = new WorldModelBridge({ deviceId: 'acc-1a', inflationCells: 0 });
    const bridge2 = new WorldModelBridge({ deviceId: 'acc-1b', inflationCells: 0 });
    const world = makeWorld();
    bridge1.rasterize(world);
    bridge2.rasterize(world);

    const metrics = compareGrids(bridge1.getWorldModel(), bridge2.getWorldModel());
    expect(metrics.cellAccuracy).toBe(1);
    expect(metrics.obstacleRecall).toBe(1);
    expect(metrics.obstaclePrecision).toBe(1);
  });

  it('handles vision grid with unknown cells (excluded from comparison)', () => {
    const truthBridge = new WorldModelBridge({ deviceId: 'acc-2a', inflationCells: 0 });
    truthBridge.rasterize(makeWorld());

    const visionBridge = new VisionWorldModelBridge({ deviceId: 'acc-2b' });
    // Only one vision update at origin — most cells still unknown
    visionBridge.updateFromVision(
      { x: 0, y: 0, rotation: 0 },
      {
        detections: [],
        scene: { openings: ['left', 'center', 'right'], blocked: [], floorVisiblePercent: 1, environment: 'indoor', dominantSurface: 'floor' },
        timestamp: Date.now(),
        processingMs: 100,
        imageSize: { width: 640, height: 480 },
        frameId: 1,
      }
    );

    const metrics = compareGrids(visionBridge.getWorldModel(), truthBridge.getWorldModel());
    // Should have some cells compared (the ones the vision observed)
    expect(metrics.totalCells).toBeGreaterThan(0);
    // Total cells compared should be much less than full grid
    const dims = truthBridge.getWorldModel().getGridDimensions();
    expect(metrics.totalCells).toBeLessThan(dims.width * dims.height);
  });

  it('detects false positives (sensor sees obstacle where truth has free)', () => {
    const bridge1 = new WorldModelBridge({ deviceId: 'acc-3a', inflationCells: 0 });
    const bridge2 = new WorldModelBridge({ deviceId: 'acc-3b', inflationCells: 0 });

    const world = makeWorld();
    bridge1.rasterize(world);
    bridge2.rasterize(world);

    // Add a fake obstacle in bridge2 where truth has free
    const grid2 = bridge2.getWorldModel().getGrid();
    const { gx, gy } = bridge2.getWorldModel().worldToGrid(-1, -1);
    grid2[gy][gx].state = 'obstacle';

    const metrics = compareGrids(bridge2.getWorldModel(), bridge1.getWorldModel());
    expect(metrics.falsePositiveRate).toBeGreaterThan(0);
  });

  it('detects false negatives (sensor misses real obstacle)', () => {
    const truthBridge = new WorldModelBridge({ deviceId: 'acc-4a', inflationCells: 0 });
    const sensorBridge = new WorldModelBridge({ deviceId: 'acc-4b', inflationCells: 0 });

    const world = makeWorld();
    truthBridge.rasterize(world);
    // Rasterize world without obstacles for sensor bridge
    const worldNoObs = { ...world, obstacles: [] };
    sensorBridge.rasterize(worldNoObs);

    const metrics = compareGrids(sensorBridge.getWorldModel(), truthBridge.getWorldModel());
    expect(metrics.falseNegativeRate).toBeGreaterThan(0);
    expect(metrics.obstacleRecall).toBeLessThan(1);
  });

  it('includes per-state breakdown', () => {
    const bridge1 = new WorldModelBridge({ deviceId: 'acc-5a', inflationCells: 0 });
    const bridge2 = new WorldModelBridge({ deviceId: 'acc-5b', inflationCells: 0 });
    const world = makeWorld();
    bridge1.rasterize(world);
    bridge2.rasterize(world);

    const metrics = compareGrids(bridge1.getWorldModel(), bridge2.getWorldModel());
    expect(metrics.stateBreakdown).toBeDefined();
    // Should have at least 'free' and 'wall' states
    const states = Object.keys(metrics.stateBreakdown);
    expect(states.length).toBeGreaterThan(0);
  });

  it('throws on dimension mismatch', () => {
    const bridge1 = new WorldModelBridge({
      deviceId: 'acc-6a', inflationCells: 0,
      worldModelConfig: { gridResolution: 10, worldWidth: 500, worldHeight: 500, confidenceDecay: 0 },
    });
    const bridge2 = new WorldModelBridge({
      deviceId: 'acc-6b', inflationCells: 0,
      worldModelConfig: { gridResolution: 20, worldWidth: 500, worldHeight: 500, confidenceDecay: 0 },
    });
    bridge1.rasterize(makeWorld());
    bridge2.rasterize(makeWorld());

    expect(() => compareGrids(bridge1.getWorldModel(), bridge2.getWorldModel())).toThrow(
      /dimension/i
    );
  });
});

// =============================================================================
// Decision Quality Tests
// =============================================================================

describe('computeDecisionQuality', () => {
  it('computes goal convergence from distance data', () => {
    const summary = makeRunSummary();
    const metrics = computeDecisionQuality(summary, { initial: 4.0, final: 0.2 });
    // Should be close to 1.0 (95% reduction)
    expect(metrics.goalConvergence).toBeGreaterThan(0.9);
  });

  it('reports negative convergence when diverging', () => {
    const summary = makeRunSummary({ goalReached: false });
    const metrics = computeDecisionQuality(summary, { initial: 2.0, final: 3.0 });
    expect(metrics.goalConvergence).toBeLessThan(0);
  });

  it('computes action diversity (entropy)', () => {
    const summary = makeRunSummary({
      actionDistribution: { MOVE_TO: 25, EXPLORE: 25, ROTATE_TO: 25, STOP: 25 },
    });
    const metrics = computeDecisionQuality(summary);
    // Uniform distribution should have maximum diversity
    expect(metrics.actionDiversity).toBe(1);
  });

  it('reports low diversity for single action type', () => {
    const summary = makeRunSummary({
      actionDistribution: { MOVE_TO: 100 },
    });
    const metrics = computeDecisionQuality(summary);
    expect(metrics.actionDiversity).toBe(0);
  });

  it('computes path efficiency', () => {
    const summary = makeRunSummary({
      goalReached: true,
      totalDistanceTraveled: 5.0,
    });
    const metrics = computeDecisionQuality(summary, { initial: 4.0, final: 0.1 });
    // Efficiency = 4.0 / 5.0 = 0.8
    expect(metrics.pathEfficiency).toBeCloseTo(0.8, 1);
  });

  it('computes stuck recovery rate', () => {
    const summary = makeRunSummary();
    const stuckEpisodes = [
      { startCycle: 10, endCycle: 13, recovered: true },
      { startCycle: 25, endCycle: 30, recovered: false },
      { startCycle: 40, endCycle: 42, recovered: true },
    ];
    const metrics = computeDecisionQuality(summary, undefined, stuckEpisodes);
    // 2 out of 3 recovered
    expect(metrics.stuckRecoveryRate).toBeCloseTo(0.667, 2);
    expect(metrics.avgStuckDuration).toBeGreaterThan(0);
  });

  it('returns defaults when no episodes', () => {
    const summary = makeRunSummary();
    const metrics = computeDecisionQuality(summary);
    expect(metrics.stuckRecoveryRate).toBe(1);
    expect(metrics.avgStuckDuration).toBe(0);
  });
});

// =============================================================================
// Report Formatting Tests
// =============================================================================

describe('formatAccuracyReport', () => {
  it('produces human-readable output', () => {
    const bridge1 = new WorldModelBridge({ deviceId: 'fmt-1a', inflationCells: 0 });
    const bridge2 = new WorldModelBridge({ deviceId: 'fmt-1b', inflationCells: 0 });
    const world = makeWorld();
    bridge1.rasterize(world);
    bridge2.rasterize(world);

    const metrics = compareGrids(bridge1.getWorldModel(), bridge2.getWorldModel());
    const report = formatAccuracyReport(metrics);
    expect(report).toContain('Grid Accuracy Report');
    expect(report).toContain('Cell accuracy');
    expect(report).toContain('Obstacle recall');
  });
});

describe('formatDecisionReport', () => {
  it('produces human-readable output', () => {
    const summary = makeRunSummary();
    const metrics = computeDecisionQuality(summary, { initial: 4.0, final: 0.1 });
    const report = formatDecisionReport(metrics);
    expect(report).toContain('Decision Quality Report');
    expect(report).toContain('Goal convergence');
    expect(report).toContain('Path efficiency');
  });
});
