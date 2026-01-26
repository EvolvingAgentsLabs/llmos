/**
 * Topology Graph for Navigation
 *
 * Provides waypoint-based navigation layer on top of the scene graph:
 * - Waypoint management (rooms, corridors, key points)
 * - Path planning (A*, Dijkstra)
 * - Region/room connectivity
 * - Dynamic obstacle avoidance
 */

import { SceneGraph } from './scene-graph';
import {
  SceneNode,
  Vector3,
  Waypoint,
  Region,
  PathQuery,
  SceneChangeEvent,
} from './types';

// ============================================================================
// Topology Types
// ============================================================================

export interface TopologyConfig {
  /** Minimum distance between waypoints */
  minWaypointSpacing: number;

  /** Maximum distance for automatic waypoint connection */
  maxConnectionDistance: number;

  /** Clearance radius for waypoints (robot size) */
  clearanceRadius: number;

  /** Enable automatic waypoint generation */
  autoGenerate: boolean;

  /** Path planning algorithm */
  pathAlgorithm: 'astar' | 'dijkstra';

  /** Heuristic weight for A* */
  astarWeight: number;
}

export const DEFAULT_TOPOLOGY_CONFIG: TopologyConfig = {
  minWaypointSpacing: 0.3,
  maxConnectionDistance: 1.0,
  clearanceRadius: 0.1,
  autoGenerate: true,
  pathAlgorithm: 'astar',
  astarWeight: 1.0,
};

export interface PathResult {
  /** Path waypoint IDs */
  waypointIds: string[];

  /** Path waypoint positions */
  positions: Vector3[];

  /** Total path length */
  totalLength: number;

  /** Total traversal cost */
  totalCost: number;

  /** Regions traversed */
  regionsTraversed: string[];

  /** Is path complete (reached goal)? */
  isComplete: boolean;

  /** Estimated time to traverse (seconds) */
  estimatedTime?: number;
}

export interface NavigationState {
  /** Current waypoint ID */
  currentWaypointId: string | null;

  /** Target waypoint ID */
  targetWaypointId: string | null;

  /** Current planned path */
  currentPath: PathResult | null;

  /** Progress along path (0-1) */
  pathProgress: number;

  /** Current region ID */
  currentRegionId: string | null;

  /** Navigation status */
  status: 'idle' | 'navigating' | 'blocked' | 'arrived' | 'replanning';
}

// ============================================================================
// Topology Graph Class
// ============================================================================

export class TopologyGraph {
  private sceneGraph: SceneGraph;
  private config: TopologyConfig;
  private waypoints: Map<string, Waypoint> = new Map();
  private regions: Map<string, Region> = new Map();
  private navigationState: NavigationState;

  // Adjacency list for fast pathfinding
  private adjacency: Map<string, Map<string, number>> = new Map();

  constructor(sceneGraph: SceneGraph, config: Partial<TopologyConfig> = {}) {
    this.sceneGraph = sceneGraph;
    this.config = { ...DEFAULT_TOPOLOGY_CONFIG, ...config };
    this.navigationState = {
      currentWaypointId: null,
      targetWaypointId: null,
      currentPath: null,
      pathProgress: 0,
      currentRegionId: null,
      status: 'idle',
    };

    // Listen for scene changes
    this.sceneGraph.addChangeListener(this.handleSceneChange.bind(this));
  }

  // ==========================================================================
  // Waypoint Management
  // ==========================================================================

  /**
   * Add a waypoint to the topology
   */
  addWaypoint(
    position: Vector3,
    label: string,
    options: {
      isKeyPoint?: boolean;
      regionId?: string;
      clearanceRadius?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Waypoint {
    // Add to scene graph
    const node = this.sceneGraph.addNode('waypoint', position, label, {
      category: 'unknown',
      description: `Navigation waypoint: ${label}`,
      attributes: {
        isKeyPoint: options.isKeyPoint ?? false,
        regionId: options.regionId ?? '',
      },
      metadata: options.metadata,
    });

    const waypoint: Waypoint = {
      ...node,
      type: 'waypoint',
      isNavigable: true,
      clearanceRadius: options.clearanceRadius ?? this.config.clearanceRadius,
      connections: new Map(),
      regionId: options.regionId,
      isKeyPoint: options.isKeyPoint ?? false,
    };

    this.waypoints.set(waypoint.id, waypoint);
    this.adjacency.set(waypoint.id, new Map());

    // Auto-connect to nearby waypoints
    this.connectNearbyWaypoints(waypoint);

    // Add to region if specified
    if (options.regionId) {
      const region = this.regions.get(options.regionId);
      if (region) {
        region.entryPoints.push(waypoint.id);
      }
    }

    return waypoint;
  }

  /**
   * Remove a waypoint
   */
  removeWaypoint(id: string): boolean {
    const waypoint = this.waypoints.get(id);
    if (!waypoint) return false;

    // Remove connections
    const connections = this.adjacency.get(id);
    if (connections) {
      for (const [neighborId] of connections) {
        this.adjacency.get(neighborId)?.delete(id);
        this.sceneGraph.findEdge(id, neighborId, 'connected_to');
      }
    }

    this.adjacency.delete(id);
    this.waypoints.delete(id);
    this.sceneGraph.removeNode(id);

    return true;
  }

  /**
   * Get a waypoint by ID
   */
  getWaypoint(id: string): Waypoint | undefined {
    return this.waypoints.get(id);
  }

  /**
   * Get all waypoints
   */
  getAllWaypoints(): Waypoint[] {
    return Array.from(this.waypoints.values());
  }

  /**
   * Find the nearest waypoint to a position
   */
  findNearestWaypoint(position: Vector3): Waypoint | null {
    let nearest: Waypoint | null = null;
    let minDist = Infinity;

    for (const waypoint of this.waypoints.values()) {
      if (!waypoint.isNavigable) continue;

      const dist = this.distance3D(position, waypoint.geometry.pose.position);
      if (dist < minDist) {
        minDist = dist;
        nearest = waypoint;
      }
    }

    return nearest;
  }

  /**
   * Connect two waypoints
   */
  connectWaypoints(id1: string, id2: string, cost?: number): boolean {
    const wp1 = this.waypoints.get(id1);
    const wp2 = this.waypoints.get(id2);

    if (!wp1 || !wp2) return false;

    const dist = this.distance3D(
      wp1.geometry.pose.position,
      wp2.geometry.pose.position
    );
    const actualCost = cost ?? dist;

    // Update adjacency
    this.adjacency.get(id1)?.set(id2, actualCost);
    this.adjacency.get(id2)?.set(id1, actualCost);

    // Update waypoint connections
    wp1.connections.set(id2, actualCost);
    wp2.connections.set(id1, actualCost);

    // Add edge to scene graph
    this.sceneGraph.addEdge(id1, id2, 'connected_to', {
      bidirectional: true,
      distance: dist,
      traversalCost: actualCost,
    });

    return true;
  }

  /**
   * Disconnect two waypoints
   */
  disconnectWaypoints(id1: string, id2: string): boolean {
    const wp1 = this.waypoints.get(id1);
    const wp2 = this.waypoints.get(id2);

    if (!wp1 || !wp2) return false;

    this.adjacency.get(id1)?.delete(id2);
    this.adjacency.get(id2)?.delete(id1);
    wp1.connections.delete(id2);
    wp2.connections.delete(id1);

    // Remove edge from scene graph
    const edge = this.sceneGraph.findEdge(id1, id2, 'connected_to');
    if (edge) {
      this.sceneGraph.removeEdge(edge.id);
    }

    return true;
  }

  /**
   * Auto-connect nearby waypoints
   */
  private connectNearbyWaypoints(waypoint: Waypoint): void {
    for (const other of this.waypoints.values()) {
      if (other.id === waypoint.id) continue;

      const dist = this.distance3D(
        waypoint.geometry.pose.position,
        other.geometry.pose.position
      );

      if (dist <= this.config.maxConnectionDistance) {
        // Check if path is clear (no obstacles)
        if (this.isPathClear(waypoint.geometry.pose.position, other.geometry.pose.position)) {
          this.connectWaypoints(waypoint.id, other.id);
        }
      }
    }
  }

  /**
   * Check if path between two points is clear
   */
  private isPathClear(start: Vector3, end: Vector3): boolean {
    // Get obstacles from scene graph
    const obstacles = this.sceneGraph.getNodesByCategory('obstacle');
    const walls = this.sceneGraph.getNodesByCategory('wall');
    const allObstacles = [...obstacles, ...walls];

    // Simple line-of-sight check
    const steps = 10;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const point: Vector3 = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        z: start.z + (end.z - start.z) * t,
      };

      for (const obstacle of allObstacles) {
        const obstaclePos = obstacle.geometry.pose.position;
        const dist = this.distance2D(point, obstaclePos);
        const bbox = obstacle.geometry.boundingBox;
        const radius = bbox
          ? Math.max(bbox.dimensions.x, bbox.dimensions.z) / 2
          : 0.1;

        if (dist < radius + this.config.clearanceRadius) {
          return false;
        }
      }
    }

    return true;
  }

  // ==========================================================================
  // Region Management
  // ==========================================================================

  /**
   * Add a region to the topology
   */
  addRegion(
    boundary: Vector3[],
    label: string,
    options: {
      isRoom?: boolean;
      metadata?: Record<string, unknown>;
    } = {}
  ): Region {
    const center = this.computeCentroid(boundary);

    const node = this.sceneGraph.addNode(
      options.isRoom ? 'room' : 'region',
      center,
      label,
      {
        category: 'unknown',
        description: `Region: ${label}`,
        metadata: options.metadata,
      }
    );

    const region: Region = {
      ...node,
      type: options.isRoom ? 'room' : 'region',
      boundary,
      entryPoints: [],
      containedObjects: [],
      explorationProgress: 0,
      isMapped: false,
    };

    this.regions.set(region.id, region);

    // Find objects contained in this region
    this.updateRegionContents(region);

    return region;
  }

  /**
   * Get a region by ID
   */
  getRegion(id: string): Region | undefined {
    return this.regions.get(id);
  }

  /**
   * Get all regions
   */
  getAllRegions(): Region[] {
    return Array.from(this.regions.values());
  }

  /**
   * Find which region contains a point
   */
  findRegionContaining(position: Vector3): Region | null {
    for (const region of this.regions.values()) {
      if (this.isPointInPolygon(position, region.boundary)) {
        return region;
      }
    }
    return null;
  }

  /**
   * Update region contents based on current scene
   */
  private updateRegionContents(region: Region): void {
    region.containedObjects = [];

    for (const node of this.sceneGraph.getAllNodes()) {
      if (node.type === 'object' || node.type === 'landmark') {
        if (this.isPointInPolygon(node.geometry.pose.position, region.boundary)) {
          region.containedObjects.push(node.id);

          // Add 'in' relationship
          this.sceneGraph.addEdge(node.id, region.id, 'in', {
            bidirectional: false,
          });
        }
      }
    }
  }

  // ==========================================================================
  // Path Planning
  // ==========================================================================

  /**
   * Find a path between two points or waypoints
   */
  findPath(query: PathQuery): PathResult | null {
    const startWp = typeof query.start === 'string'
      ? this.waypoints.get(query.start)
      : this.findNearestWaypoint(query.start);

    const goalWp = typeof query.goal === 'string'
      ? this.waypoints.get(query.goal)
      : this.findNearestWaypoint(query.goal);

    if (!startWp || !goalWp) {
      return null;
    }

    const path = this.config.pathAlgorithm === 'astar'
      ? this.astar(startWp.id, goalWp.id, query)
      : this.dijkstra(startWp.id, goalWp.id, query);

    return path;
  }

  /**
   * A* pathfinding algorithm
   */
  private astar(startId: string, goalId: string, query: PathQuery): PathResult | null {
    const goalWp = this.waypoints.get(goalId);
    if (!goalWp) return null;

    const openSet = new Set<string>([startId]);
    const cameFrom = new Map<string, string>();

    const gScore = new Map<string, number>();
    gScore.set(startId, 0);

    const fScore = new Map<string, number>();
    fScore.set(startId, this.heuristic(startId, goalId));

    const avoidSet = new Set(query.avoidNodes || []);

    while (openSet.size > 0) {
      // Get node with lowest fScore
      let current: string | null = null;
      let lowestF = Infinity;
      for (const node of openSet) {
        const f = fScore.get(node) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          current = node;
        }
      }

      if (!current) break;

      if (current === goalId) {
        return this.reconstructPath(cameFrom, current, gScore.get(current)!);
      }

      openSet.delete(current);

      const neighbors = this.adjacency.get(current);
      if (!neighbors) continue;

      for (const [neighborId, edgeCost] of neighbors) {
        if (avoidSet.has(neighborId)) continue;

        const tentativeG = (gScore.get(current) ?? Infinity) + edgeCost;

        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, current);
          gScore.set(neighborId, tentativeG);
          fScore.set(
            neighborId,
            tentativeG + this.config.astarWeight * this.heuristic(neighborId, goalId)
          );

          if (!openSet.has(neighborId)) {
            openSet.add(neighborId);
          }
        }
      }
    }

    return null; // No path found
  }

  /**
   * Dijkstra's algorithm
   */
  private dijkstra(startId: string, goalId: string, query: PathQuery): PathResult | null {
    const distances = new Map<string, number>();
    const previous = new Map<string, string>();
    const unvisited = new Set<string>();

    const avoidSet = new Set(query.avoidNodes || []);

    for (const id of this.waypoints.keys()) {
      distances.set(id, id === startId ? 0 : Infinity);
      unvisited.add(id);
    }

    while (unvisited.size > 0) {
      // Get unvisited node with smallest distance
      let current: string | null = null;
      let minDist = Infinity;
      for (const id of unvisited) {
        const dist = distances.get(id) ?? Infinity;
        if (dist < minDist) {
          minDist = dist;
          current = id;
        }
      }

      if (!current || minDist === Infinity) break;
      if (current === goalId) break;

      unvisited.delete(current);

      const neighbors = this.adjacency.get(current);
      if (!neighbors) continue;

      for (const [neighborId, edgeCost] of neighbors) {
        if (!unvisited.has(neighborId)) continue;
        if (avoidSet.has(neighborId)) continue;

        const alt = minDist + edgeCost;
        if (alt < (distances.get(neighborId) ?? Infinity)) {
          distances.set(neighborId, alt);
          previous.set(neighborId, current);
        }
      }
    }

    if (!previous.has(goalId) && startId !== goalId) {
      return null;
    }

    return this.reconstructPath(previous, goalId, distances.get(goalId)!);
  }

  /**
   * Heuristic function for A* (Euclidean distance)
   */
  private heuristic(nodeId: string, goalId: string): number {
    const node = this.waypoints.get(nodeId);
    const goal = this.waypoints.get(goalId);
    if (!node || !goal) return Infinity;

    return this.distance3D(
      node.geometry.pose.position,
      goal.geometry.pose.position
    );
  }

  /**
   * Reconstruct path from search result
   */
  private reconstructPath(
    cameFrom: Map<string, string>,
    current: string,
    totalCost: number
  ): PathResult {
    const waypointIds: string[] = [current];
    const positions: Vector3[] = [];
    const regionsTraversed = new Set<string>();

    while (cameFrom.has(current)) {
      current = cameFrom.get(current)!;
      waypointIds.unshift(current);
    }

    let totalLength = 0;
    let prevPos: Vector3 | null = null;

    for (const id of waypointIds) {
      const wp = this.waypoints.get(id);
      if (wp) {
        positions.push(wp.geometry.pose.position);
        if (wp.regionId) {
          regionsTraversed.add(wp.regionId);
        }
        if (prevPos) {
          totalLength += this.distance3D(prevPos, wp.geometry.pose.position);
        }
        prevPos = wp.geometry.pose.position;
      }
    }

    return {
      waypointIds,
      positions,
      totalLength,
      totalCost,
      regionsTraversed: Array.from(regionsTraversed),
      isComplete: true,
      estimatedTime: totalLength / 0.2, // Assume 0.2 m/s average speed
    };
  }

  // ==========================================================================
  // Navigation State
  // ==========================================================================

  /**
   * Start navigation to a target
   */
  startNavigation(
    currentPosition: Vector3,
    targetId: string | Vector3
  ): PathResult | null {
    const path = this.findPath({
      start: currentPosition,
      goal: targetId,
    });

    if (path) {
      this.navigationState = {
        currentWaypointId: path.waypointIds[0],
        targetWaypointId: path.waypointIds[path.waypointIds.length - 1],
        currentPath: path,
        pathProgress: 0,
        currentRegionId: this.findRegionContaining(currentPosition)?.id || null,
        status: 'navigating',
      };
    }

    return path;
  }

  /**
   * Update navigation progress
   */
  updateNavigationProgress(currentPosition: Vector3): NavigationState {
    if (!this.navigationState.currentPath) {
      return this.navigationState;
    }

    const path = this.navigationState.currentPath;

    // Find closest waypoint on path
    let closestIdx = 0;
    let minDist = Infinity;

    for (let i = 0; i < path.positions.length; i++) {
      const dist = this.distance3D(currentPosition, path.positions[i]);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }

    // Update progress
    this.navigationState.pathProgress = closestIdx / (path.positions.length - 1);
    this.navigationState.currentWaypointId = path.waypointIds[closestIdx];

    // Update current region
    const region = this.findRegionContaining(currentPosition);
    if (region && region.id !== this.navigationState.currentRegionId) {
      this.navigationState.currentRegionId = region.id;
    }

    // Check if arrived
    if (closestIdx === path.positions.length - 1 && minDist < 0.1) {
      this.navigationState.status = 'arrived';
    }

    return this.navigationState;
  }

  /**
   * Get current navigation state
   */
  getNavigationState(): NavigationState {
    return { ...this.navigationState };
  }

  /**
   * Cancel current navigation
   */
  cancelNavigation(): void {
    this.navigationState.status = 'idle';
    this.navigationState.currentPath = null;
    this.navigationState.targetWaypointId = null;
    this.navigationState.pathProgress = 0;
  }

  // ==========================================================================
  // Waypoint Generation
  // ==========================================================================

  /**
   * Generate waypoints from explored grid
   */
  generateWaypointsFromGrid(
    exploredCells: { x: number; z: number }[],
    cellSize: number
  ): Waypoint[] {
    const newWaypoints: Waypoint[] = [];
    const spacing = this.config.minWaypointSpacing;

    // Sample waypoints at regular intervals
    for (const cell of exploredCells) {
      const worldX = cell.x * cellSize;
      const worldZ = cell.z * cellSize;

      // Check if far enough from existing waypoints
      let tooClose = false;
      for (const wp of this.waypoints.values()) {
        const dist = this.distance2D(
          { x: worldX, y: 0, z: worldZ },
          wp.geometry.pose.position
        );
        if (dist < spacing) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        const wp = this.addWaypoint(
          { x: worldX, y: 0, z: worldZ },
          `wp_${Math.round(worldX * 100)}_${Math.round(worldZ * 100)}`,
          { isKeyPoint: false }
        );
        newWaypoints.push(wp);
      }
    }

    return newWaypoints;
  }

  /**
   * Prune redundant waypoints
   */
  pruneWaypoints(): number {
    const toRemove: string[] = [];

    for (const wp of this.waypoints.values()) {
      if (wp.isKeyPoint) continue;

      // Check if waypoint is redundant (has exactly 2 neighbors that can see each other)
      const neighbors = Array.from(wp.connections.keys());
      if (neighbors.length === 2) {
        const wp1 = this.waypoints.get(neighbors[0]);
        const wp2 = this.waypoints.get(neighbors[1]);

        if (
          wp1 &&
          wp2 &&
          this.isPathClear(wp1.geometry.pose.position, wp2.geometry.pose.position)
        ) {
          // This waypoint is redundant
          toRemove.push(wp.id);

          // Connect the neighbors directly
          const cost1 = wp.connections.get(neighbors[0]) ?? 0;
          const cost2 = wp.connections.get(neighbors[1]) ?? 0;
          this.connectWaypoints(neighbors[0], neighbors[1], cost1 + cost2);
        }
      }
    }

    for (const id of toRemove) {
      this.removeWaypoint(id);
    }

    return toRemove.length;
  }

  // ==========================================================================
  // Scene Change Handler
  // ==========================================================================

  private handleSceneChange(event: SceneChangeEvent): void {
    // Handle new obstacles - may need to recompute paths
    if (event.type === 'node_added' || event.type === 'node_moved') {
      const node = event.nodeId ? this.sceneGraph.getNode(event.nodeId) : null;
      if (node && (node.semantics.category === 'obstacle' || node.semantics.category === 'wall')) {
        // Check if any waypoint connections are now blocked
        this.recheckConnections();

        // Replan if currently navigating
        if (this.navigationState.status === 'navigating') {
          this.navigationState.status = 'replanning';
        }
      }
    }

    // Handle obstacle removal - may open new paths
    if (event.type === 'node_removed') {
      if (this.config.autoGenerate) {
        // Try to connect waypoints that may now have clear paths
        this.retryBlockedConnections();
      }
    }
  }

  /**
   * Recheck all waypoint connections for obstacles
   */
  private recheckConnections(): void {
    for (const [wpId, neighbors] of this.adjacency) {
      const wp = this.waypoints.get(wpId);
      if (!wp) continue;

      for (const [neighborId] of neighbors) {
        const neighbor = this.waypoints.get(neighborId);
        if (!neighbor) continue;

        if (!this.isPathClear(wp.geometry.pose.position, neighbor.geometry.pose.position)) {
          this.disconnectWaypoints(wpId, neighborId);
        }
      }
    }
  }

  /**
   * Try to reconnect waypoints that may now have clear paths
   */
  private retryBlockedConnections(): void {
    const waypoints = Array.from(this.waypoints.values());

    for (let i = 0; i < waypoints.length; i++) {
      for (let j = i + 1; j < waypoints.length; j++) {
        const wp1 = waypoints[i];
        const wp2 = waypoints[j];

        const dist = this.distance3D(
          wp1.geometry.pose.position,
          wp2.geometry.pose.position
        );

        if (dist <= this.config.maxConnectionDistance) {
          if (!wp1.connections.has(wp2.id)) {
            if (this.isPathClear(wp1.geometry.pose.position, wp2.geometry.pose.position)) {
              this.connectWaypoints(wp1.id, wp2.id);
            }
          }
        }
      }
    }
  }

  // ==========================================================================
  // Utility Functions
  // ==========================================================================

  private distance3D(a: Vector3, b: Vector3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private distance2D(a: Vector3, b: Vector3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private computeCentroid(points: Vector3[]): Vector3 {
    if (points.length === 0) return { x: 0, y: 0, z: 0 };

    let sumX = 0,
      sumY = 0,
      sumZ = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumZ += p.z;
    }

    return {
      x: sumX / points.length,
      y: sumY / points.length,
      z: sumZ / points.length,
    };
  }

  /**
   * Check if a point is inside a polygon (2D, using x and z)
   */
  private isPointInPolygon(point: Vector3, polygon: Vector3[]): boolean {
    if (polygon.length < 3) return false;

    let inside = false;
    const x = point.x;
    const z = point.z;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const zi = polygon[i].z;
      const xj = polygon[j].x;
      const zj = polygon[j].z;

      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
        inside = !inside;
      }
    }

    return inside;
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  /**
   * Get topology statistics
   */
  getStats(): {
    waypointCount: number;
    regionCount: number;
    connectionCount: number;
    averageConnectivity: number;
  } {
    let totalConnections = 0;
    for (const neighbors of this.adjacency.values()) {
      totalConnections += neighbors.size;
    }
    totalConnections /= 2; // Each connection counted twice

    return {
      waypointCount: this.waypoints.size,
      regionCount: this.regions.size,
      connectionCount: totalConnections,
      averageConnectivity:
        this.waypoints.size > 0 ? (totalConnections * 2) / this.waypoints.size : 0,
    };
  }

  /**
   * Generate ASCII visualization of topology
   */
  toAscii(gridSize: number = 20): string {
    const grid: string[][] = [];
    for (let i = 0; i < gridSize; i++) {
      grid.push(new Array(gridSize).fill('.'));
    }

    // Find bounds
    let minX = Infinity,
      maxX = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;

    for (const wp of this.waypoints.values()) {
      minX = Math.min(minX, wp.geometry.pose.position.x);
      maxX = Math.max(maxX, wp.geometry.pose.position.x);
      minZ = Math.min(minZ, wp.geometry.pose.position.z);
      maxZ = Math.max(maxZ, wp.geometry.pose.position.z);
    }

    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;

    // Place waypoints
    for (const wp of this.waypoints.values()) {
      const gridX = Math.floor(
        ((wp.geometry.pose.position.x - minX) / rangeX) * (gridSize - 1)
      );
      const gridZ = Math.floor(
        ((wp.geometry.pose.position.z - minZ) / rangeZ) * (gridSize - 1)
      );

      if (gridX >= 0 && gridX < gridSize && gridZ >= 0 && gridZ < gridSize) {
        grid[gridZ][gridX] = wp.isKeyPoint ? 'K' : 'W';
      }
    }

    // Draw current path if navigating
    if (this.navigationState.currentPath) {
      for (const pos of this.navigationState.currentPath.positions) {
        const gridX = Math.floor(((pos.x - minX) / rangeX) * (gridSize - 1));
        const gridZ = Math.floor(((pos.z - minZ) / rangeZ) * (gridSize - 1));

        if (gridX >= 0 && gridX < gridSize && gridZ >= 0 && gridZ < gridSize) {
          if (grid[gridZ][gridX] === '.') {
            grid[gridZ][gridX] = '*';
          }
        }
      }
    }

    return grid.map((row) => row.join('')).join('\n');
  }
}
