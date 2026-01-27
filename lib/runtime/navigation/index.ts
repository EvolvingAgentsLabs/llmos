/**
 * Navigation Module
 *
 * Provides reusable navigation logic for robot agents including:
 * - Navigation zone calculation
 * - Path recommendation
 * - Speed control based on distance
 * - Trajectory planning utilities
 * - Ray-based path exploration
 * - Predictive collision avoidance
 * - Ultrasound sensor support
 */

// Re-export ray navigation system
export * from './ray-navigation';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES AND INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export enum NavigationZone {
  OPEN = 'open',           // >100cm - Full speed exploration
  AWARE = 'aware',         // 50-100cm - Moderate speed, start planning
  CAUTION = 'caution',     // 30-50cm - Slow down, commit to turn
  CRITICAL = 'critical',   // <30cm - Execute turn or stop
}

export interface NavigationContext {
  frontDistance: number;
  frontLeftDistance: number;
  frontRightDistance: number;
  leftDistance: number;
  rightDistance: number;
  backDistance?: number;
}

export interface NavigationDecision {
  zone: NavigationZone;
  zoneEmoji: string;
  suggestedAction: string;
  bestPath: 'LEFT' | 'FORWARD' | 'RIGHT';
  recommendedSpeed: SpeedRange;
  steeringRecommendation?: SteeringRecommendation;
}

export interface SpeedRange {
  min: number;
  max: number;
}

export interface SteeringRecommendation {
  type: 'straight' | 'gentle_curve' | 'moderate_turn' | 'sharp_turn' | 'pivot';
  direction: 'left' | 'right' | 'none';
  leftMotor: number;
  rightMotor: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface NavigationConfig {
  // Distance thresholds in cm
  openThreshold: number;      // Default: 100cm
  awareThreshold: number;     // Default: 50cm
  cautionThreshold: number;   // Default: 30cm

  // Speed ranges
  openSpeed: SpeedRange;      // Default: {min: 150, max: 200}
  awareSpeed: SpeedRange;     // Default: {min: 100, max: 150}
  cautionSpeed: SpeedRange;   // Default: {min: 60, max: 100}
  criticalSpeed: SpeedRange;  // Default: {min: 0, max: 60}

  // Clearance difference threshold for path preference
  clearanceAdvantage: number; // Default: 30cm (prefer path with 30cm+ more clearance)
}

export const DEFAULT_NAVIGATION_CONFIG: NavigationConfig = {
  // Increased thresholds to give more reaction time
  openThreshold: 120,      // Was 100cm - now 120cm for earlier awareness
  awareThreshold: 70,      // Was 50cm - now 70cm to start planning earlier
  cautionThreshold: 40,    // Was 30cm - now 40cm to commit to turns earlier

  // REDUCED SPEEDS for controlled, deliberate movement
  // Slow and steady = better results, fewer collisions
  openSpeed: { min: 50, max: 70 },       // Was 150-200, now much slower
  awareSpeed: { min: 35, max: 50 },      // Was 100-150, now cautious
  cautionSpeed: { min: 20, max: 35 },    // Was 60-100, now very slow
  criticalSpeed: { min: 0, max: 20 },    // Was 0-60, now minimal

  clearanceAdvantage: 30,
};

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════

export class NavigationCalculator {
  private config: NavigationConfig;
  private rayNavSystem: import('./ray-navigation').RayNavigationSystem | null = null;

  constructor(config: Partial<NavigationConfig> = {}) {
    this.config = { ...DEFAULT_NAVIGATION_CONFIG, ...config };
  }

  /**
   * Get or create ray navigation system for advanced path exploration
   */
  getRayNavigationSystem(): import('./ray-navigation').RayNavigationSystem {
    if (!this.rayNavSystem) {
      const { createRayNavigationSystem } = require('./ray-navigation');
      this.rayNavSystem = createRayNavigationSystem({
        maxSpeed: this.config.openSpeed.max,
        minSpeed: this.config.criticalSpeed.max,
        clearanceThreshold: this.config.cautionThreshold,
      });
    }
    return this.rayNavSystem!;
  }

  /**
   * Advanced navigation using ray-based path exploration
   * This is the preferred method for intelligent navigation
   */
  getAdvancedNavigation(
    context: NavigationContext & { backLeft?: number; backRight?: number },
    robotPose: { x: number; y: number; rotation: number },
    velocity: { linear: number; angular: number } = { linear: 0, angular: 0 }
  ): NavigationDecision & {
    rayAnalysis: import('./ray-navigation').PathExplorationResult;
  } {
    const rayNav = this.getRayNavigationSystem();

    // Build sensor distances object
    const sensorDistances = {
      front: context.frontDistance,
      frontLeft: context.frontLeftDistance,
      frontRight: context.frontRightDistance,
      left: context.leftDistance,
      right: context.rightDistance,
      back: context.backDistance ?? 200,
      backLeft: context.backLeft ?? 200,
      backRight: context.backRight ?? 200,
    };

    // Compute ray-based navigation
    const rayAnalysis = rayNav.computeNavigation(sensorDistances, robotPose, velocity);

    // Get basic zone info
    const zone = this.calculateZone(context.frontDistance);
    const zoneEmoji = this.getZoneEmoji(zone);

    // Use ray analysis for steering recommendation
    const { leftMotor, rightMotor, reason } = rayAnalysis.recommendedSteering;

    // Determine best path from ray analysis
    const direction = rayAnalysis.rayFan.bestPath.direction;
    const bestPath: 'LEFT' | 'FORWARD' | 'RIGHT' =
      direction === 'center' ? 'FORWARD' :
      direction === 'left' ? 'LEFT' : 'RIGHT';

    return {
      zone,
      zoneEmoji,
      suggestedAction: reason,
      bestPath,
      recommendedSpeed: this.getSpeedRange(zone),
      steeringRecommendation: {
        type: this.getSteeringType(rayAnalysis),
        direction: rayAnalysis.rayFan.bestPath.direction === 'center' ? 'none' : rayAnalysis.rayFan.bestPath.direction,
        leftMotor,
        rightMotor,
      },
      rayAnalysis,
    };
  }

  /**
   * Determine steering type from ray analysis
   */
  private getSteeringType(
    rayAnalysis: import('./ray-navigation').PathExplorationResult
  ): SteeringRecommendation['type'] {
    const { prediction, rayFan } = rayAnalysis;

    if (prediction.urgency === 'critical') {
      return 'pivot';
    }
    if (prediction.urgency === 'high') {
      return 'sharp_turn';
    }

    const angleAbs = Math.abs(rayFan.bestPath.centerAngle);
    if (angleAbs < Math.PI / 12) {
      return 'straight';
    }
    if (angleAbs < Math.PI / 6) {
      return 'gentle_curve';
    }
    if (angleAbs < Math.PI / 3) {
      return 'moderate_turn';
    }
    return 'sharp_turn';
  }

  /**
   * Calculate the current navigation zone based on front distance
   */
  calculateZone(frontDistance: number): NavigationZone {
    if (frontDistance > this.config.openThreshold) {
      return NavigationZone.OPEN;
    } else if (frontDistance > this.config.awareThreshold) {
      return NavigationZone.AWARE;
    } else if (frontDistance > this.config.cautionThreshold) {
      return NavigationZone.CAUTION;
    } else {
      return NavigationZone.CRITICAL;
    }
  }

  /**
   * Get emoji indicator for navigation zone
   */
  getZoneEmoji(zone: NavigationZone): string {
    const emojis: Record<NavigationZone, string> = {
      [NavigationZone.OPEN]: '🟢',
      [NavigationZone.AWARE]: '🟡',
      [NavigationZone.CAUTION]: '🟠',
      [NavigationZone.CRITICAL]: '🔴',
    };
    return emojis[zone];
  }

  /**
   * Get recommended speed range for a zone
   */
  getSpeedRange(zone: NavigationZone): SpeedRange {
    const speeds: Record<NavigationZone, SpeedRange> = {
      [NavigationZone.OPEN]: this.config.openSpeed,
      [NavigationZone.AWARE]: this.config.awareSpeed,
      [NavigationZone.CAUTION]: this.config.cautionSpeed,
      [NavigationZone.CRITICAL]: this.config.criticalSpeed,
    };
    return speeds[zone];
  }

  /**
   * Determine the best path based on clearance
   */
  determineBestPath(context: NavigationContext): 'LEFT' | 'FORWARD' | 'RIGHT' {
    const { frontDistance, leftDistance, rightDistance } = context;

    // Find the direction with most clearance
    if (leftDistance > rightDistance && leftDistance > frontDistance) {
      return 'LEFT';
    } else if (rightDistance > leftDistance && rightDistance > frontDistance) {
      return 'RIGHT';
    } else {
      return 'FORWARD';
    }
  }

  /**
   * Generate a suggested action based on context and zone
   */
  suggestAction(context: NavigationContext, zone: NavigationZone): string {
    const { frontDistance, leftDistance, rightDistance } = context;
    const advantage = this.config.clearanceAdvantage;

    switch (zone) {
      case NavigationZone.OPEN:
        return 'Full speed ahead';

      case NavigationZone.AWARE:
        if (leftDistance > frontDistance + advantage) {
          return 'Consider curving left (more clearance)';
        } else if (rightDistance > frontDistance + advantage) {
          return 'Consider curving right (more clearance)';
        }
        return 'Moderate speed, monitor surroundings';

      case NavigationZone.CAUTION:
        return leftDistance > rightDistance
          ? 'Turn left recommended'
          : 'Turn right recommended';

      case NavigationZone.CRITICAL:
        return leftDistance > rightDistance
          ? 'Execute left turn NOW'
          : 'Execute right turn NOW';
    }
  }

  /**
   * Calculate steering recommendation based on context
   */
  calculateSteering(context: NavigationContext, zone: NavigationZone): SteeringRecommendation {
    const { frontDistance, leftDistance, rightDistance } = context;
    const speed = this.getSpeedRange(zone);
    const baseSpeed = Math.round((speed.min + speed.max) / 2);

    // Determine turn direction
    const turnLeft = leftDistance > rightDistance;
    const direction = turnLeft ? 'left' : 'right';

    // Calculate turn intensity based on zone and clearance difference
    const clearanceDiff = Math.abs(leftDistance - rightDistance);

    switch (zone) {
      case NavigationZone.OPEN:
        return {
          type: 'straight',
          direction: 'none',
          leftMotor: baseSpeed,
          rightMotor: baseSpeed,
        };

      case NavigationZone.AWARE:
        if (clearanceDiff > this.config.clearanceAdvantage) {
          // Gentle curve toward open side - SMALL differential for smooth turns
          return {
            type: 'gentle_curve',
            direction,
            leftMotor: turnLeft ? baseSpeed - 10 : baseSpeed + 5,
            rightMotor: turnLeft ? baseSpeed + 5 : baseSpeed - 10,
          };
        }
        return {
          type: 'straight',
          direction: 'none',
          leftMotor: baseSpeed,
          rightMotor: baseSpeed,
        };

      case NavigationZone.CAUTION:
        // Moderate turn - still gentle, controlled differential
        return {
          type: 'moderate_turn',
          direction,
          leftMotor: turnLeft ? baseSpeed - 15 : baseSpeed + 10,
          rightMotor: turnLeft ? baseSpeed + 10 : baseSpeed - 15,
        };

      case NavigationZone.CRITICAL:
        // Sharp turn or pivot - but still controlled, no wild swings
        if (frontDistance < 15) {
          // Pivot in place - SLOW rotation, not aggressive
          return {
            type: 'pivot',
            direction,
            leftMotor: turnLeft ? -20 : 25,
            rightMotor: turnLeft ? 25 : -20,
          };
        }
        return {
          type: 'sharp_turn',
          direction,
          leftMotor: turnLeft ? 10 : baseSpeed,
          rightMotor: turnLeft ? baseSpeed : 10,
        };
    }
  }

  /**
   * Get complete navigation decision
   */
  getNavigationDecision(context: NavigationContext): NavigationDecision {
    const zone = this.calculateZone(context.frontDistance);

    return {
      zone,
      zoneEmoji: this.getZoneEmoji(zone),
      suggestedAction: this.suggestAction(context, zone),
      bestPath: this.determineBestPath(context),
      recommendedSpeed: this.getSpeedRange(zone),
      steeringRecommendation: this.calculateSteering(context, zone),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LINE POSITION DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

export interface LineFollowingContext {
  position: 'left' | 'center' | 'right' | 'lost';
  onLine: boolean[];
  rawValues: number[];
  statusEmoji: string;
  statusText: string;
}

export class LinePositionDetector {
  private threshold: number;

  constructor(threshold: number = 127) {
    this.threshold = threshold;
  }

  /**
   * Detect line position from sensor array
   * Sensors: [far-left(0), left(1), center(2), right(3), far-right(4)]
   */
  detectPosition(lineSensors: number[]): 'left' | 'center' | 'right' | undefined {
    const onLine = lineSensors.map(v => v > this.threshold);
    const [fl, l, c, r, fr] = onLine;

    if (c) return 'center';
    if ((l || fl) && !r && !fr) return 'left';
    if ((r || fr) && !l && !fl) return 'right';
    return undefined;
  }

  /**
   * Get complete line following context
   */
  getLineContext(lineSensors: number[]): LineFollowingContext {
    const onLine = lineSensors.map(v => v > this.threshold);
    const position = this.detectPosition(lineSensors) || 'lost';

    let statusEmoji: string;
    let statusText: string;

    if (!onLine.some(v => v)) {
      statusEmoji = '⚠️';
      statusText = 'LINE LOST - search needed!';
    } else if (onLine[2]) {
      if (onLine[0] || onLine[1]) {
        statusEmoji = '↖️';
        statusText = 'Line drifting LEFT - turn left';
      } else if (onLine[3] || onLine[4]) {
        statusEmoji = '↗️';
        statusText = 'Line drifting RIGHT - turn right';
      } else {
        statusEmoji = '✓';
        statusText = 'CENTERED - drive straight';
      }
    } else if (onLine[0] || onLine[1]) {
      statusEmoji = '⬅️';
      statusText = 'Line is LEFT - turn left sharply';
    } else if (onLine[3] || onLine[4]) {
      statusEmoji = '➡️';
      statusText = 'Line is RIGHT - turn right sharply';
    } else {
      statusEmoji = '❓';
      statusText = 'Ambiguous position';
    }

    return {
      position,
      onLine,
      rawValues: lineSensors,
      statusEmoji,
      statusText,
    };
  }

  /**
   * Get visual representation of line sensors
   */
  getVisualRepresentation(onLine: boolean[]): string {
    return onLine.map(v => v ? '●' : '○').join(' ');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STEERING PRESETS
// ═══════════════════════════════════════════════════════════════════════════

export const STEERING_PRESETS = {
  // Straight movement - slow and steady
  straight: (speed: number) => ({ left: speed, right: speed }),

  // Gentle curves (for AWARE zone) - SMALL differentials for smooth turns
  gentleCurveLeft: (speed: number) => ({ left: speed - 10, right: speed + 5 }),
  gentleCurveRight: (speed: number) => ({ left: speed + 5, right: speed - 10 }),

  // Moderate turns (for CAUTION zone) - controlled, not aggressive
  moderateTurnLeft: (speed: number) => ({ left: speed - 20, right: speed + 10 }),
  moderateTurnRight: (speed: number) => ({ left: speed + 10, right: speed - 20 }),

  // Sharp turns (for CRITICAL zone) - still controlled, avoid wild swings
  sharpTurnLeft: () => ({ left: 10, right: 40 }),
  sharpTurnRight: () => ({ left: 40, right: 10 }),

  // Pivot in place - SLOW rotation for precision
  pivotLeft: () => ({ left: -25, right: 25 }),
  pivotRight: () => ({ left: 25, right: -25 }),

  // Reverse - slow and controlled
  reverse: (speed: number) => ({ left: -Math.min(speed, 30), right: -Math.min(speed, 30) }),
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clamp motor power to valid range
 */
export function clampMotorPower(power: number): number {
  return Math.max(-255, Math.min(255, Math.round(power)));
}

/**
 * Format distance for display
 */
export function formatDistance(distance: number): string {
  return `${distance.toFixed(0)}cm`;
}

/**
 * Create a singleton instance for convenience
 */
export const defaultNavigationCalculator = new NavigationCalculator();
export const defaultLinePositionDetector = new LinePositionDetector();
