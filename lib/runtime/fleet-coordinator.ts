/**
 * Fleet Coordinator (Multi-Robot)
 *
 * Manages coordination between multiple robots in the same arena:
 *
 *   1. Shared World Model: merges occupancy grids from all robots
 *   2. Task Assignment: assigns exploration frontiers to minimize overlap
 *   3. Conflict Resolution: prevents robots from claiming same target
 *   4. State Synchronization: broadcasts poses and discoveries
 *
 * Each robot maintains its own WorldModel (via deviceId singleton).
 * The coordinator periodically merges them into a shared view
 * and redistributes updated information to all robots.
 *
 * Architecture:
 *   Robot1 WorldModel ─┐
 *   Robot2 WorldModel ─┤── FleetCoordinator ── SharedWorldModel
 *   Robot3 WorldModel ─┘         │
 *                          Task Assignment
 *                          Conflict Resolution
 */

import WorldModel, { getWorldModel, type GridCell, type CellState } from './world-model';
import type { FrontierCell } from './world-model-bridge';

// =============================================================================
// Types
// =============================================================================

export interface FleetMember {
  /** Unique device/robot ID */
  deviceId: string;
  /** Current pose in world coordinates (meters) */
  pose: { x: number; y: number; rotation: number };
  /** Assigned task (if any) */
  assignedTask: FleetTask | null;
  /** Last sync timestamp */
  lastSync: number;
  /** Whether robot is active */
  active: boolean;
}

export interface FleetTask {
  /** Task ID */
  id: string;
  /** Task type */
  type: 'explore_frontier' | 'navigate_to' | 'patrol' | 'idle';
  /** Target position (meters) */
  target: { x: number; y: number };
  /** Description for LLM */
  description: string;
  /** Assigned robot */
  assignedTo: string;
  /** Task status */
  status: 'pending' | 'active' | 'completed' | 'failed';
  /** Creation timestamp */
  createdAt: number;
}

export interface FleetCoordinatorConfig {
  /** Merge strategy: 'max_confidence' keeps highest confidence cell */
  mergeStrategy: 'max_confidence' | 'latest_update';
  /** Minimum distance between robot targets (meters) to avoid overlap */
  minTargetSeparation: number;
  /** How often to re-assign tasks (ms) */
  reassignIntervalMs: number;
  /** Maximum fleet size */
  maxRobots: number;
}

const DEFAULT_CONFIG: FleetCoordinatorConfig = {
  mergeStrategy: 'max_confidence',
  minTargetSeparation: 0.5,
  reassignIntervalMs: 5000,
  maxRobots: 10,
};

export interface MergeResult {
  /** Number of cells updated in shared model */
  cellsUpdated: number;
  /** Number of robots whose data was merged */
  robotsMerged: number;
  /** Timestamp of merge */
  timestamp: number;
}

export interface FleetStatus {
  /** All fleet members */
  members: FleetMember[];
  /** Active tasks */
  tasks: FleetTask[];
  /** Merge statistics */
  lastMerge: MergeResult | null;
  /** Fleet-wide exploration progress */
  explorationProgress: number;
}

// =============================================================================
// Fleet Coordinator
// =============================================================================

export class FleetCoordinator {
  private config: FleetCoordinatorConfig;
  private members: Map<string, FleetMember> = new Map();
  private tasks: Map<string, FleetTask> = new Map();
  private sharedModel: WorldModel;
  private lastMerge: MergeResult | null = null;
  private taskCounter: number = 0;

  constructor(
    sharedDeviceId: string = 'fleet-shared',
    config: Partial<FleetCoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sharedModel = getWorldModel(sharedDeviceId);
  }

  // ---------------------------------------------------------------------------
  // Fleet Management
  // ---------------------------------------------------------------------------

  /**
   * Register a robot in the fleet.
   */
  addRobot(deviceId: string, initialPose: { x: number; y: number; rotation: number } = { x: 0, y: 0, rotation: 0 }): void {
    if (this.members.size >= this.config.maxRobots) {
      throw new Error(`Fleet is full (max ${this.config.maxRobots} robots)`);
    }

    this.members.set(deviceId, {
      deviceId,
      pose: { ...initialPose },
      assignedTask: null,
      lastSync: Date.now(),
      active: true,
    });
  }

  /**
   * Remove a robot from the fleet.
   */
  removeRobot(deviceId: string): void {
    // Unassign any tasks
    for (const [taskId, task] of this.tasks) {
      if (task.assignedTo === deviceId) {
        task.status = 'pending';
        task.assignedTo = '';
      }
    }
    this.members.delete(deviceId);
  }

  /**
   * Update a robot's pose.
   */
  updateRobotPose(deviceId: string, pose: { x: number; y: number; rotation: number }): void {
    const member = this.members.get(deviceId);
    if (member) {
      member.pose = { ...pose };
      member.lastSync = Date.now();
    }
  }

  /**
   * Get all active fleet members.
   */
  getMembers(): FleetMember[] {
    return Array.from(this.members.values());
  }

  /**
   * Get the shared world model.
   */
  getSharedModel(): WorldModel {
    return this.sharedModel;
  }

  // ---------------------------------------------------------------------------
  // World Model Merging
  // ---------------------------------------------------------------------------

  /**
   * Merge all robot world models into the shared model.
   * Each robot's WorldModel is accessed via getWorldModel(deviceId).
   */
  mergeWorldModels(): MergeResult {
    const sharedGrid = this.sharedModel.getGrid();
    const sharedDims = this.sharedModel.getGridDimensions();
    let cellsUpdated = 0;
    let robotsMerged = 0;

    for (const member of this.members.values()) {
      if (!member.active) continue;

      const robotModel = getWorldModel(member.deviceId);
      const robotGrid = robotModel.getGrid();
      const robotDims = robotModel.getGridDimensions();

      // Grid sizes must match
      if (robotDims.width !== sharedDims.width || robotDims.height !== sharedDims.height) continue;

      for (let gy = 0; gy < sharedDims.height; gy++) {
        for (let gx = 0; gx < sharedDims.width; gx++) {
          const robotCell = robotGrid[gy][gx];
          const sharedCell = sharedGrid[gy][gx];

          if (robotCell.state === 'unknown') continue;

          const shouldUpdate = this.shouldUpdateCell(sharedCell, robotCell);
          if (shouldUpdate) {
            sharedCell.state = robotCell.state;
            sharedCell.confidence = Math.max(sharedCell.confidence, robotCell.confidence);
            sharedCell.lastUpdated = Math.max(sharedCell.lastUpdated, robotCell.lastUpdated);
            cellsUpdated++;
          }
        }
      }

      robotsMerged++;
    }

    this.lastMerge = {
      cellsUpdated,
      robotsMerged,
      timestamp: Date.now(),
    };

    return this.lastMerge;
  }

  /**
   * Push the shared model back to all robots.
   * Robots get updates for cells they haven't observed yet.
   */
  distributeSharedModel(): number {
    const sharedGrid = this.sharedModel.getGrid();
    const sharedDims = this.sharedModel.getGridDimensions();
    let totalUpdates = 0;

    for (const member of this.members.values()) {
      if (!member.active) continue;

      const robotModel = getWorldModel(member.deviceId);
      const robotGrid = robotModel.getGrid();
      const robotDims = robotModel.getGridDimensions();

      if (robotDims.width !== sharedDims.width || robotDims.height !== sharedDims.height) continue;

      for (let gy = 0; gy < sharedDims.height; gy++) {
        for (let gx = 0; gx < sharedDims.width; gx++) {
          const sharedCell = sharedGrid[gy][gx];
          const robotCell = robotGrid[gy][gx];

          // Only update robot cells that are unknown or lower confidence
          if (robotCell.state === 'unknown' && sharedCell.state !== 'unknown') {
            robotCell.state = sharedCell.state;
            robotCell.confidence = sharedCell.confidence * 0.8; // Slightly lower — it's indirect data
            robotCell.lastUpdated = sharedCell.lastUpdated;
            totalUpdates++;
          }
        }
      }
    }

    return totalUpdates;
  }

  private shouldUpdateCell(shared: GridCell, robot: GridCell): boolean {
    if (this.config.mergeStrategy === 'max_confidence') {
      return robot.confidence > shared.confidence;
    }
    // latest_update
    return robot.lastUpdated > shared.lastUpdated;
  }

  // ---------------------------------------------------------------------------
  // Task Assignment
  // ---------------------------------------------------------------------------

  /**
   * Assign exploration frontiers to robots.
   * Uses greedy assignment: closest robot gets each frontier.
   */
  assignFrontiers(frontiers: FrontierCell[]): FleetTask[] {
    const newTasks: FleetTask[] = [];
    const availableRobots = Array.from(this.members.values())
      .filter(m => m.active && !m.assignedTask);

    if (availableRobots.length === 0 || frontiers.length === 0) return newTasks;

    // Sort frontiers by exploration value (more unknown neighbors = higher priority)
    const sortedFrontiers = [...frontiers].sort((a, b) => b.unknownNeighbors - a.unknownNeighbors);

    const assignedTargets: Array<{ x: number; y: number }> = [];

    for (const frontier of sortedFrontiers) {
      if (availableRobots.length === 0) break;

      // Check minimum separation from already-assigned targets
      const tooClose = assignedTargets.some(t =>
        Math.hypot(t.x - frontier.wx, t.y - frontier.wy) < this.config.minTargetSeparation
      );
      if (tooClose) continue;

      // Find closest available robot
      let closestIdx = -1;
      let closestDist = Infinity;
      for (let i = 0; i < availableRobots.length; i++) {
        const dist = Math.hypot(
          availableRobots[i].pose.x - frontier.wx,
          availableRobots[i].pose.y - frontier.wy
        );
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }

      if (closestIdx >= 0) {
        const robot = availableRobots.splice(closestIdx, 1)[0];
        const task: FleetTask = {
          id: `task-${++this.taskCounter}`,
          type: 'explore_frontier',
          target: { x: frontier.wx, y: frontier.wy },
          description: `Explore frontier at (${frontier.wx.toFixed(1)}, ${frontier.wy.toFixed(1)})`,
          assignedTo: robot.deviceId,
          status: 'active',
          createdAt: Date.now(),
        };

        this.tasks.set(task.id, task);
        robot.assignedTask = task;
        assignedTargets.push(task.target);
        newTasks.push(task);
      }
    }

    return newTasks;
  }

  /**
   * Mark a task as completed.
   */
  completeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'completed';
    const member = this.members.get(task.assignedTo);
    if (member) {
      member.assignedTask = null;
    }
  }

  /**
   * Get all active tasks.
   */
  getActiveTasks(): FleetTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'active');
  }

  /**
   * Get the task assigned to a specific robot.
   */
  getRobotTask(deviceId: string): FleetTask | null {
    return this.members.get(deviceId)?.assignedTask ?? null;
  }

  // ---------------------------------------------------------------------------
  // Fleet Status
  // ---------------------------------------------------------------------------

  /**
   * Get full fleet status.
   */
  getStatus(): FleetStatus {
    const sharedSnapshot = this.sharedModel.getSnapshot();
    return {
      members: Array.from(this.members.values()),
      tasks: Array.from(this.tasks.values()),
      lastMerge: this.lastMerge,
      explorationProgress: sharedSnapshot.explorationProgress,
    };
  }

  /**
   * Serialize fleet state for LLM context.
   */
  serializeForLLM(): string {
    const members = this.getMembers();
    const tasks = this.getActiveTasks();

    let output = `## Fleet Status (${members.length} robots)\n`;

    for (const m of members) {
      const pos = `(${m.pose.x.toFixed(1)}, ${m.pose.y.toFixed(1)})`;
      const task = m.assignedTask
        ? `task: ${m.assignedTask.description}`
        : 'idle';
      output += `- ${m.deviceId}: pos=${pos} ${task}\n`;
    }

    if (tasks.length > 0) {
      output += `\n### Active Tasks\n`;
      for (const t of tasks) {
        output += `- [${t.id}] ${t.description} → ${t.assignedTo}\n`;
      }
    }

    return output;
  }

  /**
   * Reset the coordinator.
   */
  reset(): void {
    this.members.clear();
    this.tasks.clear();
    this.lastMerge = null;
    this.taskCounter = 0;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createFleetCoordinator(
  config: Partial<FleetCoordinatorConfig> = {}
): FleetCoordinator {
  return new FleetCoordinator('fleet-shared', config);
}
