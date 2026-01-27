/**
 * Unified Scene Management Module
 *
 * Provides a single source of truth for:
 * - 3D Visualization (Three.js)
 * - Physics (transforms, collision)
 * - Navigation (sensors, rays, path planning)
 *
 * Features:
 * - Quaternion-based rotation (no gimbal lock)
 * - Transform matrices for hierarchical composition
 * - Component-based architecture
 * - React hooks for R3F integration
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

  // Transform utilities
  createTransform,
  cloneTransform,
  composeTransforms,
  transformToMatrix,
  matrixToTransform,

  // Quaternion helpers
  quaternionFromAxisAngle,
  quaternionFromEuler,
  slerpQuaternion,

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
  useSceneUpdate,
  useSyncThreeObject,

  // Context
  SceneManagerProvider,
  useSceneManagerContext,

  // Coordinate conversion
  physicsToThreeJS,
  threeJSToPhysics,

  // Types
  type RobotNodeState,
  type NodeTransform,
} from './use-scene-manager';
