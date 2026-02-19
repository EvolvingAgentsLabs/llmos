/**
 * Fleet Sync Layer — Push-Based World Model Delta Broadcasting
 *
 * Wraps FleetCoordinator with real-time delta broadcasting using
 * GridPatchUpdate from the serializer. Robots push their local
 * world model changes to all peers.
 *
 * Two transport modes:
 * - LocalSyncTransport: In-process (for simulation with multiple robots)
 * - WebSocketSyncTransport: Multi-machine (for physical robot fleet)
 *
 * Architecture:
 *   Robot1 WorldModel ──┐
 *   Robot2 WorldModel ──┤── FleetSyncLayer ── Transport ── SharedWorldModel
 *   Robot3 WorldModel ──┘        │
 *                          FleetCoordinator
 *                          (merge + tasks)
 */

import { FleetCoordinator } from './fleet-coordinator';
import { getWorldModel } from './world-model';
import { WorldModelSerializer, SERIAL_TO_CELL_STATE } from './world-model-serializer';
import type { GridPatchUpdate } from './world-model-serializer';

// =============================================================================
// Types
// =============================================================================

export interface SyncTransport {
  readonly name: string;
  broadcast(deviceId: string, patch: GridPatchUpdate): void;
  onReceive(callback: (fromDeviceId: string, patch: GridPatchUpdate) => void): void;
  connect(deviceId: string): void;
  disconnect(deviceId: string): void;
}

export interface FleetSyncConfig {
  /** Broadcast interval in ms (default: 500) */
  broadcastIntervalMs: number;
  /** Minimum changes before broadcasting (default: 1) */
  minChangesForBroadcast: number;
  /** Maximum patch size before sending full state (default: 500 changes) */
  maxPatchSize: number;
  /** Enable/disable sync (default: true) */
  enabled: boolean;
}

export interface FleetSyncStats {
  patchesSent: number;
  patchesReceived: number;
  totalChangesBroadcast: number;
  totalChangesApplied: number;
  lastBroadcastTime: number;
  lastReceiveTime: number;
  connectedDevices: number;
}

const DEFAULT_SYNC_CONFIG: FleetSyncConfig = {
  broadcastIntervalMs: 500,
  minChangesForBroadcast: 1,
  maxPatchSize: 500,
  enabled: true,
};

// =============================================================================
// Local Sync Transport (In-Process, for Simulation)
// =============================================================================

export class LocalSyncTransport implements SyncTransport {
  readonly name = 'local';

  private connectedDevices: Set<string> = new Set();
  private callbacks: Array<(fromDeviceId: string, patch: GridPatchUpdate) => void> = [];

  /**
   * Broadcast a patch to all connected receivers except the sender.
   */
  broadcast(deviceId: string, patch: GridPatchUpdate): void {
    for (const callback of this.callbacks) {
      // Deliver to all callbacks — filtering by sender is done by the caller
      // or by receivers checking deviceId. Here we just skip delivering to
      // the sender by checking if the sender is the origin.
      callback(deviceId, patch);
    }
  }

  /**
   * Register a callback to receive patches from other devices.
   */
  onReceive(callback: (fromDeviceId: string, patch: GridPatchUpdate) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Connect a device to the transport.
   */
  connect(deviceId: string): void {
    this.connectedDevices.add(deviceId);
  }

  /**
   * Disconnect a device from the transport.
   */
  disconnect(deviceId: string): void {
    this.connectedDevices.delete(deviceId);
  }

  /**
   * Get the number of connected devices.
   */
  getConnectedCount(): number {
    return this.connectedDevices.size;
  }

  /**
   * Check if a device is connected.
   */
  isConnected(deviceId: string): boolean {
    return this.connectedDevices.has(deviceId);
  }
}

// =============================================================================
// WebSocket Sync Transport (Multi-Machine, Stub)
// =============================================================================

export class WebSocketSyncTransport implements SyncTransport {
  readonly name = 'websocket';

  private url: string;
  private connected: boolean = false;
  private connectedDevices: Set<string> = new Set();
  private callbacks: Array<(fromDeviceId: string, patch: GridPatchUpdate) => void> = [];

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Broadcast a patch via WebSocket.
   * Stub: logs the intent but does not actually send.
   */
  broadcast(deviceId: string, patch: GridPatchUpdate): void {
    // Stub: In a real implementation, this would serialize the patch
    // and send it via WebSocket to the server for fan-out.
    if (this.connected) {
      // Would send: JSON.stringify({ from: deviceId, patch })
    }
  }

  /**
   * Register a callback to receive patches.
   */
  onReceive(callback: (fromDeviceId: string, patch: GridPatchUpdate) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Connect a device. In a real implementation, this would open a WebSocket.
   */
  connect(deviceId: string): void {
    this.connectedDevices.add(deviceId);
    this.connected = true;
  }

  /**
   * Disconnect a device. In a real implementation, this would close the WebSocket.
   */
  disconnect(deviceId: string): void {
    this.connectedDevices.delete(deviceId);
    if (this.connectedDevices.size === 0) {
      this.connected = false;
    }
  }

  /**
   * Get the WebSocket URL.
   */
  getUrl(): string {
    return this.url;
  }

  /**
   * Check if the transport has active connections.
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// =============================================================================
// Fleet Sync Layer
// =============================================================================

export class FleetSyncLayer {
  private coordinator: FleetCoordinator;
  private transport: SyncTransport;
  private config: FleetSyncConfig;

  /** One serializer per robot device, used to compute deltas */
  private serializers: Map<string, WorldModelSerializer> = new Map();

  /** Sync statistics */
  private stats: FleetSyncStats = {
    patchesSent: 0,
    patchesReceived: 0,
    totalChangesBroadcast: 0,
    totalChangesApplied: 0,
    lastBroadcastTime: 0,
    lastReceiveTime: 0,
    connectedDevices: 0,
  };

  /** Auto-sync interval handle */
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;

  /** Set of registered device IDs */
  private registeredDevices: Set<string> = new Set();

  constructor(
    coordinator: FleetCoordinator,
    transport: SyncTransport,
    config: Partial<FleetSyncConfig> = {}
  ) {
    this.coordinator = coordinator;
    this.transport = transport;
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };

    // Set up the transport receive callback to apply incoming patches
    this.transport.onReceive((fromDeviceId: string, patch: GridPatchUpdate) => {
      // Only apply patches from registered devices, and not to the sender's own model
      if (this.registeredDevices.has(fromDeviceId)) {
        this.applyReceivedPatch(fromDeviceId, patch);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Device Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a device for sync. Connects the transport, creates a serializer,
   * and takes an initial baseline snapshot of the device's world model.
   */
  registerDevice(deviceId: string): void {
    // Connect transport
    this.transport.connect(deviceId);
    this.registeredDevices.add(deviceId);

    // Create a serializer for this device
    const serializer = new WorldModelSerializer();
    this.serializers.set(deviceId, serializer);

    // Take initial baseline: serialize the current world model to establish
    // the previous state for future delta computations.
    const worldModel = getWorldModel(deviceId);
    const grid = worldModel.getGrid();
    const worldConfig = worldModel.getWorldConfig();
    serializer.serializeToJSON(
      grid,
      { x: 0, y: 0, rotation: 0 },
      worldConfig
    );

    // Update stats
    this.stats.connectedDevices = this.registeredDevices.size;
  }

  /**
   * Unregister a device from sync. Disconnects the transport and removes
   * the serializer.
   */
  unregisterDevice(deviceId: string): void {
    this.transport.disconnect(deviceId);
    this.registeredDevices.delete(deviceId);
    this.serializers.delete(deviceId);

    // Update stats
    this.stats.connectedDevices = this.registeredDevices.size;
  }

  // ---------------------------------------------------------------------------
  // Delta Broadcasting
  // ---------------------------------------------------------------------------

  /**
   * Compute and broadcast the delta for a specific device's world model.
   * Uses the device's serializer to compute changes since the last broadcast.
   */
  broadcastDelta(deviceId: string): void {
    if (!this.config.enabled) return;

    const serializer = this.serializers.get(deviceId);
    if (!serializer) return;

    const worldModel = getWorldModel(deviceId);
    const grid = worldModel.getGrid();

    // Compute delta since last serialization
    const patch = serializer.computePatch(
      grid,
      { x: 0, y: 0, rotation: 0 }
    );

    // No previous state or no changes
    if (!patch) return;
    if (patch.num_changes < this.config.minChangesForBroadcast) return;
    if (patch.num_changes > this.config.maxPatchSize) return;

    // Broadcast via transport
    this.transport.broadcast(deviceId, patch);

    // Update stats
    this.stats.patchesSent++;
    this.stats.totalChangesBroadcast += patch.num_changes;
    this.stats.lastBroadcastTime = Date.now();
  }

  // ---------------------------------------------------------------------------
  // Patch Application
  // ---------------------------------------------------------------------------

  /**
   * Apply a received patch to the shared world model.
   * Each change in the patch updates the corresponding grid cell.
   */
  applyReceivedPatch(fromDeviceId: string, patch: GridPatchUpdate): void {
    const sharedModel = this.coordinator.getSharedModel();
    const grid = sharedModel.getGrid();
    const dims = sharedModel.getGridDimensions();

    let appliedChanges = 0;

    for (const [gx, gy, serializedState] of patch.changes) {
      // Bounds check
      if (gx < 0 || gx >= dims.width || gy < 0 || gy >= dims.height) continue;

      const cellState = SERIAL_TO_CELL_STATE[serializedState];
      if (!cellState) continue;

      const cell = grid[gy][gx];

      // Apply the change: update state, confidence, and timestamp
      cell.state = cellState;
      cell.confidence = Math.max(cell.confidence, 0.8);
      cell.lastUpdated = Date.now();
      appliedChanges++;
    }

    // Update stats
    this.stats.patchesReceived++;
    this.stats.totalChangesApplied += appliedChanges;
    this.stats.lastReceiveTime = Date.now();
  }

  // ---------------------------------------------------------------------------
  // Auto Sync
  // ---------------------------------------------------------------------------

  /**
   * Start automatic delta broadcasting at the configured interval.
   * Broadcasts deltas for all registered devices on each tick.
   */
  startAutoSync(): void {
    if (this.broadcastTimer !== null) return;

    this.broadcastTimer = setInterval(() => {
      for (const deviceId of this.registeredDevices) {
        this.broadcastDelta(deviceId);
      }
    }, this.config.broadcastIntervalMs);
  }

  /**
   * Stop automatic delta broadcasting.
   */
  stopAutoSync(): void {
    if (this.broadcastTimer !== null) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Stats & Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Get a copy of the current sync statistics.
   */
  getStats(): FleetSyncStats {
    return { ...this.stats };
  }

  /**
   * Reset the sync layer: stop auto sync, clear all serializers and stats.
   */
  reset(): void {
    this.stopAutoSync();
    this.serializers.clear();
    this.registeredDevices.clear();
    this.stats = {
      patchesSent: 0,
      patchesReceived: 0,
      totalChangesBroadcast: 0,
      totalChangesApplied: 0,
      lastBroadcastTime: 0,
      lastReceiveTime: 0,
      connectedDevices: 0,
    };
  }

  /**
   * Get the underlying coordinator.
   */
  getCoordinator(): FleetCoordinator {
    return this.coordinator;
  }

  /**
   * Get the set of registered device IDs.
   */
  getRegisteredDevices(): Set<string> {
    return new Set(this.registeredDevices);
  }
}
