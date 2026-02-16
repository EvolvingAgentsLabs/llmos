import { NavigationRuntime, runNavigation } from '../../../lib/runtime/navigation-runtime';
import { createMockInference } from '../../../lib/runtime/llm-inference';
import { GroundTruthVisionSimulator } from '../../../lib/runtime/vision-simulator';
import { VisionWorldModelBridge } from '../../../lib/runtime/sensor-bridge';
import { compareGrids } from '../../../lib/runtime/world-model-metrics';
import { WorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import {
  ARENA_SIMPLE_NAVIGATION,
  ARENA_EXPLORATION,
  ARENA_NARROW_CORRIDOR,
} from '../../../lib/runtime/test-arenas';

// =============================================================================
// Vision Pipeline E2E Tests
// =============================================================================

describe('Vision Pipeline E2E', () => {
  describe('vision mode navigation', () => {
    it('completes a navigation session in vision mode', async () => {
      const result = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference(),
        { bridgeMode: 'vision' }
      );

      expect(result.evaluation).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.totalTimeMs).toBeGreaterThan(0);
    });

    it('robot moves from start position in vision mode', async () => {
      const result = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference(),
        { bridgeMode: 'vision' }
      );

      const entries = result.entries;
      const start = entries[0].pose;
      const end = entries[entries.length - 1].pose;

      const moved = Math.sqrt(
        (end.x - start.x) ** 2 + (end.y - start.y) ** 2
      );
      expect(moved).toBeGreaterThan(0.1);
    });

    it('exploration works in vision mode', async () => {
      const result = await runNavigation(
        ARENA_EXPLORATION,
        createMockInference(),
        { bridgeMode: 'vision' }
      );

      expect(result.summary.totalCycles).toBeGreaterThan(0);
      // Vision mode explores less area per cycle due to limited FOV,
      // but should still make progress
      const lastExploration = result.entries[result.entries.length - 1].exploration;
      expect(lastExploration).toBeGreaterThan(0);
    });

    it('stays within arena bounds in vision mode', async () => {
      const result = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference(),
        { bridgeMode: 'vision' }
      );

      for (const entry of result.entries) {
        const { x, y } = entry.pose;
        const b = ARENA_SIMPLE_NAVIGATION.world.bounds;
        expect(x).toBeGreaterThan(b.minX - 0.1);
        expect(x).toBeLessThan(b.maxX + 0.1);
        expect(y).toBeGreaterThan(b.minY - 0.1);
        expect(y).toBeLessThan(b.maxY + 0.1);
      }
    });

    it('respects cycle limit in vision mode', async () => {
      const result = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        createMockInference(),
        { bridgeMode: 'vision' }
      );

      expect(result.summary.totalCycles).toBeLessThanOrEqual(
        ARENA_SIMPLE_NAVIGATION.criteria.maxCycles
      );
    });
  });

  describe('vision simulator → bridge pipeline', () => {
    it('simulator output is consumed by VisionWorldModelBridge', () => {
      const sim = new GroundTruthVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      const bridge = new VisionWorldModelBridge({
        deviceId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      });

      const pose = ARENA_SIMPLE_NAVIGATION.startPose;

      // Before any update, bridge is not initialized
      expect(bridge.isRasterized()).toBe(false);

      // Generate frame and feed to bridge
      const frame = sim.generateFrame(pose);
      bridge.updateFromVision(pose, frame);

      // Bridge should now be initialized
      expect(bridge.isRasterized()).toBe(true);

      // Grid should have some known cells
      const grid = bridge.getWorldModel().getGrid();
      const dims = bridge.getWorldModel().getGridDimensions();
      let knownCells = 0;
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          if (grid[gy][gx].state !== 'unknown') knownCells++;
        }
      }
      expect(knownCells).toBeGreaterThan(0);
    });

    it('grid knowledge grows with multiple observations', () => {
      const sim = new GroundTruthVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      const bridge = new VisionWorldModelBridge({
        deviceId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      });

      const countKnown = () => {
        const grid = bridge.getWorldModel().getGrid();
        const dims = bridge.getWorldModel().getGridDimensions();
        let count = 0;
        for (let gy = 0; gy < dims.height; gy++) {
          for (let gx = 0; gx < dims.width; gx++) {
            if (grid[gy][gx].state !== 'unknown') count++;
          }
        }
        return count;
      };

      // First observation: one direction
      const pose1 = { x: 0, y: 0, rotation: 0 };
      bridge.updateFromVision(pose1, sim.generateFrame(pose1));
      const known1 = countKnown();

      // Second observation: different direction
      const pose2 = { x: 0, y: 0, rotation: Math.PI / 2 };
      bridge.updateFromVision(pose2, sim.generateFrame(pose2));
      const known2 = countKnown();

      // Third observation: yet another direction
      const pose3 = { x: 0, y: 0, rotation: Math.PI };
      bridge.updateFromVision(pose3, sim.generateFrame(pose3));
      const known3 = countKnown();

      // Knowledge should grow (or at least not shrink)
      expect(known2).toBeGreaterThanOrEqual(known1);
      expect(known3).toBeGreaterThanOrEqual(known2);
      // After 3 directions, should have meaningfully more coverage
      expect(known3).toBeGreaterThan(known1);
    });

    it('detects frontiers at observation boundaries', () => {
      const sim = new GroundTruthVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      const bridge = new VisionWorldModelBridge({
        deviceId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      });

      const pose = { x: 0, y: 0, rotation: 0 };
      bridge.updateFromVision(pose, sim.generateFrame(pose));

      // Should have frontier cells where known meets unknown
      const frontiers = bridge.findFrontiers();
      expect(frontiers.length).toBeGreaterThan(0);
    });
  });

  describe('ground-truth vs vision comparison', () => {
    it('vision mode produces lower exploration than ground-truth', async () => {
      const infer = createMockInference();

      const gtResult = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        infer,
        { bridgeMode: 'ground-truth' }
      );

      const visResult = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        infer,
        { bridgeMode: 'vision' }
      );

      // Ground-truth starts with full knowledge (100% explored = all cells known)
      // Vision starts from scratch, so exploration should be lower
      const gtExploration = gtResult.entries[0].exploration;
      const visExploration = visResult.entries[0].exploration;

      expect(gtExploration).toBeGreaterThan(visExploration);
    });

    it('both modes produce valid evaluation reports', async () => {
      const infer = createMockInference();

      const gtResult = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        infer,
        { bridgeMode: 'ground-truth' }
      );

      const visResult = await runNavigation(
        ARENA_SIMPLE_NAVIGATION,
        infer,
        { bridgeMode: 'vision' }
      );

      // Both should produce reports with arena name
      expect(gtResult.report).toContain('Simple Navigation');
      expect(visResult.report).toContain('Simple Navigation');

      // Both should have evaluation criteria
      expect(gtResult.evaluation.criteria.length).toBeGreaterThanOrEqual(4);
      expect(visResult.evaluation.criteria.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('grid accuracy metrics', () => {
    it('compares vision grid against ground-truth grid', () => {
      // Build ground-truth grid
      const gtDeviceId = `gt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const gtBridge = new WorldModelBridge({ deviceId: gtDeviceId, inflationCells: 0 });
      gtBridge.rasterize(ARENA_SIMPLE_NAVIGATION.world);

      // Build vision grid from multiple poses
      const visDeviceId = `vis-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const visBridge = new VisionWorldModelBridge({ deviceId: visDeviceId });
      const sim = new GroundTruthVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);

      // Observe from multiple positions/rotations
      const poses = [
        { x: 0, y: 0, rotation: 0 },
        { x: 0, y: 0, rotation: Math.PI / 2 },
        { x: 0, y: 0, rotation: Math.PI },
        { x: 0, y: 0, rotation: -Math.PI / 2 },
        { x: -1.0, y: -1.0, rotation: Math.PI / 4 },
        { x: 1.0, y: 1.0, rotation: -3 * Math.PI / 4 },
      ];

      for (const pose of poses) {
        visBridge.updateFromVision(pose, sim.generateFrame(pose));
      }

      // Compare grids
      const metrics = compareGrids(
        visBridge.getWorldModel(),
        gtBridge.getWorldModel()
      );

      // Vision grid accuracy should be reasonable
      expect(metrics.cellAccuracy).toBeGreaterThan(0.3);
      // Should have some knowledge of obstacles
      expect(metrics.totalCells).toBeGreaterThan(0);
    });
  });

  describe('narrow corridor in vision mode', () => {
    it('navigates narrow corridor with vision', async () => {
      const result = await runNavigation(
        ARENA_NARROW_CORRIDOR,
        createMockInference(),
        { bridgeMode: 'vision' }
      );

      expect(result.summary.totalCycles).toBeGreaterThan(0);
      expect(result.entries.length).toBeGreaterThan(0);
    });
  });
});
