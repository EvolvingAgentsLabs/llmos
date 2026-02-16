import { NavigationHALBridge, createNavigationHALBridge } from '../../../lib/runtime/navigation-hal-bridge';
import { WorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import { ARENA_SIMPLE_NAVIGATION } from '../../../lib/runtime/test-arenas';
import type { HardwareAbstractionLayer } from '../../../lib/hal/types';
import type { InferenceFunction } from '../../../lib/runtime/navigation-loop';

// =============================================================================
// Mocks
// =============================================================================

function mockInfer(action: string = 'STOP', target?: string): InferenceFunction {
  return async () => JSON.stringify({
    action: { type: action, target_id: target },
    fallback: { if_failed: 'STOP' },
    explanation: `Mock: ${action}`,
  });
}

function createMockHAL(): HardwareAbstractionLayer {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  return {
    mode: 'simulation',
    locomotion: {
      drive: jest.fn(async () => ({ success: true, timestamp: Date.now(), mode: 'simulation' as const })),
      moveTo: jest.fn(async (x: number, y: number, z: number) => {
        calls.push({ method: 'moveTo', args: [x, y, z] });
        return { success: true, timestamp: Date.now(), mode: 'simulation' as const };
      }),
      rotate: jest.fn(async (dir: string, deg: number) => {
        calls.push({ method: 'rotate', args: [dir, deg] });
        return { success: true, timestamp: Date.now(), mode: 'simulation' as const };
      }),
      moveForward: jest.fn(async (cm: number) => {
        calls.push({ method: 'moveForward', args: [cm] });
        return { success: true, timestamp: Date.now(), mode: 'simulation' as const };
      }),
      moveBackward: jest.fn(async (cm: number) => {
        calls.push({ method: 'moveBackward', args: [cm] });
        return { success: true, timestamp: Date.now(), mode: 'simulation' as const };
      }),
      stop: jest.fn(async () => {
        calls.push({ method: 'stop', args: [] });
        return { success: true, timestamp: Date.now(), mode: 'simulation' as const };
      }),
      getPose: jest.fn(async () => ({
        position: { x: 0, y: 0, z: 0 },
        rotation: { yaw: 0, pitch: 0, roll: 0 },
        velocity: { linear: 0, angular: 0 },
      })),
    },
    vision: {
      captureFrame: jest.fn(async () => 'data:image/png;base64,mock'),
      scan: jest.fn(async () => ({
        objects: [],
        distances: { front: 100, left: 100, right: 100 },
        timestamp: Date.now(),
      })),
      getDistance: jest.fn(async () => 100),
    },
    communication: {
      speak: jest.fn(async () => ({ success: true, timestamp: Date.now(), mode: 'simulation' as const })),
      setLED: jest.fn(async () => ({ success: true, timestamp: Date.now(), mode: 'simulation' as const })),
    },
    safety: {
      emergencyStop: jest.fn(async () => ({ success: true, timestamp: Date.now(), mode: 'simulation' as const })),
      resetEmergency: jest.fn(async () => ({ success: true, timestamp: Date.now(), mode: 'simulation' as const })),
      isEmergencyStopped: jest.fn(() => false),
      getBatteryLevel: jest.fn(() => 100),
    },
    initialize: jest.fn(async () => {}),
    cleanup: jest.fn(async () => {}),
    isReady: jest.fn(() => true),
    getDeviceInfo: jest.fn(() => ({
      id: 'mock',
      type: 'virtual',
      mode: 'simulation' as const,
      capabilities: ['locomotion', 'vision'],
    })),
    _calls: calls,
  } as unknown as HardwareAbstractionLayer & { _calls: Array<{ method: string; args: unknown[] }> };
}

function createBridge() {
  const deviceId = `test-hal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const bridge = new WorldModelBridge({ deviceId, inflationCells: 0 });
  bridge.rasterize(ARENA_SIMPLE_NAVIGATION.world);
  return bridge;
}

// =============================================================================
// Tests
// =============================================================================

describe('NavigationHALBridge', () => {
  describe('single cycle execution', () => {
    it('executes STOP decision', async () => {
      const hal = createMockHAL();
      const bridge = createBridge();

      const halBridge = new NavigationHALBridge(hal, bridge, mockInfer('STOP'), {
        captureFrames: false,
      });
      halBridge.getLoop().updatePose(0, 0, 0);
      halBridge.getLoop().setGoal(1, 1, 'test');

      const { cycle, execution } = await halBridge.executeCycle();

      expect(cycle.decision.action.type).toBe('STOP');
      expect(execution.success).toBe(true);
      expect(execution.action).toBe('STOP');
      expect(hal.locomotion.stop).toHaveBeenCalled();
    });

    it('executes ROTATE_TO decision', async () => {
      const hal = createMockHAL();
      const bridge = createBridge();

      const infer: InferenceFunction = async () => JSON.stringify({
        action: { type: 'ROTATE_TO', yaw_deg: 45 },
        fallback: { if_failed: 'STOP' },
        explanation: 'Rotating to face goal.',
      });

      const halBridge = new NavigationHALBridge(hal, bridge, infer, {
        captureFrames: false,
      });
      halBridge.getLoop().updatePose(0, 0, 0);
      halBridge.getLoop().setGoal(1, 1, 'test');

      const { execution } = await halBridge.executeCycle();

      expect(execution.success).toBe(true);
      expect(execution.action).toContain('ROTATE_TO');
      expect(hal.locomotion.rotate).toHaveBeenCalledWith('right', 45);
    });

    it('executes FOLLOW_WALL decision (fallback to STOP)', async () => {
      const hal = createMockHAL();
      const bridge = createBridge();

      const infer: InferenceFunction = async () => JSON.stringify({
        action: { type: 'FOLLOW_WALL' },
        fallback: { if_failed: 'STOP' },
        explanation: 'Following wall.',
      });

      const halBridge = new NavigationHALBridge(hal, bridge, infer, {
        captureFrames: false,
      });
      halBridge.getLoop().updatePose(0, 0, 0);
      halBridge.getLoop().setGoal(1, 1, 'test');

      const { execution } = await halBridge.executeCycle();

      // FOLLOW_WALL falls through to STOP in the HAL bridge
      expect(execution.success).toBe(true);
      expect(hal.locomotion.stop).toHaveBeenCalled();
    });
  });

  describe('camera frame capture', () => {
    it('captures frames when enabled', async () => {
      const hal = createMockHAL();
      const bridge = createBridge();

      const halBridge = new NavigationHALBridge(hal, bridge, mockInfer('STOP'), {
        captureFrames: true,
        frameCaptureInterval: 1,
      });
      halBridge.getLoop().updatePose(0, 0, 0);
      halBridge.getLoop().setGoal(1, 1, 'test');

      await halBridge.executeCycle();

      expect(hal.vision.captureFrame).toHaveBeenCalled();
    });

    it('skips frames when disabled', async () => {
      const hal = createMockHAL();
      const bridge = createBridge();

      const halBridge = new NavigationHALBridge(hal, bridge, mockInfer('STOP'), {
        captureFrames: false,
      });
      halBridge.getLoop().updatePose(0, 0, 0);
      halBridge.getLoop().setGoal(1, 1, 'test');

      await halBridge.executeCycle();

      expect(hal.vision.captureFrame).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('handles HAL locomotion errors', async () => {
      const hal = createMockHAL();
      (hal.locomotion.stop as jest.Mock).mockRejectedValue(new Error('Motor failure'));

      const bridge = createBridge();
      const halBridge = new NavigationHALBridge(hal, bridge, mockInfer('STOP'), {
        captureFrames: false,
      });
      halBridge.getLoop().updatePose(0, 0, 0);
      halBridge.getLoop().setGoal(1, 1, 'test');

      const { execution } = await halBridge.executeCycle();

      expect(execution.success).toBe(false);
      expect(execution.error).toContain('Motor failure');
    });

    it('handles vision capture errors gracefully', async () => {
      const hal = createMockHAL();
      (hal.vision.captureFrame as jest.Mock).mockRejectedValue(new Error('Camera offline'));

      const bridge = createBridge();
      const halBridge = new NavigationHALBridge(hal, bridge, mockInfer('STOP'), {
        captureFrames: true,
      });
      halBridge.getLoop().updatePose(0, 0, 0);
      halBridge.getLoop().setGoal(1, 1, 'test');

      // Should not throw — vision capture is optional
      const { execution } = await halBridge.executeCycle();
      expect(execution.success).toBe(true);
    });
  });

  describe('run loop', () => {
    it('stops when goal reached', async () => {
      const hal = createMockHAL();
      const bridge = createBridge();

      // Set goal near robot (should be immediately reached)
      const halBridge = new NavigationHALBridge(hal, bridge, mockInfer('STOP'), {
        captureFrames: false,
      });
      halBridge.getLoop().updatePose(1, 1, 0);
      halBridge.getLoop().setGoal(1, 1, 'test');

      const result = await halBridge.run();

      expect(result.goalReached).toBe(true);
      expect(result.cycles).toBeGreaterThanOrEqual(1);
    });

    it('stops via stop() method', async () => {
      const hal = createMockHAL();
      const bridge = createBridge();

      const halBridge = new NavigationHALBridge(hal, bridge, mockInfer('STOP'), {
        captureFrames: false,
      });
      halBridge.getLoop().updatePose(0, 0, 0);
      halBridge.getLoop().setGoal(1, 1, 'test');

      // Stop after first cycle callback
      const result = await halBridge.run(() => {
        halBridge.stop();
      });

      expect(result.cycles).toBe(1);
    });
  });

  describe('factory', () => {
    it('createNavigationHALBridge returns working instance', async () => {
      const hal = createMockHAL();
      const bridge = createBridge();

      const halBridge = createNavigationHALBridge(hal, bridge, mockInfer('STOP'), {
        captureFrames: false,
      });
      halBridge.getLoop().updatePose(0, 0, 0);
      halBridge.getLoop().setGoal(1, 1, 'test');

      const { execution } = await halBridge.executeCycle();
      expect(execution.success).toBe(true);
    });
  });
});
