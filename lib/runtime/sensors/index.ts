/**
 * Sensor Formatter Module
 *
 * Provides modular, composable sensor formatters for generating
 * LLM-friendly context from sensor data.
 */

import {
  NavigationCalculator,
  NavigationContext,
  NavigationDecision,
  LinePositionDetector,
  LineFollowingContext,
  defaultNavigationCalculator,
  defaultLinePositionDetector,
} from '../navigation';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES AND INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface SensorReadings {
  distance: {
    front: number;
    frontLeft: number;
    frontRight: number;
    left: number;
    right: number;
    backLeft: number;
    backRight: number;
    back: number;
  };
  line: number[];
  bumper: { front: boolean; back: boolean };
  battery: { voltage: number; percentage: number };
  imu?: { accelX: number; accelY: number; accelZ: number; gyroZ: number };
  pose: { x: number; y: number; rotation: number };
  nearbyCollectibles?: Collectible[];
}

export interface Collectible {
  id: string;
  type: string;
  distance: number;
  angle: number;
  points: number;
}

export interface FormatContext {
  iteration: number;
  goal?: string;
  behaviorType?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SENSOR FORMATTER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface SensorFormatter {
  /**
   * Format sensor data into a string for LLM context
   */
  format(sensors: SensorReadings, context?: FormatContext): string;

  /**
   * Get the section title for this formatter
   */
  getSectionTitle(): string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LINE SENSOR FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

export class LineSensorFormatter implements SensorFormatter {
  private detector: LinePositionDetector;

  constructor(detector: LinePositionDetector = defaultLinePositionDetector) {
    this.detector = detector;
  }

  getSectionTitle(): string {
    return 'Line Sensors';
  }

  format(sensors: SensorReadings): string {
    const lineContext = this.detector.getLineContext(sensors.line);
    const visual = this.detector.getVisualRepresentation(lineContext.onLine);

    return `**Line Sensors:** [${visual}] ${lineContext.statusEmoji} ${lineContext.statusText}
Raw: [${lineContext.rawValues.map(v => v.toFixed(0)).join(', ')}]`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DISTANCE SENSOR FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

export interface DistanceFormatterOptions {
  includeAllSensors: boolean;  // Include frontLeft, frontRight, back sensors
  includeDiagonals: boolean;   // Include backLeft, backRight
}

export class DistanceSensorFormatter implements SensorFormatter {
  private options: DistanceFormatterOptions;

  constructor(options: Partial<DistanceFormatterOptions> = {}) {
    this.options = {
      includeAllSensors: true,
      includeDiagonals: false,
      ...options,
    };
  }

  getSectionTitle(): string {
    return 'Distance';
  }

  format(sensors: SensorReadings): string {
    const d = sensors.distance;

    if (this.options.includeAllSensors) {
      let summary = `Front=${d.front.toFixed(0)}cm, FrontL=${d.frontLeft.toFixed(0)}cm, FrontR=${d.frontRight.toFixed(0)}cm, L=${d.left.toFixed(0)}cm, R=${d.right.toFixed(0)}cm`;

      if (this.options.includeDiagonals) {
        summary += `, BackL=${d.backLeft.toFixed(0)}cm, BackR=${d.backRight.toFixed(0)}cm, Back=${d.back.toFixed(0)}cm`;
      }

      return `**Distance:** ${summary}`;
    }

    return `**Distance:** Front=${d.front.toFixed(0)}cm, L=${d.left.toFixed(0)}cm, R=${d.right.toFixed(0)}cm`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION ZONE FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

export class NavigationZoneFormatter implements SensorFormatter {
  private calculator: NavigationCalculator;

  constructor(calculator: NavigationCalculator = defaultNavigationCalculator) {
    this.calculator = calculator;
  }

  getSectionTitle(): string {
    return 'Navigation Zone';
  }

  format(sensors: SensorReadings): string {
    const context = this.extractNavigationContext(sensors);
    const decision = this.calculator.getNavigationDecision(context);
    const steering = decision.steeringRecommendation;

    // Build a clear action recommendation with motor values
    let steeringAdvice = '';
    if (steering) {
      const motorAdvice = `drive(left=${steering.leftMotor}, right=${steering.rightMotor})`;
      steeringAdvice = `\n**Recommended Action:** ${steering.type.replace('_', ' ')} ${steering.direction !== 'none' ? steering.direction : ''} → ${motorAdvice}`;
    }

    // Add clear speed guidance
    const speedAdvice = `\n**Speed Range:** ${decision.recommendedSpeed.min}-${decision.recommendedSpeed.max} (use lower values when turning)`;

    return `**Navigation Zone:** ${decision.zoneEmoji} ${decision.zone.toUpperCase()} - ${decision.suggestedAction}
**Clearance:** L=${context.leftDistance.toFixed(0)}cm, FRONT=${context.frontDistance.toFixed(0)}cm, R=${context.rightDistance.toFixed(0)}cm
**Best Path:** ${decision.bestPath}${speedAdvice}${steeringAdvice}`;
  }

  /**
   * Get the full navigation decision (useful for programmatic access)
   */
  getNavigationDecision(sensors: SensorReadings): NavigationDecision {
    const context = this.extractNavigationContext(sensors);
    return this.calculator.getNavigationDecision(context);
  }

  private extractNavigationContext(sensors: SensorReadings): NavigationContext {
    return {
      frontDistance: sensors.distance.front,
      frontLeftDistance: sensors.distance.frontLeft,
      frontRightDistance: sensors.distance.frontRight,
      leftDistance: sensors.distance.left,
      rightDistance: sensors.distance.right,
      backDistance: sensors.distance.back,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POSITION FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

export class PositionFormatter implements SensorFormatter {
  getSectionTitle(): string {
    return 'Position';
  }

  format(sensors: SensorReadings): string {
    const pose = sensors.pose;
    const headingDegrees = (pose.rotation * 180) / Math.PI;
    return `**Position:** (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}) heading ${headingDegrees.toFixed(1)}°`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COLLECTIBLES FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

export class CollectiblesFormatter implements SensorFormatter {
  getSectionTitle(): string {
    return 'Nearby Collectibles';
  }

  format(sensors: SensorReadings, context?: FormatContext): string {
    const collectibles = sensors.nearbyCollectibles;

    if (collectibles && collectibles.length > 0) {
      const items = collectibles.map(c =>
        `- ${c.type} (${c.id}): ${c.distance}cm away, ${c.angle}° ${c.angle > 0 ? 'right' : c.angle < 0 ? 'left' : 'ahead'}, worth ${c.points} points`
      ).join('\n');
      return `\n**Nearby Collectibles (within 2m):**\n${items}`;
    }

    // Only show "none detected" message if the goal involves collecting
    if (context?.goal?.toLowerCase().includes('collect')) {
      return '\n**Nearby Collectibles:** None detected within range. Explore to find more!';
    }

    return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WALL PROXIMITY WARNING FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

export interface WallProximityOptions {
  arenaBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  warningDistance?: number;  // cm, default 50
  criticalDistance?: number; // cm, default 30
}

export class WallProximityFormatter implements SensorFormatter {
  private options: Required<WallProximityOptions>;

  constructor(options: WallProximityOptions = {}) {
    this.options = {
      arenaBounds: options.arenaBounds ?? { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
      warningDistance: options.warningDistance ?? 50,
      criticalDistance: options.criticalDistance ?? 30,
    };
  }

  getSectionTitle(): string {
    return 'Wall Proximity';
  }

  format(sensors: SensorReadings): string {
    const pose = sensors.pose;
    const bounds = this.options.arenaBounds;
    const warnings: string[] = [];

    // Calculate distances to each wall boundary (in cm)
    const distToMinX = Math.abs(pose.x - bounds.minX) * 100;
    const distToMaxX = Math.abs(pose.x - bounds.maxX) * 100;
    const distToMinY = Math.abs(pose.y - bounds.minY) * 100;
    const distToMaxY = Math.abs(pose.y - bounds.maxY) * 100;

    // Check proximity to each wall
    const checkWall = (dist: number, wallName: string) => {
      if (dist <= this.options.criticalDistance) {
        warnings.push(`🔴 CRITICAL: ${wallName} wall only ${dist.toFixed(0)}cm away - TURN AWAY IMMEDIATELY!`);
      } else if (dist <= this.options.warningDistance) {
        warnings.push(`🟠 WARNING: ${wallName} wall ${dist.toFixed(0)}cm away`);
      }
    };

    // Robot heading in degrees (0 = North/+Y, 90 = East/+X, etc.)
    const headingDeg = (pose.rotation * 180 / Math.PI + 360) % 360;

    // Determine which wall robot is facing
    const facingDirection = this.getHeadingDirection(headingDeg);

    // Check all walls
    checkWall(distToMinX, 'LEFT (West)');
    checkWall(distToMaxX, 'RIGHT (East)');
    checkWall(distToMinY, 'BOTTOM (South)');
    checkWall(distToMaxY, 'TOP (North)');

    if (warnings.length > 0) {
      // Add directional awareness
      let output = `\n**⚠️ ARENA BOUNDARY WARNINGS:**\n${warnings.join('\n')}`;
      output += `\n**Facing:** ${facingDirection}`;

      // Provide escape suggestion
      if (warnings.some(w => w.includes('CRITICAL'))) {
        output += `\n**SUGGESTION:** Turn away from the nearest wall before moving forward!`;
      }

      return output;
    }

    return '';
  }

  private getHeadingDirection(headingDeg: number): string {
    if (headingDeg >= 337.5 || headingDeg < 22.5) return 'North (+Y direction)';
    if (headingDeg >= 22.5 && headingDeg < 67.5) return 'Northeast';
    if (headingDeg >= 67.5 && headingDeg < 112.5) return 'East (+X direction)';
    if (headingDeg >= 112.5 && headingDeg < 157.5) return 'Southeast';
    if (headingDeg >= 157.5 && headingDeg < 202.5) return 'South (-Y direction)';
    if (headingDeg >= 202.5 && headingDeg < 247.5) return 'Southwest';
    if (headingDeg >= 247.5 && headingDeg < 292.5) return 'West (-X direction)';
    return 'Northwest';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BUMPER FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

export class BumperFormatter implements SensorFormatter {
  getSectionTitle(): string {
    return 'Bumpers';
  }

  format(sensors: SensorReadings): string {
    const { front, back } = sensors.bumper;

    if (front || back) {
      const triggered = [];
      if (front) triggered.push('FRONT');
      if (back) triggered.push('BACK');
      return `**⚠️ COLLISION:** ${triggered.join(' and ')} bumper triggered!`;
    }

    return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BATTERY FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

export class BatteryFormatter implements SensorFormatter {
  private warningThreshold: number;

  constructor(warningThreshold: number = 20) {
    this.warningThreshold = warningThreshold;
  }

  getSectionTitle(): string {
    return 'Battery';
  }

  format(sensors: SensorReadings): string {
    const { voltage, percentage } = sensors.battery;

    if (percentage <= this.warningThreshold) {
      return `**⚠️ LOW BATTERY:** ${percentage.toFixed(0)}% (${voltage.toFixed(1)}V)`;
    }

    return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

export class CompositeSensorFormatter implements SensorFormatter {
  private formatters: SensorFormatter[];

  constructor(formatters: SensorFormatter[]) {
    this.formatters = formatters;
  }

  getSectionTitle(): string {
    return 'Sensor Readings';
  }

  format(sensors: SensorReadings, context?: FormatContext): string {
    const sections = this.formatters
      .map(f => f.format(sensors, context))
      .filter(s => s.length > 0);

    const header = `## Sensor Readings${context?.iteration ? ` (Iteration ${context.iteration})` : ''}`;

    return `${header}\n\n${sections.join('\n')}`;
  }

  /**
   * Add a formatter to the composite
   */
  addFormatter(formatter: SensorFormatter): void {
    this.formatters.push(formatter);
  }

  /**
   * Remove a formatter by type
   */
  removeFormatter(formatterType: new (...args: any[]) => SensorFormatter): void {
    this.formatters = this.formatters.filter(f => !(f instanceof formatterType));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESET FORMATTERS FOR COMMON BEHAVIORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create formatter for Explorer behavior
 */
export function createExplorerFormatter(arenaBounds?: { minX: number; maxX: number; minY: number; maxY: number }): CompositeSensorFormatter {
  return new CompositeSensorFormatter([
    new LineSensorFormatter(),
    new DistanceSensorFormatter({ includeAllSensors: true }),
    new NavigationZoneFormatter(),
    new WallProximityFormatter({ arenaBounds }),
    new PositionFormatter(),
    new BumperFormatter(),
    new BatteryFormatter(),
  ]);
}

/**
 * Create formatter for Line Follower behavior
 */
export function createLineFollowerFormatter(): CompositeSensorFormatter {
  return new CompositeSensorFormatter([
    new LineSensorFormatter(),
    new DistanceSensorFormatter({ includeAllSensors: false }),
    new PositionFormatter(),
    new BumperFormatter(),
  ]);
}

/**
 * Create formatter for Wall Follower behavior
 */
export function createWallFollowerFormatter(arenaBounds?: { minX: number; maxX: number; minY: number; maxY: number }): CompositeSensorFormatter {
  return new CompositeSensorFormatter([
    new DistanceSensorFormatter({ includeAllSensors: true }),
    new NavigationZoneFormatter(),
    new WallProximityFormatter({ arenaBounds }),
    new PositionFormatter(),
    new BumperFormatter(),
  ]);
}

/**
 * Create formatter for Collector/GemHunter behavior
 */
export function createCollectorFormatter(arenaBounds?: { minX: number; maxX: number; minY: number; maxY: number }): CompositeSensorFormatter {
  return new CompositeSensorFormatter([
    new DistanceSensorFormatter({ includeAllSensors: true }),
    new NavigationZoneFormatter(),
    new WallProximityFormatter({ arenaBounds }),
    new CollectiblesFormatter(),
    new PositionFormatter(),
    new BumperFormatter(),
    new BatteryFormatter(),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTRUCTION SUFFIX GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export type BehaviorType = 'explorer' | 'lineFollower' | 'wallFollower' | 'collector' | 'patroller' | 'gemHunter';

/**
 * Generate appropriate action instruction suffix based on behavior type
 */
export function getActionInstruction(behaviorType?: BehaviorType): string {
  switch (behaviorType) {
    case 'lineFollower':
      return 'Decide your action based on the line status above.';
    case 'explorer':
      return `**ACTION REQUIRED:**
1. Check the Navigation Zone (🟢 OPEN, 🟡 AWARE, 🟠 CAUTION, 🔴 CRITICAL)
2. Compare distances: L vs FRONT vs R - turn toward the LARGEST value
3. Use the Recommended Action motor values as a starting point
4. Output your drive() command with appropriate speed for the zone`;
    case 'wallFollower':
      return 'Decide your action based on the navigation zone and best path above.';
    case 'collector':
    case 'gemHunter':
      return 'Decide your action based on nearby collectibles and navigation above.';
    default:
      return 'Decide your action based on the sensor readings above.';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  NavigationCalculator,
  LinePositionDetector,
} from '../navigation';

export type {
  NavigationContext,
  NavigationDecision,
  LineFollowingContext,
} from '../navigation';
