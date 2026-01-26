/**
 * Scene Graph + Topology Types
 *
 * A 3D scene graph that bridges:
 * - Language understanding ("go to the table near the window")
 * - Navigation (reachable waypoints)
 * - Memory (what changed)
 */

// ============================================================================
// Node Types
// ============================================================================

export type SceneNodeType =
  | 'object'    // Physical objects (tables, chairs, robots, collectibles)
  | 'room'      // Semantic regions/rooms
  | 'region'    // Sub-areas within rooms
  | 'waypoint'  // Navigation points
  | 'landmark'  // Important reference points
  | 'robot';    // The robot itself

export type ObjectCategory =
  | 'furniture'
  | 'collectible'
  | 'obstacle'
  | 'wall'
  | 'door'
  | 'container'
  | 'surface'
  | 'decoration'
  | 'unknown';

// ============================================================================
// Edge Types (Relationships)
// ============================================================================

export type EdgeRelationType =
  | 'in'            // Containment: object IN room
  | 'near'          // Proximity: A near B (within threshold)
  | 'on_top_of'     // Vertical: A on top of B
  | 'under'         // Vertical: A under B
  | 'connected_to'  // Topological: waypoint connected to waypoint
  | 'visible_from'  // Visibility: A visible from B
  | 'adjacent_to'   // Side-by-side relationship
  | 'blocks'        // A blocks path to B
  | 'supports'      // A supports B (physical)
  | 'contains';     // A contains B

// ============================================================================
// Geometry Types
// ============================================================================

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox3D {
  min: Vector3;
  max: Vector3;
  center: Vector3;
  dimensions: Vector3;
}

export interface Pose {
  position: Vector3;
  rotation: Vector3; // Euler angles in radians
  scale?: Vector3;
}

export type GeometryType =
  | 'point'
  | 'bbox'
  | 'mesh'
  | 'voxel'
  | 'polygon';

export interface GeometryReference {
  type: GeometryType;
  pose: Pose;
  boundingBox?: BoundingBox3D;
  meshId?: string;        // Reference to external mesh
  voxelGridId?: string;   // Reference to voxel representation
  polygonPoints?: Vector3[]; // For 2D regions
}

// ============================================================================
// Semantic Embedding
// ============================================================================

export interface SemanticEmbedding {
  /** Natural language label */
  label: string;

  /** Alternative names/synonyms */
  aliases: string[];

  /** Object category */
  category: ObjectCategory;

  /** Description for LLM context */
  description?: string;

  /** Semantic feature vector (for similarity search) */
  featureVector?: number[];

  /** Properties/attributes */
  attributes: Record<string, string | number | boolean>;

  /** Affordances - what actions are possible */
  affordances: string[];
}

// ============================================================================
// Time Statistics
// ============================================================================

export interface TimeStats {
  /** When the node was first observed */
  firstSeen: number;

  /** When the node was last observed */
  lastSeen: number;

  /** Number of observations */
  observationCount: number;

  /** Stability score (0-1): how consistent the node has been */
  stability: number;

  /** Has the node moved significantly? */
  isStatic: boolean;

  /** Average time between observations */
  averageObservationInterval: number;

  /** Last position change timestamp */
  lastPositionChange?: number;

  /** Confidence score (0-1) based on recency and stability */
  confidence: number;
}

// ============================================================================
// Scene Node
// ============================================================================

export interface SceneNode {
  /** Unique identifier */
  id: string;

  /** Node type */
  type: SceneNodeType;

  /** Geometry reference */
  geometry: GeometryReference;

  /** Semantic information */
  semantics: SemanticEmbedding;

  /** Time-based statistics */
  timeStats: TimeStats;

  /** Is this node currently active/visible? */
  isActive: boolean;

  /** Parent node ID (for hierarchical relationships) */
  parentId?: string;

  /** Children node IDs */
  childIds: string[];

  /** Custom metadata */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Scene Edge
// ============================================================================

export interface SceneEdge {
  /** Unique identifier */
  id: string;

  /** Source node ID */
  sourceId: string;

  /** Target node ID */
  targetId: string;

  /** Relationship type */
  relation: EdgeRelationType;

  /** Weight/strength of relationship (0-1) */
  weight: number;

  /** Is this a bidirectional relationship? */
  bidirectional: boolean;

  /** Distance between nodes (if applicable) */
  distance?: number;

  /** Traversal cost (for navigation) */
  traversalCost?: number;

  /** When this relationship was established */
  createdAt: number;

  /** When this relationship was last verified */
  lastVerified: number;

  /** Confidence in this relationship */
  confidence: number;

  /** Custom metadata */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Waypoint (Navigation Node)
// ============================================================================

export interface Waypoint extends Omit<SceneNode, 'type'> {
  type: 'waypoint';

  /** Is this waypoint navigable? */
  isNavigable: boolean;

  /** Navigation clearance radius */
  clearanceRadius: number;

  /** Connected waypoint IDs with costs */
  connections: Map<string, number>;

  /** Room/region this waypoint belongs to */
  regionId?: string;

  /** Is this a key navigation point? */
  isKeyPoint: boolean;
}

// ============================================================================
// Region/Room
// ============================================================================

export interface Region extends Omit<SceneNode, 'type'> {
  type: 'room' | 'region';

  /** Boundary polygon (2D floor plan) */
  boundary: Vector3[];

  /** Entry/exit points */
  entryPoints: string[]; // Waypoint IDs

  /** Objects contained in this region */
  containedObjects: string[]; // Node IDs

  /** Exploration status (0-1) */
  explorationProgress: number;

  /** Is this region fully mapped? */
  isMapped: boolean;
}

// ============================================================================
// Change Events
// ============================================================================

export type ChangeEventType =
  | 'node_added'
  | 'node_removed'
  | 'node_updated'
  | 'node_moved'
  | 'edge_added'
  | 'edge_removed'
  | 'edge_updated'
  | 'object_appeared'
  | 'object_disappeared'
  | 'object_state_changed'
  | 'region_entered'
  | 'region_exited';

export interface SceneChangeEvent {
  /** Event type */
  type: ChangeEventType;

  /** Timestamp */
  timestamp: number;

  /** Affected node ID */
  nodeId?: string;

  /** Affected edge ID */
  edgeId?: string;

  /** Previous state */
  previousState?: Partial<SceneNode | SceneEdge>;

  /** New state */
  newState?: Partial<SceneNode | SceneEdge>;

  /** Change magnitude (0-1) */
  magnitude: number;

  /** Human-readable description */
  description: string;

  /** Related nodes */
  relatedNodeIds: string[];
}

// ============================================================================
// Query Types
// ============================================================================

export interface SpatialQuery {
  /** Center point */
  center: Vector3;

  /** Search radius */
  radius: number;

  /** Node types to include */
  nodeTypes?: SceneNodeType[];

  /** Categories to include */
  categories?: ObjectCategory[];

  /** Minimum confidence */
  minConfidence?: number;

  /** Maximum age (ms since last seen) */
  maxAge?: number;
}

export interface SemanticQuery {
  /** Natural language query */
  query: string;

  /** Keywords to match */
  keywords?: string[];

  /** Categories to search */
  categories?: ObjectCategory[];

  /** Spatial constraint */
  spatialConstraint?: SpatialQuery;

  /** Relationship constraints */
  relationConstraints?: {
    relation: EdgeRelationType;
    targetLabel?: string;
  }[];
}

export interface PathQuery {
  /** Start node or position */
  start: string | Vector3;

  /** Goal node or position */
  goal: string | Vector3;

  /** Maximum path length */
  maxLength?: number;

  /** Avoid these nodes */
  avoidNodes?: string[];

  /** Prefer these regions */
  preferRegions?: string[];

  /** Weight function type */
  costFunction?: 'distance' | 'time' | 'safety';
}

// ============================================================================
// Scene Graph Statistics
// ============================================================================

export interface SceneGraphStats {
  /** Total number of nodes */
  totalNodes: number;

  /** Nodes by type */
  nodesByType: Record<SceneNodeType, number>;

  /** Total number of edges */
  totalEdges: number;

  /** Edges by relation */
  edgesByRelation: Record<EdgeRelationType, number>;

  /** Number of regions */
  regionCount: number;

  /** Number of waypoints */
  waypointCount: number;

  /** Number of tracked objects */
  objectCount: number;

  /** Overall exploration progress */
  explorationProgress: number;

  /** Average node confidence */
  averageConfidence: number;

  /** Number of recent changes */
  recentChangeCount: number;

  /** Last update timestamp */
  lastUpdate: number;
}

// ============================================================================
// Serialization
// ============================================================================

export interface SerializedSceneGraph {
  version: string;
  timestamp: number;
  nodes: SceneNode[];
  edges: SceneEdge[];
  regions: Region[];
  waypoints: Waypoint[];
  metadata: Record<string, unknown>;
}

// ============================================================================
// Event Listener Types
// ============================================================================

export type SceneChangeListener = (event: SceneChangeEvent) => void;

export interface SceneGraphConfig {
  /** Proximity threshold for 'near' relationships (meters) */
  nearThreshold: number;

  /** Confidence decay rate per second */
  confidenceDecayRate: number;

  /** Minimum confidence to keep a node */
  minConfidence: number;

  /** Maximum age before marking node as stale (ms) */
  staleThreshold: number;

  /** Auto-generate waypoints from exploration */
  autoGenerateWaypoints: boolean;

  /** Waypoint spacing (meters) */
  waypointSpacing: number;

  /** Enable change event emission */
  enableChangeEvents: boolean;

  /** Maximum change history size */
  maxChangeHistory: number;
}

export const DEFAULT_SCENE_GRAPH_CONFIG: SceneGraphConfig = {
  nearThreshold: 0.5,
  confidenceDecayRate: 0.01,
  minConfidence: 0.1,
  staleThreshold: 60000, // 1 minute
  autoGenerateWaypoints: true,
  waypointSpacing: 0.3,
  enableChangeEvents: true,
  maxChangeHistory: 100,
};
