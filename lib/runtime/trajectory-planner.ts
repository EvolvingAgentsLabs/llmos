/**
 * Trajectory Planner - Smart Path Planning for Robot Navigation
 *
 * This module implements a "stop-plan-execute-replan" approach to robot navigation.
 * Instead of reacting frame-by-frame to sensor readings, the robot:
 * 1. STOPS to analyze its surroundings
 * 2. PLANS a smooth trajectory to a goal (unexplored area, specific target)
 * 3. EXECUTES the trajectory with smooth movements
 * 4. REPLANS periodically or when unexpected obstacles are detected
 *
 * Philosophy: An intelligent robot plans ahead, not just reacts.
 * Stopping to think is not a weakness - it's intelligent behavior.
 */

import { WorldModel, getWorldModel, CellState } from './world-model';
import { SensorReadings } from './esp32-agent-runtime';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Waypoint {
  x: number;
  y: number;
  targetYaw?: number; // Optional target orientation at this waypoint
  speed?: number; // Suggested speed at this waypoint (0-70)
  action?: 'move' | 'turn' | 'scan'; // What to do at this waypoint
}

export interface PlannedTrajectory {
  id: string;
  waypoints: Waypoint[];
  goalDescription: string;
  estimatedDuration: number; // milliseconds
  createdAt: number;
  confidence: number; // 0-1 based on world model confidence
}

export interface TrajectoryState {
  mode: 'planning' | 'executing' | 'replanning' | 'stuck' | 'complete';
  currentTrajectory: PlannedTrajectory | null;
  currentWaypointIndex: number;
  lastPlanTime: number;
  replanCount: number;
  distanceTraveled: number;
  // Execution metrics
  executionStartTime: number | null;
  waypointsCompleted: number;
}

export interface TrajectoryPlannerConfig {
  // Planning parameters
  replanIntervalMs: number; // How often to stop and replan (default: 10000ms)
  minWaypointDistance: number; // Minimum distance between waypoints (meters)
  maxWaypointsPerPlan: number; // Maximum waypoints in a single plan
  lookAheadDistance: number; // How far ahead to plan (meters)

  // Execution parameters
  waypointReachedThreshold: number; // Distance to consider waypoint reached (meters)
  yawAlignmentThreshold: number; // Radians error tolerance for alignment

  // Safety parameters
  obstacleCheckDistance: number; // Distance to check for obstacles ahead
  emergencyReplanDistance: number; // If obstacle closer than this, replan immediately
}

const DEFAULT_CONFIG: TrajectoryPlannerConfig = {
  replanIntervalMs: 8000, // Replan every 8 seconds
  minWaypointDistance: 0.15, // 15cm between waypoints
  maxWaypointsPerPlan: 10,
  lookAheadDistance: 2.0, // Plan 2 meters ahead

  waypointReachedThreshold: 0.1, // 10cm to reach waypoint
  yawAlignmentThreshold: 0.2, // ~11 degrees

  obstacleCheckDistance: 0.5, // Check 50cm ahead
  emergencyReplanDistance: 0.2, // Replan if obstacle within 20cm
};

// ═══════════════════════════════════════════════════════════════════════════
// TRAJECTORY PLANNER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class TrajectoryPlanner {
  private config: TrajectoryPlannerConfig;
  private state: TrajectoryState;
  private worldModel: WorldModel | null = null;
  private deviceId: string;

  constructor(deviceId: string, config: Partial<TrajectoryPlannerConfig> = {}) {
    this.deviceId = deviceId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      mode: 'planning',
      currentTrajectory: null,
      currentWaypointIndex: 0,
      lastPlanTime: 0,
      replanCount: 0,
      distanceTraveled: 0,
      executionStartTime: null,
      waypointsCompleted: 0,
    };
  }

  /**
   * Get or create world model for this device
   */
  private getWorldModel(): WorldModel {
    if (!this.worldModel) {
      this.worldModel = getWorldModel(this.deviceId);
    }
    return this.worldModel;
  }

  /**
   * Get current trajectory state
   */
  getState(): TrajectoryState {
    return { ...this.state };
  }

  /**
   * Check if it's time to replan
   */
  shouldReplan(sensors: SensorReadings): boolean {
    const now = Date.now();

    // Time-based replanning
    if (now - this.state.lastPlanTime > this.config.replanIntervalMs) {
      return true;
    }

    // Emergency replan if unexpected obstacle detected
    if (this.state.mode === 'executing' && sensors.distance.front < this.config.emergencyReplanDistance * 100) {
      return true;
    }

    // Replan if trajectory is complete
    if (this.state.mode === 'complete') {
      return true;
    }

    // Replan if no trajectory exists
    if (!this.state.currentTrajectory) {
      return true;
    }

    return false;
  }

  /**
   * Plan a new trajectory from current position
   * This is the "STOP AND THINK" phase
   */
  planTrajectory(
    currentPose: { x: number; y: number; rotation: number },
    sensors: SensorReadings,
    goal?: { x: number; y: number } | 'explore'
  ): PlannedTrajectory {
    this.state.mode = 'planning';
    const worldModel = this.getWorldModel();

    // Update world model with current sensor readings
    worldModel.updateFromSensors(
      currentPose,
      {
        front: sensors.distance.front,
        frontLeft: sensors.distance.frontLeft,
        frontRight: sensors.distance.frontRight,
        left: sensors.distance.left,
        right: sensors.distance.right,
        back: sensors.distance.back,
      },
      Date.now()
    );

    // Determine goal
    let targetGoal: { x: number; y: number };
    let goalDescription: string;

    if (goal === 'explore' || !goal) {
      // Find nearest unexplored area
      const unexploredDirection = this.findBestExplorationTarget(currentPose, worldModel, sensors);
      targetGoal = unexploredDirection;
      goalDescription = `Explore toward (${targetGoal.x.toFixed(2)}, ${targetGoal.y.toFixed(2)})`;
    } else {
      targetGoal = goal;
      goalDescription = `Navigate to (${targetGoal.x.toFixed(2)}, ${targetGoal.y.toFixed(2)})`;
    }

    // Generate waypoints using simple path planning
    const waypoints = this.generateWaypoints(currentPose, targetGoal, worldModel, sensors);

    // Calculate trajectory confidence based on world model exploration
    const explorationProgress = worldModel.getExplorationProgress();
    const confidence = Math.min(0.9, 0.3 + explorationProgress * 0.6);

    // Estimate duration based on waypoint count
    const estimatedDuration = waypoints.length * 1500; // ~1.5s per waypoint

    const trajectory: PlannedTrajectory = {
      id: `traj_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      waypoints,
      goalDescription,
      estimatedDuration,
      createdAt: Date.now(),
      confidence,
    };

    // Update state
    this.state.currentTrajectory = trajectory;
    this.state.currentWaypointIndex = 0;
    this.state.lastPlanTime = Date.now();
    this.state.replanCount++;
    this.state.mode = 'executing';
    this.state.executionStartTime = Date.now();

    return trajectory;
  }

  /**
   * Find the best exploration target based on world model and sensors
   */
  private findBestExplorationTarget(
    currentPose: { x: number; y: number; rotation: number },
    worldModel: WorldModel,
    sensors: SensorReadings
  ): { x: number; y: number } {
    // Get unexplored directions from world model
    const unexploredDirs = worldModel.getUnexploredDirections(currentPose);

    // Find the clearest direction based on sensors
    const sensorClearance = [
      { dir: 'front', dist: sensors.distance.front, angle: 0 },
      { dir: 'front-left', dist: (sensors.distance.front + sensors.distance.left) / 2, angle: Math.PI / 4 },
      { dir: 'front-right', dist: (sensors.distance.front + sensors.distance.right) / 2, angle: -Math.PI / 4 },
      { dir: 'left', dist: sensors.distance.left, angle: Math.PI / 2 },
      { dir: 'right', dist: sensors.distance.right, angle: -Math.PI / 2 },
    ];

    // Score each direction: prefer unexplored + clear
    let bestScore = -1;
    let bestAngle = 0;
    let bestDistance = 0.5; // Default explore distance

    for (const sensor of sensorClearance) {
      let score = sensor.dist / 100; // Base score from clearance (convert cm to m)

      // Bonus for unexplored areas
      const matchingUnexplored = unexploredDirs.find((u) => u.direction.includes(sensor.dir));
      if (matchingUnexplored) {
        score += 2.0; // Big bonus for unexplored
      }

      // Prefer forward-ish directions slightly
      const forwardBias = Math.cos(sensor.angle) * 0.3;
      score += forwardBias;

      if (score > bestScore && sensor.dist > 30) {
        // Minimum 30cm clearance
        bestScore = score;
        bestAngle = currentPose.rotation + sensor.angle;
        bestDistance = Math.min(sensor.dist / 100, this.config.lookAheadDistance);
      }
    }

    // Calculate target position
    const targetX = currentPose.x + Math.sin(bestAngle) * bestDistance;
    const targetY = currentPose.y - Math.cos(bestAngle) * bestDistance;

    // Clamp to arena bounds (assume 5x5m arena centered at origin)
    const clampedX = Math.max(-2.3, Math.min(2.3, targetX));
    const clampedY = Math.max(-2.3, Math.min(2.3, targetY));

    return { x: clampedX, y: clampedY };
  }

  /**
   * Generate smooth waypoints from current position to goal
   */
  private generateWaypoints(
    currentPose: { x: number; y: number; rotation: number },
    goal: { x: number; y: number },
    worldModel: WorldModel,
    sensors: SensorReadings
  ): Waypoint[] {
    const waypoints: Waypoint[] = [];

    // Calculate direct path
    const dx = goal.x - currentPose.x;
    const dy = goal.y - currentPose.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const targetAngle = Math.atan2(dx, -dy); // Angle to target

    // If target is behind us or significant turn needed, add a turn waypoint first
    const angleToTarget = this.normalizeAngle(targetAngle - currentPose.rotation);
    if (Math.abs(angleToTarget) > Math.PI / 4) {
      // Need to turn first
      waypoints.push({
        x: currentPose.x,
        y: currentPose.y,
        targetYaw: targetAngle,
        speed: 0,
        action: 'turn',
      });
    }

    // Generate intermediate waypoints along the path
    const numWaypoints = Math.min(
      this.config.maxWaypointsPerPlan,
      Math.ceil(distance / this.config.minWaypointDistance)
    );

    for (let i = 1; i <= numWaypoints; i++) {
      const t = i / numWaypoints;
      const wx = currentPose.x + dx * t;
      const wy = currentPose.y + dy * t;

      // Check if this waypoint would be in an obstacle (from world model)
      const { gx, gy } = worldModel.worldToGrid(wx, wy);
      if (worldModel.isValidGridCoord(gx, gy)) {
        // Add waypoint with appropriate speed based on distance to goal
        const remainingDistance = distance * (1 - t);
        const speed = this.calculateSpeed(remainingDistance, sensors);

        waypoints.push({
          x: wx,
          y: wy,
          targetYaw: targetAngle,
          speed,
          action: 'move',
        });
      }
    }

    // Add a scan waypoint at the end if we've traveled far
    if (distance > 0.5) {
      const lastWp = waypoints[waypoints.length - 1];
      if (lastWp && lastWp.action !== 'scan') {
        waypoints.push({
          x: goal.x,
          y: goal.y,
          speed: 0,
          action: 'scan',
        });
      }
    }

    return waypoints;
  }

  /**
   * Calculate appropriate speed based on remaining distance and sensors
   */
  private calculateSpeed(remainingDistance: number, sensors: SensorReadings): number {
    // Base speed from distance (slow down as we approach)
    let speed = Math.min(60, remainingDistance * 100);

    // Reduce speed if obstacles nearby
    const minObstacleDist = Math.min(
      sensors.distance.front,
      sensors.distance.frontLeft,
      sensors.distance.frontRight
    );

    if (minObstacleDist < 50) {
      speed = Math.min(speed, 35); // Slow zone
    }
    if (minObstacleDist < 30) {
      speed = Math.min(speed, 20); // Very slow
    }

    return Math.max(15, speed); // Minimum speed for movement
  }

  /**
   * Get the motor command to follow the current trajectory
   * Returns null if replanning is needed or trajectory is complete
   */
  getMotorCommand(
    currentPose: { x: number; y: number; rotation: number },
    sensors: SensorReadings
  ): { left: number; right: number; action: string } | null {
    if (this.state.mode !== 'executing' || !this.state.currentTrajectory) {
      return null;
    }

    const trajectory = this.state.currentTrajectory;
    const waypointIndex = this.state.currentWaypointIndex;

    // Check if trajectory is complete
    if (waypointIndex >= trajectory.waypoints.length) {
      this.state.mode = 'complete';
      return null;
    }

    const waypoint = trajectory.waypoints[waypointIndex];

    // Check if we've reached the current waypoint
    const distToWaypoint = Math.sqrt(
      Math.pow(waypoint.x - currentPose.x, 2) + Math.pow(waypoint.y - currentPose.y, 2)
    );

    if (distToWaypoint < this.config.waypointReachedThreshold) {
      // Waypoint reached, advance to next
      this.state.currentWaypointIndex++;
      this.state.waypointsCompleted++;

      // Handle scan action
      if (waypoint.action === 'scan') {
        return { left: 0, right: 0, action: 'scan' };
      }

      // Check if there's a next waypoint
      if (this.state.currentWaypointIndex >= trajectory.waypoints.length) {
        this.state.mode = 'complete';
        return null;
      }

      // Recursively get command for next waypoint
      return this.getMotorCommand(currentPose, sensors);
    }

    // Calculate steering to reach waypoint
    return this.calculateSteeringCommand(currentPose, waypoint, sensors);
  }

  /**
   * Calculate motor commands to steer toward a waypoint
   */
  private calculateSteeringCommand(
    currentPose: { x: number; y: number; rotation: number },
    waypoint: Waypoint,
    sensors: SensorReadings
  ): { left: number; right: number; action: string } {
    // Handle turn action (turn in place)
    if (waypoint.action === 'turn' && waypoint.targetYaw !== undefined) {
      const yawError = this.normalizeAngle(waypoint.targetYaw - currentPose.rotation);

      if (Math.abs(yawError) < this.config.yawAlignmentThreshold) {
        // Turn complete, advance to next waypoint
        this.state.currentWaypointIndex++;
        return { left: 0, right: 0, action: 'turn_complete' };
      }

      // Turn in place
      const turnPower = Math.min(25, Math.abs(yawError) * 30);
      if (yawError > 0) {
        // Turn left (left motor faster)
        return { left: turnPower, right: -turnPower * 0.5, action: 'turning_left' };
      } else {
        // Turn right (right motor faster)
        return { left: -turnPower * 0.5, right: turnPower, action: 'turning_right' };
      }
    }

    // Calculate angle to waypoint
    const dx = waypoint.x - currentPose.x;
    const dy = waypoint.y - currentPose.y;
    const angleToWaypoint = Math.atan2(dx, -dy);
    const yawError = this.normalizeAngle(angleToWaypoint - currentPose.rotation);

    // Base speed from waypoint or default
    const baseSpeed = waypoint.speed ?? 40;

    // Calculate steering differential based on yaw error
    // Small error = small differential (smooth steering)
    const steerMagnitude = Math.min(20, Math.abs(yawError) * 25);

    let left: number;
    let right: number;

    if (Math.abs(yawError) > Math.PI / 2) {
      // Target is behind us - turn in place first
      if (yawError > 0) {
        left = steerMagnitude;
        right = -steerMagnitude * 0.5;
      } else {
        left = -steerMagnitude * 0.5;
        right = steerMagnitude;
      }
      return { left, right, action: 'pivot_to_target' };
    }

    // Normal forward movement with steering
    if (yawError > 0) {
      // Need to turn left - left motor faster
      left = baseSpeed;
      right = baseSpeed - steerMagnitude;
    } else {
      // Need to turn right - right motor faster
      left = baseSpeed - steerMagnitude;
      right = baseSpeed;
    }

    // Safety check - reduce speed if obstacles detected
    const minFrontDist = Math.min(sensors.distance.front, sensors.distance.frontLeft, sensors.distance.frontRight);
    if (minFrontDist < 30) {
      // Scale down speed proportionally
      const scale = Math.max(0.3, minFrontDist / 30);
      left *= scale;
      right *= scale;
    }

    return {
      left: Math.round(left),
      right: Math.round(right),
      action: 'following_trajectory',
    };
  }

  /**
   * Normalize angle to [-PI, PI]
   */
  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  /**
   * Force a replan (e.g., when stuck or obstacle detected)
   */
  forceReplan(): void {
    this.state.mode = 'replanning';
    this.state.currentTrajectory = null;
  }

  /**
   * Get trajectory status for debugging/display
   */
  getTrajectoryStatus(): {
    mode: string;
    progress: string;
    currentWaypoint: Waypoint | null;
    waypointsRemaining: number;
    trajectoryId: string | null;
    confidence: number;
  } {
    const trajectory = this.state.currentTrajectory;
    const waypointsRemaining = trajectory
      ? trajectory.waypoints.length - this.state.currentWaypointIndex
      : 0;

    const currentWaypoint =
      trajectory && this.state.currentWaypointIndex < trajectory.waypoints.length
        ? trajectory.waypoints[this.state.currentWaypointIndex]
        : null;

    const progress = trajectory
      ? `${this.state.currentWaypointIndex}/${trajectory.waypoints.length} waypoints`
      : 'No trajectory';

    return {
      mode: this.state.mode,
      progress,
      currentWaypoint,
      waypointsRemaining,
      trajectoryId: trajectory?.id ?? null,
      confidence: trajectory?.confidence ?? 0,
    };
  }

  /**
   * Generate context string for LLM prompt
   */
  generatePlanningContext(
    currentPose: { x: number; y: number; rotation: number },
    sensors: SensorReadings
  ): string {
    const worldModel = this.getWorldModel();
    const status = this.getTrajectoryStatus();
    const explorationProgress = worldModel.getExplorationProgress();

    let context = `\n## TRAJECTORY PLANNING STATUS\n`;
    context += `Mode: ${status.mode.toUpperCase()}\n`;
    context += `Progress: ${status.progress}\n`;
    context += `Arena explored: ${(explorationProgress * 100).toFixed(1)}%\n`;

    if (status.currentWaypoint) {
      const wp = status.currentWaypoint;
      const dist = Math.sqrt(
        Math.pow(wp.x - currentPose.x, 2) + Math.pow(wp.y - currentPose.y, 2)
      );
      context += `Current target: (${wp.x.toFixed(2)}, ${wp.y.toFixed(2)}) - ${dist.toFixed(2)}m away\n`;
      context += `Waypoint action: ${wp.action || 'move'}\n`;
    }

    if (this.state.currentTrajectory) {
      context += `Plan confidence: ${(status.confidence * 100).toFixed(0)}%\n`;
      context += `Goal: ${this.state.currentTrajectory.goalDescription}\n`;
    }

    return context;
  }

  /**
   * Reset the planner (e.g., when starting a new session)
   */
  reset(): void {
    this.state = {
      mode: 'planning',
      currentTrajectory: null,
      currentWaypointIndex: 0,
      lastPlanTime: 0,
      replanCount: 0,
      distanceTraveled: 0,
      executionStartTime: null,
      waypointsCompleted: 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const trajectoryPlanners = new Map<string, TrajectoryPlanner>();

/**
 * Get or create a trajectory planner for a specific device
 */
export function getTrajectoryPlanner(
  deviceId: string,
  config?: Partial<TrajectoryPlannerConfig>
): TrajectoryPlanner {
  if (!trajectoryPlanners.has(deviceId)) {
    trajectoryPlanners.set(deviceId, new TrajectoryPlanner(deviceId, config));
  }
  return trajectoryPlanners.get(deviceId)!;
}

/**
 * Clear trajectory planner for a device
 */
export function clearTrajectoryPlanner(deviceId: string): void {
  const planner = trajectoryPlanners.get(deviceId);
  if (planner) {
    planner.reset();
  }
  trajectoryPlanners.delete(deviceId);
}

/**
 * Clear all trajectory planners
 */
export function clearAllTrajectoryPlanners(): void {
  for (const planner of trajectoryPlanners.values()) {
    planner.reset();
  }
  trajectoryPlanners.clear();
}

export default TrajectoryPlanner;
