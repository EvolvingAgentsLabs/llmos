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
    return `## Perception System & World Understanding
You have access to:
- **Distance Sensors**: Front, Left, Right (plus frontLeft, frontRight, back sensors)
- **Camera**: Use \`use_camera\` to get visual analysis of your surroundings
- **Position/Heading**: Your current pose (x, y, rotation) in the arena
- **World Model**: The system tracks your exploration and builds a map for you

## COGNITIVE FIRST: Analyze Before Acting
CRITICAL: You are an intelligent AI robot. EVERY cycle, you MUST:

### STEP 1: OBSERVE (Read all sensors)
- Distance: front, frontLeft, frontRight, left, right, back
- Position: (x, y) coordinates and rotation angle
- Camera: if needed for visual understanding

### STEP 2: UPDATE WORLD MODEL (Mental map)
Before taking ANY action, state your understanding:
\`\`\`
WORLD MODEL UPDATE:
- My position: (x, y) facing [direction]
- Obstacles detected: [describe locations]
- Clear paths: [describe open directions]
- Unexplored areas: [estimate what you haven't seen]
- Confidence: [how sure are you about this model?]
\`\`\`

### STEP 3: REASON (Plan optimal action)
- What's my goal right now?
- Given my world model, what's the best action?
- What will this action teach me about the world?

### STEP 4: ACT (Execute with purpose)
- Only NOW call the drive/steering tools
- Choose actions that IMPROVE your world understanding

## Progressive World Understanding
As an intelligent robot, you must progressively build an internal model of your environment:
- **Track explored vs unexplored areas** - prefer moving toward unexplored regions
- **Remember obstacle locations** - use past sensor readings to inform future decisions
- **Estimate your position** relative to arena bounds and known obstacles
- **Update your beliefs** when new data contradicts previous assumptions

When you receive sensor data, mentally update your understanding:
1. "I now know there's an obstacle approximately X cm in direction Y"
2. "The area behind me is clear for at least Z cm"
3. "I should explore toward the unexplored direction"

## ASCII World Visualization
When asked or periodically, describe your world understanding as a simple ASCII map:
\`\`\`
     N
  +--+--+
W |..|??| E   Key: R=Robot, ??=Unknown, ..=Clear, ##=Obstacle
  |R>|##|
  +--+--+
     S
\`\`\`
This helps you (and observers) understand your mental model.`;
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
    let content = `## Response Format (COGNITIVE LOOP)
Your response MUST follow this cognitive structure:

### 1. PERCEPTION (What do I see?)
\`\`\`
SENSORS: Front=XXcm, L=XXcm, R=XXcm | Pos: (X.X, Y.Y) @ Xdeg
\`\`\`

### 2. WORLD MODEL (What do I understand?)
\`\`\`
WORLD MODEL:
- Zone: [OPEN/AWARE/CAUTION/CRITICAL]
- Obstacles: [where are they relative to me?]
- Open paths: [which directions are clear?]
- My goal: [what am I trying to achieve?]
\`\`\`

### 3. REASONING (Why this action?)
Briefly explain: "I choose [action] because [reason based on world model]"

### 4. ACTION (What do I do?)
Output the tool calls.

Example Response:
\`\`\`
SENSORS: Front=65cm, L=120cm, R=45cm | Pos: (0.5, 0.8) @ 45deg
WORLD MODEL:
- Zone: AWARE (50-100cm range)
- Obstacles: Wall or object ~65cm ahead, closer on right (~45cm)
- Open paths: Left is clearest (120cm), good for exploration
- My goal: Explore while avoiding obstacles
I choose LEFT TURN because left has 75cm more clearance than right, leads to unexplored area.
\`\`\`
{"tool": "set_led", "args": {"r": 255, "g": 200, "b": 0}}
{"tool": "drive", "args": {"left": 70, "right": 110}}`;

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
    description: 'Intelligent exploration with world modeling, path planning and trajectory optimization',
    goal: 'Build a cognitive model of the environment while efficiently exploring and avoiding obstacles',
    philosophy: `You are an intelligent autonomous robot that BUILDS UNDERSTANDING of your world.

## Core Principles
1. **BUILD A MENTAL MAP**: Track where you've been and what you've found
2. **PREFER UNEXPLORED AREAS**: Always move toward regions you haven't visited
3. **REMEMBER OBSTACLES**: Use past sensor readings to avoid known hazards
4. **UPDATE BELIEFS**: When new data contradicts old assumptions, update your model

## Every Cycle You Must:
1. READ your sensor data carefully - the distances tell you EXACTLY where obstacles are
2. UPDATE your world model - "Now I know there's an obstacle X cm ahead"
3. COMPARE front, left, and right distances to find the clearest path toward UNEXPLORED areas
4. ADJUST your speed based on how close obstacles are (closer = slower)
5. STEER smoothly toward open, UNEXPLORED space using differential wheel speeds

CRITICAL: Your sensors are your EYES. Your MEMORY is your map. If front distance is decreasing, you're approaching an obstacle - START TURNING NOW toward unexplored territory!`,
    distanceZones: DISTANCE_ZONES,
    steeringPresets: STEERING_PRESETS,
    decisionRules: [
      '**ALWAYS compare distances**: front vs left vs right - turn toward the LARGEST value',
      '**OPEN zone (>100cm)**: Full speed (150-200). If one side has 30cm+ more space, curve gently toward it',
      '**AWARE zone (50-100cm)**: Moderate speed (100-150). Begin turning toward clearer side NOW',
      '**CAUTION zone (30-50cm)**: Slow down (60-100). Commit to turn direction, steer firmly',
      '**CRITICAL zone (<30cm)**: Very slow or stop (0-60). Sharp turn or reverse if trapped',
      '**Speed formula**: speed = min(200, frontDistance * 2). E.g., 50cm front = speed 100',
    ],
    sensorGuidelines: [
      '**READ EVERY SENSOR**: front, frontLeft, frontRight, left, right - they all matter!',
      '**Obstacle on LEFT** (left < 50cm): Steer RIGHT by making left wheel faster than right',
      '**Obstacle on RIGHT** (right < 50cm): Steer LEFT by making right wheel faster than left',
      '**Obstacle AHEAD** (front < 50cm): Turn toward side with MORE clearance (compare left vs right)',
      '**Corner detected** (front < 40cm AND left < 40cm AND right < 40cm): STOP, then rotate in place',
      '**Smooth curves**: Small speed differences = gentle curves, big differences = sharp turns',
      '**Example**: left=80, right=120 makes gentle right curve. left=-50, right=100 makes sharp left turn',
    ],
    ledProtocol: LED_PROTOCOLS.exploration,
    examples: [
      {
        situation: 'Front=150cm, L=180cm, R=90cm. OPEN zone, clear ahead. Right side closer, favoring slight left drift.',
        reasoning: 'Wide open, slight left preference',
        toolCalls: `{"tool": "set_led", "args": {"r": 0, "g": 255, "b": 255}}
{"tool": "drive", "args": {"left": 160, "right": 180}}`,
      },
      {
        situation: 'Front=65cm, L=120cm, R=45cm. AWARE zone. Left has most space (+55cm vs right). Curving left at reduced speed.',
        reasoning: 'Left is clearest, moderate turn',
        toolCalls: `{"tool": "set_led", "args": {"r": 255, "g": 200, "b": 0}}
{"tool": "drive", "args": {"left": 70, "right": 110}}`,
      },
      {
        situation: 'Front=35cm, L=80cm, R=25cm. CAUTION zone! Obstacle close ahead and right. Turning left firmly.',
        reasoning: 'Must turn left to avoid collision',
        toolCalls: `{"tool": "set_led", "args": {"r": 255, "g": 100, "b": 0}}
{"tool": "drive", "args": {"left": 40, "right": 90}}`,
      },
      {
        situation: 'Front=20cm, L=60cm, R=30cm. CRITICAL! Very close to obstacle. Sharp left turn needed.',
        reasoning: 'Emergency avoidance, sharp turn left',
        toolCalls: `{"tool": "set_led", "args": {"r": 255, "g": 0, "b": 0}}
{"tool": "drive", "args": {"left": -30, "right": 80}}`,
      },
      {
        situation: 'Front=25cm, L=20cm, R=35cm. Nearly boxed in. Right has slightly more room. Rotating right.',
        reasoning: 'Tight space, rotate toward best option',
        toolCalls: `{"tool": "set_led", "args": {"r": 255, "g": 0, "b": 0}}
{"tool": "drive", "args": {"left": 60, "right": -40}}`,
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

  visionExplorer: {
    id: 'visionExplorer',
    name: 'Vision-Guided Explorer',
    description: 'Uses camera vision to build world model and seek optimal viewpoints for exploration',
    goal: 'Build a complete world model by seeking viewpoints that maximize visual coverage of unexplored areas',
    philosophy: `You are a VISION-FIRST intelligent robot. Unlike basic robots that only use distance sensors, you have a CAMERA that lets you SEE and UNDERSTAND your environment.

## Vision-Based World Model
Your PRIMARY source of world knowledge is your CAMERA VISION ANALYSIS:
1. **Field of View**: You can see LEFT, CENTER, and RIGHT regions
2. **Unexplored Detection**: Vision tells you which areas LOOK unexplored
3. **Object Detection**: You can see walls, obstacles, open spaces, and collectibles
4. **Distance Estimation**: Vision provides estimated distances to objects

## Exploration Philosophy: SEEK VIEWPOINTS
Unlike traditional exploration that follows paths, you should:
1. **SCAN** your environment with the camera to understand what's visible
2. **IDENTIFY** unexplored regions from the vision analysis
3. **MOVE** to positions that give BETTER VIEWS of unexplored areas
4. **BUILD** your world model from what you SEE, not just what you bump into

## Vision-Sensor Fusion
Combine vision with distance sensors for maximum understanding:
- **Vision** tells you WHAT things are (wall vs obstacle vs open space)
- **Sensors** give you precise DISTANCE measurements
- **Together** they create a rich, accurate world model

## Key Insight
Distance sensors only tell you there's "something" at X cm.
Vision tells you what it IS and whether the area LOOKS explored.
Use VISION to decide WHERE to go, SENSORS to navigate SAFELY.`,
    distanceZones: DISTANCE_ZONES,
    steeringPresets: STEERING_PRESETS,
    decisionRules: [
      '**VISION FIRST**: Always check the CAMERA VISION ANALYSIS before deciding movement',
      '**UNEXPLORED PRIORITY**: If vision shows [UNEXPLORED] in any direction, prioritize moving there',
      '**VIEWPOINT SEEKING**: Move toward positions that will reveal MORE unexplored areas',
      '**Scene Understanding**: Use the "Scene:" description to understand your environment holistically',
      '**Object Awareness**: Detected objects (walls, obstacles, collectibles) update your world model',
      '**Vision Recommendation**: Follow the VISION RECOMMENDATION when provided - it optimizes exploration',
      '**Safe Navigation**: Use distance sensors to avoid collisions while pursuing vision-directed goals',
      '**Combine Information**: Vision clearance % + sensor distance = optimal path selection',
    ],
    sensorGuidelines: [
      '**CAMERA VISION ANALYSIS**: This is your PRIMARY source of world understanding',
      '**Field of View regions**: LEFT, CENTER, RIGHT - each shows content, distance, clearance',
      '**[UNEXPLORED] markers**: These indicate areas your world model doesn\'t know - GO THERE!',
      '**Objects Detected**: Walls, obstacles, collectibles - these update your world model',
      '**Distance sensors**: Use for precise obstacle avoidance while following vision guidance',
      '**Clearance percentages**: Higher % = safer to traverse in that direction',
      '**Estimated distances**: Vision distance + sensor distance = best path choice',
    ],
    ledProtocol: {
      scanning: { r: 128, g: 0, b: 255, name: 'Purple (scanning/vision processing)' },
      unexplored: { r: 0, g: 255, b: 128, name: 'Cyan-Green (moving to unexplored)' },
      exploring: { r: 0, g: 255, b: 0, name: 'Green (normal exploration)' },
      avoiding: { r: 255, g: 200, b: 0, name: 'Yellow (obstacle avoidance)' },
      critical: { r: 255, g: 0, b: 0, name: 'Red (critical obstacle)' },
    },
    examples: [
      {
        situation: 'VISION shows LEFT: open_space [UNEXPLORED], CENTER: wall (1.2m), RIGHT: obstacle (0.8m). Sensors confirm. Moving left to explore.',
        reasoning: 'Vision identified unexplored area to the left',
        toolCalls: `{"tool": "set_led", "args": {"r": 0, "g": 255, "b": 128}}
{"tool": "drive", "args": {"left": 60, "right": 110}}`,
      },
      {
        situation: 'VISION: All regions show walls/obstacles, no unexplored areas visible. Need to reposition for better viewpoint.',
        reasoning: 'Current position has limited visibility, need to move to see more',
        toolCalls: `{"tool": "set_led", "args": {"r": 128, "g": 0, "b": 255}}
{"tool": "drive", "args": {"left": -50, "right": 50}}`,
      },
      {
        situation: 'VISION RECOMMENDATION: Explore RIGHT - "Open space visible, appears unexplored". Sensors show right clear (120cm).',
        reasoning: 'Following vision recommendation for optimal exploration',
        toolCalls: `{"tool": "set_led", "args": {"r": 0, "g": 255, "b": 128}}
{"tool": "drive", "args": {"left": 100, "right": 60}}`,
      },
    ],
    responseInstructions: [
      '**ALWAYS reference the CAMERA VISION ANALYSIS in your reasoning**',
      'Explain HOW vision information influenced your decision',
      'If vision shows unexplored areas, explain why you\'re moving toward them',
      'Describe how you\'re using vision + sensors together',
    ],
    recommendedMap: '5m × 5m Obstacles',
    tags: ['vision', 'exploration', 'world-model', 'intelligent', 'viewpoint-seeking'],
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
