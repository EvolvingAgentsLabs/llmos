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
  RayNavigationSystem,
  PathExplorationResult,
  RayFan,
  TrajectoryPrediction,
  UltrasoundReading,
  createRayNavigationSystem,
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
  velocity?: { linear: number; angular: number }; // For trajectory prediction
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

    // Check for imminent collision conditions
    const isCollisionImminent = context.frontDistance < 25;
    // Improved corner detection: check front AND diagonals, with back as escape route
    const backDist = context.backDistance ?? 200;  // Default to open if no back sensor
    const isCornerTrap = context.frontDistance < 40 &&
                         context.leftDistance < 40 &&
                         context.rightDistance < 40 &&
                         context.frontLeftDistance < 50 &&
                         context.frontRightDistance < 50;
    const canReverseOut = backDist > 60;  // Check if backing up is an option
    const hasBumperContact = sensors.bumper.front || sensors.bumper.back;

    // Determine the most open direction for smart escape
    const directions = [
      { name: 'left', distance: context.leftDistance, pivot: 'drive(left=-25, right=25)' },
      { name: 'right', distance: context.rightDistance, pivot: 'drive(left=25, right=-25)' },
      { name: 'back-left', distance: (context.leftDistance + backDist) / 2, pivot: 'drive(left=-20, right=30)' },
      { name: 'back-right', distance: (context.rightDistance + backDist) / 2, pivot: 'drive(left=30, right=-20)' },
    ];
    const bestEscape = directions.reduce((a, b) => a.distance > b.distance ? a : b);

    // Build imperative action guidance based on urgency level
    let steeringAdvice = '';
    if (steering) {
      const motorAdvice = `drive(left=${steering.leftMotor}, right=${steering.rightMotor})`;

      // More forceful language for dangerous situations
      if (isCollisionImminent || hasBumperContact) {
        steeringAdvice = `\n**⚠️ MANDATORY ACTION - COLLISION IMMINENT:** ${motorAdvice}
YOU MUST execute this command NOW. Do not reason further - ACT IMMEDIATELY.`;
      } else if (decision.zone === 'critical') {
        steeringAdvice = `\n**🔴 REQUIRED ACTION:** ${steering.type.replace('_', ' ')} ${steering.direction !== 'none' ? steering.direction : ''} → ${motorAdvice}
Execute this turn immediately to avoid collision.`;
      } else if (decision.zone === 'caution') {
        steeringAdvice = `\n**🟠 RECOMMENDED ACTION:** ${steering.type.replace('_', ' ')} ${steering.direction !== 'none' ? steering.direction : ''} → ${motorAdvice}
Begin turning now - obstacle is close.`;
      } else {
        steeringAdvice = `\n**Suggested Action:** ${steering.type.replace('_', ' ')} ${steering.direction !== 'none' ? steering.direction : ''} → ${motorAdvice}`;
      }
    }

    // Add corner trap warning with CONTROLLED rotation values (not aggressive!)
    let cornerWarning = '';
    if (isCornerTrap) {
      if (canReverseOut) {
        // Prefer backing out over spinning in place
        cornerWarning = `\n**⚠️ MANDATORY ACTION - CORNER TRAP:** Front blocked! REVERSE first, then turn.
Step 1: drive(left=-30, right=-30) to back up
Step 2: ${bestEscape.pivot} to turn toward ${bestEscape.name} (most open: ${bestEscape.distance.toFixed(0)}cm)`;
      } else {
        // Must pivot in place - use CONTROLLED values matching behavior philosophy
        cornerWarning = `\n**⚠️ MANDATORY ACTION - CORNER TRAP:** All directions tight! GENTLE pivot toward ${bestEscape.name}.
Use: ${bestEscape.pivot} (controlled rotation - DO NOT use aggressive values!)`;
      }
    }

    // Add clear speed guidance
    const speedAdvice = `\n**Speed Range:** ${decision.recommendedSpeed.min}-${decision.recommendedSpeed.max} (use lower values when turning)`;

    // Build zone indicator with urgency
    let zoneIndicator = `**Navigation Zone:** ${decision.zoneEmoji} ${decision.zone.toUpperCase()} - ${decision.suggestedAction}`;
    if (hasBumperContact) {
      zoneIndicator = `**⚠️ BUMPER CONTACT DETECTED!** ${sensors.bumper.front ? 'FRONT' : 'BACK'} collision!\n` + zoneIndicator;
    }

    return `${zoneIndicator}
**Clearance:** L=${context.leftDistance.toFixed(0)}cm, FRONT=${context.frontDistance.toFixed(0)}cm, R=${context.rightDistance.toFixed(0)}cm
**Best Path:** ${decision.bestPath}${speedAdvice}${cornerWarning}${steeringAdvice}`;
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
// VELOCITY FORMATTER - For trajectory prediction
// ═══════════════════════════════════════════════════════════════════════════

export class VelocityFormatter implements SensorFormatter {
  getSectionTitle(): string {
    return 'Velocity';
  }

  format(sensors: SensorReadings): string {
    const velocity = sensors.velocity;
    if (!velocity) {
      return '**Velocity:** Not available';
    }

    // Convert to more readable units
    const linearCmPerSec = (velocity.linear * 100).toFixed(1);
    const angularDegPerSec = ((velocity.angular * 180) / Math.PI).toFixed(1);

    // Provide trajectory prediction context
    const direction = velocity.linear >= 0 ? 'forward' : 'backward';
    const turning = velocity.angular > 0.1 ? 'turning right' :
                    velocity.angular < -0.1 ? 'turning left' : 'straight';

    // Predict position in 200ms (one loop interval)
    const predictionMs = 200;
    const predictedDistanceCm = (Math.abs(velocity.linear) * (predictionMs / 1000) * 100).toFixed(1);
    const predictedRotationDeg = ((velocity.angular * (predictionMs / 1000) * 180) / Math.PI).toFixed(1);

    return [
      `**Velocity:** ${linearCmPerSec} cm/s ${direction}, ${angularDegPerSec}°/s ${turning}`,
      `**Trajectory (next 200ms):** Will move ${predictedDistanceCm}cm and rotate ${predictedRotationDeg}°`,
    ].join('\n');
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
// RAY NAVIGATION FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

export class RayNavigationFormatter implements SensorFormatter {
  private rayNavSystem: RayNavigationSystem;
  private lastPose: { x: number; y: number; rotation: number } = { x: 0, y: 0, rotation: 0 };
  private lastVelocity: { linear: number; angular: number } = { linear: 0, angular: 0 };

  constructor(config?: Partial<import('../navigation/ray-navigation').RayNavigationConfig>) {
    this.rayNavSystem = createRayNavigationSystem(config);
  }

  getSectionTitle(): string {
    return 'Ray Navigation Analysis';
  }

  /**
   * Update pose and velocity for trajectory prediction
   */
  updatePoseAndVelocity(
    pose: { x: number; y: number; rotation: number },
    velocity: { linear: number; angular: number }
  ): void {
    this.lastPose = pose;
    this.lastVelocity = velocity;
  }

  format(sensors: SensorReadings, context?: FormatContext): string {
    // Update pose from sensor data
    if (sensors.pose) {
      this.lastPose = sensors.pose;
    }

    // Update velocity from sensor data for accurate trajectory prediction
    if (sensors.velocity) {
      this.lastVelocity = sensors.velocity;
    }

    // Build sensor distances
    const sensorDistances = {
      front: sensors.distance.front,
      frontLeft: sensors.distance.frontLeft,
      frontRight: sensors.distance.frontRight,
      left: sensors.distance.left,
      right: sensors.distance.right,
      back: sensors.distance.back,
      backLeft: sensors.distance.backLeft,
      backRight: sensors.distance.backRight,
    };

    // Compute ray navigation
    const result = this.rayNavSystem.computeNavigation(
      sensorDistances,
      this.lastPose,
      this.lastVelocity
    );

    return this.formatResult(result);
  }

  /**
   * Format the ray navigation result for LLM context
   */
  private formatResult(result: PathExplorationResult): string {
    const { rayFan, prediction, ultrasound, recommendedSteering, explorationScore } = result;

    let output = '\n## RAY-BASED PATH ANALYSIS\n';

    // Ray fan visualization (simplified ASCII)
    output += this.formatRayFanVisualization(rayFan);

    // Best path info
    const bestPath = rayFan.bestPath;
    output += `\n**Best Path:** ${bestPath.direction.toUpperCase()}`;
    output += ` | Clearance: ${bestPath.clearance.toFixed(0)}cm`;
    output += ` | Width: ${(bestPath.width * 180 / Math.PI).toFixed(0)}°`;
    output += ` | Score: ${(bestPath.score * 100).toFixed(0)}%\n`;

    // Alternative paths
    if (rayFan.alternativePaths.length > 0) {
      output += '**Alternatives:** ';
      output += rayFan.alternativePaths.map(p =>
        `${p.direction}(${p.clearance.toFixed(0)}cm)`
      ).join(', ');
      output += '\n';
    }

    // Trajectory prediction
    output += this.formatPrediction(prediction);

    // Ultrasound reading
    output += this.formatUltrasound(ultrasound);

    // Recommended action
    output += `\n**🎯 RECOMMENDED ACTION:** ${recommendedSteering.reason}`;
    output += `\n→ drive(left=${recommendedSteering.leftMotor}, right=${recommendedSteering.rightMotor})`;

    // Exploration score
    output += `\n\n**Exploration Score:** ${(explorationScore * 100).toFixed(0)}%`;

    return output;
  }

  /**
   * Create ASCII visualization of ray fan
   */
  private formatRayFanVisualization(rayFan: RayFan): string {
    const rays = rayFan.rays;
    const maxDist = 200;

    // Create a simple bar visualization
    let viz = '\n**Ray Fan (180°):**\n```\n';

    // Group rays into 5 sectors for compact display
    const sectors = ['LEFT', 'FL', 'FRONT', 'FR', 'RIGHT'];
    const sectorSize = Math.ceil(rays.length / 5);

    for (let s = 0; s < 5; s++) {
      const sectorRays = rays.slice(s * sectorSize, (s + 1) * sectorSize);
      const avgDist = sectorRays.reduce((sum, r) => sum + r.distance, 0) / sectorRays.length;
      const clearCount = sectorRays.filter(r => r.clear).length;
      const allClear = clearCount === sectorRays.length;

      // Bar length proportional to distance (max 10 chars)
      const barLen = Math.round((avgDist / maxDist) * 10);
      const bar = (allClear ? '█' : '▓').repeat(barLen) + '░'.repeat(10 - barLen);
      const marker = allClear ? '✓' : '✗';

      viz += `${sectors[s].padEnd(6)} ${bar} ${avgDist.toFixed(0).padStart(3)}cm ${marker}\n`;
    }

    viz += '```\n';
    return viz;
  }

  /**
   * Format trajectory prediction
   */
  private formatPrediction(prediction: TrajectoryPrediction): string {
    if (!prediction.collisionPredicted) {
      return '\n**Trajectory:** ✓ Clear path ahead\n';
    }

    const urgencyEmojis: Record<string, string> = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴',
    };

    let output = `\n**⚠️ COLLISION PREDICTED:** ${urgencyEmojis[prediction.urgency]} ${prediction.urgency.toUpperCase()}\n`;
    output += `- Time to collision: ${prediction.timeToCollision.toFixed(1)}s\n`;
    output += `- Recommended: ${prediction.recommendedAction.replace('_', ' ')}\n`;

    return output;
  }

  /**
   * Format ultrasound reading
   */
  private formatUltrasound(ultrasound: UltrasoundReading): string {
    const confidenceBar = '█'.repeat(Math.round(ultrasound.confidence * 5)) +
                          '░'.repeat(5 - Math.round(ultrasound.confidence * 5));

    return `\n**Ultrasound:** ${ultrasound.distance.toFixed(0)}cm [${confidenceBar}] ` +
           `(confidence: ${(ultrasound.confidence * 100).toFixed(0)}%)\n`;
  }

  /**
   * Get the raw ray navigation result (for programmatic access)
   */
  getNavigationResult(sensors: SensorReadings): PathExplorationResult {
    if (sensors.pose) {
      this.lastPose = sensors.pose;
    }

    const sensorDistances = {
      front: sensors.distance.front,
      frontLeft: sensors.distance.frontLeft,
      frontRight: sensors.distance.frontRight,
      left: sensors.distance.left,
      right: sensors.distance.right,
      back: sensors.distance.back,
      backLeft: sensors.distance.backLeft,
      backRight: sensors.distance.backRight,
    };

    return this.rayNavSystem.computeNavigation(
      sensorDistances,
      this.lastPose,
      this.lastVelocity
    );
  }

  /**
   * Get the underlying ray navigation system
   */
  getRayNavigationSystem(): RayNavigationSystem {
    return this.rayNavSystem;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ULTRASOUND SENSOR FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

export class UltrasoundFormatter implements SensorFormatter {
  private maxRange: number;

  constructor(maxRange: number = 400) {
    this.maxRange = maxRange;
  }

  getSectionTitle(): string {
    return 'Ultrasound Sensor';
  }

  format(sensors: SensorReadings): string {
    // Compute synthetic ultrasound from front sensors
    const frontSensors = [
      sensors.distance.front,
      sensors.distance.frontLeft,
      sensors.distance.frontRight,
    ];

    // Weighted average (center-biased for ultrasound cone)
    const weights = [0.6, 0.2, 0.2];
    let weightedDist = 0;
    for (let i = 0; i < frontSensors.length; i++) {
      weightedDist += frontSensors[i] * weights[i];
    }

    const minDist = Math.min(...frontSensors);
    const variance = frontSensors.reduce((sum, d) => sum + Math.pow(d - weightedDist, 2), 0) / 3;
    const confidence = Math.max(0, 1 - (weightedDist / this.maxRange) - (variance / 2000));

    // Only show if there's something interesting
    if (minDist > 150) {
      return ''; // Skip if far from obstacles
    }

    const signalStrength = Math.max(0, 1 - (minDist / 100));
    const signalBar = '▓'.repeat(Math.round(signalStrength * 5)) +
                      '░'.repeat(5 - Math.round(signalStrength * 5));

    return `**🔊 Ultrasound:** ${minDist.toFixed(0)}cm [${signalBar}] ` +
           `(echo: ${(signalStrength * 100).toFixed(0)}%)`;
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
    new VelocityFormatter(), // Added for trajectory prediction
    new BumperFormatter(),
    new BatteryFormatter(),
  ]);
}

/**
 * Create advanced formatter for Explorer with ray-based navigation
 * This provides much better path exploration and collision avoidance
 */
export function createRayExplorerFormatter(): CompositeSensorFormatter {
  return new CompositeSensorFormatter([
    new DistanceSensorFormatter({ includeAllSensors: true, includeDiagonals: true }),
    new RayNavigationFormatter(),
    new UltrasoundFormatter(),
    new PositionFormatter(),
    new VelocityFormatter(), // Added for trajectory prediction
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
    new VelocityFormatter(), // Added for trajectory prediction
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
    new VelocityFormatter(), // Added for trajectory prediction
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
    new VelocityFormatter(), // Added for trajectory prediction
    new BumperFormatter(),
    new BatteryFormatter(),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTRUCTION SUFFIX GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export type BehaviorType = 'explorer' | 'lineFollower' | 'wallFollower' | 'collector' | 'patroller' | 'gemHunter' | 'rayExplorer';

/**
 * Generate appropriate action instruction suffix based on behavior type
 */
export function getActionInstruction(behaviorType?: BehaviorType): string {
  switch (behaviorType) {
    case 'lineFollower':
      return 'Decide your action based on the line status above.';
    case 'rayExplorer':
      return `**🎯 RAY-BASED NAVIGATION PROTOCOL:**
1. LOOK at the RAY FAN visualization - it shows clear paths (✓) vs blocked (✗)
2. CHECK the "Best Path" recommendation - this is computed from 15 rays analyzing your surroundings
3. READ the TRAJECTORY PREDICTION:
   - If "Clear path ahead": Follow the recommended action
   - If "COLLISION PREDICTED": Execute the avoidance action IMMEDIATELY
4. FOLLOW the "🎯 RECOMMENDED ACTION" - this drive() command is pre-computed for optimal navigation
5. The ULTRASOUND sensor provides precise forward distance - trust its readings

**CRITICAL:** The ray system has already analyzed all paths. Trust its recommendation!
Output the suggested drive() command unless you have a specific reason to deviate.`;
    case 'explorer':
      return `**⚡ IMMEDIATE ACTION REQUIRED:**
1. Check for ⚠️ MANDATORY ACTION or 🔴 REQUIRED ACTION warnings above
2. If present: Execute EXACTLY that command. Do not modify it. Do not reason further.
3. If no warnings: Check the Navigation Zone:
   - 🔴 CRITICAL/🟠 CAUTION: You MUST turn away from the obstacle NOW
   - 🟡 AWARE/🟢 OPEN: Explore toward unexplored areas
4. ALWAYS turn toward the direction with LARGEST clearance value
5. Output your drive() command - remember: collision = failure!`;
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
  RayNavigationSystem,
  createRayNavigationSystem,
  getRayNavigationSystem,
} from '../navigation';

export type {
  NavigationContext,
  NavigationDecision,
  LineFollowingContext,
  RayFan,
  Ray,
  RayPath,
  TrajectoryPrediction,
  UltrasoundReading,
  PathExplorationResult,
  RayNavigationConfig,
} from '../navigation';
