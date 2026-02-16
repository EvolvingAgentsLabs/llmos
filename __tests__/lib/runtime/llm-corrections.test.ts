import { NavigationLoop, type InferenceFunction } from '../../../lib/runtime/navigation-loop';
import { WorldModelBridge, type IWorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import { ARENA_SIMPLE_NAVIGATION } from '../../../lib/runtime/test-arenas';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a mock inference function that returns a decision with corrections.
 */
function mockInferWithCorrections(
  corrections: Array<{ pos_m: [number, number]; observed_state: 'free' | 'obstacle' | 'unknown'; confidence: number }>
): InferenceFunction {
  return async () => JSON.stringify({
    action: { type: 'STOP' },
    fallback: { if_failed: 'STOP' },
    world_model_update: { corrections },
    explanation: 'Applying world model corrections.',
  });
}

function mockInferNoCorrections(): InferenceFunction {
  return async () => JSON.stringify({
    action: { type: 'STOP' },
    fallback: { if_failed: 'STOP' },
    explanation: 'No corrections.',
  });
}

function createBridge(): { bridge: IWorldModelBridge; deviceId: string } {
  const deviceId = `test-corr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const bridge = new WorldModelBridge({ deviceId, inflationCells: 0 });
  bridge.rasterize(ARENA_SIMPLE_NAVIGATION.world);
  return { bridge, deviceId };
}

// =============================================================================
// Tests
// =============================================================================

describe('LLM World Model Corrections', () => {
  describe('correction application', () => {
    it('applies corrections to low-confidence cells', async () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();

      // Use a cell away from robot position to avoid explored overwrite
      const { gx, gy } = wm.worldToGrid(0.5, 0.5);
      grid[gy][gx].state = 'free';
      grid[gy][gx].confidence = 0.5; // Below llmCorrectionMaxOverride default (0.7)

      const loop = new NavigationLoop(
        bridge,
        mockInferWithCorrections([
          { pos_m: [0.5, 0.5], observed_state: 'obstacle', confidence: 0.8 },
        ]),
        { generateMapImages: false }
      );
      loop.updatePose(0, 0, 0);
      loop.setGoal(1, 1, 'test');

      await loop.runCycle();

      // The cell should now be 'obstacle' from LLM correction
      expect(grid[gy][gx].state).toBe('obstacle');
    });

    it('does not override high-confidence sensor cells', async () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();

      // Set a high-confidence obstacle
      const { gx, gy } = wm.worldToGrid(0.5, 0.5);
      grid[gy][gx].state = 'obstacle';
      grid[gy][gx].confidence = 0.95; // Above llmCorrectionMaxOverride default (0.7)

      const loop = new NavigationLoop(
        bridge,
        mockInferWithCorrections([
          { pos_m: [0.5, 0.5], observed_state: 'free', confidence: 0.9 },
        ]),
        { generateMapImages: false }
      );
      loop.updatePose(0, 0, 0);
      loop.setGoal(1, 1, 'test');

      await loop.runCycle();

      // Cell should remain obstacle — sensor confidence (0.95) > maxOverride (0.7)
      expect(grid[gy][gx].state).toBe('obstacle');
    });

    it('does not override explored cells', async () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();

      // Mark a cell as explored (robot was physically there)
      const { gx, gy } = wm.worldToGrid(0, 0);
      grid[gy][gx].state = 'explored';
      grid[gy][gx].confidence = 0.3; // Even low confidence explored cells should be safe

      const loop = new NavigationLoop(
        bridge,
        mockInferWithCorrections([
          { pos_m: [0, 0], observed_state: 'obstacle', confidence: 0.9 },
        ]),
        { generateMapImages: false }
      );
      loop.updatePose(0, 0, 0);
      loop.setGoal(1, 1, 'test');

      await loop.runCycle();

      // Explored cell should never be overridden
      expect(grid[gy][gx].state).toBe('explored');
    });

    it('skips low-confidence corrections', async () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();

      // Use a cell away from robot position
      const { gx, gy } = wm.worldToGrid(0.5, 0.5);
      grid[gy][gx].state = 'free';
      grid[gy][gx].confidence = 0.3;

      const loop = new NavigationLoop(
        bridge,
        mockInferWithCorrections([
          { pos_m: [0.5, 0.5], observed_state: 'obstacle', confidence: 0.3 }, // Below min (0.6)
        ]),
        { generateMapImages: false }
      );
      loop.updatePose(0, 0, 0);
      loop.setGoal(1, 1, 'test');

      await loop.runCycle();

      // Cell should remain free — correction confidence too low
      expect(grid[gy][gx].state).toBe('free');
    });

    it('applies multiple corrections in one cycle', async () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();

      // Set up two low-confidence cells
      const pos1 = wm.worldToGrid(0.3, 0.3);
      const pos2 = wm.worldToGrid(-0.3, -0.3);
      grid[pos1.gy][pos1.gx].state = 'free';
      grid[pos1.gy][pos1.gx].confidence = 0.4;
      grid[pos2.gy][pos2.gx].state = 'unknown';
      grid[pos2.gy][pos2.gx].confidence = 0;

      const loop = new NavigationLoop(
        bridge,
        mockInferWithCorrections([
          { pos_m: [0.3, 0.3], observed_state: 'obstacle', confidence: 0.7 },
          { pos_m: [-0.3, -0.3], observed_state: 'free', confidence: 0.8 },
        ]),
        { generateMapImages: false }
      );
      loop.updatePose(0, 0, 0);
      loop.setGoal(1, 1, 'test');

      await loop.runCycle();

      expect(grid[pos1.gy][pos1.gx].state).toBe('obstacle');
      expect(grid[pos2.gy][pos2.gx].state).toBe('free');
    });

    it('does not crash when no corrections are provided', async () => {
      const { bridge } = createBridge();

      const loop = new NavigationLoop(
        bridge,
        mockInferNoCorrections(),
        { generateMapImages: false }
      );
      loop.updatePose(0, 0, 0);
      loop.setGoal(1, 1, 'test');

      const result = await loop.runCycle();
      expect(result.decision.action.type).toBe('STOP');
    });

    it('respects applyLLMCorrections=false config', async () => {
      const { bridge } = createBridge();
      const wm = bridge.getWorldModel();
      const grid = wm.getGrid();

      // Use a cell away from robot position
      const { gx, gy } = wm.worldToGrid(0.5, 0.5);
      grid[gy][gx].state = 'free';
      grid[gy][gx].confidence = 0.3;

      const loop = new NavigationLoop(
        bridge,
        mockInferWithCorrections([
          { pos_m: [0.5, 0.5], observed_state: 'obstacle', confidence: 0.9 },
        ]),
        { generateMapImages: false, applyLLMCorrections: false }
      );
      loop.updatePose(0, 0, 0);
      loop.setGoal(1, 1, 'test');

      await loop.runCycle();

      // Should NOT apply correction when disabled
      expect(grid[gy][gx].state).toBe('free');
    });
  });
});
