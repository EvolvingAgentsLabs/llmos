/**
 * Core Scene Graph Implementation
 *
 * A 3D scene graph for robot spatial reasoning:
 * - Manages nodes (objects, rooms, waypoints)
 * - Manages edges (relationships)
 * - Provides spatial queries
 * - Tracks changes over time
 */

import {
  SceneNode,
  SceneEdge,
  SceneNodeType,
  EdgeRelationType,
  ObjectCategory,
  Vector3,
  BoundingBox3D,
  Pose,
  GeometryReference,
  SemanticEmbedding,
  TimeStats,
  SceneChangeEvent,
  ChangeEventType,
  SceneChangeListener,
  SpatialQuery,
  SceneGraphStats,
  SceneGraphConfig,
  DEFAULT_SCENE_GRAPH_CONFIG,
  SerializedSceneGraph,
} from './types';

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function distance3D(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function distance2D(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function createBoundingBox(center: Vector3, dimensions: Vector3): BoundingBox3D {
  return {
    center,
    dimensions,
    min: {
      x: center.x - dimensions.x / 2,
      y: center.y - dimensions.y / 2,
      z: center.z - dimensions.z / 2,
    },
    max: {
      x: center.x + dimensions.x / 2,
      y: center.y + dimensions.y / 2,
      z: center.z + dimensions.z / 2,
    },
  };
}

function createTimeStats(): TimeStats {
  const now = Date.now();
  return {
    firstSeen: now,
    lastSeen: now,
    observationCount: 1,
    stability: 1.0,
    isStatic: true,
    averageObservationInterval: 0,
    confidence: 1.0,
  };
}

function updateTimeStats(stats: TimeStats, hasMoved: boolean): TimeStats {
  const now = Date.now();
  const interval = now - stats.lastSeen;
  const newObservationCount = stats.observationCount + 1;

  // Update average interval using running average
  const newAverageInterval =
    (stats.averageObservationInterval * stats.observationCount + interval) /
    newObservationCount;

  // Update stability based on movement
  const stabilityDecay = hasMoved ? 0.2 : 0;
  const stabilityRecovery = hasMoved ? 0 : 0.05;
  const newStability = Math.max(
    0,
    Math.min(1, stats.stability - stabilityDecay + stabilityRecovery)
  );

  return {
    ...stats,
    lastSeen: now,
    observationCount: newObservationCount,
    averageObservationInterval: newAverageInterval,
    stability: newStability,
    isStatic: newStability > 0.8,
    lastPositionChange: hasMoved ? now : stats.lastPositionChange,
    confidence: Math.min(1, (newStability + 0.5) * (1 - interval / 60000)),
  };
}

// ============================================================================
// Scene Graph Class
// ============================================================================

export class SceneGraph {
  private nodes: Map<string, SceneNode> = new Map();
  private edges: Map<string, SceneEdge> = new Map();
  private config: SceneGraphConfig;
  private changeListeners: Set<SceneChangeListener> = new Set();
  private changeHistory: SceneChangeEvent[] = [];

  // Spatial index (simple grid-based)
  private spatialIndex: Map<string, Set<string>> = new Map();
  private spatialCellSize: number = 0.5; // meters

  // Edge indices for fast lookup
  private edgesBySource: Map<string, Set<string>> = new Map();
  private edgesByTarget: Map<string, Set<string>> = new Map();
  private edgesByRelation: Map<EdgeRelationType, Set<string>> = new Map();

  constructor(config: Partial<SceneGraphConfig> = {}) {
    this.config = { ...DEFAULT_SCENE_GRAPH_CONFIG, ...config };
  }

  // ==========================================================================
  // Node Management
  // ==========================================================================

  /**
   * Add a new node to the scene graph
   */
  addNode(
    type: SceneNodeType,
    position: Vector3,
    label: string,
    options: {
      category?: ObjectCategory;
      dimensions?: Vector3;
      description?: string;
      attributes?: Record<string, string | number | boolean>;
      affordances?: string[];
      parentId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): SceneNode {
    const id = generateId();
    const now = Date.now();

    const dimensions = options.dimensions || { x: 0.1, y: 0.1, z: 0.1 };

    const node: SceneNode = {
      id,
      type,
      geometry: {
        type: 'bbox',
        pose: {
          position,
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        boundingBox: createBoundingBox(position, dimensions),
      },
      semantics: {
        label,
        aliases: [],
        category: options.category || 'unknown',
        description: options.description,
        attributes: options.attributes || {},
        affordances: options.affordances || [],
      },
      timeStats: createTimeStats(),
      isActive: true,
      parentId: options.parentId,
      childIds: [],
      metadata: options.metadata || {},
    };

    this.nodes.set(id, node);
    this.updateSpatialIndex(node);

    // Update parent's children list
    if (options.parentId) {
      const parent = this.nodes.get(options.parentId);
      if (parent) {
        parent.childIds.push(id);
      }
    }

    this.emitChange({
      type: 'node_added',
      timestamp: now,
      nodeId: id,
      newState: node,
      magnitude: 1.0,
      description: `Added ${type} "${label}" at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`,
      relatedNodeIds: options.parentId ? [options.parentId] : [],
    });

    return node;
  }

  /**
   * Update an existing node
   */
  updateNode(
    id: string,
    updates: {
      position?: Vector3;
      rotation?: Vector3;
      label?: string;
      attributes?: Record<string, string | number | boolean>;
      isActive?: boolean;
      metadata?: Record<string, unknown>;
    }
  ): SceneNode | null {
    const node = this.nodes.get(id);
    if (!node) return null;

    const previousState = { ...node };
    let hasMoved = false;

    if (updates.position) {
      const oldPos = node.geometry.pose.position;
      const dist = distance3D(oldPos, updates.position);
      hasMoved = dist > 0.01; // 1cm threshold

      node.geometry.pose.position = updates.position;
      if (node.geometry.boundingBox) {
        const dims = node.geometry.boundingBox.dimensions;
        node.geometry.boundingBox = createBoundingBox(updates.position, dims);
      }

      // Update spatial index
      this.removeSpatialIndex(node);
      this.updateSpatialIndex(node);
    }

    if (updates.rotation) {
      node.geometry.pose.rotation = updates.rotation;
    }

    if (updates.label) {
      node.semantics.label = updates.label;
    }

    if (updates.attributes) {
      node.semantics.attributes = {
        ...node.semantics.attributes,
        ...updates.attributes,
      };
    }

    if (updates.isActive !== undefined) {
      node.isActive = updates.isActive;
    }

    if (updates.metadata) {
      node.metadata = { ...node.metadata, ...updates.metadata };
    }

    // Update time stats
    node.timeStats = updateTimeStats(node.timeStats, hasMoved);

    const changeType: ChangeEventType = hasMoved ? 'node_moved' : 'node_updated';
    this.emitChange({
      type: changeType,
      timestamp: Date.now(),
      nodeId: id,
      previousState,
      newState: node,
      magnitude: hasMoved ? distance3D(previousState.geometry.pose.position, updates.position!) : 0.5,
      description: hasMoved
        ? `Moved "${node.semantics.label}" to new position`
        : `Updated "${node.semantics.label}"`,
      relatedNodeIds: [],
    });

    return node;
  }

  /**
   * Remove a node from the scene graph
   */
  removeNode(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Remove from parent's children
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((cid) => cid !== id);
      }
    }

    // Remove all children recursively
    for (const childId of node.childIds) {
      this.removeNode(childId);
    }

    // Remove all edges involving this node
    const edgesToRemove = [
      ...Array.from(this.edgesBySource.get(id) || []),
      ...Array.from(this.edgesByTarget.get(id) || []),
    ];
    for (const edgeId of edgesToRemove) {
      this.removeEdge(edgeId);
    }

    // Remove from spatial index
    this.removeSpatialIndex(node);

    // Remove the node
    this.nodes.delete(id);

    this.emitChange({
      type: 'node_removed',
      timestamp: Date.now(),
      nodeId: id,
      previousState: node,
      magnitude: 1.0,
      description: `Removed ${node.type} "${node.semantics.label}"`,
      relatedNodeIds: node.childIds,
    });

    return true;
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): SceneNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): SceneNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get nodes by type
   */
  getNodesByType(type: SceneNodeType): SceneNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.type === type);
  }

  /**
   * Get nodes by category
   */
  getNodesByCategory(category: ObjectCategory): SceneNode[] {
    return Array.from(this.nodes.values()).filter(
      (n) => n.semantics.category === category
    );
  }

  // ==========================================================================
  // Edge Management
  // ==========================================================================

  /**
   * Add an edge (relationship) between two nodes
   */
  addEdge(
    sourceId: string,
    targetId: string,
    relation: EdgeRelationType,
    options: {
      weight?: number;
      bidirectional?: boolean;
      distance?: number;
      traversalCost?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): SceneEdge | null {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);

    if (!source || !target) return null;

    // Check for existing edge
    const existingEdge = this.findEdge(sourceId, targetId, relation);
    if (existingEdge) {
      // Update existing edge instead
      return this.updateEdge(existingEdge.id, {
        weight: options.weight,
        lastVerified: Date.now(),
      });
    }

    const id = generateId();
    const now = Date.now();

    // Calculate distance if not provided
    const dist =
      options.distance ??
      distance3D(source.geometry.pose.position, target.geometry.pose.position);

    const edge: SceneEdge = {
      id,
      sourceId,
      targetId,
      relation,
      weight: options.weight ?? 1.0,
      bidirectional: options.bidirectional ?? this.isSymmetricRelation(relation),
      distance: dist,
      traversalCost: options.traversalCost ?? dist,
      createdAt: now,
      lastVerified: now,
      confidence: 1.0,
      metadata: options.metadata || {},
    };

    this.edges.set(id, edge);

    // Update indices
    if (!this.edgesBySource.has(sourceId)) {
      this.edgesBySource.set(sourceId, new Set());
    }
    this.edgesBySource.get(sourceId)!.add(id);

    if (!this.edgesByTarget.has(targetId)) {
      this.edgesByTarget.set(targetId, new Set());
    }
    this.edgesByTarget.get(targetId)!.add(id);

    if (!this.edgesByRelation.has(relation)) {
      this.edgesByRelation.set(relation, new Set());
    }
    this.edgesByRelation.get(relation)!.add(id);

    this.emitChange({
      type: 'edge_added',
      timestamp: now,
      edgeId: id,
      newState: edge,
      magnitude: 0.5,
      description: `Added "${relation}" relationship: "${source.semantics.label}" → "${target.semantics.label}"`,
      relatedNodeIds: [sourceId, targetId],
    });

    return edge;
  }

  /**
   * Update an existing edge
   */
  updateEdge(
    id: string,
    updates: {
      weight?: number;
      traversalCost?: number;
      lastVerified?: number;
      confidence?: number;
      metadata?: Record<string, unknown>;
    }
  ): SceneEdge | null {
    const edge = this.edges.get(id);
    if (!edge) return null;

    const previousState = { ...edge };

    if (updates.weight !== undefined) edge.weight = updates.weight;
    if (updates.traversalCost !== undefined) edge.traversalCost = updates.traversalCost;
    if (updates.lastVerified !== undefined) edge.lastVerified = updates.lastVerified;
    if (updates.confidence !== undefined) edge.confidence = updates.confidence;
    if (updates.metadata) edge.metadata = { ...edge.metadata, ...updates.metadata };

    this.emitChange({
      type: 'edge_updated',
      timestamp: Date.now(),
      edgeId: id,
      previousState,
      newState: edge,
      magnitude: 0.3,
      description: `Updated "${edge.relation}" relationship`,
      relatedNodeIds: [edge.sourceId, edge.targetId],
    });

    return edge;
  }

  /**
   * Remove an edge
   */
  removeEdge(id: string): boolean {
    const edge = this.edges.get(id);
    if (!edge) return false;

    // Remove from indices
    this.edgesBySource.get(edge.sourceId)?.delete(id);
    this.edgesByTarget.get(edge.targetId)?.delete(id);
    this.edgesByRelation.get(edge.relation)?.delete(id);

    this.edges.delete(id);

    this.emitChange({
      type: 'edge_removed',
      timestamp: Date.now(),
      edgeId: id,
      previousState: edge,
      magnitude: 0.5,
      description: `Removed "${edge.relation}" relationship`,
      relatedNodeIds: [edge.sourceId, edge.targetId],
    });

    return true;
  }

  /**
   * Get an edge by ID
   */
  getEdge(id: string): SceneEdge | undefined {
    return this.edges.get(id);
  }

  /**
   * Get all edges
   */
  getAllEdges(): SceneEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Find a specific edge between nodes
   */
  findEdge(
    sourceId: string,
    targetId: string,
    relation?: EdgeRelationType
  ): SceneEdge | undefined {
    const sourceEdges = this.edgesBySource.get(sourceId);
    if (!sourceEdges) return undefined;

    for (const edgeId of sourceEdges) {
      const edge = this.edges.get(edgeId);
      if (edge && edge.targetId === targetId) {
        if (!relation || edge.relation === relation) {
          return edge;
        }
      }
    }

    return undefined;
  }

  /**
   * Get all edges from a node
   */
  getEdgesFrom(nodeId: string): SceneEdge[] {
    const edgeIds = this.edgesBySource.get(nodeId) || new Set();
    return Array.from(edgeIds)
      .map((id) => this.edges.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get all edges to a node
   */
  getEdgesTo(nodeId: string): SceneEdge[] {
    const edgeIds = this.edgesByTarget.get(nodeId) || new Set();
    return Array.from(edgeIds)
      .map((id) => this.edges.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get all edges of a specific relation type
   */
  getEdgesByRelation(relation: EdgeRelationType): SceneEdge[] {
    const edgeIds = this.edgesByRelation.get(relation) || new Set();
    return Array.from(edgeIds)
      .map((id) => this.edges.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get all neighbors of a node (connected by any edge)
   */
  getNeighbors(nodeId: string, relation?: EdgeRelationType): SceneNode[] {
    const neighborIds = new Set<string>();

    // Outgoing edges
    const outEdges = this.edgesBySource.get(nodeId) || new Set();
    for (const edgeId of outEdges) {
      const edge = this.edges.get(edgeId);
      if (edge && (!relation || edge.relation === relation)) {
        neighborIds.add(edge.targetId);
      }
    }

    // Incoming edges (if bidirectional)
    const inEdges = this.edgesByTarget.get(nodeId) || new Set();
    for (const edgeId of inEdges) {
      const edge = this.edges.get(edgeId);
      if (edge && edge.bidirectional && (!relation || edge.relation === relation)) {
        neighborIds.add(edge.sourceId);
      }
    }

    return Array.from(neighborIds)
      .map((id) => this.nodes.get(id)!)
      .filter(Boolean);
  }

  // ==========================================================================
  // Spatial Queries
  // ==========================================================================

  /**
   * Find nodes within a radius of a point
   */
  findNodesInRadius(query: SpatialQuery): SceneNode[] {
    const { center, radius, nodeTypes, categories, minConfidence, maxAge } = query;
    const now = Date.now();

    // Get candidate cells
    const candidates = this.getSpatialCandidates(center, radius);
    const results: SceneNode[] = [];

    for (const nodeId of candidates) {
      const node = this.nodes.get(nodeId);
      if (!node || !node.isActive) continue;

      // Check distance
      const dist = distance3D(node.geometry.pose.position, center);
      if (dist > radius) continue;

      // Check type filter
      if (nodeTypes && !nodeTypes.includes(node.type)) continue;

      // Check category filter
      if (categories && !categories.includes(node.semantics.category)) continue;

      // Check confidence
      if (minConfidence && node.timeStats.confidence < minConfidence) continue;

      // Check age
      if (maxAge && now - node.timeStats.lastSeen > maxAge) continue;

      results.push(node);
    }

    // Sort by distance
    results.sort((a, b) => {
      const distA = distance3D(a.geometry.pose.position, center);
      const distB = distance3D(b.geometry.pose.position, center);
      return distA - distB;
    });

    return results;
  }

  /**
   * Find the nearest node to a point
   */
  findNearestNode(
    position: Vector3,
    options: {
      nodeTypes?: SceneNodeType[];
      categories?: ObjectCategory[];
      maxDistance?: number;
    } = {}
  ): { node: SceneNode; distance: number } | null {
    const nodes = this.findNodesInRadius({
      center: position,
      radius: options.maxDistance || Infinity,
      nodeTypes: options.nodeTypes,
      categories: options.categories,
    });

    if (nodes.length === 0) return null;

    const nearest = nodes[0];
    return {
      node: nearest,
      distance: distance3D(nearest.geometry.pose.position, position),
    };
  }

  /**
   * Find nodes that match a label (fuzzy matching)
   */
  findNodesByLabel(label: string, fuzzy: boolean = true): SceneNode[] {
    const normalizedQuery = label.toLowerCase();

    return Array.from(this.nodes.values()).filter((node) => {
      const nodeLabel = node.semantics.label.toLowerCase();

      if (fuzzy) {
        // Check if query is contained in label or aliases
        if (nodeLabel.includes(normalizedQuery)) return true;
        if (node.semantics.aliases.some((a) => a.toLowerCase().includes(normalizedQuery)))
          return true;
      } else {
        if (nodeLabel === normalizedQuery) return true;
        if (node.semantics.aliases.some((a) => a.toLowerCase() === normalizedQuery))
          return true;
      }

      return false;
    });
  }

  // ==========================================================================
  // Relationship Inference
  // ==========================================================================

  /**
   * Automatically infer and add relationships based on spatial analysis
   */
  inferRelationships(): SceneEdge[] {
    const newEdges: SceneEdge[] = [];
    const nodes = Array.from(this.nodes.values());

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        // Check for 'near' relationship
        const dist = distance3D(
          nodeA.geometry.pose.position,
          nodeB.geometry.pose.position
        );

        if (dist <= this.config.nearThreshold) {
          const existing = this.findEdge(nodeA.id, nodeB.id, 'near');
          if (!existing) {
            const edge = this.addEdge(nodeA.id, nodeB.id, 'near', {
              distance: dist,
              bidirectional: true,
            });
            if (edge) newEdges.push(edge);
          }
        }

        // Check for 'on_top_of' relationship (vertical stacking)
        if (this.isOnTopOf(nodeA, nodeB)) {
          const existing = this.findEdge(nodeA.id, nodeB.id, 'on_top_of');
          if (!existing) {
            const edge = this.addEdge(nodeA.id, nodeB.id, 'on_top_of', {
              bidirectional: false,
            });
            if (edge) newEdges.push(edge);
          }
        } else if (this.isOnTopOf(nodeB, nodeA)) {
          const existing = this.findEdge(nodeB.id, nodeA.id, 'on_top_of');
          if (!existing) {
            const edge = this.addEdge(nodeB.id, nodeA.id, 'on_top_of', {
              bidirectional: false,
            });
            if (edge) newEdges.push(edge);
          }
        }
      }
    }

    return newEdges;
  }

  /**
   * Check if node A is on top of node B
   */
  private isOnTopOf(nodeA: SceneNode, nodeB: SceneNode): boolean {
    const posA = nodeA.geometry.pose.position;
    const posB = nodeB.geometry.pose.position;

    // A must be above B
    if (posA.y <= posB.y) return false;

    // Check horizontal overlap
    const horizDist = distance2D(posA, posB);
    const bbA = nodeA.geometry.boundingBox;
    const bbB = nodeB.geometry.boundingBox;

    if (!bbA || !bbB) return false;

    // Allow some overlap tolerance
    const maxHorizDist = Math.max(bbA.dimensions.x, bbB.dimensions.x) / 2;
    if (horizDist > maxHorizDist) return false;

    // Check vertical gap is reasonable
    const verticalGap = posA.y - bbA.dimensions.y / 2 - (posB.y + bbB.dimensions.y / 2);
    return verticalGap < 0.1 && verticalGap > -0.05; // Small tolerance
  }

  // ==========================================================================
  // Spatial Index
  // ==========================================================================

  private getSpatialCellKey(position: Vector3): string {
    const cx = Math.floor(position.x / this.spatialCellSize);
    const cy = Math.floor(position.y / this.spatialCellSize);
    const cz = Math.floor(position.z / this.spatialCellSize);
    return `${cx},${cy},${cz}`;
  }

  private updateSpatialIndex(node: SceneNode): void {
    const key = this.getSpatialCellKey(node.geometry.pose.position);
    if (!this.spatialIndex.has(key)) {
      this.spatialIndex.set(key, new Set());
    }
    this.spatialIndex.get(key)!.add(node.id);
  }

  private removeSpatialIndex(node: SceneNode): void {
    const key = this.getSpatialCellKey(node.geometry.pose.position);
    this.spatialIndex.get(key)?.delete(node.id);
  }

  private getSpatialCandidates(center: Vector3, radius: number): Set<string> {
    const candidates = new Set<string>();
    const cellRadius = Math.ceil(radius / this.spatialCellSize);

    const cx = Math.floor(center.x / this.spatialCellSize);
    const cy = Math.floor(center.y / this.spatialCellSize);
    const cz = Math.floor(center.z / this.spatialCellSize);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        for (let dz = -cellRadius; dz <= cellRadius; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const cell = this.spatialIndex.get(key);
          if (cell) {
            for (const nodeId of cell) {
              candidates.add(nodeId);
            }
          }
        }
      }
    }

    return candidates;
  }

  // ==========================================================================
  // Change Events
  // ==========================================================================

  /**
   * Add a change listener
   */
  addChangeListener(listener: SceneChangeListener): void {
    this.changeListeners.add(listener);
  }

  /**
   * Remove a change listener
   */
  removeChangeListener(listener: SceneChangeListener): void {
    this.changeListeners.delete(listener);
  }

  /**
   * Get change history
   */
  getChangeHistory(since?: number): SceneChangeEvent[] {
    if (since) {
      return this.changeHistory.filter((e) => e.timestamp >= since);
    }
    return [...this.changeHistory];
  }

  private emitChange(event: SceneChangeEvent): void {
    if (!this.config.enableChangeEvents) return;

    // Add to history
    this.changeHistory.push(event);

    // Trim history if needed
    while (this.changeHistory.length > this.config.maxChangeHistory) {
      this.changeHistory.shift();
    }

    // Notify listeners
    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in scene change listener:', error);
      }
    }
  }

  // ==========================================================================
  // Maintenance
  // ==========================================================================

  /**
   * Update confidence values based on time decay
   */
  decayConfidence(): void {
    const now = Date.now();

    for (const node of this.nodes.values()) {
      const age = now - node.timeStats.lastSeen;
      const decay = (age / 1000) * this.config.confidenceDecayRate;
      node.timeStats.confidence = Math.max(0, node.timeStats.confidence - decay);

      // Mark as inactive if below threshold
      if (node.timeStats.confidence < this.config.minConfidence) {
        if (node.isActive) {
          node.isActive = false;
          this.emitChange({
            type: 'object_disappeared',
            timestamp: now,
            nodeId: node.id,
            magnitude: 0.8,
            description: `"${node.semantics.label}" has not been seen recently`,
            relatedNodeIds: [],
          });
        }
      }
    }

    for (const edge of this.edges.values()) {
      const age = now - edge.lastVerified;
      const decay = (age / 1000) * this.config.confidenceDecayRate;
      edge.confidence = Math.max(0, edge.confidence - decay);
    }
  }

  /**
   * Remove stale nodes and edges
   */
  pruneStale(): number {
    const now = Date.now();
    let removed = 0;

    // Find stale nodes
    const staleNodes: string[] = [];
    for (const node of this.nodes.values()) {
      const age = now - node.timeStats.lastSeen;
      if (age > this.config.staleThreshold && node.timeStats.confidence < this.config.minConfidence) {
        staleNodes.push(node.id);
      }
    }

    for (const nodeId of staleNodes) {
      this.removeNode(nodeId);
      removed++;
    }

    return removed;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get scene graph statistics
   */
  getStats(): SceneGraphStats {
    const nodesByType: Record<SceneNodeType, number> = {
      object: 0,
      room: 0,
      region: 0,
      waypoint: 0,
      landmark: 0,
      robot: 0,
    };

    const edgesByRelation: Record<EdgeRelationType, number> = {
      in: 0,
      near: 0,
      on_top_of: 0,
      under: 0,
      connected_to: 0,
      visible_from: 0,
      adjacent_to: 0,
      blocks: 0,
      supports: 0,
      contains: 0,
    };

    let totalConfidence = 0;

    for (const node of this.nodes.values()) {
      nodesByType[node.type]++;
      totalConfidence += node.timeStats.confidence;
    }

    for (const edge of this.edges.values()) {
      edgesByRelation[edge.relation]++;
    }

    const recentChanges = this.changeHistory.filter(
      (e) => Date.now() - e.timestamp < 10000
    ).length;

    return {
      totalNodes: this.nodes.size,
      nodesByType,
      totalEdges: this.edges.size,
      edgesByRelation,
      regionCount: nodesByType.room + nodesByType.region,
      waypointCount: nodesByType.waypoint,
      objectCount: nodesByType.object,
      explorationProgress: 0, // Computed elsewhere
      averageConfidence: this.nodes.size > 0 ? totalConfidence / this.nodes.size : 0,
      recentChangeCount: recentChanges,
      lastUpdate: this.changeHistory.length > 0
        ? this.changeHistory[this.changeHistory.length - 1].timestamp
        : 0,
    };
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  /**
   * Serialize the scene graph
   */
  serialize(): SerializedSceneGraph {
    return {
      version: '1.0',
      timestamp: Date.now(),
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      regions: [],
      waypoints: [],
      metadata: {
        config: this.config,
      },
    };
  }

  /**
   * Deserialize and restore a scene graph
   */
  deserialize(data: SerializedSceneGraph): void {
    this.clear();

    for (const node of data.nodes) {
      this.nodes.set(node.id, node);
      this.updateSpatialIndex(node);
    }

    for (const edge of data.edges) {
      this.edges.set(edge.id, edge);

      if (!this.edgesBySource.has(edge.sourceId)) {
        this.edgesBySource.set(edge.sourceId, new Set());
      }
      this.edgesBySource.get(edge.sourceId)!.add(edge.id);

      if (!this.edgesByTarget.has(edge.targetId)) {
        this.edgesByTarget.set(edge.targetId, new Set());
      }
      this.edgesByTarget.get(edge.targetId)!.add(edge.id);

      if (!this.edgesByRelation.has(edge.relation)) {
        this.edgesByRelation.set(edge.relation, new Set());
      }
      this.edgesByRelation.get(edge.relation)!.add(edge.id);
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.spatialIndex.clear();
    this.edgesBySource.clear();
    this.edgesByTarget.clear();
    this.edgesByRelation.clear();
    this.changeHistory = [];
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private isSymmetricRelation(relation: EdgeRelationType): boolean {
    return ['near', 'adjacent_to', 'connected_to'].includes(relation);
  }
}
