/**
 * Robot4 AssemblyScript Examples Library
 *
 * A collection of robot behavior examples in AssemblyScript.
 * These examples demonstrate different algorithms and patterns
 * for autonomous robot control.
 */

export interface Robot4Example {
  id: string;
  name: string;
  description: string;
  category: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  source: string;
}

/**
 * All Robot4 examples
 */
export const ROBOT4_EXAMPLES: Robot4Example[] = [
  // ==================== BEGINNER ====================
  {
    id: 'blink-led',
    name: 'Blink LED',
    description: 'Simple LED blinking pattern. Great first example to verify the robot is working.',
    category: 'beginner',
    tags: ['led', 'timer', 'basic'],
    source: `// Blink LED Example
// The LED alternates between red and blue every 500ms

export function update(): void {
  // Get elapsed time and use modulo for timing
  const time = millis();
  const phase = (time / 500) % 2;

  if (phase < 1) {
    led(255, 0, 0);  // Red
  } else {
    led(0, 0, 255);  // Blue
  }
}
`,
  },

  {
    id: 'drive-forward',
    name: 'Drive Forward',
    description: 'Drive forward until an obstacle is detected, then stop.',
    category: 'beginner',
    tags: ['drive', 'distance', 'basic'],
    source: `// Drive Forward Example
// Robot drives forward and stops when obstacle detected

const SAFE_DISTANCE: i32 = 25;  // Stop when closer than 25cm
const DRIVE_SPEED: i32 = 50;    // Motor speed (0-100)

export function update(): void {
  const frontDistance = distance(0);  // Front sensor

  if (frontDistance < SAFE_DISTANCE) {
    // Obstacle ahead - stop and show red
    stop();
    led(255, 0, 0);
  } else {
    // Clear path - drive forward and show green
    drive(DRIVE_SPEED, DRIVE_SPEED);
    led(0, 255, 0);
  }
}
`,
  },

  {
    id: 'button-control',
    name: 'Button Control',
    description: 'Use the button to start and stop the robot.',
    category: 'beginner',
    tags: ['button', 'state', 'control'],
    source: `// Button Control Example
// Press button to toggle between running and stopped

export function update(): void {
  // Toggle running state when button is pressed
  if (buttonPressed()) {
    const running = getState("running", 0);
    setState("running", running == 0 ? 1 : 0);
    beep(1000, 100);  // Confirmation beep
  }

  const isRunning = getState("running", 0);

  if (isRunning == 1) {
    drive(40, 40);
    led(0, 255, 0);  // Green when running
  } else {
    stop();
    led(255, 165, 0);  // Orange when stopped
  }
}
`,
  },

  // ==================== INTERMEDIATE ====================
  {
    id: 'collision-avoidance',
    name: 'Collision Avoidance',
    description: 'Navigate around obstacles using front distance sensor. Uses a state machine for smooth behavior.',
    category: 'intermediate',
    tags: ['distance', 'state-machine', 'navigation'],
    source: `// Collision Avoidance Example
// Uses state machine for reliable obstacle avoidance

const SAFE_DISTANCE: i32 = 30;
const TURN_TIME: i32 = 600;
const FORWARD_SPEED: i32 = 55;
const TURN_SPEED: i32 = 50;

// States
const STATE_FORWARD: i32 = 0;
const STATE_TURNING: i32 = 1;

export function update(): void {
  const state = getState("state", STATE_FORWARD);
  const frontDist = distance(0);

  if (state == STATE_FORWARD) {
    if (frontDist < SAFE_DISTANCE) {
      // Obstacle detected - start turning
      setState("state", STATE_TURNING);
      setState("turnStart", millis());

      // Randomly choose turn direction
      const turnDir = (millis() % 2) == 0 ? 1 : -1;
      setState("turnDir", turnDir);

      led(255, 100, 0);  // Orange
    } else {
      // Clear - drive forward
      drive(FORWARD_SPEED, FORWARD_SPEED);

      // Color based on distance (green to yellow)
      const greenness = clamp(map(frontDist, SAFE_DISTANCE, 100, 100, 255), 100, 255);
      led(255 - greenness, greenness, 0);
    }
  } else {
    // STATE_TURNING
    const turnStart = getState("turnStart", 0);
    const turnDir = getState("turnDir", 1);

    if (elapsed(turnStart) > TURN_TIME) {
      // Done turning
      setState("state", STATE_FORWARD);
    } else {
      // Execute turn
      if (turnDir > 0) {
        drive(TURN_SPEED, -TURN_SPEED);  // Turn right
      } else {
        drive(-TURN_SPEED, TURN_SPEED);  // Turn left
      }
      led(0, 100, 255);  // Blue while turning
    }
  }
}
`,
  },

  {
    id: 'line-follower',
    name: 'Line Follower',
    description: 'Follow a black line on a white surface using line sensors.',
    category: 'intermediate',
    tags: ['line-sensor', 'pid', 'navigation'],
    source: `// Line Follower Example
// Uses 5 line sensors for smooth line tracking

const BASE_SPEED: i32 = 45;
const MAX_CORRECTION: i32 = 35;

// PID gains
const KP: f32 = 0.8;
const KD: f32 = 0.3;

export function update(): void {
  // Read line sensors (0=leftmost, 4=rightmost)
  // 0 = white, 1 = black (on line)
  const s0 = getLineSensor(0);
  const s1 = getLineSensor(1);
  const s2 = getLineSensor(2);  // Center
  const s3 = getLineSensor(3);
  const s4 = getLineSensor(4);

  // Calculate weighted position (-2 to +2)
  // Negative = line is to the left, Positive = line is to the right
  const sensorSum = s0 + s1 + s2 + s3 + s4;

  if (sensorSum == 0) {
    // No line detected - use last known direction
    const lastError = getStateF("lastError", 0.0);
    if (lastError < 0) {
      drive(-20, 40);  // Search left
    } else {
      drive(40, -20);  // Search right
    }
    led(255, 0, 0);  // Red - searching
    return;
  }

  // Calculate position error
  const position: f32 = <f32>((-2 * s0) + (-1 * s1) + (0 * s2) + (1 * s3) + (2 * s4));
  const error: f32 = position / <f32>sensorSum;

  // PID calculation
  const lastError = getStateF("lastError", 0.0);
  const derivative: f32 = error - lastError;
  const correction: f32 = (KP * error) + (KD * derivative);

  setStateF("lastError", error);

  // Apply correction to motors
  const correctionInt = <i32>(correction * <f32>MAX_CORRECTION);
  const leftSpeed = clamp(BASE_SPEED + correctionInt, -100, 100);
  const rightSpeed = clamp(BASE_SPEED - correctionInt, -100, 100);

  drive(leftSpeed, rightSpeed);

  // LED shows tracking status
  if (abs(<i32>(error * 10.0)) < 3) {
    led(0, 255, 0);  // Green - centered
  } else {
    led(255, 255, 0);  // Yellow - correcting
  }
}
`,
  },

  {
    id: 'wall-follower',
    name: 'Wall Follower',
    description: 'Follow along a wall at a constant distance using the side sensor.',
    category: 'intermediate',
    tags: ['distance', 'pid', 'navigation'],
    source: `// Wall Follower Example
// Maintains constant distance from right-side wall

const TARGET_DISTANCE: i32 = 20;  // Target distance from wall (cm)
const BASE_SPEED: i32 = 40;
const MAX_CORRECTION: i32 = 25;

// PID gains
const KP: f32 = 1.5;
const KI: f32 = 0.05;
const KD: f32 = 0.8;

export function update(): void {
  // Read right-side distance sensor
  const rightDist = distance(2);  // Sensor 2 = right side
  const frontDist = distance(0);  // Front sensor for safety

  // Check for obstacle ahead
  if (frontDist < 15) {
    // Turn left sharply
    drive(-30, 50);
    led(255, 0, 0);
    return;
  }

  // Check if wall is visible
  if (rightDist > 100) {
    // No wall - turn right to find it
    drive(40, 20);
    led(255, 165, 0);  // Orange - searching
    return;
  }

  // Calculate error (positive = too far, negative = too close)
  const error: f32 = <f32>(rightDist - TARGET_DISTANCE);

  // PID terms
  const lastError = getStateF("lastError", 0.0);
  const integral = getStateF("integral", 0.0);

  const derivative: f32 = error - lastError;
  const newIntegral: f32 = clampF(integral + error * 0.016, -50.0, 50.0);

  const correction: f32 = (KP * error) + (KI * newIntegral) + (KD * derivative);

  // Save state
  setStateF("lastError", error);
  setStateF("integral", newIntegral);

  // Apply to motors (positive correction = turn left toward wall)
  const correctionInt = clamp(<i32>correction, -MAX_CORRECTION, MAX_CORRECTION);
  const leftSpeed = BASE_SPEED + correctionInt;
  const rightSpeed = BASE_SPEED - correctionInt;

  drive(leftSpeed, rightSpeed);

  // LED shows distance status
  const errorAbs = abs(<i32>error);
  if (errorAbs < 3) {
    led(0, 255, 0);    // Green - on target
  } else if (errorAbs < 8) {
    led(255, 255, 0);  // Yellow - close
  } else {
    led(255, 100, 0);  // Orange - correcting
  }
}
`,
  },

  // ==================== ADVANCED ====================
  {
    id: 'maze-solver',
    name: 'Maze Solver',
    description: 'Solve a maze using the left-hand rule algorithm. The robot keeps its left side to the wall.',
    category: 'advanced',
    tags: ['maze', 'algorithm', 'navigation'],
    source: `// Maze Solver Example
// Uses left-hand rule: always keep left wall close

const WALL_DIST: i32 = 20;
const FRONT_CLEAR: i32 = 25;
const SPEED: i32 = 40;
const TURN_SPEED: i32 = 45;
const TURN_TIME: i32 = 450;

// States
const STATE_FORWARD: i32 = 0;
const STATE_TURN_LEFT: i32 = 1;
const STATE_TURN_RIGHT: i32 = 2;

export function update(): void {
  const state = getState("state", STATE_FORWARD);

  // Read sensors
  const frontDist = distance(0);
  const leftDist = distance(1);
  const rightDist = distance(2);

  // State machine
  if (state == STATE_FORWARD) {
    // Check for decisions
    const leftOpen = leftDist > WALL_DIST + 10;
    const frontBlocked = frontDist < FRONT_CLEAR;

    if (leftOpen) {
      // Left is open - turn left (left-hand rule)
      setState("state", STATE_TURN_LEFT);
      setState("turnStart", millis());
      led(0, 255, 255);  // Cyan
    } else if (frontBlocked) {
      // Front blocked - turn right
      setState("state", STATE_TURN_RIGHT);
      setState("turnStart", millis());
      led(255, 0, 255);  // Magenta
    } else {
      // Continue forward, hug left wall
      const error = leftDist - WALL_DIST;
      const correction = clamp(error / 2, -15, 15);
      drive(SPEED - correction, SPEED + correction);
      led(0, 255, 0);  // Green
    }
  } else if (state == STATE_TURN_LEFT) {
    if (elapsed(getState("turnStart", 0)) > TURN_TIME) {
      setState("state", STATE_FORWARD);
    } else {
      drive(-TURN_SPEED, TURN_SPEED);
    }
  } else if (state == STATE_TURN_RIGHT) {
    if (elapsed(getState("turnStart", 0)) > TURN_TIME) {
      setState("state", STATE_FORWARD);
    } else {
      drive(TURN_SPEED, -TURN_SPEED);
    }
  }
}
`,
  },

  {
    id: 'light-seeker',
    name: 'Light Seeker',
    description: 'Move toward the brightest light source using two light sensors (simulated with distance sensors).',
    category: 'advanced',
    tags: ['sensors', 'gradient', 'search'],
    source: `// Light Seeker Example
// Robot moves toward areas with less obstacles (simulating light)
// Uses gradient ascent to find open spaces

const BASE_SPEED: i32 = 35;
const TURN_SPEED: i32 = 40;
const SCAN_TIME: i32 = 1500;

// States
const STATE_SCAN: i32 = 0;
const STATE_MOVE: i32 = 1;
const STATE_TURN: i32 = 2;

export function update(): void {
  const state = getState("state", STATE_SCAN);

  if (state == STATE_SCAN) {
    // Scanning phase - rotate and find best direction
    const scanStart = getState("scanStart", 0);

    if (scanStart == 0) {
      // Start new scan
      setState("scanStart", millis());
      setState("bestDist", 0);
      setState("bestAngle", 0);
      setState("currentAngle", 0);
    }

    const elapsed = millis() - scanStart;

    if (elapsed < SCAN_TIME) {
      // Continue scanning
      drive(TURN_SPEED, -TURN_SPEED);

      const currentDist = distance(0);
      const bestDist = getState("bestDist", 0);

      if (currentDist > bestDist) {
        setState("bestDist", currentDist);
        setState("bestAngle", elapsed);
      }

      // Rainbow LED during scan
      const hue = (elapsed * 255) / SCAN_TIME;
      led(255 - (hue % 256), hue % 256, 128);
    } else {
      // Scan complete - turn to best angle
      setState("state", STATE_TURN);
      setState("turnStart", millis());
      const bestAngle = getState("bestAngle", 0);
      setState("turnTarget", bestAngle);
    }
  } else if (state == STATE_TURN) {
    // Turn to face best direction
    const turnStart = getState("turnStart", 0);
    const turnTarget = getState("turnTarget", 0);

    if (elapsed(turnStart) < turnTarget) {
      drive(TURN_SPEED, -TURN_SPEED);
      led(0, 100, 255);
    } else {
      setState("state", STATE_MOVE);
      setState("moveStart", millis());
    }
  } else if (state == STATE_MOVE) {
    // Move toward open space
    const frontDist = distance(0);

    if (frontDist < 30 || elapsed(getState("moveStart", 0)) > 3000) {
      // Obstacle or timeout - rescan
      setState("state", STATE_SCAN);
      setState("scanStart", 0);
    } else {
      drive(BASE_SPEED, BASE_SPEED);
      led(0, 255, 0);
    }
  }
}
`,
  },

  {
    id: 'dance-routine',
    name: 'Dance Routine',
    description: 'A fun choreographed dance routine with LED light show.',
    category: 'advanced',
    tags: ['fun', 'led', 'sequence'],
    source: `// Dance Routine Example
// Choreographed moves with LED light show

const MOVE_TIME: i32 = 400;

// Dance moves sequence
const MOVES: i32 = 8;

export function update(): void {
  const time = millis();
  const moveIndex = (time / MOVE_TIME) % MOVES;
  const movePhase = (time % MOVE_TIME);
  const progress = <f32>movePhase / <f32>MOVE_TIME;

  // Execute current dance move
  if (moveIndex == 0) {
    // Spin right
    drive(60, -60);
    led(255, 0, 0);
  } else if (moveIndex == 1) {
    // Spin left
    drive(-60, 60);
    led(0, 255, 0);
  } else if (moveIndex == 2) {
    // Wiggle right
    drive(50, 30);
    led(0, 0, 255);
  } else if (moveIndex == 3) {
    // Wiggle left
    drive(30, 50);
    led(255, 255, 0);
  } else if (moveIndex == 4) {
    // Back up
    drive(-40, -40);
    led(255, 0, 255);
  } else if (moveIndex == 5) {
    // Forward burst
    drive(80, 80);
    led(0, 255, 255);
  } else if (moveIndex == 6) {
    // Pivot right
    drive(70, 0);
    led(255, 165, 0);
  } else if (moveIndex == 7) {
    // Pivot left
    drive(0, 70);
    led(255, 255, 255);
  }

  // Beep on move transitions
  if (movePhase < 50) {
    beep(500 + moveIndex * 100, 30);
  }
}
`,
  },

  {
    id: 'patrol-behavior',
    name: 'Patrol Behavior',
    description: 'Robot patrols back and forth between boundaries, turning when it detects obstacles.',
    category: 'intermediate',
    tags: ['patrol', 'state-machine', 'navigation'],
    source: `// Patrol Behavior Example
// Robot patrols an area, turning at boundaries

const PATROL_TIME: i32 = 3000;
const TURN_TIME: i32 = 800;
const PATROL_SPEED: i32 = 45;
const BOUNDARY_DIST: i32 = 30;

// States
const STATE_PATROL: i32 = 0;
const STATE_TURN: i32 = 1;
const STATE_WAIT: i32 = 2;

export function update(): void {
  const state = getState("state", STATE_PATROL);
  const patrolStart = getState("patrolStart", millis());

  // Initialize on first run
  if (getState("initialized", 0) == 0) {
    setState("initialized", 1);
    setState("patrolStart", millis());
    setState("patrolDir", 1);
  }

  if (state == STATE_PATROL) {
    const frontDist = distance(0);
    const patrolTime = elapsed(patrolStart);

    // Check for boundary conditions
    if (frontDist < BOUNDARY_DIST || patrolTime > PATROL_TIME) {
      setState("state", STATE_TURN);
      setState("turnStart", millis());
      beep(800, 100);
    } else {
      // Continue patrolling
      const dir = getState("patrolDir", 1);
      drive(PATROL_SPEED * dir, PATROL_SPEED * dir);

      // Pulsing LED based on time
      const pulse = (patrolTime / 50) % 255;
      led(0, pulse, 255 - pulse);
    }
  } else if (state == STATE_TURN) {
    if (elapsed(getState("turnStart", 0)) > TURN_TIME) {
      // Reverse direction
      const dir = getState("patrolDir", 1);
      setState("patrolDir", -dir);
      setState("patrolStart", millis());
      setState("state", STATE_WAIT);
      setState("waitStart", millis());
    } else {
      // Execute 180-degree turn
      drive(50, -50);
      led(255, 100, 0);
    }
  } else if (state == STATE_WAIT) {
    // Brief pause before continuing
    stop();
    led(255, 255, 0);

    if (elapsed(getState("waitStart", 0)) > 300) {
      setState("state", STATE_PATROL);
    }
  }
}
`,
  },
];

/**
 * Get examples by category
 */
export function getExamplesByCategory(category: 'beginner' | 'intermediate' | 'advanced'): Robot4Example[] {
  return ROBOT4_EXAMPLES.filter(e => e.category === category);
}

/**
 * Get examples by tag
 */
export function getExamplesByTag(tag: string): Robot4Example[] {
  return ROBOT4_EXAMPLES.filter(e => e.tags.includes(tag));
}

/**
 * Get example by ID
 */
export function getExampleById(id: string): Robot4Example | undefined {
  return ROBOT4_EXAMPLES.find(e => e.id === id);
}

/**
 * Get all unique tags
 */
export function getAllTags(): string[] {
  const tags = new Set<string>();
  ROBOT4_EXAMPLES.forEach(e => e.tags.forEach(t => tags.add(t)));
  return Array.from(tags).sort();
}

/**
 * Search examples
 */
export function searchExamples(query: string): Robot4Example[] {
  const lowerQuery = query.toLowerCase();
  return ROBOT4_EXAMPLES.filter(e =>
    e.name.toLowerCase().includes(lowerQuery) ||
    e.description.toLowerCase().includes(lowerQuery) ||
    e.tags.some(t => t.toLowerCase().includes(lowerQuery))
  );
}
