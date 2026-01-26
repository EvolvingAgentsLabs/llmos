/**
 * Scene Graph Manager
 *
 * Unified interface that:
 * - Integrates with the existing WorldModel (occupancy grid)
 * - Manages the scene graph and topology
 * - Provides change detection and event emission
 * - Generates LLM-friendly context for spatial reasoning
 */

import { SceneGraph } from './scene-graph';
import { TopologyGraph, PathResult } from './topology';
import { SemanticQueryEngine, QueryResult } from './semantic-query';
import {
  SceneNode,
  SceneChangeEvent,
  Vector3,
  ObjectCategory,
  SceneGraphConfig,
  DEFAULT_SCENE_GRAPH_CONFIG,
  SceneGraphStats,
  SerializedSceneGraph,
} from './types';

// ============================================================================
// Manager Types
// ============================================================================

export interface SceneGraphManagerConfig extends SceneGraphConfig {
  /** Device ID for world model integration */
  deviceId?: string;

  /** Sync interval with world model (ms) */
  worldModelSyncInterval: number;

  /** Enable automatic object tracking */
  enableObjectTracking: boolean;

  /** Minimum observation confidence to add to graph */
  minObservationConfidence: number;
}

export const DEFAULT_MANAGER_CONFIG: SceneGraphManagerConfig = {
  ...DEFAULT_SCENE_GRAPH_CONFIG,
  deviceId: 'default',
  worldModelSyncInterval: 500,
  enableObjectTracking: true,
  minObservationConfidence: 0.5,
};

export interface ObjectObservation {
  /** Object ID (from detection) */
  id: string;

  /** Object label/class */
  label: string;

  /** Position in world coordinates */
  position: Vector3;

  /** Bounding box dimensions */
  dimensions?: Vector3;

  /** Object category */
  category: ObjectCategory;

  /** Detection confidence */
  confidence: number;

  /** Timestamp */
  timestamp: number;

  /** Additional attributes */
  attributes?: Record<string, string | number | boolean>;
}

export interface RobotState {
  /** Robot position */
  position: Vector3;

  /** Robot rotation (yaw in radians) */
  rotation: number;

  /** Current velocity */
  velocity?: Vector3;

  /** Timestamp */
  timestamp: number;
}

export interface SceneContext {
  /** Robot state */
  robot: RobotState;

  /** Nearby objects */
  nearbyObjects: SceneNode[];

  /** Current region */
  currentRegion: string | null;

  /** Visible objects */
  visibleObjects: SceneNode[];

  /** Recent changes */
  recentChanges: SceneChangeEvent[];

  /** Navigation state */
  navigation: {
    isNavigating: boolean;
    targetLabel: string | null;
    pathLength: number | null;
    estimatedTime: number | null;
  };

  /** Statistics */
  stats: SceneGraphStats;
}

// ============================================================================
// Scene Graph Manager
// ============================================================================

export class SceneGraphManager {
  private sceneGraph: SceneGraph;
  private topology: TopologyGraph;
  private queryEngine: SemanticQueryEngine;
  private config: SceneGraphManagerConfig;

  private robotNodeId: string | null = null;
  private robotState: RobotState | null = null;
  private objectNodes: Map<string, string> = new Map(); // observation id -> node id

  private changeListeners: Set<(event: SceneChangeEvent) => void> = new Set();
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<SceneGraphManagerConfig> = {}) {
    this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };
    this.sceneGraph = new SceneGraph(this.config);
    this.topology = new TopologyGraph(this.sceneGraph, {
      minWaypointSpacing: this.config.waypointSpacing,
      autoGenerate: this.config.autoGenerateWaypoints,
    });
    this.queryEngine = new SemanticQueryEngine(this.sceneGraph, this.topology);

    // Forward scene graph changes
    this.sceneGraph.addChangeListener((event) => {
      for (const listener of this.changeListeners) {
        listener(event);
      }
    });
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the scene graph with robot starting position
   */
  initialize(robotPosition: Vector3, robotRotation: number = 0): void {
    // Create robot node
    const robotNode = this.sceneGraph.addNode('robot', robotPosition, 'robot', {
      category: 'unknown',
      description: 'The robot agent',
      attributes: {
        rotation: robotRotation,
      },
    });

    this.robotNodeId = robotNode.id;
    this.robotState = {
      position: robotPosition,
      rotation: robotRotation,
      timestamp: Date.now(),
    };

    // Add initial waypoint at robot position
    this.topology.addWaypoint(robotPosition, 'start', {
      isKeyPoint: true,
    });
  }

  /**
   * Start automatic update loop
   */
  startUpdates(): void {
    if (this.updateInterval) return;

    this.updateInterval = setInterval(() => {
      this.sceneGraph.decayConfidence();
    }, this.config.worldModelSyncInterval);
  }

  /**
   * Stop automatic updates
   */
  stopUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // ==========================================================================
  // Robot State Management
  // ==========================================================================

  /**
   * Update robot position and state
   */
  updateRobotState(state: RobotState): void {
    this.robotState = state;

    if (this.robotNodeId) {
      this.sceneGraph.updateNode(this.robotNodeId, {
        position: state.position,
        attributes: {
          rotation: state.rotation,
          velocityX: state.velocity?.x ?? 0,
          velocityZ: state.velocity?.z ?? 0,
        },
      });
    }

    // Update navigation progress
    this.topology.updateNavigationProgress(state.position);

    // Auto-generate waypoint if enabled
    if (this.config.autoGenerateWaypoints) {
      this.maybeAddWaypoint(state.position);
    }
  }

  /**
   * Get current robot state
   */
  getRobotState(): RobotState | null {
    return this.robotState;
  }

  /**
   * Maybe add a new waypoint if far enough from existing ones
   */
  private maybeAddWaypoint(position: Vector3): void {
    const nearest = this.topology.findNearestWaypoint(position);
    if (!nearest) {
      this.topology.addWaypoint(position, `wp_auto_${Date.now()}`, {
        isKeyPoint: false,
      });
      return;
    }

    const dist = this.distance3D(position, nearest.geometry.pose.position);
    if (dist >= this.config.waypointSpacing) {
      this.topology.addWaypoint(position, `wp_auto_${Date.now()}`, {
        isKeyPoint: false,
      });
    }
  }

  // ==========================================================================
  // Object Observation
  // ==========================================================================

  /**
   * Process an object observation from sensors
   */
  observeObject(observation: ObjectObservation): SceneNode {
    const existingNodeId = this.objectNodes.get(observation.id);

    if (existingNodeId) {
      // Update existing object
      const updated = this.sceneGraph.updateNode(existingNodeId, {
        position: observation.position,
        attributes: {
          ...observation.attributes,
          confidence: observation.confidence,
        },
      });

      return updated || this.sceneGraph.getNode(existingNodeId)!;
    }

    // Add new object
    const node = this.sceneGraph.addNode(
      'object',
      observation.position,
      observation.label,
      {
        category: observation.category,
        dimensions: observation.dimensions,
        attributes: {
          ...observation.attributes,
          detectionId: observation.id,
          confidence: observation.confidence,
        },
      }
    );

    this.objectNodes.set(observation.id, node.id);

    // Infer relationships
    this.sceneGraph.inferRelationships();

    return node;
  }

  /**
   * Process multiple observations at once
   */
  observeObjects(observations: ObjectObservation[]): SceneNode[] {
    const nodes: SceneNode[] = [];

    for (const obs of observations) {
      if (obs.confidence >= this.config.minObservationConfidence) {
        nodes.push(this.observeObject(obs));
      }
    }

    // Infer relationships after all observations
    this.sceneGraph.inferRelationships();

    return nodes;
  }

  /**
   * Mark an object as collected/removed
   */
  removeObject(observationId: string): boolean {
    const nodeId = this.objectNodes.get(observationId);
    if (!nodeId) return false;

    this.sceneGraph.removeNode(nodeId);
    this.objectNodes.delete(observationId);

    return true;
  }

  // ==========================================================================
  // Region Management
  // ==========================================================================

  /**
   * Define a region in the scene
   */
  addRegion(
    boundary: Vector3[],
    label: string,
    isRoom: boolean = false
  ): string {
    const region = this.topology.addRegion(boundary, label, { isRoom });
    return region.id;
  }

  /**
   * Get the region containing the robot
   */
  getCurrentRegion(): string | null {
    if (!this.robotState) return null;
    const region = this.topology.findRegionContaining(this.robotState.position);
    return region?.id || null;
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Natural language query
   */
  query(naturalLanguageQuery: string): QueryResult {
    return this.queryEngine.query(naturalLanguageQuery);
  }

  /**
   * Find objects by label
   */
  findByLabel(label: string): SceneNode[] {
    return this.sceneGraph.findNodesByLabel(label);
  }

  /**
   * Find nearby objects
   */
  findNearby(
    radius: number = 1.0,
    category?: ObjectCategory
  ): SceneNode[] {
    if (!this.robotState) return [];

    return this.sceneGraph.findNodesInRadius({
      center: this.robotState.position,
      radius,
      categories: category ? [category] : undefined,
    });
  }

  /**
   * Get objects visible to the robot
   */
  getVisibleObjects(maxDistance: number = 2.0): SceneNode[] {
    if (!this.robotState) return [];

    const nearby = this.findNearby(maxDistance);

    // Filter by field of view (simple cone check)
    const robotYaw = this.robotState.rotation;
    const fovAngle = Math.PI / 3; // 60 degree FOV

    return nearby.filter((node) => {
      if (node.id === this.robotNodeId) return false;

      const dx = node.geometry.pose.position.x - this.robotState!.position.x;
      const dz = node.geometry.pose.position.z - this.robotState!.position.z;
      const angleToObject = Math.atan2(dx, dz);

      let angleDiff = angleToObject - robotYaw;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

      return Math.abs(angleDiff) <= fovAngle / 2;
    });
  }

  // ==========================================================================
  // Navigation
  // ==========================================================================

  /**
   * Navigate to a target (by label or position)
   */
  navigateTo(target: string | Vector3): PathResult | null {
    if (!this.robotState) return null;

    if (typeof target === 'string') {
      // Find target by label
      const matches = this.findByLabel(target);
      if (matches.length === 0) {
        // Try semantic query
        const result = this.query(`go to ${target}`);
        if (result.matches.length === 0) return null;
        target = result.matches[0].node.geometry.pose.position;
      } else {
        target = matches[0].geometry.pose.position;
      }
    }

    return this.topology.startNavigation(this.robotState.position, target);
  }

  /**
   * Get navigation state
   */
  getNavigationState() {
    return this.topology.getNavigationState();
  }

  /**
   * Cancel current navigation
   */
  cancelNavigation(): void {
    this.topology.cancelNavigation();
  }

  /**
   * Get next waypoint to navigate to
   */
  getNextWaypoint(): Vector3 | null {
    const navState = this.topology.getNavigationState();
    if (!navState.currentPath || navState.status !== 'navigating') {
      return null;
    }

    const currentIndex = navState.currentPath.waypointIds.indexOf(
      navState.currentWaypointId || ''
    );

    if (currentIndex < 0 || currentIndex >= navState.currentPath.positions.length - 1) {
      return null;
    }

    return navState.currentPath.positions[currentIndex + 1];
  }

  // ==========================================================================
  // Context Generation for LLM
  // ==========================================================================

  /**
   * Generate scene context for LLM reasoning
   */
  getSceneContext(): SceneContext {
    const nearbyObjects = this.findNearby(2.0);
    const visibleObjects = this.getVisibleObjects();
    const recentChanges = this.sceneGraph.getChangeHistory(Date.now() - 10000);
    const navState = this.topology.getNavigationState();

    let targetLabel: string | null = null;
    if (navState.targetWaypointId) {
      const targetWp = this.topology.getWaypoint(navState.targetWaypointId);
      targetLabel = targetWp?.semantics.label || null;
    }

    return {
      robot: this.robotState || {
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        timestamp: Date.now(),
      },
      nearbyObjects,
      currentRegion: this.getCurrentRegion(),
      visibleObjects,
      recentChanges,
      navigation: {
        isNavigating: navState.status === 'navigating',
        targetLabel,
        pathLength: navState.currentPath?.totalLength || null,
        estimatedTime: navState.currentPath?.estimatedTime || null,
      },
      stats: this.sceneGraph.getStats(),
    };
  }

  /**
   * Generate natural language description of scene
   */
  describeScene(): string {
    const ctx = this.getSceneContext();
    const lines: string[] = [];

    // Robot position
    const pos = ctx.robot.position;
    lines.push(
      `Robot at (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)}), heading ${this.radToDeg(ctx.robot.rotation).toFixed(0)}°`
    );

    // Current region
    if (ctx.currentRegion) {
      const region = this.topology.getRegion(ctx.currentRegion);
      if (region) {
        lines.push(`Currently in: ${region.semantics.label}`);
      }
    }

    // Visible objects
    if (ctx.visibleObjects.length > 0) {
      const objectList = ctx.visibleObjects
        .slice(0, 5)
        .map((o) => {
          const dist = this.distance3D(o.geometry.pose.position, ctx.robot.position);
          return `${o.semantics.label} (${dist.toFixed(2)}m)`;
        })
        .join(', ');
      lines.push(`Visible: ${objectList}`);
    } else {
      lines.push('No objects visible');
    }

    // Navigation status
    if (ctx.navigation.isNavigating) {
      lines.push(
        `Navigating to: ${ctx.navigation.targetLabel || 'target'} (${ctx.navigation.pathLength?.toFixed(2) || '?'}m remaining)`
      );
    }

    // Recent changes
    if (ctx.recentChanges.length > 0) {
      const change = ctx.recentChanges[ctx.recentChanges.length - 1];
      lines.push(`Recent: ${change.description}`);
    }

    return lines.join('\n');
  }

  /**
   * Generate structured JSON context for LLM
   */
  getStructuredContext(): object {
    const ctx = this.getSceneContext();

    return {
      robot: {
        position: {
          x: ctx.robot.position.x.toFixed(3),
          z: ctx.robot.position.z.toFixed(3),
        },
        heading_deg: this.radToDeg(ctx.robot.rotation).toFixed(1),
      },
      region: ctx.currentRegion || 'unknown',
      visible_objects: ctx.visibleObjects.map((o) => ({
        label: o.semantics.label,
        category: o.semantics.category,
        distance: this.distance3D(o.geometry.pose.position, ctx.robot.position).toFixed(2),
        direction: this.getDirection(ctx.robot, o.geometry.pose.position),
      })),
      nearby_objects: ctx.nearbyObjects
        .filter((o) => o.id !== this.robotNodeId)
        .map((o) => ({
          label: o.semantics.label,
          category: o.semantics.category,
          position: {
            x: o.geometry.pose.position.x.toFixed(2),
            z: o.geometry.pose.position.z.toFixed(2),
          },
        })),
      navigation: ctx.navigation.isNavigating
        ? {
            target: ctx.navigation.targetLabel,
            remaining_distance: ctx.navigation.pathLength?.toFixed(2),
            estimated_time_sec: ctx.navigation.estimatedTime?.toFixed(0),
          }
        : null,
      stats: {
        total_objects: ctx.stats.objectCount,
        total_waypoints: ctx.stats.waypointCount,
        exploration_progress: (ctx.stats.explorationProgress * 100).toFixed(1) + '%',
      },
    };
  }

  /**
   * Get direction to a point (for LLM context)
   */
  private getDirection(robot: RobotState, target: Vector3): string {
    const dx = target.x - robot.position.x;
    const dz = target.z - robot.position.z;
    const angleToTarget = Math.atan2(dx, dz);

    let angleDiff = angleToTarget - robot.rotation;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    const degDiff = this.radToDeg(angleDiff);

    if (Math.abs(degDiff) < 15) return 'ahead';
    if (degDiff > 0 && degDiff < 60) return 'front-right';
    if (degDiff >= 60 && degDiff < 120) return 'right';
    if (degDiff >= 120) return 'behind-right';
    if (degDiff < 0 && degDiff > -60) return 'front-left';
    if (degDiff <= -60 && degDiff > -120) return 'left';
    return 'behind-left';
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================

  /**
   * Add a change listener
   */
  addChangeListener(listener: (event: SceneChangeEvent) => void): void {
    this.changeListeners.add(listener);
  }

  /**
   * Remove a change listener
   */
  removeChangeListener(listener: (event: SceneChangeEvent) => void): void {
    this.changeListeners.delete(listener);
  }

  // ==========================================================================
  // Statistics and Debug
  // ==========================================================================

  /**
   * Get scene graph statistics
   */
  getStats(): SceneGraphStats {
    return this.sceneGraph.getStats();
  }

  /**
   * Get topology statistics
   */
  getTopologyStats() {
    return this.topology.getStats();
  }

  /**
   * Get ASCII visualization
   */
  toAscii(): string {
    return this.topology.toAscii();
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  /**
   * Serialize the scene graph
   */
  serialize(): SerializedSceneGraph {
    return this.sceneGraph.serialize();
  }

  /**
   * Deserialize and restore
   */
  deserialize(data: SerializedSceneGraph): void {
    this.sceneGraph.deserialize(data);

    // Rebuild object tracking
    this.objectNodes.clear();
    for (const node of this.sceneGraph.getAllNodes()) {
      if (node.type === 'object') {
        const detectionId = node.metadata.detectionId as string;
        if (detectionId) {
          this.objectNodes.set(detectionId, node.id);
        }
      }
      if (node.type === 'robot') {
        this.robotNodeId = node.id;
      }
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.sceneGraph.clear();
    this.objectNodes.clear();
    this.robotNodeId = null;
    this.robotState = null;
  }

  // ==========================================================================
  // Direct Access (for advanced usage)
  // ==========================================================================

  /**
   * Get the underlying scene graph
   */
  getSceneGraph(): SceneGraph {
    return this.sceneGraph;
  }

  /**
   * Get the topology graph
   */
  getTopology(): TopologyGraph {
    return this.topology;
  }

  /**
   * Get the query engine
   */
  getQueryEngine(): SemanticQueryEngine {
    return this.queryEngine;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private distance3D(a: Vector3, b: Vector3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private radToDeg(rad: number): number {
    return (rad * 180) / Math.PI;
  }
}

// ============================================================================
// Singleton Instance Management
// ============================================================================

const managers: Map<string, SceneGraphManager> = new Map();

/**
 * Get or create a scene graph manager for a device
 */
export function getSceneGraphManager(
  deviceId: string = 'default',
  config?: Partial<SceneGraphManagerConfig>
): SceneGraphManager {
  let manager = managers.get(deviceId);

  if (!manager) {
    manager = new SceneGraphManager({
      ...config,
      deviceId,
    });
    managers.set(deviceId, manager);
  }

  return manager;
}

/**
 * Remove a scene graph manager
 */
export function removeSceneGraphManager(deviceId: string): void {
  const manager = managers.get(deviceId);
  if (manager) {
    manager.stopUpdates();
    manager.clear();
    managers.delete(deviceId);
  }
}

/**
 * Clear all managers
 */
export function clearAllSceneGraphManagers(): void {
  for (const [deviceId] of managers) {
    removeSceneGraphManager(deviceId);
  }
}
