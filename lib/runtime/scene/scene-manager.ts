/**
 * Unified Scene Manager
 *
 * Inspired by OGRE and IGSTK patterns, this provides a single source of truth
 * for the robot simulation world, unifying:
 * - Physics (transforms, collision, dynamics)
 * - Visualization (Three.js rendering)
 * - Navigation (sensors, rays, path planning)
 *
 * Key Principles:
 * 1. Single source of truth for all transforms
 * 2. Observer pattern for state changes
 * 3. Clean separation of concerns via components
 * 4. Hierarchical scene graph for parent-child transforms
 */

import { EventEmitter } from 'events';

// ═══════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Transform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number }; // Euler angles
  scale: { x: number; y: number; z: number };
}

export interface Velocity {
  linear: { x: number; y: number; z: number };
  angular: { x: number; y: number; z: number };
}

export type NodeType = 'root' | 'robot' | 'obstacle' | 'wall' | 'collectible' | 'waypoint' | 'sensor';

// ═══════════════════════════════════════════════════════════════════════════
// SCENE NODE - Base class for all scene objects
// ═══════════════════════════════════════════════════════════════════════════

export class SceneNode extends EventEmitter {
  readonly id: string;
  readonly type: NodeType;

  // Transform (local space)
  private _localTransform: Transform;

  // Cached world transform
  private _worldTransform: Transform;
  private _worldTransformDirty: boolean = true;

  // Hierarchy
  private _parent: SceneNode | null = null;
  private _children: Map<string, SceneNode> = new Map();

  // Components (attach additional behaviors)
  private _components: Map<string, NodeComponent> = new Map();

  // Metadata
  userData: Record<string, unknown> = {};

  constructor(id: string, type: NodeType) {
    super();
    this.id = id;
    this.type = type;

    this._localTransform = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };

    this._worldTransform = { ...this._localTransform };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Transform Management
  // ─────────────────────────────────────────────────────────────────────────

  get localTransform(): Readonly<Transform> {
    return this._localTransform;
  }

  get worldTransform(): Readonly<Transform> {
    if (this._worldTransformDirty) {
      this._updateWorldTransform();
    }
    return this._worldTransform;
  }

  /**
   * Set position in local space (relative to parent)
   */
  setPosition(x: number, y: number, z: number = 0): void {
    this._localTransform.position.x = x;
    this._localTransform.position.y = y;
    this._localTransform.position.z = z;
    this._markDirty();
    this.emit('transform', this);
  }

  /**
   * Set rotation in local space (Euler angles in radians)
   */
  setRotation(x: number, y: number = 0, z: number = 0): void {
    this._localTransform.rotation.x = x;
    this._localTransform.rotation.y = y;
    this._localTransform.rotation.z = z;
    this._markDirty();
    this.emit('transform', this);
  }

  /**
   * Convenience: Set 2D pose (x, y, rotation around Z)
   * This is the common case for ground robots
   */
  setPose2D(x: number, y: number, rotation: number): void {
    this._localTransform.position.x = x;
    this._localTransform.position.y = 0; // Y is up in Three.js
    this._localTransform.position.z = y; // Physics Y maps to Three.js Z
    this._localTransform.rotation.y = -rotation; // Negate for Three.js convention
    this._markDirty();
    this.emit('transform', this);
  }

  private _markDirty(): void {
    this._worldTransformDirty = true;
    // Mark all children dirty too
    for (const child of this._children.values()) {
      child._markDirty();
    }
  }

  private _updateWorldTransform(): void {
    if (this._parent) {
      const parentWorld = this._parent.worldTransform;
      // Simple composition (no rotation of child positions for now)
      this._worldTransform = {
        position: {
          x: parentWorld.position.x + this._localTransform.position.x,
          y: parentWorld.position.y + this._localTransform.position.y,
          z: parentWorld.position.z + this._localTransform.position.z,
        },
        rotation: {
          x: parentWorld.rotation.x + this._localTransform.rotation.x,
          y: parentWorld.rotation.y + this._localTransform.rotation.y,
          z: parentWorld.rotation.z + this._localTransform.rotation.z,
        },
        scale: {
          x: parentWorld.scale.x * this._localTransform.scale.x,
          y: parentWorld.scale.y * this._localTransform.scale.y,
          z: parentWorld.scale.z * this._localTransform.scale.z,
        },
      };
    } else {
      this._worldTransform = { ...this._localTransform };
    }
    this._worldTransformDirty = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Hierarchy Management
  // ─────────────────────────────────────────────────────────────────────────

  get parent(): SceneNode | null {
    return this._parent;
  }

  get children(): ReadonlyMap<string, SceneNode> {
    return this._children;
  }

  addChild(node: SceneNode): void {
    if (node._parent) {
      node._parent.removeChild(node);
    }
    node._parent = this;
    this._children.set(node.id, node);
    node._markDirty();
    this.emit('childAdded', node);
  }

  removeChild(node: SceneNode): void {
    if (this._children.delete(node.id)) {
      node._parent = null;
      this.emit('childRemoved', node);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Component Management
  // ─────────────────────────────────────────────────────────────────────────

  addComponent<T extends NodeComponent>(component: T): T {
    this._components.set(component.name, component);
    component.attach(this);
    return component;
  }

  getComponent<T extends NodeComponent>(name: string): T | undefined {
    return this._components.get(name) as T | undefined;
  }

  removeComponent(name: string): void {
    const component = this._components.get(name);
    if (component) {
      component.detach();
      this._components.delete(name);
    }
  }

  /**
   * Update all components (called by SceneManager each frame)
   */
  update(deltaTime: number): void {
    for (const component of this._components.values()) {
      component.update(deltaTime);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE COMPONENT - Attach behaviors to nodes
// ═══════════════════════════════════════════════════════════════════════════

export abstract class NodeComponent {
  abstract readonly name: string;
  protected node: SceneNode | null = null;

  attach(node: SceneNode): void {
    this.node = node;
    this.onAttach();
  }

  detach(): void {
    this.onDetach();
    this.node = null;
  }

  protected onAttach(): void {}
  protected onDetach(): void {}
  abstract update(deltaTime: number): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHYSICS COMPONENT - Manages physics state
// ═══════════════════════════════════════════════════════════════════════════

export class PhysicsComponent extends NodeComponent {
  readonly name = 'physics';

  velocity: Velocity = {
    linear: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 },
  };

  // Collision shape
  collisionRadius: number = 0.04; // 4cm for cube robot

  // Motor state (for differential drive)
  motors = {
    leftPWM: 0,
    rightPWM: 0,
    leftRPM: 0,
    rightRPM: 0,
  };

  update(_deltaTime: number): void {
    // Physics updates are handled by the physics system
  }

  /**
   * Get 2D velocity for ground robots
   */
  get linearVelocity2D(): number {
    return Math.sqrt(
      this.velocity.linear.x ** 2 +
      this.velocity.linear.z ** 2
    );
  }

  get angularVelocity2D(): number {
    return this.velocity.angular.y;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SENSOR COMPONENT - Manages sensor data
// ═══════════════════════════════════════════════════════════════════════════

export interface SensorReading {
  front: number;
  frontLeft: number;
  frontRight: number;
  left: number;
  right: number;
  back: number;
  backLeft: number;
  backRight: number;
}

export class SensorComponent extends NodeComponent {
  readonly name = 'sensors';

  // Distance sensors (cm)
  distance: SensorReading = {
    front: 200,
    frontLeft: 200,
    frontRight: 200,
    left: 200,
    right: 200,
    back: 200,
    backLeft: 200,
    backRight: 200,
  };

  // Line sensors (0-255)
  line: number[] = [0, 0, 0, 0, 0];

  // IMU
  imu = {
    heading: 0,
    accel: { x: 0, y: 0, z: 0 },
    gyro: { x: 0, y: 0, z: 0 },
  };

  // Bumpers
  bumper = { front: false, back: false };

  // Encoders
  encoders = { left: 0, right: 0 };

  update(_deltaTime: number): void {
    // Sensor updates are handled by the physics system
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION COMPONENT - Manages navigation state
// ═══════════════════════════════════════════════════════════════════════════

export interface RayData {
  angle: number;
  distance: number;
  clear: boolean;
}

export class NavigationComponent extends NodeComponent {
  readonly name = 'navigation';

  // Ray fan from sensors
  rays: RayData[] = [];

  // Best path
  bestPathAngle: number = 0;
  bestPathClearance: number = 0;

  // Collision prediction
  collisionPredicted: boolean = false;
  timeToCollision: number = Infinity;

  // Recommended steering
  recommendedSteering = {
    leftMotor: 0,
    rightMotor: 0,
  };

  update(_deltaTime: number): void {
    // Navigation updates are handled by the navigation system
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VISUAL COMPONENT - Links to Three.js representation
// ═══════════════════════════════════════════════════════════════════════════

export class VisualComponent extends NodeComponent {
  readonly name = 'visual';

  // Reference to Three.js object (set by renderer)
  threeObject: unknown = null;

  // Visual properties
  visible: boolean = true;
  color: string = '#ffffff';
  emissive: string = '#000000';
  opacity: number = 1.0;

  update(_deltaTime: number): void {
    // Visual updates are handled by the render system
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE MANAGER - Central coordinator
// ═══════════════════════════════════════════════════════════════════════════

export class SceneManager extends EventEmitter {
  private static instances: Map<string, SceneManager> = new Map();

  readonly deviceId: string;
  readonly rootNode: SceneNode;

  // Quick access to important nodes
  private _robotNode: SceneNode | null = null;
  private _worldNode: SceneNode | null = null;

  // All nodes by ID for fast lookup
  private _nodes: Map<string, SceneNode> = new Map();

  // Systems that process nodes
  private _systems: SceneSystem[] = [];

  private constructor(deviceId: string) {
    super();
    this.deviceId = deviceId;

    // Create root node
    this.rootNode = new SceneNode('root', 'root');
    this._nodes.set('root', this.rootNode);

    // Create world container node
    this._worldNode = new SceneNode('world', 'root');
    this.rootNode.addChild(this._worldNode);
    this._nodes.set('world', this._worldNode);
  }

  /**
   * Get or create a SceneManager for a device
   */
  static getInstance(deviceId: string): SceneManager {
    let instance = this.instances.get(deviceId);
    if (!instance) {
      instance = new SceneManager(deviceId);
      this.instances.set(deviceId, instance);
    }
    return instance;
  }

  /**
   * Clear a device's scene manager
   */
  static clearInstance(deviceId: string): void {
    this.instances.delete(deviceId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Node Management
  // ─────────────────────────────────────────────────────────────────────────

  get robotNode(): SceneNode | null {
    return this._robotNode;
  }

  get worldNode(): SceneNode {
    return this._worldNode!;
  }

  /**
   * Create and register a robot node
   */
  createRobot(id: string = 'robot'): SceneNode {
    const node = new SceneNode(id, 'robot');

    // Add standard components
    node.addComponent(new PhysicsComponent());
    node.addComponent(new SensorComponent());
    node.addComponent(new NavigationComponent());
    node.addComponent(new VisualComponent());

    this.rootNode.addChild(node);
    this._nodes.set(id, node);
    this._robotNode = node;

    this.emit('robotCreated', node);
    return node;
  }

  /**
   * Create an obstacle node
   */
  createObstacle(id: string, x: number, y: number, radius: number): SceneNode {
    const node = new SceneNode(id, 'obstacle');
    node.setPose2D(x, y, 0);
    node.userData.radius = radius;

    const physics = node.addComponent(new PhysicsComponent());
    physics.collisionRadius = radius;
    node.addComponent(new VisualComponent());

    this._worldNode!.addChild(node);
    this._nodes.set(id, node);

    this.emit('obstacleCreated', node);
    return node;
  }

  /**
   * Create a wall node
   */
  createWall(id: string, x1: number, y1: number, x2: number, y2: number): SceneNode {
    const node = new SceneNode(id, 'wall');
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    node.setPose2D(midX, midY, angle);
    node.userData.start = { x: x1, y: y1 };
    node.userData.end = { x: x2, y: y2 };
    node.userData.length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    node.addComponent(new VisualComponent());

    this._worldNode!.addChild(node);
    this._nodes.set(id, node);

    this.emit('wallCreated', node);
    return node;
  }

  /**
   * Create a collectible node
   */
  createCollectible(id: string, x: number, y: number, type: string): SceneNode {
    const node = new SceneNode(id, 'collectible');
    node.setPose2D(x, y, 0);
    node.userData.collectibleType = type;
    node.userData.collected = false;

    node.addComponent(new VisualComponent());

    this._worldNode!.addChild(node);
    this._nodes.set(id, node);

    this.emit('collectibleCreated', node);
    return node;
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): SceneNode | undefined {
    return this._nodes.get(id);
  }

  /**
   * Get all nodes of a type
   */
  getNodesByType(type: NodeType): SceneNode[] {
    const result: SceneNode[] = [];
    for (const node of this._nodes.values()) {
      if (node.type === type) {
        result.push(node);
      }
    }
    return result;
  }

  /**
   * Remove a node
   */
  removeNode(id: string): void {
    const node = this._nodes.get(id);
    if (node && node.parent) {
      node.parent.removeChild(node);
      this._nodes.delete(id);

      if (node === this._robotNode) {
        this._robotNode = null;
      }

      this.emit('nodeRemoved', node);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // System Management
  // ─────────────────────────────────────────────────────────────────────────

  addSystem(system: SceneSystem): void {
    system.initialize(this);
    this._systems.push(system);
  }

  removeSystem(system: SceneSystem): void {
    const index = this._systems.indexOf(system);
    if (index >= 0) {
      this._systems.splice(index, 1);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Update Loop
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update all systems and nodes
   */
  update(deltaTime: number): void {
    // Update systems first (they may modify node state)
    for (const system of this._systems) {
      system.update(deltaTime);
    }

    // Update all node components
    this._updateNode(this.rootNode, deltaTime);

    this.emit('updated', deltaTime);
  }

  private _updateNode(node: SceneNode, deltaTime: number): void {
    node.update(deltaTime);
    for (const child of node.children.values()) {
      this._updateNode(child, deltaTime);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Convenience Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update robot pose from physics simulation
   */
  updateRobotPose(x: number, y: number, rotation: number): void {
    if (this._robotNode) {
      this._robotNode.setPose2D(x, y, rotation);
    }
  }

  /**
   * Update robot velocity
   */
  updateRobotVelocity(linear: number, angular: number): void {
    if (this._robotNode) {
      const physics = this._robotNode.getComponent<PhysicsComponent>('physics');
      if (physics) {
        physics.velocity.linear.z = linear; // Forward is Z in Three.js
        physics.velocity.angular.y = angular;
      }
    }
  }

  /**
   * Update robot sensors
   */
  updateRobotSensors(sensors: Partial<SensorReading>): void {
    if (this._robotNode) {
      const sensorComp = this._robotNode.getComponent<SensorComponent>('sensors');
      if (sensorComp) {
        Object.assign(sensorComp.distance, sensors);
      }
    }
  }

  /**
   * Update navigation rays
   */
  updateNavigationRays(rays: RayData[], bestAngle: number, clearance: number): void {
    if (this._robotNode) {
      const nav = this._robotNode.getComponent<NavigationComponent>('navigation');
      if (nav) {
        nav.rays = rays;
        nav.bestPathAngle = bestAngle;
        nav.bestPathClearance = clearance;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE SYSTEM - Processes nodes each frame
// ═══════════════════════════════════════════════════════════════════════════

export abstract class SceneSystem {
  protected sceneManager: SceneManager | null = null;

  initialize(sceneManager: SceneManager): void {
    this.sceneManager = sceneManager;
    this.onInitialize();
  }

  protected onInitialize(): void {}
  abstract update(deltaTime: number): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Get scene manager for a device
// ═══════════════════════════════════════════════════════════════════════════

export function getSceneManager(deviceId: string): SceneManager {
  return SceneManager.getInstance(deviceId);
}
