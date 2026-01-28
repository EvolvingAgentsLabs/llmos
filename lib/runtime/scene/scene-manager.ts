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
 * 2. Quaternions for rotation (no gimbal lock)
 * 3. Transform matrices for hierarchical composition
 * 4. Observer pattern for state changes
 * 5. Clean separation of concerns via components
 */

import { EventEmitter } from 'events';
import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Transform {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export interface Velocity {
  linear: THREE.Vector3;
  angular: THREE.Vector3; // Angular velocity as axis * angle_rate
}

export type NodeType = 'root' | 'robot' | 'obstacle' | 'wall' | 'collectible' | 'waypoint' | 'sensor';

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFORM UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a default transform (identity)
 */
export function createTransform(): Transform {
  return {
    position: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(0, 0, 0, 1), // Identity quaternion
    scale: new THREE.Vector3(1, 1, 1),
  };
}

/**
 * Clone a transform
 */
export function cloneTransform(t: Transform): Transform {
  return {
    position: t.position.clone(),
    quaternion: t.quaternion.clone(),
    scale: t.scale.clone(),
  };
}

/**
 * Compose parent and child transforms using matrix multiplication
 * Result = Parent * Child (child transform in parent's space)
 */
export function composeTransforms(parent: Transform, child: Transform): Transform {
  // Build parent matrix
  const parentMatrix = new THREE.Matrix4();
  parentMatrix.compose(parent.position, parent.quaternion, parent.scale);

  // Build child matrix
  const childMatrix = new THREE.Matrix4();
  childMatrix.compose(child.position, child.quaternion, child.scale);

  // Multiply: world = parent * child
  const worldMatrix = new THREE.Matrix4();
  worldMatrix.multiplyMatrices(parentMatrix, childMatrix);

  // Decompose result
  const result = createTransform();
  worldMatrix.decompose(result.position, result.quaternion, result.scale);

  return result;
}

/**
 * Convert transform to a 4x4 matrix
 */
export function transformToMatrix(t: Transform): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  matrix.compose(t.position, t.quaternion, t.scale);
  return matrix;
}

/**
 * Create transform from a 4x4 matrix
 */
export function matrixToTransform(m: THREE.Matrix4): Transform {
  const t = createTransform();
  m.decompose(t.position, t.quaternion, t.scale);
  return t;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE NODE - Base class for all scene objects
// ═══════════════════════════════════════════════════════════════════════════

export class SceneNode extends EventEmitter {
  readonly id: string;
  readonly type: NodeType;

  // Local transform (relative to parent)
  private _localTransform: Transform;

  // Cached world transform and matrix
  private _worldTransform: Transform;
  private _worldMatrix: THREE.Matrix4;
  private _localMatrix: THREE.Matrix4;
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

    this._localTransform = createTransform();
    this._worldTransform = createTransform();
    this._worldMatrix = new THREE.Matrix4();
    this._localMatrix = new THREE.Matrix4();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Transform Accessors
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

  get localMatrix(): THREE.Matrix4 {
    this._localMatrix.compose(
      this._localTransform.position,
      this._localTransform.quaternion,
      this._localTransform.scale
    );
    return this._localMatrix;
  }

  get worldMatrix(): THREE.Matrix4 {
    if (this._worldTransformDirty) {
      this._updateWorldTransform();
    }
    return this._worldMatrix;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Position (in local space)
  // ─────────────────────────────────────────────────────────────────────────

  get position(): THREE.Vector3 {
    return this._localTransform.position;
  }

  setPosition(x: number, y: number, z: number): this {
    this._localTransform.position.set(x, y, z);
    this._markDirty();
    this.emit('transform', this);
    return this;
  }

  setPositionVec(v: THREE.Vector3): this {
    this._localTransform.position.copy(v);
    this._markDirty();
    this.emit('transform', this);
    return this;
  }

  translate(x: number, y: number, z: number): this {
    this._localTransform.position.x += x;
    this._localTransform.position.y += y;
    this._localTransform.position.z += z;
    this._markDirty();
    this.emit('transform', this);
    return this;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Rotation (quaternion-based, no gimbal lock)
  // ─────────────────────────────────────────────────────────────────────────

  get quaternion(): THREE.Quaternion {
    return this._localTransform.quaternion;
  }

  setQuaternion(x: number, y: number, z: number, w: number): this {
    this._localTransform.quaternion.set(x, y, z, w);
    this._markDirty();
    this.emit('transform', this);
    return this;
  }

  setQuaternionQ(q: THREE.Quaternion): this {
    this._localTransform.quaternion.copy(q);
    this._markDirty();
    this.emit('transform', this);
    return this;
  }

  /**
   * Set rotation from Euler angles (converted to quaternion internally)
   * Order: XYZ (pitch, yaw, roll)
   */
  setRotationEuler(x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ'): this {
    const euler = new THREE.Euler(x, y, z, order);
    this._localTransform.quaternion.setFromEuler(euler);
    this._markDirty();
    this.emit('transform', this);
    return this;
  }

  /**
   * Set rotation around a specific axis
   */
  setRotationAxis(axis: THREE.Vector3, angle: number): this {
    this._localTransform.quaternion.setFromAxisAngle(axis, angle);
    this._markDirty();
    this.emit('transform', this);
    return this;
  }

  /**
   * Rotate around Y axis (common for ground robots)
   */
  setYaw(angle: number): this {
    this._localTransform.quaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      angle
    );
    this._markDirty();
    this.emit('transform', this);
    return this;
  }

  /**
   * Rotate by a quaternion (multiply current rotation)
   */
  rotateBy(q: THREE.Quaternion): this {
    this._localTransform.quaternion.multiply(q);
    this._markDirty();
    this.emit('transform', this);
    return this;
  }

  /**
   * Get rotation as Euler angles (for compatibility)
   */
  getEuler(order: THREE.EulerOrder = 'XYZ'): THREE.Euler {
    const euler = new THREE.Euler();
    euler.setFromQuaternion(this._localTransform.quaternion, order);
    return euler;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scale
  // ─────────────────────────────────────────────────────────────────────────

  get scale(): THREE.Vector3 {
    return this._localTransform.scale;
  }

  setScale(x: number, y: number = x, z: number = x): this {
    this._localTransform.scale.set(x, y, z);
    this._markDirty();
    this.emit('transform', this);
    return this;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Convenience: 2D Pose (common for ground robots)
  // Physics: X = left/right, Y = forward, rotation around vertical
  // Three.js: X = left/right, Y = up, Z = forward
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Set 2D pose for ground robot
   * @param x Position X (left/right in both systems)
   * @param y Position Y in physics (forward) → maps to Z in Three.js
   * @param rotation Rotation in physics: sin(θ) for X, cos(θ) for Y movement
   */
  setPose2D(x: number, y: number, rotation: number): this {
    // Physics Y → Three.js Z (forward on ground plane)
    this._localTransform.position.set(x, 0, y);

    // Physics rotation maps directly to Three.js Y-axis rotation
    // With rotation θ, local +Z transforms to world (sin(θ), 0, cos(θ))
    // which matches physics forward direction (sin(θ), cos(θ))
    this._localTransform.quaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotation
    );

    this._markDirty();
    this.emit('transform', this);
    return this;
  }

  /**
   * Get 2D pose (for physics system)
   */
  getPose2D(): { x: number; y: number; rotation: number } {
    const euler = this.getEuler('YXZ'); // Y first for yaw extraction
    return {
      x: this._localTransform.position.x,
      y: this._localTransform.position.z, // Three.js Z → Physics Y
      rotation: euler.y, // Direct mapping - no negation needed
    };
  }

  /**
   * Get forward direction vector (in world space)
   */
  getForwardDirection(): THREE.Vector3 {
    const forward = new THREE.Vector3(0, 0, 1); // +Z is forward in Three.js
    forward.applyQuaternion(this.worldTransform.quaternion);
    return forward;
  }

  /**
   * Get right direction vector (in world space)
   */
  getRightDirection(): THREE.Vector3 {
    const right = new THREE.Vector3(1, 0, 0); // +X is right
    right.applyQuaternion(this.worldTransform.quaternion);
    return right;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Matrix Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Set transform from a matrix
   */
  setFromMatrix(matrix: THREE.Matrix4): this {
    matrix.decompose(
      this._localTransform.position,
      this._localTransform.quaternion,
      this._localTransform.scale
    );
    this._markDirty();
    this.emit('transform', this);
    return this;
  }

  /**
   * Apply a matrix transformation (multiply current transform)
   */
  applyMatrix(matrix: THREE.Matrix4): this {
    const currentMatrix = this.localMatrix;
    currentMatrix.premultiply(matrix);
    this.setFromMatrix(currentMatrix);
    return this;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Dirty Flag Management
  // ─────────────────────────────────────────────────────────────────────────

  private _markDirty(): void {
    this._worldTransformDirty = true;
    // Mark all children dirty too (their world transform depends on ours)
    for (const child of this._children.values()) {
      child._markDirty();
    }
  }

  private _updateWorldTransform(): void {
    if (this._parent) {
      // World = Parent.World * Local
      const parentWorld = this._parent.worldMatrix;
      const localMat = this.localMatrix;

      this._worldMatrix.multiplyMatrices(parentWorld, localMat);

      // Decompose to get position/quaternion/scale
      this._worldMatrix.decompose(
        this._worldTransform.position,
        this._worldTransform.quaternion,
        this._worldTransform.scale
      );
    } else {
      // No parent, world = local
      this._worldTransform = cloneTransform(this._localTransform);
      this._worldMatrix.compose(
        this._worldTransform.position,
        this._worldTransform.quaternion,
        this._worldTransform.scale
      );
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

  addChild(node: SceneNode): this {
    if (node._parent) {
      node._parent.removeChild(node);
    }
    node._parent = this;
    this._children.set(node.id, node);
    node._markDirty();
    this.emit('childAdded', node);
    return this;
  }

  removeChild(node: SceneNode): this {
    if (this._children.delete(node.id)) {
      node._parent = null;
      this.emit('childRemoved', node);
    }
    return this;
  }

  /**
   * Find a descendant node by ID
   */
  findNode(id: string): SceneNode | null {
    if (this.id === id) return this;
    for (const child of this._children.values()) {
      const found = child.findNode(id);
      if (found) return found;
    }
    return null;
  }

  /**
   * Traverse all descendants
   */
  traverse(callback: (node: SceneNode) => void): void {
    callback(this);
    for (const child of this._children.values()) {
      child.traverse(callback);
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

  hasComponent(name: string): boolean {
    return this._components.has(name);
  }

  removeComponent(name: string): this {
    const component = this._components.get(name);
    if (component) {
      component.detach();
      this._components.delete(name);
    }
    return this;
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

  // Velocity (in local space)
  velocity: Velocity = {
    linear: new THREE.Vector3(0, 0, 0),
    angular: new THREE.Vector3(0, 0, 0),
  };

  // Collision shape
  collisionRadius: number = 0.04; // 4cm for cube robot
  collisionHeight: number = 0.08; // 8cm height

  // Motor state (for differential drive)
  motors = {
    leftPWM: 0,
    rightPWM: 0,
    leftRPM: 0,
    rightRPM: 0,
  };

  // Physical properties
  mass: number = 0.5; // kg
  friction: number = 0.3;

  update(_deltaTime: number): void {
    // Physics updates are handled by the physics system
  }

  /**
   * Get linear speed (magnitude of linear velocity)
   */
  get linearSpeed(): number {
    return this.velocity.linear.length();
  }

  /**
   * Get 2D linear velocity (for ground robots)
   * Returns velocity in physics coordinate system (X, Y where Y is forward)
   */
  get linearVelocity2D(): number {
    // Z component in Three.js is forward (Y in physics)
    return this.velocity.linear.z;
  }

  /**
   * Get angular velocity around Y axis (yaw rate)
   */
  get angularVelocity2D(): number {
    return this.velocity.angular.y;
  }

  /**
   * Set 2D velocity (for ground robots)
   */
  setVelocity2D(linear: number, angular: number): void {
    this.velocity.linear.set(0, 0, linear); // Forward is +Z
    this.velocity.angular.set(0, angular, 0); // Yaw is around Y
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

  // IMU (uses quaternion for orientation)
  imu = {
    orientation: new THREE.Quaternion(),
    accel: new THREE.Vector3(0, 0, 0),
    gyro: new THREE.Vector3(0, 0, 0),
  };

  // Bumpers
  bumper = { front: false, back: false };

  // Encoders (cumulative ticks)
  encoders = { left: 0, right: 0 };

  update(_deltaTime: number): void {
    // Sensor updates are handled by the physics system
  }

  /**
   * Get heading from IMU (yaw angle in radians)
   */
  get heading(): number {
    const euler = new THREE.Euler().setFromQuaternion(this.imu.orientation, 'YXZ');
    return euler.y;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION COMPONENT - Manages navigation state
// ═══════════════════════════════════════════════════════════════════════════

export interface RayData {
  angle: number; // Angle relative to robot forward (radians)
  distance: number; // Distance in cm
  clear: boolean; // Is path clear?
  endpoint?: THREE.Vector3; // World-space endpoint (optional)
}

export class NavigationComponent extends NodeComponent {
  readonly name = 'navigation';

  // Ray fan from sensors
  rays: RayData[] = [];

  // Best path
  bestPathAngle: number = 0;
  bestPathClearance: number = 0;
  bestPathDirection: THREE.Vector3 = new THREE.Vector3(0, 0, 1);

  // Collision prediction
  collisionPredicted: boolean = false;
  timeToCollision: number = Infinity;
  collisionPoint: THREE.Vector3 | null = null;

  // Recommended steering
  recommendedSteering = {
    leftMotor: 0,
    rightMotor: 0,
  };

  update(_deltaTime: number): void {
    // Navigation updates are handled by the navigation system
  }

  /**
   * Compute ray endpoints in world space
   */
  computeRayEndpoints(): void {
    if (!this.node) return;

    const worldPos = this.node.worldTransform.position;
    const worldQuat = this.node.worldTransform.quaternion;

    for (const ray of this.rays) {
      // Compute direction in local space
      const localDir = new THREE.Vector3(
        Math.sin(ray.angle),
        0,
        Math.cos(ray.angle)
      );

      // Transform to world space
      localDir.applyQuaternion(worldQuat);

      // Compute endpoint
      const distance = ray.distance / 100; // cm to meters
      ray.endpoint = worldPos.clone().add(localDir.multiplyScalar(distance));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VISUAL COMPONENT - Links to Three.js representation
// ═══════════════════════════════════════════════════════════════════════════

export class VisualComponent extends NodeComponent {
  readonly name = 'visual';

  // Reference to Three.js object (set by renderer)
  threeObject: THREE.Object3D | null = null;

  // Visual properties
  visible: boolean = true;
  color: THREE.Color = new THREE.Color(0xffffff);
  emissive: THREE.Color = new THREE.Color(0x000000);
  opacity: number = 1.0;

  // LED state (for robot)
  ledColor: THREE.Color = new THREE.Color(0x58a6ff);

  update(_deltaTime: number): void {
    // Sync Three.js object transform from node
    if (this.threeObject && this.node) {
      const world = this.node.worldTransform;
      this.threeObject.position.copy(world.position);
      this.threeObject.quaternion.copy(world.quaternion);
      this.threeObject.scale.copy(world.scale);
    }
  }

  /**
   * Set LED color from RGB values
   */
  setLedRGB(r: number, g: number, b: number): void {
    this.ledColor.setRGB(r / 255, g / 255, b / 255);
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

  // Time tracking
  private _lastUpdateTime: number = 0;

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
  // Node Accessors
  // ─────────────────────────────────────────────────────────────────────────

  get robotNode(): SceneNode | null {
    return this._robotNode;
  }

  get worldNode(): SceneNode {
    return this._worldNode!;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Node Factory Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create and register a robot node with all standard components
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

    // Position at midpoint
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    node.setPose2D(midX, midY, angle);
    node.userData.start = new THREE.Vector2(x1, y1);
    node.userData.end = new THREE.Vector2(x2, y2);
    node.userData.length = length;

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
   * Create a waypoint node
   */
  createWaypoint(id: string, x: number, y: number): SceneNode {
    const node = new SceneNode(id, 'waypoint');
    node.setPose2D(x, y, 0);

    this._worldNode!.addChild(node);
    this._nodes.set(id, node);

    this.emit('waypointCreated', node);
    return node;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Node Management
  // ─────────────────────────────────────────────────────────────────────────

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
   * Remove a node and its children
   */
  removeNode(id: string): void {
    const node = this._nodes.get(id);
    if (!node) return;

    // Remove all children first
    for (const child of node.children.values()) {
      this.removeNode(child.id);
    }

    // Remove from parent
    if (node.parent) {
      node.parent.removeChild(node);
    }

    this._nodes.delete(id);

    if (node === this._robotNode) {
      this._robotNode = null;
    }

    this.emit('nodeRemoved', node);
  }

  /**
   * Clear all nodes except root and world
   */
  clear(): void {
    const toRemove: string[] = [];
    for (const id of this._nodes.keys()) {
      if (id !== 'root' && id !== 'world') {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this.removeNode(id);
    }
    this._robotNode = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // System Management
  // ─────────────────────────────────────────────────────────────────────────

  addSystem(system: SceneSystem): void {
    system.initialize(this);
    this._systems.push(system);
    this._systems.sort((a, b) => a.priority - b.priority);
  }

  removeSystem(system: SceneSystem): void {
    const index = this._systems.indexOf(system);
    if (index >= 0) {
      this._systems.splice(index, 1);
    }
  }

  getSystem<T extends SceneSystem>(name: string): T | undefined {
    return this._systems.find((s) => s.name === name) as T | undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Update Loop
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update all systems and nodes
   */
  update(deltaTime?: number): void {
    const now = performance.now();
    const dt = deltaTime ?? (this._lastUpdateTime ? (now - this._lastUpdateTime) / 1000 : 0.016);
    this._lastUpdateTime = now;

    // Update systems first (they may modify node state)
    for (const system of this._systems) {
      system.update(dt);
    }

    // Update all node components
    this.rootNode.traverse((node) => node.update(dt));

    this.emit('updated', dt);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Convenience Methods for Robot
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
        physics.setVelocity2D(linear, angular);
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

        // Compute best path direction
        nav.bestPathDirection.set(
          Math.sin(bestAngle),
          0,
          Math.cos(bestAngle)
        ).applyQuaternion(this._robotNode.worldTransform.quaternion);

        // Compute ray endpoints in world space
        nav.computeRayEndpoints();
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE SYSTEM - Processes nodes each frame
// ═══════════════════════════════════════════════════════════════════════════

export abstract class SceneSystem {
  abstract readonly name: string;
  readonly priority: number = 0; // Lower = runs first

  protected sceneManager: SceneManager | null = null;

  initialize(sceneManager: SceneManager): void {
    this.sceneManager = sceneManager;
    this.onInitialize();
  }

  protected onInitialize(): void {}
  abstract update(deltaTime: number): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get scene manager for a device (convenience function)
 */
export function getSceneManager(deviceId: string): SceneManager {
  return SceneManager.getInstance(deviceId);
}

/**
 * Create a rotation quaternion from axis and angle
 */
export function quaternionFromAxisAngle(axis: THREE.Vector3, angle: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}

/**
 * Create a rotation quaternion from Euler angles
 */
export function quaternionFromEuler(x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ'): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order));
}

/**
 * Interpolate between two quaternions (SLERP)
 */
export function slerpQuaternion(a: THREE.Quaternion, b: THREE.Quaternion, t: number): THREE.Quaternion {
  return new THREE.Quaternion().slerpQuaternions(a, b, t);
}
