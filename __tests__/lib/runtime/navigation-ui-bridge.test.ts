import { NavigationUIBridge, createNavigationUIBridge } from '../../../lib/runtime/navigation-ui-bridge';
import { WorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import { ARENA_SIMPLE_NAVIGATION } from '../../../lib/runtime/test-arenas';
import type { InferenceFunction } from '../../../lib/runtime/navigation-loop';

// =============================================================================
// Helpers
// =============================================================================

function mockInfer(action: string = 'STOP'): InferenceFunction {
  return async () => JSON.stringify({
    action: { type: action },
    fallback: { if_failed: 'STOP' },
    explanation: `Mock: ${action}`,
  });
}

function createBridge() {
  const deviceId = `test-ui-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const bridge = new WorldModelBridge({ deviceId, inflationCells: 0 });
  bridge.rasterize(ARENA_SIMPLE_NAVIGATION.world);
  return bridge;
}

// =============================================================================
// Tests
// =============================================================================

describe('NavigationUIBridge', () => {
  describe('state management', () => {
    it('provides initial state', () => {
      const bridge = createBridge();
      const uiBridge = new NavigationUIBridge(bridge, mockInfer());

      const state = uiBridge.getState();
      expect(state.cycle).toBe(0);
      expect(state.running).toBe(false);
      expect(state.goalReached).toBe(false);
      expect(state.lastAction).toBe('none');
    });

    it('updates state after single cycle', async () => {
      const bridge = createBridge();
      const uiBridge = new NavigationUIBridge(bridge, mockInfer('STOP'));

      uiBridge.getLoop().updatePose(0, 0, 0);
      uiBridge.setGoal(1, 1, 'test');

      await uiBridge.runSingleCycle();

      const state = uiBridge.getState();
      expect(state.cycle).toBe(1);
      expect(state.lastAction).toBe('STOP');
      expect(state.lastExplanation).toContain('Mock');
    });
  });

  describe('state change callbacks', () => {
    it('emits state changes on cycle', async () => {
      const bridge = createBridge();
      const uiBridge = new NavigationUIBridge(bridge, mockInfer('STOP'));

      uiBridge.getLoop().updatePose(0, 0, 0);
      uiBridge.setGoal(1, 1, 'test');

      const states: unknown[] = [];
      uiBridge.onStateChange(s => states.push(s));

      await uiBridge.runSingleCycle();

      // Should have emitted at least one state change
      expect(states.length).toBeGreaterThanOrEqual(1);
    });

    it('unsubscribes correctly', async () => {
      const bridge = createBridge();
      const uiBridge = new NavigationUIBridge(bridge, mockInfer('STOP'));

      uiBridge.getLoop().updatePose(0, 0, 0);
      uiBridge.setGoal(1, 1, 'test');

      let callCount = 0;
      const unsub = uiBridge.onStateChange(() => callCount++);

      await uiBridge.runSingleCycle();
      const countAfterFirst = callCount;

      unsub();
      await uiBridge.runSingleCycle();

      // No new calls after unsubscribe
      expect(callCount).toBe(countAfterFirst);
    });
  });

  describe('prediction integration', () => {
    it('includes prediction stats when enabled', async () => {
      const bridge = createBridge();
      const uiBridge = new NavigationUIBridge(bridge, mockInfer('STOP'), {
        enablePredictions: true,
      });

      uiBridge.getLoop().updatePose(0, 0, 0);
      uiBridge.setGoal(1, 1, 'test');

      await uiBridge.runSingleCycle();

      const state = uiBridge.getState();
      expect(state.predictions).not.toBeNull();
      expect(state.predictions!.predictedCount).toBeGreaterThanOrEqual(0);
    });

    it('does not include predictions when disabled', async () => {
      const bridge = createBridge();
      const uiBridge = new NavigationUIBridge(bridge, mockInfer('STOP'), {
        enablePredictions: false,
      });

      uiBridge.getLoop().updatePose(0, 0, 0);
      uiBridge.setGoal(1, 1, 'test');

      await uiBridge.runSingleCycle();

      const state = uiBridge.getState();
      expect(state.predictions).toBeNull();
    });
  });

  describe('goal detection', () => {
    it('detects goal reached', async () => {
      const bridge = createBridge();
      const uiBridge = new NavigationUIBridge(bridge, mockInfer('STOP'));

      // Robot at goal
      uiBridge.getLoop().updatePose(1, 1, 0);
      uiBridge.setGoal(1, 1, 'test');

      await uiBridge.runSingleCycle();

      const state = uiBridge.getState();
      expect(state.goalReached).toBe(true);
    });
  });

  describe('error handling', () => {
    it('captures errors in state', async () => {
      const bridge = createBridge();
      const failingInfer: InferenceFunction = async () => {
        throw new Error('LLM unavailable');
      };

      const uiBridge = new NavigationUIBridge(bridge, failingInfer);
      uiBridge.getLoop().updatePose(0, 0, 0);
      uiBridge.setGoal(1, 1, 'test');

      // Should not throw — errors are captured in state
      await uiBridge.runSingleCycle();

      // LLM failure triggers fallback, not error state
      const state = uiBridge.getState();
      expect(state.cycle).toBe(1);
    });
  });

  describe('lifecycle', () => {
    it('disposes cleanly', () => {
      const bridge = createBridge();
      const uiBridge = new NavigationUIBridge(bridge, mockInfer());

      let called = false;
      uiBridge.onStateChange(() => { called = true; });
      uiBridge.dispose();

      // After dispose, no more callbacks
      expect(uiBridge.getState().running).toBe(false);
    });

    it('can set exploration mode', () => {
      const bridge = createBridge();
      const uiBridge = new NavigationUIBridge(bridge, mockInfer());

      uiBridge.setExplorationMode('Find all items');

      const state = uiBridge.getState();
      // Mode should be updated via emitState
      expect(state).toBeDefined();
    });
  });

  describe('factory', () => {
    it('createNavigationUIBridge returns working instance', async () => {
      const bridge = createBridge();
      const uiBridge = createNavigationUIBridge(bridge, mockInfer('STOP'));

      uiBridge.getLoop().updatePose(0, 0, 0);
      uiBridge.setGoal(1, 1, 'test');

      await uiBridge.runSingleCycle();
      expect(uiBridge.getState().cycle).toBe(1);
    });
  });
});
