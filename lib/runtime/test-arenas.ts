/**
 * Test Arena Configurations
 *
 * Predefined arena setups for end-to-end navigation testing.
 * Each arena defines: walls, obstacles, beacons, robot start pose, and goal.
 *
 * Arena coordinate system: meters, centered at (0,0).
 * Standard arena size: 5m x 5m (bounds: -2.5 to +2.5).
 */

import type { Robot4World } from './robot4-runtime';

// =============================================================================
// Types
// =============================================================================

export interface TestArenaConfig {
  /** Human-readable name */
  name: string;
  /** Description of the test scenario */
  description: string;
  /** The simulation world definition */
  world: Robot4World;
  /** Robot starting pose */
  startPose: { x: number; y: number; rotation: number };
  /** Navigation goal (null for exploration-only) */
  goal: { x: number; y: number; text: string } | null;
  /** Success criteria for evaluation */
  criteria: SuccessCriteria;
}

export interface SuccessCriteria {
  /** Robot must reach within this distance of goal (meters). Ignored if no goal. */
  goalToleranceM: number;
  /** Maximum allowed collisions (0 = zero tolerance) */
  maxCollisions: number;
  /** Minimum exploration % required (0-1). 0 = no requirement. */
  minExploration: number;
  /** Maximum cycles before timeout */
  maxCycles: number;
  /** Maximum stuck counter allowed at end */
  maxStuckCounter: number;
}

// =============================================================================
// Arena 1: Simple Navigation
// =============================================================================

/**
 * Simple navigation: robot in corner, goal diagonally across, 3 obstacles.
 *
 * Layout:
 *   ┌─────────────────────────┐
 *   │                     G   │
 *   │              ■          │
 *   │                         │
 *   │        ■                │
 *   │   ■                     │
 *   │ R                       │
 *   └─────────────────────────┘
 *
 * R = Robot start (−1.5, −1.5), heading NE
 * G = Goal (1.5, 1.5)
 * ■ = Obstacles
 */
export const ARENA_SIMPLE_NAVIGATION: TestArenaConfig = {
  name: 'Simple Navigation',
  description: 'Navigate from corner to opposite corner with 3 obstacles',
  world: {
    walls: [
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },   // Bottom
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },      // Right
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },      // Top
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },    // Left
    ],
    obstacles: [
      { x: -0.5, y: -0.5, radius: 0.2 },
      { x: 0.5, y: 0.3, radius: 0.2 },
      { x: 1.0, y: 1.2, radius: 0.2 },
    ],
    beacons: [],
    lines: [],
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
  },
  startPose: { x: -1.5, y: -1.5, rotation: Math.PI / 4 },
  goal: { x: 1.5, y: 1.5, text: 'Reach the goal at (1.5, 1.5)' },
  criteria: {
    goalToleranceM: 0.3,
    maxCollisions: 0,
    minExploration: 0,
    maxCycles: 100,
    maxStuckCounter: 10,
  },
};

// =============================================================================
// Arena 2: Exploration
// =============================================================================

/**
 * Exploration: robot at center, explore >80% of a 5m x 5m arena.
 * Random obstacles scattered around.
 *
 * Layout:
 *   ┌─────────────────────────┐
 *   │  ■              ■       │
 *   │                         │
 *   │       ■    R    ■       │
 *   │                         │
 *   │   ■                     │
 *   └─────────────────────────┘
 */
export const ARENA_EXPLORATION: TestArenaConfig = {
  name: 'Exploration',
  description: 'Explore >80% of the arena starting from center',
  world: {
    walls: [
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },
    ],
    obstacles: [
      { x: -1.5, y: 1.5, radius: 0.15 },
      { x: 1.5, y: 1.5, radius: 0.15 },
      { x: -0.5, y: 0.0, radius: 0.15 },
      { x: 1.0, y: 0.0, radius: 0.15 },
      { x: -1.0, y: -1.0, radius: 0.15 },
    ],
    beacons: [],
    lines: [],
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
  },
  startPose: { x: 0, y: 0, rotation: 0 },
  goal: null,
  criteria: {
    goalToleranceM: 0.3,
    maxCollisions: 0,
    minExploration: 0.8,
    maxCycles: 150,
    maxStuckCounter: 15,
  },
};

// =============================================================================
// Arena 3: Dead-End Recovery
// =============================================================================

/**
 * Dead-end recovery: L-shaped corridor, robot inside dead end.
 *
 * Layout:
 *   ┌───────────┬─────────────┐
 *   │           │             │
 *   │   R       │      G      │
 *   │           │             │
 *   │           │             │
 *   │           └─────────────│
 *   │                         │
 *   │                         │
 *   └─────────────────────────┘
 *
 * The robot must back out of the dead end, navigate around the wall,
 * and reach the goal on the other side.
 */
export const ARENA_DEAD_END: TestArenaConfig = {
  name: 'Dead-End Recovery',
  description: 'Escape dead end, navigate L-shape to reach goal',
  world: {
    walls: [
      // Outer boundary
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },
      // Internal L-wall: vertical segment
      { x1: 0, y1: 2.5, x2: 0, y2: -0.5 },
      // Internal L-wall: horizontal segment
      { x1: 0, y1: -0.5, x2: 2.5, y2: -0.5 },
    ],
    obstacles: [],
    beacons: [],
    lines: [],
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
  },
  startPose: { x: -1.5, y: 1.0, rotation: 0 },
  goal: { x: 1.5, y: 1.0, text: 'Reach the goal past the L-wall' },
  criteria: {
    goalToleranceM: 0.3,
    maxCollisions: 0,
    minExploration: 0,
    maxCycles: 120,
    maxStuckCounter: 15,
  },
};

// =============================================================================
// Arena 4: Narrow Corridor
// =============================================================================

/**
 * Narrow corridor: robot must navigate through a tight passage.
 *
 * Layout:
 *   ┌─────────────────────────┐
 *   │ R       ┃   ┃        G │
 *   │         ┃   ┃          │
 *   │         ┃   ┃          │
 *   │         ┃   ┃          │
 *   │                         │
 *   └─────────────────────────┘
 */
export const ARENA_NARROW_CORRIDOR: TestArenaConfig = {
  name: 'Narrow Corridor',
  description: 'Navigate through a narrow gap between two walls',
  world: {
    walls: [
      // Outer boundary
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },
      // Left wall of corridor
      { x1: -0.3, y1: 2.5, x2: -0.3, y2: -1.0 },
      // Right wall of corridor
      { x1: 0.3, y1: 2.5, x2: 0.3, y2: -1.0 },
    ],
    obstacles: [],
    beacons: [],
    lines: [],
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
  },
  startPose: { x: -1.5, y: 1.5, rotation: 0 },
  goal: { x: 1.5, y: 1.5, text: 'Reach the other side through the corridor' },
  criteria: {
    goalToleranceM: 0.3,
    maxCollisions: 0,
    minExploration: 0,
    maxCycles: 80,
    maxStuckCounter: 10,
  },
};

// =============================================================================
// Registry
// =============================================================================

export const ALL_TEST_ARENAS: Record<string, TestArenaConfig> = {
  simple: ARENA_SIMPLE_NAVIGATION,
  exploration: ARENA_EXPLORATION,
  dead_end: ARENA_DEAD_END,
  narrow_corridor: ARENA_NARROW_CORRIDOR,
};
