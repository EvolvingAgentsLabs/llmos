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

    return `**Navigation Zone:** ${decision.zoneEmoji} ${decision.zone.toUpperCase()} - ${decision.suggestedAction}
**Best Path:** ${decision.bestPath} (L=${context.leftDistance.toFixed(0)}cm, F=${context.frontDistance.toFixed(0)}cm, R=${context.rightDistance.toFixed(0)}cm)`;
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
export function createExplorerFormatter(): CompositeSensorFormatter {
  return new CompositeSensorFormatter([
    new LineSensorFormatter(),
    new DistanceSensorFormatter({ includeAllSensors: true }),
    new NavigationZoneFormatter(),
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
export function createWallFollowerFormatter(): CompositeSensorFormatter {
  return new CompositeSensorFormatter([
    new DistanceSensorFormatter({ includeAllSensors: true }),
    new NavigationZoneFormatter(),
    new PositionFormatter(),
    new BumperFormatter(),
  ]);
}

/**
 * Create formatter for Collector/GemHunter behavior
 */
export function createCollectorFormatter(): CompositeSensorFormatter {
  return new CompositeSensorFormatter([
    new DistanceSensorFormatter({ includeAllSensors: true }),
    new NavigationZoneFormatter(),
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
  NavigationContext,
  NavigationDecision,
  LinePositionDetector,
  LineFollowingContext,
} from '../navigation';
