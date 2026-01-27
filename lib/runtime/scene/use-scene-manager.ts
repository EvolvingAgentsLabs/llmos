/**
 * React Hooks for SceneManager Integration
 *
 * Provides hooks to use the unified SceneManager within React Three Fiber components.
 * Handles synchronization between SceneManager state and React rendering.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  SceneManager,
  SceneNode,
  PhysicsComponent,
  SensorComponent,
  NavigationComponent,
  VisualComponent,
  type Transform,
  type RayData,
} from './scene-manager';
import type { CubeRobotState as SimulatorState, FloorMap } from '@/lib/hardware/cube-robot-simulator';
import type { PathExplorationResult } from '@/lib/runtime/navigation/ray-navigation';

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useSceneManager
// Get or create a SceneManager for a device
// ═══════════════════════════════════════════════════════════════════════════

export function useSceneManager(deviceId: string): SceneManager {
  const managerRef = useRef<SceneManager | null>(null);

  if (!managerRef.current) {
    managerRef.current = SceneManager.getInstance(deviceId);
  }

  useEffect(() => {
    return () => {
      // Optionally clean up on unmount
      // SceneManager.clearInstance(deviceId);
    };
  }, [deviceId]);

  return managerRef.current;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useSceneSync
// Synchronize simulator state to SceneManager
// ═══════════════════════════════════════════════════════════════════════════

export function useSceneSync(
  sceneManager: SceneManager,
  robotState: SimulatorState | null,
  floorMap: FloorMap | null,
  rayNavigation: PathExplorationResult | null
): void {
  const initializedRef = useRef(false);

  // Initialize world from floor map (once)
  useEffect(() => {
    if (!floorMap || initializedRef.current) return;

    // Create robot if not exists
    if (!sceneManager.robotNode) {
      sceneManager.createRobot('robot');
    }

    // Create walls
    floorMap.walls.forEach((wall, idx) => {
      const id = `wall-${idx}`;
      if (!sceneManager.getNode(id)) {
        sceneManager.createWall(id, wall.start.x, wall.start.y, wall.end.x, wall.end.y);
      }
    });

    // Create obstacles
    floorMap.obstacles?.forEach((obstacle, idx) => {
      const id = `obstacle-${idx}`;
      if (!sceneManager.getNode(id)) {
        sceneManager.createObstacle(id, obstacle.x, obstacle.y, obstacle.radius);
      }
    });

    // Create collectibles
    floorMap.collectibles?.forEach((collectible) => {
      const id = collectible.id;
      if (!sceneManager.getNode(id)) {
        sceneManager.createCollectible(id, collectible.x, collectible.y, collectible.type);
      }
    });

    initializedRef.current = true;
  }, [floorMap, sceneManager]);

  // Sync robot state each frame
  useEffect(() => {
    if (!robotState) return;

    const robot = sceneManager.robotNode;
    if (!robot) return;

    // Update pose
    sceneManager.updateRobotPose(
      robotState.pose.x,
      robotState.pose.y,
      robotState.pose.rotation
    );

    // Update velocity
    sceneManager.updateRobotVelocity(
      robotState.velocity.linear,
      robotState.velocity.angular
    );

    // Update sensors
    if (robotState.sensors) {
      sceneManager.updateRobotSensors(robotState.sensors.distance);
    }

    // Update physics component
    const physics = robot.getComponent<PhysicsComponent>('physics');
    if (physics && robotState.motors) {
      physics.motors = { ...robotState.motors };
    }

    // Update visual component (LED color)
    const visual = robot.getComponent<VisualComponent>('visual');
    if (visual && robotState.led) {
      visual.color = `rgb(${robotState.led.r}, ${robotState.led.g}, ${robotState.led.b})`;
    }
  }, [robotState, sceneManager]);

  // Sync navigation data
  useEffect(() => {
    if (!rayNavigation) return;

    const rays: RayData[] = rayNavigation.rayFan.rays.map((r) => ({
      angle: r.angle,
      distance: r.distance,
      clear: r.clear,
    }));

    sceneManager.updateNavigationRays(
      rays,
      rayNavigation.rayFan.bestPath?.centerAngle ?? 0,
      rayNavigation.rayFan.bestPath?.clearance ?? 0
    );

    // Update collision prediction
    const robot = sceneManager.robotNode;
    if (robot) {
      const nav = robot.getComponent<NavigationComponent>('navigation');
      if (nav) {
        nav.collisionPredicted = rayNavigation.prediction.collisionPredicted;
        nav.timeToCollision = rayNavigation.prediction.timeToCollision;
        nav.recommendedSteering = { ...rayNavigation.recommendedSteering };
      }
    }
  }, [rayNavigation, sceneManager]);

  // Mark collected items
  useEffect(() => {
    if (!robotState?.collectibles?.collected) return;

    for (const id of robotState.collectibles.collected) {
      const node = sceneManager.getNode(id);
      if (node) {
        node.userData.collected = true;
      }
    }
  }, [robotState?.collectibles?.collected, sceneManager]);
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useRobotNode
// Get robot node with automatic updates
// ═══════════════════════════════════════════════════════════════════════════

export interface RobotNodeState {
  transform: Transform;
  velocity: { linear: number; angular: number };
  motors: { leftPWM: number; rightPWM: number; leftRPM: number; rightRPM: number };
  rays: RayData[];
  bestPathAngle: number;
  collisionPredicted: boolean;
}

export function useRobotNode(sceneManager: SceneManager): RobotNodeState | null {
  const stateRef = useRef<RobotNodeState | null>(null);

  // Update state from scene manager each frame
  useFrame(() => {
    const robot = sceneManager.robotNode;
    if (!robot) {
      stateRef.current = null;
      return;
    }

    const physics = robot.getComponent<PhysicsComponent>('physics');
    const nav = robot.getComponent<NavigationComponent>('navigation');

    stateRef.current = {
      transform: robot.worldTransform,
      velocity: {
        linear: physics?.linearVelocity2D ?? 0,
        angular: physics?.angularVelocity2D ?? 0,
      },
      motors: physics?.motors ?? { leftPWM: 0, rightPWM: 0, leftRPM: 0, rightRPM: 0 },
      rays: nav?.rays ?? [],
      bestPathAngle: nav?.bestPathAngle ?? 0,
      collisionPredicted: nav?.collisionPredicted ?? false,
    };
  });

  return stateRef.current;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useNodeTransform
// Get a node's transform for Three.js components
// ═══════════════════════════════════════════════════════════════════════════

export function useNodeTransform(
  sceneManager: SceneManager,
  nodeId: string
): { position: [number, number, number]; rotation: [number, number, number] } | null {
  const transformRef = useRef<{
    position: [number, number, number];
    rotation: [number, number, number];
  } | null>(null);

  useFrame(() => {
    const node = sceneManager.getNode(nodeId);
    if (!node) {
      transformRef.current = null;
      return;
    }

    const t = node.worldTransform;
    transformRef.current = {
      position: [t.position.x, t.position.y, t.position.z],
      rotation: [t.rotation.x, t.rotation.y, t.rotation.z],
    };
  });

  return transformRef.current;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useSceneNodes
// Get all nodes of a type with transforms
// ═══════════════════════════════════════════════════════════════════════════

export function useSceneNodes(
  sceneManager: SceneManager,
  type: 'obstacle' | 'wall' | 'collectible'
): SceneNode[] {
  return useMemo(() => {
    return sceneManager.getNodesByType(type);
  }, [sceneManager, type]);
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT HELPER: SceneManagerProvider
// Context for sharing SceneManager across components
// ═══════════════════════════════════════════════════════════════════════════

import { createContext, useContext, type ReactNode } from 'react';

const SceneManagerContext = createContext<SceneManager | null>(null);

export function SceneManagerProvider({
  deviceId,
  children,
}: {
  deviceId: string;
  children: ReactNode;
}) {
  const sceneManager = useSceneManager(deviceId);

  return (
    <SceneManagerContext.Provider value={sceneManager}>
      {children}
    </SceneManagerContext.Provider>
  );
}

export function useSceneManagerContext(): SceneManager {
  const context = useContext(SceneManagerContext);
  if (!context) {
    throw new Error('useSceneManagerContext must be used within SceneManagerProvider');
  }
  return context;
}
