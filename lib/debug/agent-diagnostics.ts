/**
 * Agent Diagnostics Logger
 *
 * Centralized diagnostic data collection for the AI physical agent.
 * Captures perception, decision-making, physics, and camera issues
 * to help understand what is working and what is failing.
 *
 * Categories of diagnostics:
 * - PERCEPTION: What the robot "sees" via sensors vs ground truth
 * - DECISION: LLM reasoning quality, action selection, stuck detection
 * - PHYSICS: Collision events, pushable object interactions, movement
 * - CAMERA: Field of view coverage, blind spots, perspective issues
 * - REPRESENTATION: Wall/object detection accuracy, sensor coverage gaps
 */

import { create } from 'zustand';

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type DiagnosticCategory =
  | 'perception'
  | 'decision'
  | 'physics'
  | 'camera'
  | 'representation'
  | 'navigation'
  | 'stuck';

export type DiagnosticSeverity = 'ok' | 'info' | 'warning' | 'error' | 'critical';

export interface DiagnosticEvent {
  id: string;
  timestamp: number;
  cycle: number;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
  data?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PERCEPTION SNAPSHOT - What sensors report vs what exists
// ═══════════════════════════════════════════════════════════════════════════

export interface PerceptionSnapshot {
  cycle: number;
  timestamp: number;
  // Raw sensor readings
  sensors: {
    front: number;
    frontLeft: number;
    frontRight: number;
    left: number;
    right: number;
    back: number;
    backLeft: number;
    backRight: number;
  };
  // Derived perception
  frontBlocked: boolean;
  leftBlocked: boolean;
  rightBlocked: boolean;
  backBlocked: boolean;
  // Nearby objects detected
  pushableObjectsDetected: number;
  dockZonesDetected: number;
  // What the agent "told" the LLM
  sceneDescription: string;
  recommendation: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION SNAPSHOT - What the LLM decided and why
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionSnapshot {
  cycle: number;
  timestamp: number;
  // LLM decision
  reasoning: string;
  actionType: string;
  targetDirection: string | null;
  wheelCommands: { left: string; right: string };
  // Quality metrics
  responseTimeMs: number;
  parsedSuccessfully: boolean;
  toolCallsExtracted: number;
  // Consistency check
  matchesSensorRecommendation: boolean;
  repeatsLastAction: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHYSICS SNAPSHOT - Movement and collision data
// ═══════════════════════════════════════════════════════════════════════════

export interface PhysicsSnapshot {
  cycle: number;
  timestamp: number;
  // Position
  pose: { x: number; y: number; rotation: number };
  velocity: { linear: number; angular: number };
  // Movement since last cycle
  distanceMoved: number;
  rotationChanged: number;
  // Collision state
  frontBumper: boolean;
  backBumper: boolean;
  // Wall proximity (closest wall distance)
  closestWallDistance: number;
  closestObstacleDistance: number;
  // Pushable objects state
  pushableObjectsMoved: boolean;
  objectsInDockZones: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CAMERA/PERSPECTIVE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export interface CameraAnalysisSnapshot {
  cycle: number;
  timestamp: number;
  // What the "camera" (take_picture tool) reported
  sceneFromCamera: string;
  // Blind spots - directions with no sensor coverage
  blindSpots: string[];
  // Whether camera perspective matches goal needs
  canSeeGoalTarget: boolean;
  goalTargetDirection: string | null;
  goalTargetDistance: number | null;
  // Field of view coverage
  fovCoveragePercent: number;
  // Issues
  issues: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// AGGREGATE HEALTH SCORES
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentHealthScores {
  // 0-100 scores
  perception: number;     // Are sensors giving useful data?
  decisionQuality: number; // Is the LLM making good decisions?
  movement: number;       // Is the robot actually moving toward goals?
  exploration: number;    // Is the robot exploring new areas?
  goalProgress: number;   // Is the robot making progress on the goal?
  overall: number;        // Weighted average
}

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTICS STORE
// ═══════════════════════════════════════════════════════════════════════════

const MAX_EVENTS = 500;
const MAX_SNAPSHOTS = 100;

interface DiagnosticsState {
  // Events timeline
  events: DiagnosticEvent[];

  // Snapshots per cycle
  perceptionHistory: PerceptionSnapshot[];
  decisionHistory: DecisionSnapshot[];
  physicsHistory: PhysicsSnapshot[];
  cameraHistory: CameraAnalysisSnapshot[];

  // Current health scores
  health: AgentHealthScores;

  // Stuck detection
  stuckCycles: number;
  lastPositions: Array<{ x: number; y: number; rotation: number }>;

  // Representation issues found
  representationIssues: string[];

  // Actions
  addEvent: (event: Omit<DiagnosticEvent, 'id' | 'timestamp'>) => void;
  addPerception: (snapshot: PerceptionSnapshot) => void;
  addDecision: (snapshot: DecisionSnapshot) => void;
  addPhysics: (snapshot: PhysicsSnapshot) => void;
  addCamera: (snapshot: CameraAnalysisSnapshot) => void;
  updateHealth: (scores: Partial<AgentHealthScores>) => void;
  addRepresentationIssue: (issue: string) => void;
  clear: () => void;
}

const generateId = () => `diag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

export const useDiagnosticsStore = create<DiagnosticsState>((set, get) => ({
  events: [],
  perceptionHistory: [],
  decisionHistory: [],
  physicsHistory: [],
  cameraHistory: [],
  health: {
    perception: 50,
    decisionQuality: 50,
    movement: 50,
    exploration: 50,
    goalProgress: 0,
    overall: 50,
  },
  stuckCycles: 0,
  lastPositions: [],
  representationIssues: [],

  addEvent: (event) => {
    set((state) => {
      const newEvent: DiagnosticEvent = {
        ...event,
        id: generateId(),
        timestamp: Date.now(),
      };
      const events = [newEvent, ...state.events];
      if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
      return { events };
    });
  },

  addPerception: (snapshot) => {
    set((state) => {
      const history = [...state.perceptionHistory, snapshot];
      if (history.length > MAX_SNAPSHOTS) history.shift();
      return { perceptionHistory: history };
    });
  },

  addDecision: (snapshot) => {
    set((state) => {
      const history = [...state.decisionHistory, snapshot];
      if (history.length > MAX_SNAPSHOTS) history.shift();
      return { decisionHistory: history };
    });
  },

  addPhysics: (snapshot) => {
    set((state) => {
      const history = [...state.physicsHistory, snapshot];
      if (history.length > MAX_SNAPSHOTS) history.shift();

      // Stuck detection
      const lastPositions = [...state.lastPositions, snapshot.pose];
      if (lastPositions.length > 5) lastPositions.shift();

      let stuckCycles = state.stuckCycles;
      if (lastPositions.length >= 3) {
        const recent = lastPositions.slice(-3);
        const totalMovement = recent.reduce((sum, pos, i) => {
          if (i === 0) return 0;
          const prev = recent[i - 1];
          return sum + Math.sqrt(
            (pos.x - prev.x) ** 2 + (pos.y - prev.y) ** 2
          );
        }, 0);
        const totalRotation = recent.reduce((sum, pos, i) => {
          if (i === 0) return 0;
          return sum + Math.abs(pos.rotation - recent[i - 1].rotation);
        }, 0);

        if (totalMovement < 0.02 && totalRotation < 0.1) {
          stuckCycles++;
        } else {
          stuckCycles = 0;
        }
      }

      return { physicsHistory: history, lastPositions, stuckCycles };
    });
  },

  addCamera: (snapshot) => {
    set((state) => {
      const history = [...state.cameraHistory, snapshot];
      if (history.length > MAX_SNAPSHOTS) history.shift();
      return { cameraHistory: history };
    });
  },

  updateHealth: (scores) => {
    set((state) => {
      const health = { ...state.health, ...scores };
      health.overall = Math.round(
        (health.perception * 0.2 +
          health.decisionQuality * 0.25 +
          health.movement * 0.2 +
          health.exploration * 0.15 +
          health.goalProgress * 0.2)
      );
      return { health };
    });
  },

  addRepresentationIssue: (issue) => {
    set((state) => {
      const issues = [...state.representationIssues];
      if (!issues.includes(issue)) {
        issues.push(issue);
      }
      return { representationIssues: issues };
    });
  },

  clear: () => {
    set({
      events: [],
      perceptionHistory: [],
      decisionHistory: [],
      physicsHistory: [],
      cameraHistory: [],
      health: {
        perception: 50,
        decisionQuality: 50,
        movement: 50,
        exploration: 50,
        goalProgress: 0,
        overall: 50,
      },
      stuckCycles: 0,
      lastPositions: [],
      representationIssues: [],
    });
  },
}));

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC ANALYSIS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze perception quality from sensor readings.
 * Checks for blind spots, sensor coverage, and consistency.
 */
export function analyzePerception(
  sensors: PerceptionSnapshot['sensors'],
  nearbyPushables: number,
  nearbyDocks: number,
  goal: string
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  // Check for sensor saturation (max range = no info)
  const maxRange = 200; // cm
  const directions = Object.entries(sensors);
  const saturatedCount = directions.filter(([, d]) => d >= maxRange).length;
  if (saturatedCount >= 6) {
    issues.push(`${saturatedCount}/8 sensors at max range - robot may be in open area with no landmarks`);
    score -= 10;
  }

  // Check for dangerously close readings
  const dangerouslyClose = directions.filter(([, d]) => d < 10);
  if (dangerouslyClose.length > 0) {
    const names = dangerouslyClose.map(([n]) => n).join(', ');
    issues.push(`DANGER: ${names} sensor(s) < 10cm - collision imminent`);
    score -= 30;
  }

  // Check for asymmetric readings that suggest sensor noise or wall at angle
  const leftRight = Math.abs(sensors.left - sensors.right);
  if (leftRight > 100 && sensors.left < 50 && sensors.right < 50) {
    issues.push('Large left/right asymmetry with both close - possible corner or angled wall');
    score -= 5;
  }

  // Check if goal-relevant objects are detected
  const goalLower = goal.toLowerCase();
  if ((goalLower.includes('cube') || goalLower.includes('push')) && nearbyPushables === 0) {
    issues.push('Goal mentions pushable objects but none detected nearby');
    score -= 15;
  }
  if ((goalLower.includes('dock') || goalLower.includes('zone')) && nearbyDocks === 0) {
    issues.push('Goal mentions dock zones but none detected nearby');
    score -= 10;
  }

  // Blind spot analysis: back sensors often ignored
  if (sensors.back < 20 && sensors.front > 100) {
    issues.push('Obstacle very close behind - robot may back into it if reversing');
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

/**
 * Analyze decision quality from LLM response.
 */
export function analyzeDecision(
  decision: DecisionSnapshot,
  perception: PerceptionSnapshot | null,
  prevDecision: DecisionSnapshot | null
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  // Check if response parsed correctly
  if (!decision.parsedSuccessfully) {
    issues.push('LLM response failed to parse as valid JSON - fallback behavior used');
    score -= 40;
  }

  // Check response time
  if (decision.responseTimeMs > 10000) {
    issues.push(`LLM response very slow (${(decision.responseTimeMs / 1000).toFixed(1)}s) - may cause jerky behavior`);
    score -= 15;
  } else if (decision.responseTimeMs > 5000) {
    issues.push(`LLM response slow (${(decision.responseTimeMs / 1000).toFixed(1)}s)`);
    score -= 5;
  }

  // Check if no tool calls were extracted
  if (decision.toolCallsExtracted === 0) {
    issues.push('No tool calls extracted from LLM response - robot will not act');
    score -= 30;
  }

  // Check if decision contradicts sensor recommendation
  if (!decision.matchesSensorRecommendation && perception) {
    if (perception.frontBlocked && decision.targetDirection === 'forward') {
      issues.push('LLM chose FORWARD but front is blocked - will collide');
      score -= 25;
    }
  }

  // Check for repetitive actions
  if (decision.repeatsLastAction && prevDecision?.repeatsLastAction) {
    issues.push('Same action repeated 3+ times - possible stuck loop');
    score -= 20;
  }

  // Check reasoning quality
  if (!decision.reasoning || decision.reasoning.length < 10) {
    issues.push('Missing or very short reasoning - LLM may not be analyzing properly');
    score -= 10;
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

/**
 * Analyze physics/movement quality.
 */
export function analyzePhysics(
  current: PhysicsSnapshot,
  prev: PhysicsSnapshot | null
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  // Check if robot is moving
  if (prev && current.distanceMoved < 0.005 && Math.abs(current.velocity.linear) < 0.01) {
    issues.push('Robot stationary despite motor commands - possible collision or stuck');
    score -= 20;
  }

  // Check for collision
  if (current.frontBumper || current.backBumper) {
    const side = current.frontBumper ? 'front' : 'back';
    issues.push(`${side} bumper triggered - collision detected`);
    score -= 15;
  }

  // Check wall proximity
  if (current.closestWallDistance < 5) {
    issues.push(`Very close to wall (${current.closestWallDistance.toFixed(1)}cm) - risk of getting stuck`);
    score -= 10;
  }

  // Check velocity sanity
  if (Math.abs(current.velocity.linear) > 1.0) {
    issues.push(`Unusually high velocity (${current.velocity.linear.toFixed(2)} m/s) - physics issue?`);
    score -= 5;
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

/**
 * Analyze camera/perception perspective for goal achievement.
 */
export function analyzeCameraPerspective(
  sensors: PerceptionSnapshot['sensors'],
  goal: string,
  robotPose: { x: number; y: number; rotation: number },
  pushables?: Array<{ distance: number; angle: number; dockedIn?: string }>,
  dockZones?: Array<{ distance: number; angle: number; hasObject: boolean }>
): CameraAnalysisSnapshot {
  const issues: string[] = [];
  const blindSpots: string[] = [];

  // The robot has 8 distance sensors but the "camera" (take_picture) only reports
  // front, left, right distances. This means:
  const cameraReportedDirs = ['front', 'left', 'right'];
  const allDirs = ['front', 'frontLeft', 'frontRight', 'left', 'right', 'back', 'backLeft', 'backRight'];
  const unreportedDirs = allDirs.filter(d => !cameraReportedDirs.includes(d));

  // The take_picture tool only uses front/left/right distance
  // frontLeft, frontRight, back, backLeft, backRight are NOT reported to the LLM
  blindSpots.push(...unreportedDirs.map(d => `${d} (sensor exists but not reported to LLM)`));

  issues.push(
    'take_picture only reports front/left/right distances (3 of 8 sensors). ' +
    'The LLM cannot see frontLeft, frontRight, back, backLeft, backRight readings.'
  );

  // FOV coverage: 3 out of 8 directions = 37.5%
  let fovCoveragePercent = 37.5;

  // Check if goal target is detectable
  let canSeeGoalTarget = false;
  let goalTargetDirection: string | null = null;
  let goalTargetDistance: number | null = null;
  const goalLower = goal.toLowerCase();

  if (goalLower.includes('cube') || goalLower.includes('push')) {
    if (pushables && pushables.length > 0) {
      const closest = pushables[0];
      canSeeGoalTarget = true;
      goalTargetDistance = closest.distance;
      if (Math.abs(closest.angle) < 30) goalTargetDirection = 'ahead';
      else if (closest.angle < 0) goalTargetDirection = 'left';
      else goalTargetDirection = 'right';

      // Pushable info IS reported via nearbyPushables in take_picture
      fovCoveragePercent += 10; // bonus for object detection
    } else {
      issues.push('Goal requires finding pushable objects but none in sensor range');
    }
  }

  if (goalLower.includes('dock') || goalLower.includes('zone') || goalLower.includes('green')) {
    if (dockZones && dockZones.length > 0) {
      const closest = dockZones[0];
      if (!canSeeGoalTarget) {
        canSeeGoalTarget = true;
        goalTargetDistance = closest.distance;
        if (Math.abs(closest.angle) < 30) goalTargetDirection = 'ahead';
        else if (closest.angle < 0) goalTargetDirection = 'left';
        else goalTargetDirection = 'right';
      }
      fovCoveragePercent += 10;
    }
  }

  if (goalLower.includes('explore')) {
    // For exploration, the limited FOV is a bigger problem
    issues.push(
      'Exploration goal: Limited 3-sensor FOV means robot must rotate to scan. ' +
      'This is inefficient. Consider adding frontLeft/frontRight to take_picture.'
    );
  }

  // Perspective issue: the camera is simulated from sensor data, not an actual image
  issues.push(
    'Camera perspective is synthetic (sensor-derived text), not a real camera image. ' +
    'The LLM receives text descriptions like "Clear path ahead" instead of visual data. ' +
    'This limits spatial understanding compared to real camera feeds.'
  );

  // Wall representation issue
  issues.push(
    'Walls are represented as line segments. Distance sensors detect them correctly, but ' +
    'the LLM has no concept of wall shape, length, or orientation - only distance readings.'
  );

  const sceneFromCamera = `Front: ${sensors.front}cm, Left: ${sensors.left}cm, Right: ${sensors.right}cm`;

  return {
    cycle: 0, // Set by caller
    timestamp: Date.now(),
    sceneFromCamera,
    blindSpots,
    canSeeGoalTarget,
    goalTargetDirection,
    goalTargetDistance,
    fovCoveragePercent: Math.min(100, fovCoveragePercent),
    issues,
  };
}

/**
 * Analyze representation quality of walls and objects
 */
export function analyzeRepresentation(
  wallCount: number,
  obstacleCount: number,
  pushableCount: number,
  dockZoneCount: number,
  arenaSize: { width: number; height: number }
): string[] {
  const issues: string[] = [];

  // Wall representation
  if (wallCount === 4) {
    // Standard rectangular arena
    issues.push(
      'WALLS: Represented as 4 line segments (rectangular boundary). ' +
      'Line segments have zero thickness - the hazard-stripe visual is purely cosmetic. ' +
      'Collision detection uses point-to-line distance which works but doesn\'t model wall thickness.'
    );
  } else if (wallCount > 4) {
    issues.push(
      `WALLS: ${wallCount} wall segments including ${wallCount - 4} internal walls. ` +
      'Internal walls are also zero-thickness lines. Robot detects them via distance sensors ' +
      'but the LLM has no concept of wall connectivity or maze structure.'
    );
  }

  // Obstacle representation
  if (obstacleCount > 0) {
    issues.push(
      `OBSTACLES: ${obstacleCount} circular obstacles. Rendered as cylinders with hazard pattern ` +
      'but physics treats them as circles. Sensors detect them via ray-circle intersection. ' +
      'The LLM only knows "obstacle at X cm" - not shape, size, or that it can be navigated around.'
    );
  }

  // Pushable objects
  if (pushableCount > 0) {
    issues.push(
      `PUSHABLE OBJECTS: ${pushableCount} physics objects. Detected as both sensor obstacles ` +
      'AND reported separately via nearbyPushables. Physics uses circle-circle collision ' +
      'approximation even though objects are cubes visually. This mismatch between visual ' +
      '(cube) and physics (circle) representation may confuse spatial reasoning.'
    );
  }

  // Dock zones
  if (dockZoneCount > 0) {
    issues.push(
      `DOCK ZONES: ${dockZoneCount} rectangular target areas. Rendered as floor planes. ` +
      'The robot can drive over them without interaction. Objects dock when their center ' +
      'is fully inside the zone. The LLM is told about dock zones via nearbyDockZones sensor.'
    );
  }

  // Arena scale
  if (arenaSize.width >= 5 || arenaSize.height >= 5) {
    issues.push(
      `ARENA: ${arenaSize.width}m x ${arenaSize.height}m. Distance sensors max at 2m range. ` +
      'In a 5m arena, the robot can only see 40% of the arena width at best. ' +
      'Large unexplored areas will exist until the robot physically traverses them.'
    );
  }

  // Coordinate system
  issues.push(
    'COORDINATES: Physics uses sin(θ) for X and cos(θ) for Y (rotation=0 faces +Y/+Z). ' +
    'This is consistent internally but the LLM is told pose.rotation in degrees. ' +
    'The LLM must infer "which way am I facing" from changing sensor readings, not from coordinates.'
  );

  return issues;
}
