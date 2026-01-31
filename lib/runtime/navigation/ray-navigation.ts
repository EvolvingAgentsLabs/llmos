/**
 * Ray-Based Navigation System
 *
 * Implements intelligent path exploration using ray casting to:
 * 1. Find clean paths through obstacle fields
 * 2. Predict collisions before they happen
 * 3. Score multiple potential trajectories
 * 4. Choose optimal navigation decisions
 *
 * Key concepts:
 * - Ray Fan: Multiple rays cast in a fan pattern to evaluate path clearance
 * - Trajectory Prediction: Project current movement to detect future collisions
 * - Path Scoring: Evaluate paths based on clearance, distance, and direction preference
 * - Ultrasound Sensor: Simulated high-precision distance measurement
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES AND INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface Ray {
  angle: number;        // Angle in radians relative to robot heading
  distance: number;     // Measured distance in cm
  clear: boolean;       // Is this ray path clear (above threshold)?
  worldAngle: number;   // Absolute angle in world coordinates
}

export interface RayFan {
  rays: Ray[];
  bestPath: RayPath;
  alternativePaths: RayPath[];
  timestamp: number;
}

export interface RayPath {
  centerAngle: number;      // Central angle of the path
  clearance: number;        // Minimum distance along path
  width: number;            // Angular width of clear corridor (radians)
  score: number;            // Composite score (higher = better)
  direction: 'left' | 'center' | 'right';
}

export interface TrajectoryPrediction {
  collisionPredicted: boolean;
  timeToCollision: number;        // Seconds until collision (Infinity if none)
  collisionPoint: { x: number; y: number } | null;
  collisionAngle: number | null;  // Angle where collision would occur
  recommendedAction: 'continue' | 'slow_down' | 'turn_left' | 'turn_right' | 'stop';
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export interface UltrasoundReading {
  distance: number;       // Distance in cm (more precise than IR)
  confidence: number;     // 0-1 confidence level
  echoStrength: number;   // Signal strength (useful for surface detection)
  timestamp: number;
}

export interface PathExplorationResult {
  rayFan: RayFan;
  prediction: TrajectoryPrediction;
  ultrasound: UltrasoundReading;
  recommendedSteering: {
    leftMotor: number;
    rightMotor: number;
    reason: string;
  };
  explorationScore: number;  // How good is the current exploration state
}

export interface RayNavigationConfig {
  // Ray fan configuration
  rayCount: number;           // Number of rays to cast (default: 15)
  raySpreadAngle: number;     // Total fan spread in radians (default: PI = 180 degrees)
  maxRayDistance: number;     // Max ray distance in cm (default: 200)
  clearanceThreshold: number; // Minimum distance to consider "clear" in cm (default: 30)

  // Path scoring weights
  distanceWeight: number;     // Weight for path distance (default: 1.0)
  widthWeight: number;        // Weight for path width (default: 0.8)
  centerBiasWeight: number;   // Preference for forward paths (default: 0.3)
  explorationWeight: number;  // Weight for unexplored directions (default: 0.5)

  // Trajectory prediction
  predictionHorizon: number;  // Seconds to predict ahead (default: 2.0)
  safetyMargin: number;       // Extra distance buffer in cm (default: 10)

  // Ultrasound settings
  ultrasoundEnabled: boolean; // Enable ultrasound sensor (default: true)
  ultrasoundMaxRange: number; // Max ultrasound range in cm (default: 400)
  ultrasoundBeamWidth: number; // Beam width in radians (default: PI/12 = 15 degrees)

  // Speed control
  maxSpeed: number;           // Maximum motor power (default: 70)
  minSpeed: number;           // Minimum motor power when moving (default: 20)
  turnDifferential: number;   // Max differential between wheels (default: 40)
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_RAY_NAV_CONFIG: RayNavigationConfig = {
  // Ray fan - 15 rays spread over 180 degrees
  rayCount: 15,
  raySpreadAngle: Math.PI,  // 180 degrees
  maxRayDistance: 200,
  clearanceThreshold: 30,

  // Path scoring
  distanceWeight: 1.0,
  widthWeight: 0.8,
  centerBiasWeight: 0.3,
  explorationWeight: 0.5,

  // Trajectory prediction
  predictionHorizon: 2.0,
  safetyMargin: 10,

  // Ultrasound
  ultrasoundEnabled: true,
  ultrasoundMaxRange: 400,
  ultrasoundBeamWidth: Math.PI / 12,  // 15 degrees

  // Speed control - conservative for safety
  maxSpeed: 70,
  minSpeed: 20,
  turnDifferential: 40,
};

// ═══════════════════════════════════════════════════════════════════════════
// RAY NAVIGATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export class RayNavigationSystem {
  private config: RayNavigationConfig;
  private lastRayFan: RayFan | null = null;
  private exploredAngles: Set<number> = new Set();  // Track explored directions
  private positionHistory: Array<{ x: number; y: number; rotation: number; timestamp: number }> = [];

  constructor(config: Partial<RayNavigationConfig> = {}) {
    this.config = { ...DEFAULT_RAY_NAV_CONFIG, ...config };
  }

  /**
   * Main entry point: Analyze environment and compute navigation decision
   */
  computeNavigation(
    sensorDistances: {
      front: number;
      frontLeft: number;
      frontRight: number;
      left: number;
      right: number;
      back: number;
      backLeft: number;
      backRight: number;
    },
    robotPose: { x: number; y: number; rotation: number },
    velocity: { linear: number; angular: number }
  ): PathExplorationResult {
    // Cast rays and build fan
    const rayFan = this.castRayFan(sensorDistances, robotPose.rotation);

    // Predict trajectory
    const prediction = this.predictTrajectory(sensorDistances, velocity, robotPose);

    // Compute ultrasound reading (synthetic from front sensors)
    const ultrasound = this.computeUltrasound(sensorDistances, robotPose.rotation);

    // Update position history for exploration tracking
    this.updatePositionHistory(robotPose);

    // Compute recommended steering
    const recommendedSteering = this.computeSteering(rayFan, prediction, ultrasound);

    // Calculate exploration score
    const explorationScore = this.calculateExplorationScore(rayFan);

    return {
      rayFan,
      prediction,
      ultrasound,
      recommendedSteering,
      explorationScore,
    };
  }

  /**
   * Cast a fan of rays to evaluate path clearance in all directions
   */
  castRayFan(
    sensorDistances: {
      front: number;
      frontLeft: number;
      frontRight: number;
      left: number;
      right: number;
      back: number;
      backLeft: number;
      backRight: number;
    },
    robotRotation: number
  ): RayFan {
    const rays: Ray[] = [];
    const { rayCount, raySpreadAngle, clearanceThreshold } = this.config;

    // Map sensor directions to angles (relative to robot heading)
    const sensorAngles: Record<string, number> = {
      front: 0,
      frontLeft: -Math.PI / 4,
      frontRight: Math.PI / 4,
      left: -Math.PI / 2,
      right: Math.PI / 2,
      back: Math.PI,
      backLeft: -3 * Math.PI / 4,
      backRight: 3 * Math.PI / 4,
    };

    // Cast rays across the fan
    for (let i = 0; i < rayCount; i++) {
      const relativeAngle = -raySpreadAngle / 2 + (raySpreadAngle * i) / (rayCount - 1);
      const worldAngle = this.normalizeAngle(robotRotation + relativeAngle);

      // Interpolate distance from nearest sensors
      const distance = this.interpolateDistance(relativeAngle, sensorDistances, sensorAngles);

      rays.push({
        angle: relativeAngle,
        distance,
        clear: distance > clearanceThreshold,
        worldAngle,
      });
    }

    // Find clear paths (contiguous groups of clear rays)
    const paths = this.findClearPaths(rays);

    // Sort paths by score
    paths.sort((a, b) => b.score - a.score);

    const bestPath = paths[0] || this.createEmergencyPath(rays);
    const alternativePaths = paths.slice(1, 4);  // Keep top 3 alternatives

    this.lastRayFan = {
      rays,
      bestPath,
      alternativePaths,
      timestamp: Date.now(),
    };

    return this.lastRayFan;
  }

  /**
   * Interpolate distance reading for a given angle based on sensor data
   */
  private interpolateDistance(
    angle: number,
    distances: Record<string, number>,
    sensorAngles: Record<string, number>
  ): number {
    // Find the two nearest sensors to this angle
    const sensors = Object.entries(sensorAngles).map(([name, sensorAngle]) => ({
      name,
      angle: sensorAngle,
      distance: distances[name as keyof typeof distances] || this.config.maxRayDistance,
    }));

    // Sort by angular distance to target angle
    sensors.sort((a, b) => {
      const diffA = Math.abs(this.normalizeAngle(a.angle - angle));
      const diffB = Math.abs(this.normalizeAngle(b.angle - angle));
      return diffA - diffB;
    });

    const nearest = sensors[0];
    const secondNearest = sensors[1];

    // Linear interpolation between two nearest sensors
    const angleDiff = Math.abs(this.normalizeAngle(secondNearest.angle - nearest.angle));
    if (angleDiff < 0.01) return nearest.distance;

    const t = Math.abs(this.normalizeAngle(angle - nearest.angle)) / angleDiff;
    const interpolated = nearest.distance * (1 - t) + secondNearest.distance * t;

    return Math.min(interpolated, this.config.maxRayDistance);
  }

  /**
   * Find contiguous clear paths in the ray fan
   */
  private findClearPaths(rays: Ray[]): RayPath[] {
    const paths: RayPath[] = [];
    let pathStart = -1;

    for (let i = 0; i < rays.length; i++) {
      if (rays[i].clear) {
        if (pathStart === -1) pathStart = i;
      } else {
        if (pathStart !== -1) {
          paths.push(this.createPath(rays, pathStart, i - 1));
          pathStart = -1;
        }
      }
    }

    // Handle path that extends to the end
    if (pathStart !== -1) {
      paths.push(this.createPath(rays, pathStart, rays.length - 1));
    }

    return paths;
  }

  /**
   * Create a RayPath from a contiguous group of clear rays
   */
  private createPath(rays: Ray[], startIdx: number, endIdx: number): RayPath {
    const pathRays = rays.slice(startIdx, endIdx + 1);
    const centerIdx = Math.floor((startIdx + endIdx) / 2);
    const centerRay = rays[centerIdx];

    // Calculate minimum clearance along path
    const clearance = Math.min(...pathRays.map(r => r.distance));

    // Calculate angular width
    const width = Math.abs(rays[endIdx].angle - rays[startIdx].angle);

    // Determine direction
    let direction: 'left' | 'center' | 'right';
    if (centerRay.angle < -Math.PI / 8) {
      direction = 'left';
    } else if (centerRay.angle > Math.PI / 8) {
      direction = 'right';
    } else {
      direction = 'center';
    }

    // Calculate composite score
    const { distanceWeight, widthWeight, centerBiasWeight, explorationWeight } = this.config;

    // Distance score (normalized)
    const distanceScore = clearance / this.config.maxRayDistance;

    // Width score (wider paths are better)
    const widthScore = width / Math.PI;

    // Center bias (prefer forward paths)
    const centerBias = 1 - Math.abs(centerRay.angle) / Math.PI;

    // Exploration bonus (prefer unexplored directions)
    const explorationBonus = this.exploredAngles.has(Math.round(centerRay.worldAngle * 10)) ? 0 : 1;

    const score =
      distanceScore * distanceWeight +
      widthScore * widthWeight +
      centerBias * centerBiasWeight +
      explorationBonus * explorationWeight;

    return {
      centerAngle: centerRay.angle,
      clearance,
      width,
      score,
      direction,
    };
  }

  /**
   * Create emergency path when no clear path exists
   */
  private createEmergencyPath(rays: Ray[]): RayPath {
    // Find the ray with the maximum distance (least bad option)
    let maxDistance = 0;
    let bestRay = rays[Math.floor(rays.length / 2)];  // Default to center

    for (const ray of rays) {
      if (ray.distance > maxDistance) {
        maxDistance = ray.distance;
        bestRay = ray;
      }
    }

    let direction: 'left' | 'center' | 'right';
    if (bestRay.angle < -Math.PI / 8) {
      direction = 'left';
    } else if (bestRay.angle > Math.PI / 8) {
      direction = 'right';
    } else {
      direction = 'center';
    }

    return {
      centerAngle: bestRay.angle,
      clearance: maxDistance,
      width: 0.1,  // Very narrow - emergency only
      score: maxDistance / this.config.maxRayDistance * 0.5,  // Low score
      direction,
    };
  }

  /**
   * Predict trajectory and detect potential collisions
   */
  predictTrajectory(
    sensorDistances: {
      front: number;
      frontLeft: number;
      frontRight: number;
      left: number;
      right: number;
      back: number;
    },
    velocity: { linear: number; angular: number },
    robotPose: { x: number; y: number; rotation: number }
  ): TrajectoryPrediction {
    const { predictionHorizon, safetyMargin } = this.config;

    // If not moving, no collision predicted
    if (Math.abs(velocity.linear) < 0.01 && Math.abs(velocity.angular) < 0.01) {
      return {
        collisionPredicted: false,
        timeToCollision: Infinity,
        collisionPoint: null,
        collisionAngle: null,
        recommendedAction: 'continue',
        urgency: 'low',
      };
    }

    // Convert velocity from m/s to cm/s for consistent units
    const linearCmPerSec = velocity.linear * 100;

    // Project position forward
    const dt = 0.1;  // 100ms steps
    let t = 0;
    let x = robotPose.x * 100;  // Convert to cm
    let y = robotPose.y * 100;
    let theta = robotPose.rotation;

    while (t < predictionHorizon) {
      // Update position using differential drive model
      // Match physics convention: sin for X, cos for Y (rotation=0 means +Y direction)
      x += linearCmPerSec * Math.sin(theta) * dt;
      y += linearCmPerSec * Math.cos(theta) * dt;
      theta += velocity.angular * dt;
      t += dt;

      // Check if predicted position collides with any obstacle
      // Use ray distances to estimate collision
      const forwardDist = this.estimateDistanceAtAngle(theta - robotPose.rotation, sensorDistances);
      const traveledDist = Math.sqrt(
        Math.pow(x - robotPose.x * 100, 2) +
        Math.pow(y - robotPose.y * 100, 2)
      );

      if (traveledDist + safetyMargin >= forwardDist) {
        // Collision predicted!
        const urgency = this.calculateUrgency(t, velocity.linear);
        const recommendedAction = this.recommendAvoidanceAction(sensorDistances, velocity);

        return {
          collisionPredicted: true,
          timeToCollision: t,
          collisionPoint: { x: x / 100, y: y / 100 },  // Convert back to meters
          collisionAngle: theta,
          recommendedAction,
          urgency,
        };
      }
    }

    // No collision predicted in horizon
    return {
      collisionPredicted: false,
      timeToCollision: Infinity,
      collisionPoint: null,
      collisionAngle: null,
      recommendedAction: 'continue',
      urgency: 'low',
    };
  }

  /**
   * Estimate distance in a given direction using sensor interpolation
   */
  private estimateDistanceAtAngle(
    angle: number,
    distances: { front: number; frontLeft: number; frontRight: number; left: number; right: number; back: number }
  ): number {
    const normalizedAngle = this.normalizeAngle(angle);

    // Map angle to nearest sensor
    if (Math.abs(normalizedAngle) < Math.PI / 8) {
      return distances.front;
    } else if (normalizedAngle < -3 * Math.PI / 8) {
      return distances.left;
    } else if (normalizedAngle < -Math.PI / 8) {
      return distances.frontLeft;
    } else if (normalizedAngle > 3 * Math.PI / 8) {
      return distances.right;
    } else if (normalizedAngle > Math.PI / 8) {
      return distances.frontRight;
    }

    return distances.front;
  }

  /**
   * Calculate urgency level based on time to collision
   */
  private calculateUrgency(timeToCollision: number, linearVelocity: number): 'low' | 'medium' | 'high' | 'critical' {
    // Faster velocity = higher urgency at same time
    const speedFactor = Math.abs(linearVelocity) / 0.5;  // Normalize to typical speed

    if (timeToCollision < 0.5 * speedFactor) return 'critical';
    if (timeToCollision < 1.0 * speedFactor) return 'high';
    if (timeToCollision < 1.5 * speedFactor) return 'medium';
    return 'low';
  }

  /**
   * Recommend avoidance action based on sensor readings
   */
  private recommendAvoidanceAction(
    distances: { front: number; frontLeft: number; frontRight: number; left: number; right: number },
    velocity: { linear: number; angular: number }
  ): TrajectoryPrediction['recommendedAction'] {
    // If front is blocked, determine turn direction
    if (distances.front < 40) {
      // Compare left vs right clearance
      const leftClearance = (distances.left + distances.frontLeft) / 2;
      const rightClearance = (distances.right + distances.frontRight) / 2;

      if (leftClearance > rightClearance + 20) {
        return 'turn_left';
      } else if (rightClearance > leftClearance + 20) {
        return 'turn_right';
      } else {
        // Similar clearance - turn away from current angular direction
        return velocity.angular > 0 ? 'turn_left' : 'turn_right';
      }
    }

    // If just approaching, slow down
    if (distances.front < 80) {
      return 'slow_down';
    }

    return 'continue';
  }

  /**
   * Compute synthetic ultrasound reading from front sensors
   * Ultrasound has wider beam but more accurate distance measurement
   */
  computeUltrasound(
    sensorDistances: { front: number; frontLeft: number; frontRight: number },
    robotRotation: number
  ): UltrasoundReading {
    if (!this.config.ultrasoundEnabled) {
      return {
        distance: sensorDistances.front,
        confidence: 0,
        echoStrength: 0,
        timestamp: Date.now(),
      };
    }

    // Ultrasound uses a cone - take minimum of front sensors in beam
    const beamDistances = [
      sensorDistances.front,
      sensorDistances.frontLeft,
      sensorDistances.frontRight,
    ];

    // Weighted average favoring center
    const weights = [0.6, 0.2, 0.2];
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < beamDistances.length; i++) {
      weightedSum += beamDistances[i] * weights[i];
      totalWeight += weights[i];
    }

    const distance = weightedSum / totalWeight;

    // Minimum for obstacle detection
    const minInBeam = Math.min(...beamDistances);

    // Confidence decreases with distance and variance
    const variance = beamDistances.reduce((sum, d) => sum + Math.pow(d - distance, 2), 0) / beamDistances.length;
    const distanceConfidence = 1 - (distance / this.config.ultrasoundMaxRange);
    const varianceConfidence = 1 - Math.min(variance / 1000, 1);
    const confidence = (distanceConfidence + varianceConfidence) / 2;

    // Echo strength - stronger when closer and surface is perpendicular
    const echoStrength = Math.max(0, 1 - (minInBeam / 100));

    return {
      distance: Math.min(minInBeam, this.config.ultrasoundMaxRange),
      confidence: Math.max(0, Math.min(1, confidence)),
      echoStrength,
      timestamp: Date.now(),
    };
  }

  /**
   * Compute recommended steering based on ray fan and predictions
   */
  computeSteering(
    rayFan: RayFan,
    prediction: TrajectoryPrediction,
    ultrasound: UltrasoundReading
  ): { leftMotor: number; rightMotor: number; reason: string } {
    const { maxSpeed, minSpeed, turnDifferential } = this.config;
    const bestPath = rayFan.bestPath;

    // Emergency handling for critical situations
    if (prediction.urgency === 'critical') {
      return this.computeEmergencySteering(prediction, ultrasound);
    }

    // Calculate base speed based on clearance
    const clearanceRatio = Math.min(bestPath.clearance / 100, 1);  // Normalize to 100cm
    const baseSpeed = minSpeed + (maxSpeed - minSpeed) * clearanceRatio;

    // Calculate turn intensity based on path angle
    const turnIntensity = Math.abs(bestPath.centerAngle) / (Math.PI / 2);
    const turnAmount = turnDifferential * turnIntensity;

    let leftMotor: number;
    let rightMotor: number;
    let reason: string;

    if (bestPath.direction === 'center' && Math.abs(bestPath.centerAngle) < Math.PI / 12) {
      // Going straight
      leftMotor = baseSpeed;
      rightMotor = baseSpeed;
      reason = `Clear path ahead (${bestPath.clearance.toFixed(0)}cm clearance)`;
    } else if (bestPath.direction === 'left' || bestPath.centerAngle < 0) {
      // Turn left - left motor faster to decrease rotation (turn left)
      leftMotor = baseSpeed + turnAmount * 0.5;
      rightMotor = baseSpeed - turnAmount;
      reason = `Turning left toward ${bestPath.clearance.toFixed(0)}cm clearance`;
    } else {
      // Turn right - right motor faster to increase rotation (turn right)
      leftMotor = baseSpeed - turnAmount;
      rightMotor = baseSpeed + turnAmount * 0.5;
      reason = `Turning right toward ${bestPath.clearance.toFixed(0)}cm clearance`;
    }

    // Apply prediction adjustments
    if (prediction.urgency === 'high') {
      leftMotor *= 0.7;
      rightMotor *= 0.7;
      reason = `Slowing: ${reason}`;
    } else if (prediction.urgency === 'medium') {
      leftMotor *= 0.85;
      rightMotor *= 0.85;
    }

    // Clamp values
    leftMotor = Math.round(Math.max(-maxSpeed, Math.min(maxSpeed, leftMotor)));
    rightMotor = Math.round(Math.max(-maxSpeed, Math.min(maxSpeed, rightMotor)));

    return { leftMotor, rightMotor, reason };
  }

  /**
   * Compute emergency steering for critical situations
   */
  private computeEmergencySteering(
    prediction: TrajectoryPrediction,
    ultrasound: UltrasoundReading
  ): { leftMotor: number; rightMotor: number; reason: string } {
    const { maxSpeed } = this.config;

    switch (prediction.recommendedAction) {
      case 'turn_left':
        return {
          leftMotor: Math.round(maxSpeed * 0.5),
          rightMotor: Math.round(-maxSpeed * 0.3),
          reason: 'EMERGENCY: Sharp left turn to avoid collision',
        };
      case 'turn_right':
        return {
          leftMotor: Math.round(-maxSpeed * 0.3),
          rightMotor: Math.round(maxSpeed * 0.5),
          reason: 'EMERGENCY: Sharp right turn to avoid collision',
        };
      case 'stop':
        return {
          leftMotor: 0,
          rightMotor: 0,
          reason: 'EMERGENCY: Full stop - collision imminent',
        };
      default:
        // Reverse
        return {
          leftMotor: Math.round(-maxSpeed * 0.4),
          rightMotor: Math.round(-maxSpeed * 0.4),
          reason: 'EMERGENCY: Reversing to avoid collision',
        };
    }
  }

  /**
   * Update position history for exploration tracking
   */
  private updatePositionHistory(pose: { x: number; y: number; rotation: number }): void {
    const now = Date.now();

    // Add current position
    this.positionHistory.push({
      ...pose,
      timestamp: now,
    });

    // Track explored angles (in 10-degree buckets)
    const angleBucket = Math.round(pose.rotation * 10);
    this.exploredAngles.add(angleBucket);

    // Keep only last 100 positions
    while (this.positionHistory.length > 100) {
      this.positionHistory.shift();
    }

    // Clear old explored angles (forget after 60 seconds)
    // This encourages re-exploration of areas
    if (this.positionHistory.length > 50) {
      const oldPose = this.positionHistory[0];
      if (now - oldPose.timestamp > 60000) {
        const oldBucket = Math.round(oldPose.rotation * 10);
        this.exploredAngles.delete(oldBucket);
      }
    }
  }

  /**
   * Calculate exploration score (how well the robot is exploring)
   */
  private calculateExplorationScore(rayFan: RayFan): number {
    // Score based on:
    // 1. Number of clear paths available
    // 2. Average clearance of all rays
    // 3. Diversity of explored angles

    const clearRays = rayFan.rays.filter(r => r.clear).length;
    const clearRatio = clearRays / rayFan.rays.length;

    const avgClearance = rayFan.rays.reduce((sum, r) => sum + r.distance, 0) / rayFan.rays.length;
    const clearanceScore = avgClearance / this.config.maxRayDistance;

    const explorationDiversity = this.exploredAngles.size / 36;  // 360 degrees / 10 degree buckets

    return (clearRatio * 0.3 + clearanceScore * 0.4 + explorationDiversity * 0.3);
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
   * Get last computed ray fan (for visualization)
   */
  getLastRayFan(): RayFan | null {
    return this.lastRayFan;
  }

  /**
   * Reset exploration history
   */
  resetExploration(): void {
    this.exploredAngles.clear();
    this.positionHistory = [];
    this.lastRayFan = null;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RayNavigationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): RayNavigationConfig {
    return { ...this.config };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let defaultRayNavSystem: RayNavigationSystem | null = null;

export function getRayNavigationSystem(config?: Partial<RayNavigationConfig>): RayNavigationSystem {
  if (!defaultRayNavSystem) {
    defaultRayNavSystem = new RayNavigationSystem(config);
  } else if (config) {
    defaultRayNavSystem.updateConfig(config);
  }
  return defaultRayNavSystem;
}

export function createRayNavigationSystem(config?: Partial<RayNavigationConfig>): RayNavigationSystem {
  return new RayNavigationSystem(config);
}
