'use client';

/**
 * React Hooks for SceneManager Integration
 *
 * Provides hooks to use the unified SceneManager within React Three Fiber components.
 * Handles synchronization between SceneManager state and React rendering.
 */

import React, { useEffect, useRef, useMemo, createContext, useContext, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
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
        sceneManager.createWall(id, wall.x1, wall.y1, wall.x2, wall.y2);
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
      visual.setLedRGB(robotState.led.r, robotState.led.g, robotState.led.b);
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

        // Set collision point if predicted
        if (rayNavigation.prediction.collisionPoint) {
          nav.collisionPoint = new THREE.Vector3(
            rayNavigation.prediction.collisionPoint.x,
            0,
            rayNavigation.prediction.collisionPoint.y
          );
        } else {
          nav.collisionPoint = null;
        }
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
// Get robot node state for rendering
// ═══════════════════════════════════════════════════════════════════════════

export interface RobotNodeState {
  // Transform (world space)
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;

  // Derived directions
  forward: THREE.Vector3;
  right: THREE.Vector3;

  // Physics
  linearVelocity: number;
  angularVelocity: number;
  motors: { leftPWM: number; rightPWM: number; leftRPM: number; rightRPM: number };

  // Navigation
  rays: RayData[];
  bestPathAngle: number;
  bestPathDirection: THREE.Vector3;
  collisionPredicted: boolean;
  collisionPoint: THREE.Vector3 | null;
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
    const world = robot.worldTransform;

    stateRef.current = {
      position: world.position.clone(),
      quaternion: world.quaternion.clone(),
      scale: world.scale.clone(),
      forward: robot.getForwardDirection(),
      right: robot.getRightDirection(),
      linearVelocity: physics?.linearVelocity2D ?? 0,
      angularVelocity: physics?.angularVelocity2D ?? 0,
      motors: physics?.motors ?? { leftPWM: 0, rightPWM: 0, leftRPM: 0, rightRPM: 0 },
      rays: nav?.rays ?? [],
      bestPathAngle: nav?.bestPathAngle ?? 0,
      bestPathDirection: nav?.bestPathDirection.clone() ?? new THREE.Vector3(0, 0, 1),
      collisionPredicted: nav?.collisionPredicted ?? false,
      collisionPoint: nav?.collisionPoint?.clone() ?? null,
    };
  });

  return stateRef.current;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useNodeTransform
// Get a node's transform for Three.js components
// ═══════════════════════════════════════════════════════════════════════════

export interface NodeTransform {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  matrix: THREE.Matrix4;
}

export function useNodeTransform(
  sceneManager: SceneManager,
  nodeId: string
): NodeTransform | null {
  const transformRef = useRef<NodeTransform | null>(null);

  useFrame(() => {
    const node = sceneManager.getNode(nodeId);
    if (!node) {
      transformRef.current = null;
      return;
    }

    const t = node.worldTransform;
    transformRef.current = {
      position: [t.position.x, t.position.y, t.position.z],
      quaternion: [t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w],
      scale: [t.scale.x, t.scale.y, t.scale.z],
      matrix: node.worldMatrix.clone(),
    };
  });

  return transformRef.current;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useSceneNodes
// Get all nodes of a type
// ═══════════════════════════════════════════════════════════════════════════

export function useSceneNodes(
  sceneManager: SceneManager,
  type: 'obstacle' | 'wall' | 'collectible' | 'waypoint'
): SceneNode[] {
  return useMemo(() => {
    return sceneManager.getNodesByType(type);
  }, [sceneManager, type]);
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useSceneUpdate
// Trigger scene manager update each frame
// ═══════════════════════════════════════════════════════════════════════════

export function useSceneUpdate(sceneManager: SceneManager): void {
  useFrame((_, delta) => {
    sceneManager.update(delta);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useSyncThreeObject
// Sync a Three.js object to a scene node
// ═══════════════════════════════════════════════════════════════════════════

export function useSyncThreeObject(
  sceneManager: SceneManager,
  nodeId: string,
  threeObject: THREE.Object3D | null
): void {
  useEffect(() => {
    if (!threeObject) return;

    const node = sceneManager.getNode(nodeId);
    if (!node) return;

    const visual = node.getComponent<VisualComponent>('visual');
    if (visual) {
      visual.threeObject = threeObject;
    }

    return () => {
      if (visual) {
        visual.threeObject = null;
      }
    };
  }, [sceneManager, nodeId, threeObject]);

  // Sync transform each frame
  useFrame(() => {
    const node = sceneManager.getNode(nodeId);
    if (!node || !threeObject) return;

    const world = node.worldTransform;
    threeObject.position.copy(world.position);
    threeObject.quaternion.copy(world.quaternion);
    threeObject.scale.copy(world.scale);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT: SceneManagerProvider
// Share SceneManager across components
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: Convert between coordinate systems
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert physics coordinates (X, Y, rotation) to Three.js transform
 * Physics: rotation θ gives forward direction (sin(θ), cos(θ))
 * Three.js: rotation.y = θ gives local +Z → world (sin(θ), 0, cos(θ))
 */
export function physicsToThreeJS(
  x: number,
  y: number,
  rotation: number
): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  return {
    position: new THREE.Vector3(x, 0, y),
    quaternion: new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotation
    ),
  };
}

/**
 * Convert Three.js transform to physics coordinates
 */
export function threeJSToPhysics(
  position: THREE.Vector3,
  quaternion: THREE.Quaternion
): { x: number; y: number; rotation: number } {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
  return {
    x: position.x,
    y: position.z,
    rotation: euler.y,
  };
}
