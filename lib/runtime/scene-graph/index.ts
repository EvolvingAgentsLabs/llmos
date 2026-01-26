/**
 * Scene Graph + Topology Module
 *
 * The internal model representation that agents love for spatial reasoning:
 *
 * Features:
 * - 3D Scene Graph with nodes (objects, rooms, waypoints) and edges (relationships)
 * - Topological Graph for waypoint-based navigation
 * - Semantic Query Engine for language grounding
 * - Change Detection and Event System
 * - LLM Context Generation
 *
 * This module bridges:
 * - Language understanding ("go to the table near the window")
 * - Navigation (reachable waypoints, path planning)
 * - Memory (what changed, object persistence)
 *
 * Basic Usage:
 * ```typescript
 * import { getSceneGraphManager } from '@/lib/runtime/scene-graph';
 *
 * const manager = getSceneGraphManager('robot-1');
 *
 * // Initialize with robot position
 * manager.initialize({ x: 0, y: 0, z: 0 });
 *
 * // Update robot state
 * manager.updateRobotState({
 *   position: { x: 1, y: 0, z: 2 },
 *   rotation: Math.PI / 4,
 *   timestamp: Date.now(),
 * });
 *
 * // Observe objects from sensors
 * manager.observeObject({
 *   id: 'obj-1',
 *   label: 'table',
 *   position: { x: 2, y: 0.4, z: 3 },
 *   category: 'furniture',
 *   confidence: 0.95,
 *   timestamp: Date.now(),
 * });
 *
 * // Natural language query
 * const result = manager.query('find the table near the window');
 *
 * // Navigate to target
 * const path = manager.navigateTo('table');
 *
 * // Get LLM context
 * const context = manager.getStructuredContext();
 * const description = manager.describeScene();
 * ```
 */

// Core Scene Graph
export { SceneGraph } from './scene-graph';

// Topology Graph for Navigation
export { TopologyGraph } from './topology';
export type {
  TopologyConfig,
  PathResult,
  NavigationState,
} from './topology';

// Semantic Query Engine
export { SemanticQueryEngine } from './semantic-query';
export type {
  QueryMatch,
  QueryResult,
  QueryInterpretation,
  EntityReference,
  SpatialRelation,
  AttributeFilter,
} from './semantic-query';

// Scene Graph Manager (Main Entry Point)
export {
  SceneGraphManager,
  getSceneGraphManager,
  removeSceneGraphManager,
  clearAllSceneGraphManagers,
} from './scene-graph-manager';
export type {
  SceneGraphManagerConfig,
  ObjectObservation,
  RobotState,
  SceneContext,
} from './scene-graph-manager';

// Types
export type {
  // Node types
  SceneNode,
  SceneNodeType,
  ObjectCategory,
  Waypoint,
  Region,

  // Edge types
  SceneEdge,
  EdgeRelationType,

  // Geometry types
  Vector3,
  BoundingBox3D,
  Pose,
  GeometryType,
  GeometryReference,

  // Semantic types
  SemanticEmbedding,

  // Time tracking
  TimeStats,

  // Events
  SceneChangeEvent,
  ChangeEventType,
  SceneChangeListener,

  // Queries
  SpatialQuery,
  SemanticQuery,
  PathQuery,

  // Statistics
  SceneGraphStats,

  // Config
  SceneGraphConfig,

  // Serialization
  SerializedSceneGraph,
} from './types';

// Default configs
export { DEFAULT_SCENE_GRAPH_CONFIG } from './types';

// World Model Integration
export {
  createIntegratedWorldModel,
  getIntegratedWorldModel,
  startSync,
  stopSync,
  syncWorldModelToSceneGraph,
  syncSceneGraphToWorldModel,
  getCombinedCognitiveAnalysis,
  queryIntegratedSystem,
  cleanupIntegration,
  cleanupAllIntegrations,
} from './world-model-integration';
export type { WorldModelSceneGraphBridge, IntegrationConfig } from './world-model-integration';
