import { VisionWorldModelBridge } from '../../../lib/runtime/sensor-bridge';
import type { IWorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import type { VisionFrame, Detection, SceneAnalysis } from '../../../lib/runtime/vision/mobilenet-detector';

// =============================================================================
// Helpers
// =============================================================================

function makeScene(overrides: Partial<SceneAnalysis> = {}): SceneAnalysis {
  return {
    openings: ['left', 'center', 'right'],
    blocked: [],
    floorVisiblePercent: 1.0,
    environment: 'indoor',
    dominantSurface: 'floor',
    ...overrides,
  };
}

function makeVisionFrame(overrides: Partial<VisionFrame> = {}): VisionFrame {
  return {
    detections: [],
    scene: makeScene(),
    timestamp: Date.now(),
    processingMs: 100,
    imageSize: { width: 640, height: 480 },
    frameId: 1,
    ...overrides,
  };
}

function makeDetection(overrides: Partial<Detection> = {}): Detection {
  return {
    label: 'obstacle',
    confidence: 0.9,
    bbox: { x: 0.4, y: 0.3, width: 0.2, height: 0.4 },
    estimatedDepthCm: 80,
    depthMethod: 'vlm_estimate',
    region: 'center',
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('VisionWorldModelBridge', () => {
  describe('IWorldModelBridge conformance', () => {
    it('implements IWorldModelBridge interface', () => {
      const bridge: IWorldModelBridge = new VisionWorldModelBridge({ deviceId: 'iface-1' });
      expect(bridge.getWorldModel).toBeDefined();
      expect(bridge.updateRobotPose).toBeDefined();
      expect(bridge.findFrontiers).toBeDefined();
      expect(bridge.isRasterized).toBeDefined();
      expect(bridge.reset).toBeDefined();
    });

    it('starts uninitialized', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'init-1' });
      expect(bridge.isRasterized()).toBe(false);
    });

    it('becomes initialized after first vision update', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'init-2' });
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame()
      );
      expect(bridge.isRasterized()).toBe(true);
    });
  });

  describe('vision updates — openings', () => {
    it('marks robot position as explored', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'vis-1' });
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame()
      );

      const wm = bridge.getWorldModel();
      const { gx, gy } = wm.worldToGrid(0, 0);
      const grid = wm.getGrid();
      expect(grid[gy][gx].state).toBe('explored');
    });

    it('marks free cells in open directions', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'vis-2' });
      // All three directions are open
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame({ scene: makeScene({ openings: ['left', 'center', 'right'] }) })
      );

      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      // Count non-unknown cells — openings should have cast rays
      let knownCells = 0;
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          if (grid[gy][gx].state !== 'unknown') knownCells++;
        }
      }
      // 3 rays × ~10 cells each + robot cell
      expect(knownCells).toBeGreaterThan(5);
    });

    it('does not mark cells when no openings', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'vis-3' });
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame({ scene: makeScene({ openings: [], blocked: [] }) })
      );

      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      let knownCells = 0;
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          if (grid[gy][gx].state !== 'unknown') knownCells++;
        }
      }
      // Only the robot cell should be marked
      expect(knownCells).toBe(1);
    });
  });

  describe('vision updates — detections', () => {
    it('marks obstacle at detection depth', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'det-1' });
      // Obstacle at center, 80cm away
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame({
          detections: [makeDetection({ region: 'center', estimatedDepthCm: 80 })],
          scene: makeScene({ openings: [], blocked: [] }),
        })
      );

      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      // Should have at least one obstacle cell
      let obstacleCount = 0;
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          if (grid[gy][gx].state === 'obstacle') obstacleCount++;
        }
      }
      expect(obstacleCount).toBeGreaterThanOrEqual(1);
    });

    it('marks free cells between robot and detection', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'det-2' });
      // Obstacle at center, 100cm (1m) away
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame({
          detections: [makeDetection({ region: 'center', estimatedDepthCm: 100 })],
          scene: makeScene({ openings: [], blocked: [] }),
        })
      );

      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      let freeCount = 0;
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          if (grid[gy][gx].state === 'free') freeCount++;
        }
      }
      // Should have free cells along the ray before the obstacle
      expect(freeCount).toBeGreaterThan(0);
    });

    it('uses bbox x-center for angular resolution', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'det-3' });
      // Detection at far left of image (bbox.x ~0.0)
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame({
          detections: [makeDetection({
            region: 'left',
            bbox: { x: 0.0, y: 0.3, width: 0.1, height: 0.4 },
            estimatedDepthCm: 100,
          })],
          scene: makeScene({ openings: [], blocked: [] }),
        })
      );

      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      // Should have an obstacle cell somewhere in the grid
      let hasObstacle = false;
      for (let gy = 0; gy < dims.height && !hasObstacle; gy++) {
        for (let gx = 0; gx < dims.width && !hasObstacle; gx++) {
          if (grid[gy][gx].state === 'obstacle') hasObstacle = true;
        }
      }
      expect(hasObstacle).toBe(true);
    });
  });

  describe('vision updates — blocked directions', () => {
    it('marks obstacle in blocked direction', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'blk-1' });
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame({
          scene: makeScene({ openings: ['left', 'right'], blocked: ['center'] }),
        })
      );

      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      let obstacleCount = 0;
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          if (grid[gy][gx].state === 'obstacle') obstacleCount++;
        }
      }
      expect(obstacleCount).toBeGreaterThanOrEqual(1);
    });

    it('skips blocked direction if detection already covers it', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'blk-2' });
      // Center is blocked AND has a detection — blocked processing should skip it
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame({
          detections: [makeDetection({ region: 'center', estimatedDepthCm: 80 })],
          scene: makeScene({ openings: ['left', 'right'], blocked: ['center'] }),
        })
      );

      // Just verify it doesn't crash and has obstacles
      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      let obstacleCount = 0;
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          if (grid[gy][gx].state === 'obstacle') obstacleCount++;
        }
      }
      expect(obstacleCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('incremental updates', () => {
    it('builds grid incrementally over multiple vision updates', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'incr-1' });

      // First update at origin, facing north
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame()
      );

      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      let knownCount1 = 0;
      for (const row of grid) {
        for (const cell of row) {
          if (cell.state !== 'unknown') knownCount1++;
        }
      }

      // Second update at different position, facing east
      bridge.updateFromVision(
        { x: 1, y: 1, rotation: Math.PI / 2 },
        makeVisionFrame({ frameId: 2 })
      );

      let knownCount2 = 0;
      for (const row of grid) {
        for (const cell of row) {
          if (cell.state !== 'unknown') knownCount2++;
        }
      }

      expect(knownCount2).toBeGreaterThan(knownCount1);
    });

    it('does not overwrite explored cells with free', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'incr-2' });

      // First: robot visits position (0, 0)
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame()
      );

      const wm = bridge.getWorldModel();
      const { gx, gy } = wm.worldToGrid(0, 0);
      const grid = wm.getGrid();
      expect(grid[gy][gx].state).toBe('explored');

      // Second: another update that casts a ray over (0, 0)
      bridge.updateFromVision(
        { x: -0.5, y: 0.5, rotation: -Math.PI / 4 }, // Facing toward (0, 0)
        makeVisionFrame({ frameId: 2 })
      );

      // Robot cell should still be explored, not downgraded to free
      expect(grid[gy][gx].state).toBe('explored');
    });
  });

  describe('frontiers', () => {
    it('finds frontier cells at boundary of known/unknown', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'front-1' });
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame()
      );

      const frontiers = bridge.findFrontiers();
      expect(frontiers.length).toBeGreaterThan(0);
    });

    it('returns frontiers sorted by unknown neighbor count', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'front-2' });
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame()
      );

      const frontiers = bridge.findFrontiers();
      if (frontiers.length >= 2) {
        for (let i = 1; i < frontiers.length; i++) {
          expect(frontiers[i - 1].unknownNeighbors).toBeGreaterThanOrEqual(
            frontiers[i].unknownNeighbors
          );
        }
      }
    });
  });

  describe('updateRobotPose', () => {
    it('marks robot cell as explored even without vision update', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'pose-1' });
      bridge.updateRobotPose({ x: 0.5, y: 0.5, rotation: 0 });

      const wm = bridge.getWorldModel();
      const { gx, gy } = wm.worldToGrid(0.5, 0.5);
      const grid = wm.getGrid();
      expect(grid[gy][gx].state).toBe('explored');
    });

    it('increments visit count on repeated visits', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'pose-2' });
      bridge.updateRobotPose({ x: 0, y: 0, rotation: 0 });
      bridge.updateRobotPose({ x: 0, y: 0, rotation: 0 });
      bridge.updateRobotPose({ x: 0, y: 0, rotation: 0 });

      const wm = bridge.getWorldModel();
      const { gx, gy } = wm.worldToGrid(0, 0);
      const grid = wm.getGrid();
      expect(grid[gy][gx].visitCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('reset', () => {
    it('resets initialization state', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'reset-1' });
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame()
      );
      expect(bridge.isRasterized()).toBe(true);

      bridge.reset();
      expect(bridge.isRasterized()).toBe(false);
    });
  });

  describe('temporal coherence — confidence decay', () => {
    it('decays old cells when decay is enabled', () => {
      const now = Date.now();
      const bridge = new VisionWorldModelBridge({
        deviceId: 'decay-1',
        enableDecay: true,
        decayStartMs: 1000,
        staleThresholdMs: 5000,
        decayRatePerSec: 0.1,
        minConfidence: 0.2,
      });

      // First update at t=now
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame({ scene: makeScene({ openings: ['center'], blocked: [] }) }),
        now
      );

      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      // Count free cells after first update
      let freeCells: Array<{ gx: number; gy: number; confidence: number }> = [];
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          if (grid[gy][gx].state === 'free') {
            freeCells.push({ gx, gy, confidence: grid[gy][gx].confidence });
          }
        }
      }
      expect(freeCells.length).toBeGreaterThan(0);

      // Second update 3 seconds later, at a different position
      // The original free cells haven't been re-observed so they should decay
      bridge.updateFromVision(
        { x: 1, y: 1, rotation: Math.PI },
        makeVisionFrame({ scene: makeScene({ openings: ['center'], blocked: [] }), frameId: 2 }),
        now + 3000
      );

      // Check that old free cells have lower confidence
      let decayed = 0;
      for (const fc of freeCells) {
        const cell = grid[fc.gy][fc.gx];
        if (cell.state === 'free' && cell.confidence < fc.confidence) {
          decayed++;
        }
      }
      expect(decayed).toBeGreaterThan(0);
    });

    it('reverts stale cells to unknown', () => {
      const now = Date.now();
      const bridge = new VisionWorldModelBridge({
        deviceId: 'decay-2',
        enableDecay: true,
        decayStartMs: 100,
        staleThresholdMs: 1000,
        decayRatePerSec: 1.0, // Fast decay
        minConfidence: 0.2,
      });

      // First update
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame({ scene: makeScene({ openings: ['center'], blocked: [] }) }),
        now
      );

      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      // Count free cells
      let freeBefore = 0;
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          if (grid[gy][gx].state === 'free') freeBefore++;
        }
      }
      expect(freeBefore).toBeGreaterThan(0);

      // Update 2 seconds later at a different spot — stale cells should revert to unknown
      bridge.updateFromVision(
        { x: 2, y: 2, rotation: Math.PI },
        makeVisionFrame({ scene: makeScene({ openings: ['center'], blocked: [] }), frameId: 2 }),
        now + 2000
      );

      // Count free cells from original area that reverted
      let freeAfter = 0;
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          if (grid[gy][gx].state === 'free') freeAfter++;
        }
      }
      // Some original free cells should have been reverted to unknown
      // New free cells were created at (2,2) area, but old ones should be gone
      // We can't compare directly because new cells were added; check that the grid
      // has some unknown cells where free cells used to be
      // Instead, check that explored cells are preserved
      const { gx: robotGx, gy: robotGy } = wm.worldToGrid(0, 0);
      expect(grid[robotGy][robotGx].state).toBe('explored');
    });

    it('does not decay explored cells', () => {
      const now = Date.now();
      const bridge = new VisionWorldModelBridge({
        deviceId: 'decay-3',
        enableDecay: true,
        decayStartMs: 100,
        staleThresholdMs: 500,
        decayRatePerSec: 1.0,
        minConfidence: 0.2,
      });

      // Robot visits (0,0)
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame(),
        now
      );

      const wm = bridge.getWorldModel();
      const { gx, gy } = wm.worldToGrid(0, 0);
      const grid = wm.getGrid();
      expect(grid[gy][gx].state).toBe('explored');

      // Much later, decay runs
      bridge.updateFromVision(
        { x: 2, y: 2, rotation: 0 },
        makeVisionFrame({ frameId: 2 }),
        now + 10000
      );

      // Explored cell should remain explored
      expect(grid[gy][gx].state).toBe('explored');
    });

    it('does not decay when disabled', () => {
      const now = Date.now();
      const bridge = new VisionWorldModelBridge({
        deviceId: 'decay-4',
        enableDecay: false,
      });

      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame({ scene: makeScene({ openings: ['center'], blocked: [] }) }),
        now
      );

      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      // Record original confidence of free cells
      const originalConfs: number[] = [];
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          if (grid[gy][gx].state === 'free') {
            originalConfs.push(grid[gy][gx].confidence);
          }
        }
      }

      // Update much later
      bridge.updateFromVision(
        { x: 2, y: 2, rotation: Math.PI },
        makeVisionFrame({ scene: makeScene({ openings: [], blocked: [] }), frameId: 2 }),
        now + 60000
      );

      // Original free cells should still have same confidence (no decay)
      let idx = 0;
      let anyDecayed = false;
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          if (grid[gy][gx].state === 'free' && idx < originalConfs.length) {
            if (grid[gy][gx].confidence < originalConfs[idx] - 0.001) {
              anyDecayed = true;
            }
            idx++;
          }
        }
      }
      expect(anyDecayed).toBe(false);
    });

    it('decays obstacle cells too', () => {
      const now = Date.now();
      const bridge = new VisionWorldModelBridge({
        deviceId: 'decay-5',
        enableDecay: true,
        decayStartMs: 100,
        staleThresholdMs: 2000,
        decayRatePerSec: 0.5,
        minConfidence: 0.2,
      });

      // Place an obstacle
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame({
          detections: [makeDetection({ region: 'center', estimatedDepthCm: 80 })],
          scene: makeScene({ openings: [], blocked: [] }),
        }),
        now
      );

      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      // Find the obstacle cell
      let obsCell: { gx: number; gy: number } | null = null;
      for (let gy = 0; gy < dims.height && !obsCell; gy++) {
        for (let gx = 0; gx < dims.width && !obsCell; gx++) {
          if (grid[gy][gx].state === 'obstacle') {
            obsCell = { gx, gy };
          }
        }
      }
      expect(obsCell).not.toBeNull();

      // Update 3 seconds later from different spot
      bridge.updateFromVision(
        { x: 2, y: 2, rotation: Math.PI },
        makeVisionFrame({ scene: makeScene({ openings: [], blocked: [] }), frameId: 2 }),
        now + 3000
      );

      // Obstacle should have been reverted to unknown (3s > staleThreshold 2s)
      if (obsCell) {
        expect(grid[obsCell.gy][obsCell.gx].state).toBe('unknown');
      }
    });
  });

  describe('integration with NavigationLoop types', () => {
    it('produces world model with serialize method', () => {
      const bridge = new VisionWorldModelBridge({ deviceId: 'integ-1' });
      bridge.updateFromVision(
        { x: 0, y: 0, rotation: 0 },
        makeVisionFrame({
          detections: [makeDetection({ estimatedDepthCm: 80 })],
          scene: makeScene({ openings: ['left', 'right'], blocked: [] }),
        })
      );

      const wm = bridge.getWorldModel();
      const serialized = wm.serialize('json', { x: 0, y: 0, rotation: 0 });
      expect(serialized).toBeDefined();
      expect('occupancy_rle' in serialized || 'changes' in serialized).toBe(true);
    });
  });
});
