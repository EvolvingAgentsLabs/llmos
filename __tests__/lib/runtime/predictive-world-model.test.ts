import { PredictiveWorldModel, createPredictiveModel } from '../../../lib/runtime/predictive-world-model';
import { WorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import WorldModel from '../../../lib/runtime/world-model';
import { ARENA_SIMPLE_NAVIGATION } from '../../../lib/runtime/test-arenas';

// =============================================================================
// Helpers
// =============================================================================

function createBridge() {
  const deviceId = `test-pred-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const bridge = new WorldModelBridge({ deviceId, inflationCells: 0 });
  bridge.rasterize(ARENA_SIMPLE_NAVIGATION.world);
  return { bridge, deviceId };
}

/** Create a blank WorldModel (no arena walls) for precise tests */
function createBlankWorldModel(): WorldModel {
  return new WorldModel({ worldWidth: 200, worldHeight: 200, gridResolution: 10 });
}

// =============================================================================
// Tests
// =============================================================================

describe('PredictiveWorldModel', () => {
  describe('wall continuation', () => {
    it('extrapolates wall into unknown territory', () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      // Place a wall segment (2 cells in a row) with unknown cells ahead
      const midX = Math.floor(dims.width / 2);
      const midY = Math.floor(dims.height / 2);

      // Clear an area to work with
      for (let y = midY - 5; y <= midY + 5; y++) {
        for (let x = midX - 5; x <= midX + 5; x++) {
          if (wm.isValidGridCoord(x, y)) {
            grid[y][x].state = 'unknown';
            grid[y][x].confidence = 0;
          }
        }
      }

      // Place a horizontal wall segment of 2 cells
      grid[midY][midX].state = 'wall';
      grid[midY][midX].confidence = 0.9;
      grid[midY][midX + 1].state = 'wall';
      grid[midY][midX + 1].confidence = 0.9;

      const model = new PredictiveWorldModel();
      const count = model.predict(wm);

      expect(count).toBeGreaterThan(0);

      // Cells to the right should be predicted as wall
      expect(grid[midY][midX + 2].state).toBe('wall');
      expect(grid[midY][midX + 2].confidence).toBeLessThan(0.5);
    });

    it('respects maxWallExtrapolation limit', () => {
      const wm = createBlankWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      const midX = Math.floor(dims.width / 2);
      const midY = Math.floor(dims.height / 2);

      // Wall segment (2 cells)
      grid[midY][midX].state = 'wall';
      grid[midY][midX].confidence = 0.9;
      grid[midY][midX + 1].state = 'wall';
      grid[midY][midX + 1].confidence = 0.9;

      const model = new PredictiveWorldModel({ maxWallExtrapolation: 3 });
      model.predict(wm);

      // Should predict cells midX+2, midX+3, midX+4 (3 cells from end of segment)
      expect(grid[midY][midX + 2].state).toBe('wall');
      expect(grid[midY][midX + 3].state).toBe('wall');
      expect(grid[midY][midX + 4].state).toBe('wall');
      // Cell midX+5 should remain unknown (beyond extrapolation limit)
      expect(grid[midY][midX + 5].state).toBe('unknown');
    });
  });

  describe('open space expansion', () => {
    it('predicts free space near observed free areas', () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      const midX = Math.floor(dims.width / 2);
      const midY = Math.floor(dims.height / 2);

      // Clear area
      for (let y = midY - 5; y <= midY + 5; y++) {
        for (let x = midX - 5; x <= midX + 5; x++) {
          if (wm.isValidGridCoord(x, y)) {
            grid[y][x].state = 'unknown';
            grid[y][x].confidence = 0;
          }
        }
      }

      // Create a 3x3 free area
      for (let y = midY - 1; y <= midY + 1; y++) {
        for (let x = midX - 1; x <= midX + 1; x++) {
          grid[y][x].state = 'free';
          grid[y][x].confidence = 0.8;
        }
      }

      const model = new PredictiveWorldModel();
      const count = model.predict(wm);

      expect(count).toBeGreaterThan(0);

      // Adjacent unknown cells should be predicted as free
      // At least the cells adjacent to the free area edges
      const adjacentCells = [
        [midX - 2, midY], [midX + 2, midY],
        [midX, midY - 2], [midX, midY + 2],
      ];

      let predictedFree = 0;
      for (const [x, y] of adjacentCells) {
        if (grid[y][x].state === 'free') predictedFree++;
      }
      expect(predictedFree).toBeGreaterThan(0);
    });
  });

  describe('boundary walls', () => {
    it('predicts walls at grid edges when enough edge walls exist', () => {
      const wm = createBlankWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      // Place walls along the top edge (row 0) — enough to trigger boundary prediction
      for (let x = 0; x < 8; x++) {
        grid[0][x].state = 'wall';
        grid[0][x].confidence = 0.9;
      }

      // Leave some top-edge cells as unknown
      const targetX = 10;
      expect(grid[0][targetX].state).toBe('unknown');

      const model = new PredictiveWorldModel();
      model.predict(wm);

      // The unknown edge cell should be predicted as wall
      expect(grid[0][targetX].state).toBe('wall');
    });
  });

  describe('verification', () => {
    it('verifies correct predictions', () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      const midX = Math.floor(dims.width / 2);
      const midY = Math.floor(dims.height / 2);

      // Clear area
      for (let y = midY - 3; y <= midY + 3; y++) {
        for (let x = midX - 3; x <= midX + 3; x++) {
          if (wm.isValidGridCoord(x, y)) {
            grid[y][x].state = 'unknown';
            grid[y][x].confidence = 0;
          }
        }
      }

      // Wall segment
      grid[midY][midX].state = 'wall';
      grid[midY][midX].confidence = 0.9;
      grid[midY][midX + 1].state = 'wall';
      grid[midY][midX + 1].confidence = 0.9;

      const model = new PredictiveWorldModel();
      model.predict(wm);

      // Simulate observation that confirms prediction
      const predState = grid[midY][midX + 2].state;
      expect(predState).toBe('wall');

      // "Observe" the cell with higher confidence
      grid[midY][midX + 2].state = 'wall';
      grid[midY][midX + 2].confidence = 0.9;
      grid[midY][midX + 2].lastUpdated = Date.now() + 1000;

      const result = model.verify(wm);
      expect(result.verified).toBeGreaterThanOrEqual(1);
    });

    it('detects wrong predictions', () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      const midX = Math.floor(dims.width / 2);
      const midY = Math.floor(dims.height / 2);

      // Clear area
      for (let y = midY - 3; y <= midY + 3; y++) {
        for (let x = midX - 3; x <= midX + 3; x++) {
          if (wm.isValidGridCoord(x, y)) {
            grid[y][x].state = 'unknown';
            grid[y][x].confidence = 0;
          }
        }
      }

      // Wall segment → model predicts continuation
      grid[midY][midX].state = 'wall';
      grid[midY][midX].confidence = 0.9;
      grid[midY][midX + 1].state = 'wall';
      grid[midY][midX + 1].confidence = 0.9;

      const model = new PredictiveWorldModel();
      model.predict(wm);

      // "Observe" the cell but it's actually free (wrong prediction)
      grid[midY][midX + 2].state = 'free';
      grid[midY][midX + 2].confidence = 0.9;
      grid[midY][midX + 2].lastUpdated = Date.now() + 1000;

      const result = model.verify(wm);
      expect(result.wrong).toBeGreaterThanOrEqual(1);
    });

    it('skips verification when disabled', () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();

      const model = new PredictiveWorldModel({ verifyOnObservation: false });
      model.predict(wm);

      const result = model.verify(wm);
      expect(result.verified).toBe(0);
      expect(result.wrong).toBe(0);
    });
  });

  describe('statistics', () => {
    it('tracks prediction counts and accuracy', () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();

      const model = new PredictiveWorldModel();
      model.predict(wm);

      const result = model.getResult();
      expect(result.predictedCount).toBeGreaterThanOrEqual(0);
      expect(result.accuracy).toBe(1); // No verifications yet → 100%
    });

    it('resets correctly', () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();

      const model = new PredictiveWorldModel();
      model.predict(wm);
      model.reset();

      const result = model.getResult();
      expect(result.predictedCount).toBe(0);
      expect(result.verifiedCount).toBe(0);
      expect(result.wrongCount).toBe(0);
    });
  });

  describe('does not override observed cells', () => {
    it('only applies predictions to unknown or lower-confidence cells', () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();
      const dims = wm.getGridDimensions();

      const midX = Math.floor(dims.width / 2);
      const midY = Math.floor(dims.height / 2);

      // Wall segment
      grid[midY][midX].state = 'wall';
      grid[midY][midX].confidence = 0.9;
      grid[midY][midX + 1].state = 'wall';
      grid[midY][midX + 1].confidence = 0.9;

      // Place a known free cell ahead with high confidence
      grid[midY][midX + 2].state = 'free';
      grid[midY][midX + 2].confidence = 0.9;

      const model = new PredictiveWorldModel();
      model.predict(wm);

      // High-confidence free cell should NOT be overridden
      expect(grid[midY][midX + 2].state).toBe('free');
    });
  });

  describe('factory', () => {
    it('createPredictiveModel returns working instance', () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();

      const model = createPredictiveModel({ maxWallExtrapolation: 2 });
      const count = model.predict(wm);

      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
