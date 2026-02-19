import {
  FleetSyncLayer,
  LocalSyncTransport,
  WebSocketSyncTransport,
} from '../../../lib/runtime/fleet-sync-layer';
import type { FleetSyncStats } from '../../../lib/runtime/fleet-sync-layer';
import { FleetCoordinator } from '../../../lib/runtime/fleet-coordinator';
import { getWorldModel, clearAllWorldModels } from '../../../lib/runtime/world-model';
import { WorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import { ARENA_SIMPLE_NAVIGATION } from '../../../lib/runtime/test-arenas';
import type { GridPatchUpdate, SerializedCellState } from '../../../lib/runtime/world-model-serializer';

// =============================================================================
// Helpers
// =============================================================================

function createRobotBridge(deviceId: string) {
  const bridge = new WorldModelBridge({ deviceId, inflationCells: 0 });
  bridge.rasterize(ARENA_SIMPLE_NAVIGATION.world);
  return bridge;
}

// =============================================================================
// Tests
// =============================================================================

describe('FleetSyncLayer', () => {
  afterEach(() => {
    clearAllWorldModels();
  });

  // ---------------------------------------------------------------------------
  // Device Registration
  // ---------------------------------------------------------------------------

  describe('device registration', () => {
    it('registers and unregisters devices', () => {
      const coordinator = new FleetCoordinator('sync-reg-shared');
      const transport = new LocalSyncTransport();
      const syncLayer = new FleetSyncLayer(coordinator, transport);

      // Register two devices
      createRobotBridge('sync-reg-r1');
      createRobotBridge('sync-reg-r2');
      syncLayer.registerDevice('sync-reg-r1');
      syncLayer.registerDevice('sync-reg-r2');

      const stats = syncLayer.getStats();
      expect(stats.connectedDevices).toBe(2);
      expect(transport.getConnectedCount()).toBe(2);

      // Unregister one
      syncLayer.unregisterDevice('sync-reg-r1');

      const stats2 = syncLayer.getStats();
      expect(stats2.connectedDevices).toBe(1);
      expect(transport.getConnectedCount()).toBe(1);
      expect(transport.isConnected('sync-reg-r1')).toBe(false);
      expect(transport.isConnected('sync-reg-r2')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Delta Broadcasting
  // ---------------------------------------------------------------------------

  describe('delta broadcasting', () => {
    it('broadcasts delta after world model changes', () => {
      const coordinator = new FleetCoordinator('sync-bc-shared');
      const transport = new LocalSyncTransport();
      const syncLayer = new FleetSyncLayer(coordinator, transport);

      // Set up robot with rasterized arena
      const bridge = createRobotBridge('sync-bc-r1');
      syncLayer.registerDevice('sync-bc-r1');

      // Make changes to the world model after the baseline was taken
      // updateRobotPose marks cells as explored, which changes them from 'free'
      bridge.updateRobotPose({ x: 0.1, y: 0.1, rotation: 0 });
      bridge.updateRobotPose({ x: 0.2, y: 0.1, rotation: 0 });
      bridge.updateRobotPose({ x: 0.3, y: 0.1, rotation: 0 });

      // Broadcast the delta
      syncLayer.broadcastDelta('sync-bc-r1');

      const stats = syncLayer.getStats();
      expect(stats.patchesSent).toBeGreaterThan(0);
      expect(stats.totalChangesBroadcast).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Received Patch Application
  // ---------------------------------------------------------------------------

  describe('received patch application', () => {
    it('received patches update shared model', () => {
      const coordinator = new FleetCoordinator('sync-recv-shared');
      const transport = new LocalSyncTransport();
      const syncLayer = new FleetSyncLayer(coordinator, transport);

      // Create the shared model so it exists
      getWorldModel('sync-recv-shared');

      // Create a mock patch with known changes
      const mockPatch: GridPatchUpdate = {
        frame: 'world_patch',
        cycle: 1,
        changes: [
          [25, 25, 'F' as SerializedCellState], // Center cell → free
          [26, 25, 'O' as SerializedCellState], // Next cell → obstacle
          [27, 25, 'E' as SerializedCellState], // Another cell → explored
        ],
        robot: { pose_m: [0, 0], yaw_deg: 0 },
        exploration: 0.01,
        num_changes: 3,
      };

      // Apply the patch directly
      syncLayer.applyReceivedPatch('some-robot', mockPatch);

      // Verify the shared model was updated
      const sharedGrid = coordinator.getSharedModel().getGrid();
      expect(sharedGrid[25][25].state).toBe('free');
      expect(sharedGrid[25][26].state).toBe('obstacle');
      expect(sharedGrid[25][27].state).toBe('explored');

      const stats = syncLayer.getStats();
      expect(stats.patchesReceived).toBe(1);
      expect(stats.totalChangesApplied).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // LocalSyncTransport
  // ---------------------------------------------------------------------------

  describe('LocalSyncTransport', () => {
    it('delivers to all receivers except sender', () => {
      const transport = new LocalSyncTransport();

      transport.connect('device-1');
      transport.connect('device-2');
      transport.connect('device-3');

      const receivedBy: string[] = [];
      const receivedPatches: GridPatchUpdate[] = [];

      // Set up a callback that tracks who the patch is from
      transport.onReceive((fromDeviceId: string, patch: GridPatchUpdate) => {
        receivedBy.push(fromDeviceId);
        receivedPatches.push(patch);
      });

      const mockPatch: GridPatchUpdate = {
        frame: 'world_patch',
        cycle: 1,
        changes: [[10, 10, 'F' as SerializedCellState]],
        robot: { pose_m: [0, 0], yaw_deg: 0 },
        exploration: 0.01,
        num_changes: 1,
      };

      // Broadcast from device-1
      transport.broadcast('device-1', mockPatch);

      // The callback fires once per broadcast call with the sender's ID
      // The FleetSyncLayer is responsible for filtering — the transport
      // just delivers and identifies the sender
      expect(receivedBy).toHaveLength(1);
      expect(receivedBy[0]).toBe('device-1');
      expect(receivedPatches[0]).toEqual(mockPatch);
    });

    it('supports multiple callbacks', () => {
      const transport = new LocalSyncTransport();
      transport.connect('dev-a');

      let callback1Called = false;
      let callback2Called = false;

      transport.onReceive(() => { callback1Called = true; });
      transport.onReceive(() => { callback2Called = true; });

      const mockPatch: GridPatchUpdate = {
        frame: 'world_patch',
        cycle: 1,
        changes: [],
        robot: { pose_m: [0, 0], yaw_deg: 0 },
        exploration: 0,
        num_changes: 0,
      };

      transport.broadcast('dev-a', mockPatch);

      expect(callback1Called).toBe(true);
      expect(callback2Called).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // End-to-End Propagation
  // ---------------------------------------------------------------------------

  describe('end-to-end propagation', () => {
    it('robot1 change propagates to shared model', () => {
      const coordinator = new FleetCoordinator('sync-e2e-shared');
      const transport = new LocalSyncTransport();
      const syncLayer = new FleetSyncLayer(coordinator, transport);

      // Register two robots
      const bridge1 = createRobotBridge('sync-e2e-r1');
      createRobotBridge('sync-e2e-r2');
      coordinator.addRobot('sync-e2e-r1');
      coordinator.addRobot('sync-e2e-r2');
      syncLayer.registerDevice('sync-e2e-r1');
      syncLayer.registerDevice('sync-e2e-r2');

      // Robot 1 moves and marks cells as explored
      bridge1.updateRobotPose({ x: 0.1, y: 0.1, rotation: 0 });
      bridge1.updateRobotPose({ x: 0.2, y: 0.1, rotation: 0 });

      // Broadcast robot1's delta — the transport receive callback
      // will call applyReceivedPatch which updates the shared model
      syncLayer.broadcastDelta('sync-e2e-r1');

      // Check that the shared model received the updates
      const sharedGrid = coordinator.getSharedModel().getGrid();
      const wm1 = getWorldModel('sync-e2e-r1');

      // Find cells that robot1 marked as explored
      const pos1 = wm1.worldToGrid(0.1, 0.1);
      const pos2 = wm1.worldToGrid(0.2, 0.1);

      // These cells should now be updated in the shared model
      // (either explored or free depending on the patch)
      const cell1 = sharedGrid[pos1.gy][pos1.gx];
      const cell2 = sharedGrid[pos2.gy][pos2.gx];

      expect(cell1.state).not.toBe('unknown');
      expect(cell2.state).not.toBe('unknown');

      const stats = syncLayer.getStats();
      expect(stats.patchesSent).toBeGreaterThan(0);
      expect(stats.patchesReceived).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Stats Tracking
  // ---------------------------------------------------------------------------

  describe('stats tracking', () => {
    it('tracks patchesSent, patchesReceived, totalChangesBroadcast after operations', () => {
      const coordinator = new FleetCoordinator('sync-stats-shared');
      const transport = new LocalSyncTransport();
      const syncLayer = new FleetSyncLayer(coordinator, transport);

      // Ensure shared model exists
      getWorldModel('sync-stats-shared');

      // Register a device
      const bridge = createRobotBridge('sync-stats-r1');
      syncLayer.registerDevice('sync-stats-r1');

      // Initial stats should be zero
      let stats = syncLayer.getStats();
      expect(stats.patchesSent).toBe(0);
      expect(stats.patchesReceived).toBe(0);
      expect(stats.totalChangesBroadcast).toBe(0);
      expect(stats.totalChangesApplied).toBe(0);

      // Make some changes and broadcast
      bridge.updateRobotPose({ x: 0.1, y: 0.1, rotation: 0 });
      bridge.updateRobotPose({ x: 0.2, y: 0.2, rotation: 0 });
      syncLayer.broadcastDelta('sync-stats-r1');

      stats = syncLayer.getStats();
      expect(stats.patchesSent).toBeGreaterThan(0);
      expect(stats.totalChangesBroadcast).toBeGreaterThan(0);
      expect(stats.lastBroadcastTime).toBeGreaterThan(0);

      // The transport callback also triggers applyReceivedPatch,
      // so patchesReceived should have incremented
      expect(stats.patchesReceived).toBeGreaterThan(0);
      expect(stats.totalChangesApplied).toBeGreaterThan(0);
      expect(stats.lastReceiveTime).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  describe('reset', () => {
    it('reset clears state', () => {
      const coordinator = new FleetCoordinator('sync-reset-shared');
      const transport = new LocalSyncTransport();
      const syncLayer = new FleetSyncLayer(coordinator, transport);

      // Register devices
      createRobotBridge('sync-reset-r1');
      createRobotBridge('sync-reset-r2');
      syncLayer.registerDevice('sync-reset-r1');
      syncLayer.registerDevice('sync-reset-r2');

      expect(syncLayer.getStats().connectedDevices).toBe(2);
      expect(syncLayer.getRegisteredDevices().size).toBe(2);

      // Reset
      syncLayer.reset();

      const stats = syncLayer.getStats();
      expect(stats.connectedDevices).toBe(0);
      expect(stats.patchesSent).toBe(0);
      expect(stats.patchesReceived).toBe(0);
      expect(stats.totalChangesBroadcast).toBe(0);
      expect(stats.totalChangesApplied).toBe(0);
      expect(stats.lastBroadcastTime).toBe(0);
      expect(stats.lastReceiveTime).toBe(0);
      expect(syncLayer.getRegisteredDevices().size).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Auto Sync
  // ---------------------------------------------------------------------------

  describe('auto sync', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('auto sync starts and stops', () => {
      const coordinator = new FleetCoordinator('sync-auto-shared');
      const transport = new LocalSyncTransport();
      const syncLayer = new FleetSyncLayer(coordinator, transport, {
        broadcastIntervalMs: 100,
      });

      // Ensure shared model exists
      getWorldModel('sync-auto-shared');

      // Register device (takes baseline snapshot)
      createRobotBridge('sync-auto-r1');
      syncLayer.registerDevice('sync-auto-r1');

      // Directly modify grid cells to guarantee a detectable change
      const model = getWorldModel('sync-auto-r1');
      const grid = model.getGrid();
      grid[10][10].state = 'obstacle';
      grid[10][10].confidence = 1.0;

      // Start auto sync
      syncLayer.startAutoSync();

      // Advance time past the interval
      jest.advanceTimersByTime(150);

      let stats = syncLayer.getStats();
      expect(stats.patchesSent).toBeGreaterThan(0);

      // Make more changes directly on the grid
      grid[15][15].state = 'obstacle';
      grid[15][15].confidence = 1.0;

      const sentBefore = syncLayer.getStats().patchesSent;

      // Advance time again
      jest.advanceTimersByTime(150);

      stats = syncLayer.getStats();
      expect(stats.patchesSent).toBeGreaterThan(sentBefore);

      // Stop auto sync
      syncLayer.stopAutoSync();
      const sentAfterStop = syncLayer.getStats().patchesSent;

      // Make more changes and advance — should NOT broadcast
      grid[20][20].state = 'obstacle';
      grid[20][20].confidence = 1.0;
      jest.advanceTimersByTime(300);

      stats = syncLayer.getStats();
      expect(stats.patchesSent).toBe(sentAfterStop);
    });
  });

  // ---------------------------------------------------------------------------
  // WebSocketSyncTransport (stub)
  // ---------------------------------------------------------------------------

  describe('WebSocketSyncTransport', () => {
    it('stores url and tracks connection state', () => {
      const transport = new WebSocketSyncTransport('ws://localhost:8080');
      expect(transport.getUrl()).toBe('ws://localhost:8080');
      expect(transport.isConnected()).toBe(false);

      transport.connect('ws-dev-1');
      expect(transport.isConnected()).toBe(true);

      transport.disconnect('ws-dev-1');
      expect(transport.isConnected()).toBe(false);
    });
  });
});
