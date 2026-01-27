/**
 * Unified Scene Management Module
 *
 * Provides a single source of truth for:
 * - 3D Visualization (Three.js)
 * - Physics (transforms, collision)
 * - Navigation (sensors, rays, path planning)
 *
 * Inspired by OGRE and IGSTK patterns.
 */

export {
  // Core classes
  SceneManager,
  SceneNode,
  SceneSystem,
  NodeComponent,

  // Components
  PhysicsComponent,
  SensorComponent,
  NavigationComponent,
  VisualComponent,

  // Types
  type Transform,
  type Velocity,
  type NodeType,
  type SensorReading,
  type RayData,

  // Helper
  getSceneManager,
} from './scene-manager';

export {
  // React hooks
  useSceneManager,
  useSceneSync,
  useRobotNode,
  useNodeTransform,
  useSceneNodes,

  // Context
  SceneManagerProvider,
  useSceneManagerContext,

  // Types
  type RobotNodeState,
} from './use-scene-manager';
