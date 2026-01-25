/**
 * Behavior Template System
 *
 * Provides a composable system for defining robot behaviors.
 * Behaviors are built from reusable components like navigation strategies,
 * LED protocols, and sensor interpretations.
 */

import { NavigationConfig, DEFAULT_NAVIGATION_CONFIG, SpeedRange } from '../navigation';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES AND INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface LEDColor {
  r: number;
  g: number;
  b: number;
  name: string;
}

export interface LEDProtocol {
  [state: string]: LEDColor;
}

export interface DistanceZoneConfig {
  zoneName: string;
  threshold: string;
  speedRange: string;
  action: string;
}

export interface SteeringPreset {
  name: string;
  description: string;
  leftMotor: number | string;
  rightMotor: number | string;
}

export interface BehaviorExample {
  situation: string;
  reasoning: string;
  toolCalls: string;
}

export interface BehaviorTemplate {
  id: string;
  name: string;
  description: string;

  // Core behavior definition
  goal: string;
  philosophy?: string;

  // Navigation settings
  navigationConfig?: Partial<NavigationConfig>;
  distanceZones?: DistanceZoneConfig[];
  steeringPresets?: SteeringPreset[];

  // Sensor interpretation
  sensorGuidelines?: string[];

  // Decision rules
  decisionRules?: string[];

  // LED indicators
  ledProtocol?: LEDProtocol;

  // Examples
  examples?: BehaviorExample[];

  // Response format customization
  responseInstructions?: string[];

  // Map recommendation
  recommendedMap: string;

  // Tags for categorization
  tags: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Common LED color presets
 */
export const LED_COLORS = {
  cyan: { r: 0, g: 255, b: 255, name: 'Cyan' },
  green: { r: 0, g: 255, b: 0, name: 'Green' },
  yellow: { r: 255, g: 200, b: 0, name: 'Yellow' },
  orange: { r: 255, g: 100, b: 0, name: 'Orange' },
  red: { r: 255, g: 0, b: 0, name: 'Red' },
  blue: { r: 0, g: 0, b: 255, name: 'Blue' },
  purple: { r: 128, g: 0, b: 255, name: 'Purple' },
  white: { r: 255, g: 255, b: 255, name: 'White' },
  gold: { r: 255, g: 215, b: 0, name: 'Gold' },
} as const;

/**
 * Standard LED protocols for common behaviors
 */
export const LED_PROTOCOLS = {
  exploration: {
    cruising: { ...LED_COLORS.cyan, name: 'Cyan (cruising)' },
    exploring: { ...LED_COLORS.green, name: 'Green (exploring)' },
    planning: { ...LED_COLORS.yellow, name: 'Yellow (planning turn)' },
    avoiding: { ...LED_COLORS.orange, name: 'Orange (avoiding)' },
    stopped: { ...LED_COLORS.red, name: 'Red (stopped)' },
  },
  lineFollowing: {
    onLine: { ...LED_COLORS.green, name: 'Green (on line)' },
    correcting: { ...LED_COLORS.yellow, name: 'Yellow (correcting)' },
    lost: { ...LED_COLORS.red, name: 'Red (line lost)' },
  },
  wallFollowing: {
    following: { ...LED_COLORS.blue, name: 'Blue (following)' },
    adjusting: { ...LED_COLORS.yellow, name: 'Yellow (adjusting)' },
    blocked: { ...LED_COLORS.red, name: 'Red (blocked)' },
  },
  collecting: {
    searching: { ...LED_COLORS.gold, name: 'Gold (searching)' },
    collecting: { ...LED_COLORS.green, name: 'Green (collecting)' },
    exploring: { ...LED_COLORS.blue, name: 'Blue (exploring)' },
    obstacle: { ...LED_COLORS.red, name: 'Red (obstacle)' },
  },
} as const;

/**
 * Standard distance zones
 */
export const DISTANCE_ZONES: DistanceZoneConfig[] = [
  { zoneName: 'OPEN', threshold: '> 100cm', speedRange: '150-200', action: 'Full speed exploration' },
  { zoneName: 'AWARE', threshold: '50-100cm', speedRange: '100-150', action: 'Moderate speed, start planning turn' },
  { zoneName: 'CAUTION', threshold: '30-50cm', speedRange: '60-100', action: 'Slow down, commit to turn direction' },
  { zoneName: 'CRITICAL', threshold: '< 30cm', speedRange: '0-60', action: 'Execute turn or stop' },
];

/**
 * Standard steering presets
 */
export const STEERING_PRESETS: SteeringPreset[] = [
  { name: 'Gentle curve left', description: 'Slight left curve', leftMotor: 100, rightMotor: 140 },
  { name: 'Moderate turn left', description: 'Medium left turn', leftMotor: 60, rightMotor: 120 },
  { name: 'Sharp turn left', description: 'Sharp left turn', leftMotor: -50, rightMotor: 100 },
  { name: 'Gentle curve right', description: 'Slight right curve', leftMotor: 140, rightMotor: 100 },
  { name: 'Moderate turn right', description: 'Medium right turn', leftMotor: 120, rightMotor: 60 },
  { name: 'Sharp turn right', description: 'Sharp right turn', leftMotor: 100, rightMotor: -50 },
];

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export class BehaviorPromptBuilder {
  /**
   * Generate a complete system prompt from a behavior template
   */
  static build(template: BehaviorTemplate): string {
    const sections: string[] = [];

    // Header
    sections.push(this.buildHeader(template));

    // Philosophy section (if provided)
    if (template.philosophy) {
      sections.push(`## Navigation Philosophy\n${template.philosophy}`);
    }

    // Perception system
    sections.push(this.buildPerceptionSection());

    // Distance zones (if provided)
    if (template.distanceZones && template.distanceZones.length > 0) {
      sections.push(this.buildDistanceZonesSection(template.distanceZones));
    }

    // Decision rules (if provided)
    if (template.decisionRules && template.decisionRules.length > 0) {
      sections.push(this.buildDecisionRulesSection(template.decisionRules));
    }

    // Steering presets (if provided)
    if (template.steeringPresets && template.steeringPresets.length > 0) {
      sections.push(this.buildSteeringSection(template.steeringPresets));
    }

    // Sensor guidelines (if provided)
    if (template.sensorGuidelines && template.sensorGuidelines.length > 0) {
      sections.push(this.buildSensorGuidelinesSection(template.sensorGuidelines));
    }

    // LED protocol (if provided)
    if (template.ledProtocol) {
      sections.push(this.buildLEDSection(template.ledProtocol));
    }

    // Response format
    sections.push(this.buildResponseFormatSection(template.responseInstructions));

    // Examples (if provided)
    if (template.examples && template.examples.length > 0) {
      sections.push(this.buildExamplesSection(template.examples));
    }

    return sections.join('\n\n');
  }

  private static buildHeader(template: BehaviorTemplate): string {
    return `You are an intelligent autonomous ${template.name.toLowerCase()} robot with advanced navigation capabilities. Your goal is to ${template.goal.toLowerCase()}.`;
  }

  private static buildPerceptionSection(): string {
    return `## Perception System
You have access to:
- **Distance Sensors**: Front, Left, Right (plus frontLeft, frontRight, back sensors)
- **Camera**: Use \`use_camera\` to get visual analysis of your surroundings
- **Position/Heading**: Your current pose in the arena`;
  }

  private static buildDistanceZonesSection(zones: DistanceZoneConfig[]): string {
    const header = `## Intelligent Path Planning

### Distance Zones & Speed Control
| Zone | Front Distance | Speed | Action |
|------|----------------|-------|--------|`;

    const rows = zones.map(z =>
      `| **${z.zoneName}** | ${z.threshold} | ${z.speedRange} | ${z.action} |`
    ).join('\n');

    return `${header}\n${rows}`;
  }

  private static buildDecisionRulesSection(rules: string[]): string {
    const numbered = rules.map((r, i) => `${i + 1}. ${r}`).join('\n');
    return `### Proactive Navigation Rules\n${numbered}`;
  }

  private static buildSteeringSection(presets: SteeringPreset[]): string {
    const items = presets.map(p =>
      `- **${p.name}**: drive(left=${p.leftMotor}, right=${p.rightMotor})`
    ).join('\n');
    return `### Smooth Steering Formulas\n${items}`;
  }

  private static buildSensorGuidelinesSection(guidelines: string[]): string {
    const items = guidelines.map(g => `- ${g}`).join('\n');
    return `### Sensor Interpretation\n${items}`;
  }

  private static buildLEDSection(protocol: LEDProtocol): string {
    const items = Object.entries(protocol).map(([state, color]) =>
      `- **${color.name}** (${color.r},${color.g},${color.b}): ${state}`
    ).join('\n');
    return `## LED Status Protocol\n${items}`;
  }

  private static buildResponseFormatSection(instructions?: string[]): string {
    let content = `## Response Format
Briefly state:
1. Current situation (distances to obstacles)
2. Your trajectory decision (where you're heading)
3. Speed adjustment reasoning

Then output tool calls.`;

    if (instructions && instructions.length > 0) {
      content += '\n\n' + instructions.join('\n');
    }

    return content;
  }

  private static buildExamplesSection(examples: BehaviorExample[]): string {
    const items = examples.map(e =>
      `"${e.situation}"
\`\`\`json
${e.toolCalls}
\`\`\``
    ).join('\n\n');

    return `## Example Decision Process\n${items}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOR DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const BEHAVIOR_TEMPLATES: Record<string, BehaviorTemplate> = {
  explorer: {
    id: 'explorer',
    name: 'Explorer',
    description: 'Intelligent exploration with proactive path planning and trajectory optimization',
    goal: 'Efficiently explore the environment while proactively avoiding obstacles',
    philosophy: `Think like an autonomous vehicle: ANTICIPATE obstacles, PLAN trajectories, and ADJUST continuously. Don't wait until you're about to collide - navigate proactively with spatial awareness.`,
    distanceZones: DISTANCE_ZONES,
    steeringPresets: STEERING_PRESETS,
    decisionRules: [
      '**At 80cm+**: If front < left or front < right by 30cm+, start curving toward open side',
      '**At 50-80cm**: Calculate best escape route, begin gentle turn',
      '**At 30-50cm**: Commit to turn direction, reduce speed proportionally',
      '**At <30cm**: Execute decisive turn toward most open direction',
      '**Use camera** periodically to validate sensor readings and detect obstacles sensors might miss',
    ],
    sensorGuidelines: [
      '**Prefer unexplored directions**: If you\'ve been turning left often, favor right when equal',
      '**Maximize coverage**: Don\'t just avoid walls, actively seek open spaces',
      '**Corner handling**: When multiple walls detected, rotate in place to find exit',
      '**Dead end detection**: If all directions < 40cm, stop, use camera, then reverse slightly and turn',
    ],
    ledProtocol: LED_PROTOCOLS.exploration,
    examples: [
      {
        situation: 'Front=65cm, L=120cm, R=45cm. Entering caution zone. Left path is clearest (+75cm vs front). Initiating gradual left curve at reduced speed.',
        reasoning: 'Left has most clearance',
        toolCalls: `{"tool": "set_led", "args": {"r": 255, "g": 200, "b": 0}}
{"tool": "drive", "args": {"left": 70, "right": 110}}`,
      },
    ],
    recommendedMap: '5m × 5m Obstacles',
    tags: ['exploration', 'obstacle-avoidance', 'autonomous'],
  },

  wallFollower: {
    id: 'wallFollower',
    name: 'Wall Follower',
    description: 'Follows walls using the right-hand rule',
    goal: 'Follow walls systematically using the right-hand rule to explore and navigate',
    sensorGuidelines: [
      'Maintain approximately 20cm distance from the right wall',
      'If right wall is too far (>30cm), turn slightly right',
      'If right wall is too close (<15cm), turn slightly left',
      'If front is blocked, turn left',
    ],
    ledProtocol: LED_PROTOCOLS.wallFollowing,
    recommendedMap: '5m × 5m Maze',
    tags: ['wall-following', 'navigation', 'systematic'],
  },

  lineFollower: {
    id: 'lineFollower',
    name: 'Line Follower',
    description: 'Follows line track using IR sensors',
    goal: 'Follow the white line track smoothly and continuously',
    sensorGuidelines: [
      '**Line Sensors** (5 sensors, array indices 0-4): Values 0 = OFF line, 255 = ON line',
      '**Layout**: [far-left(0), left(1), center(2), right(3), far-right(4)]',
      '**Motor Power**: Range -255 to +255, moderate speed 60-100',
      '**Differential steering**: One wheel faster than other for turns',
      '**On curves**: Keep turning continuously, never assume straight path',
    ],
    decisionRules: [
      '**CENTER sensor detects line (index 2 = 255)**: Drive forward: drive(left=80, right=80)',
      '**LEFT sensors detect line (indices 0 or 1 = 255)**: Turn LEFT - Gentle: drive(left=50, right=80), Sharp: drive(left=30, right=90)',
      '**RIGHT sensors detect line (indices 3 or 4 = 255)**: Turn RIGHT - Gentle: drive(left=80, right=50), Sharp: drive(left=90, right=30)',
      '**NO sensors detect line (all = 0)**: STOP and ROTATE to search: drive(left=40, right=-40)',
    ],
    ledProtocol: LED_PROTOCOLS.lineFollowing,
    responseInstructions: [
      'Keep responses VERY brief. Just state the sensor status and drive command:',
      '"Center on line. drive(80,80)"',
      '"Line left, turning. drive(50,85)"',
      '"Line lost, searching. drive(40,-40)"',
    ],
    recommendedMap: '5m × 5m Line Track',
    tags: ['line-following', 'reactive', 'precision'],
  },

  patroller: {
    id: 'patroller',
    name: 'Patroller',
    description: 'Patrols in a systematic rectangular pattern',
    goal: 'Patrol in a rectangular pattern while avoiding obstacles',
    decisionRules: [
      'Drive forward until obstacle detected',
      'Turn 90 degrees right',
      'Continue patrol pattern',
      'Return to start after N iterations',
    ],
    ledProtocol: {
      patrolling: { ...LED_COLORS.white, name: 'White (patrolling)' },
      turning: { ...LED_COLORS.purple, name: 'Purple (turning)' },
      returning: { ...LED_COLORS.red, name: 'Red (returning)' },
    },
    recommendedMap: '5m × 5m Empty',
    tags: ['patrolling', 'systematic', 'coverage'],
  },

  collector: {
    id: 'collector',
    name: 'Coin Collector',
    description: 'Collects all coins scattered around the arena',
    goal: 'Find and collect all coins in the arena while avoiding obstacles',
    decisionRules: [
      'Systematically explore the arena to find coins (gold circles on the floor)',
      'Navigate toward detected coins while avoiding obstacles',
      'Coins are collected automatically when you drive over them',
      'Use sensor data to detect nearby collectibles and plan efficient routes',
      'Track progress: remember which areas you\'ve explored',
    ],
    sensorGuidelines: [
      'Start by exploring the perimeter',
      'Work inward in a spiral pattern',
      'Prioritize clusters of coins',
      'Avoid revisiting empty areas',
    ],
    ledProtocol: LED_PROTOCOLS.collecting,
    recommendedMap: '5m × 5m Coin Collection',
    tags: ['collecting', 'exploration', 'optimization'],
  },

  gemHunter: {
    id: 'gemHunter',
    name: 'Gem Hunter',
    description: 'Hunts gems of different values while avoiding obstacles',
    goal: 'Collect gems of different values scattered around the arena, prioritizing high-value targets',
    decisionRules: [
      'Search for gems: green (10pts), blue (25pts), purple (50pts), gold stars (100pts)',
      'Prioritize high-value gems when multiple are detected',
      'Navigate carefully around obstacles to reach gems',
      'Plan efficient routes between gem locations',
    ],
    sensorGuidelines: [
      'Gold stars are worth the most - prioritize them',
      'Purple gems are near obstacles - approach carefully',
      'Blue gems are in corners - sweep the perimeter',
      'Green gems are scattered - collect opportunistically',
    ],
    ledProtocol: LED_PROTOCOLS.collecting,
    recommendedMap: '5m × 5m Gem Hunt',
    tags: ['collecting', 'prioritization', 'strategy'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOR REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export class BehaviorRegistry {
  private behaviors: Map<string, BehaviorTemplate> = new Map();

  constructor() {
    // Register default behaviors
    Object.values(BEHAVIOR_TEMPLATES).forEach(b => this.register(b));
  }

  /**
   * Register a new behavior
   */
  register(behavior: BehaviorTemplate): void {
    this.behaviors.set(behavior.id, behavior);
  }

  /**
   * Get a behavior by ID
   */
  get(id: string): BehaviorTemplate | undefined {
    return this.behaviors.get(id);
  }

  /**
   * Get the system prompt for a behavior
   */
  getPrompt(id: string): string | undefined {
    const behavior = this.get(id);
    if (!behavior) return undefined;
    return BehaviorPromptBuilder.build(behavior);
  }

  /**
   * List all registered behaviors
   */
  listAll(): BehaviorTemplate[] {
    return Array.from(this.behaviors.values());
  }

  /**
   * List behaviors by tag
   */
  listByTag(tag: string): BehaviorTemplate[] {
    return this.listAll().filter(b => b.tags.includes(tag));
  }

  /**
   * Get behavior description info
   */
  getDescription(id: string): { name: string; description: string; mapName: string } | undefined {
    const behavior = this.get(id);
    if (!behavior) return undefined;
    return {
      name: behavior.name,
      description: behavior.description,
      mapName: behavior.recommendedMap,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

export const behaviorRegistry = new BehaviorRegistry();

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get behavior prompt by ID (convenience function)
 */
export function getBehaviorPrompt(behaviorId: string): string {
  const prompt = behaviorRegistry.getPrompt(behaviorId);
  if (!prompt) {
    throw new Error(`Unknown behavior: ${behaviorId}`);
  }
  return prompt;
}

/**
 * Get behavior-to-map mapping
 */
export function getBehaviorToMapMapping(): Record<string, string> {
  const mapping: Record<string, string> = {};
  behaviorRegistry.listAll().forEach(b => {
    // Convert map name to ID format
    const mapId = b.recommendedMap
      .replace('5m × 5m ', 'standard5x5')
      .replace(/ /g, '');
    mapping[b.id] = mapId;
  });
  return mapping;
}

/**
 * Get all behavior descriptions
 */
export function getAllBehaviorDescriptions(): Record<string, { name: string; description: string; mapName: string }> {
  const descriptions: Record<string, { name: string; description: string; mapName: string }> = {};
  behaviorRegistry.listAll().forEach(b => {
    descriptions[b.id] = {
      name: b.name,
      description: b.description,
      mapName: b.recommendedMap,
    };
  });
  return descriptions;
}
