/**
 * World Model System for Robot AI Agents
 *
 * This module provides a cognitive world model that robots use to:
 * 1. Build an internal representation of their environment
 * 2. Track explored vs unexplored areas
 * 3. Remember obstacle locations and safe paths
 * 4. Generate ASCII visualizations of their understanding
 * 5. Progressively improve their model through exploration
 *
 * Philosophy: An intelligent robot must first understand its world
 * before it can effectively navigate and act within it.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GridCell {
  x: number;
  y: number;
  state: CellState;
  confidence: number;        // 0.0 to 1.0 - how confident we are about this cell
  lastUpdated: number;       // Timestamp of last update
  visitCount: number;        // How many times the robot has been here
  distanceReading?: number;  // Last distance sensor reading at this cell
}

export type CellState =
  | 'unknown'      // Not yet observed
  | 'free'         // Safe to traverse
  | 'obstacle'     // Contains an obstacle
  | 'wall'         // Wall boundary
  | 'explored'     // Visited by robot
  | 'path'         // Part of a planned/traveled path
  | 'collectible'  // Contains a collectible item
  | 'collected';   // Collectible was here but collected

export interface WorldModelConfig {
  gridResolution: number;    // Cell size in cm (default: 10cm)
  worldWidth: number;        // World width in cm
  worldHeight: number;       // World height in cm
  confidenceDecay: number;   // How quickly confidence decays (0.0 to 1.0)
  explorationBonus: number;  // Bonus for exploring new areas
}

export interface RobotPoseSnapshot {
  x: number;
  y: number;
  rotation: number;
  timestamp: number;
}

export interface WorldModelSnapshot {
  grid: GridCell[][];
  robotPath: RobotPoseSnapshot[];
  explorationProgress: number;  // 0.0 to 1.0
  obstacleCount: number;
  collectiblesFound: number;
  collectiblesCollected: number;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORLD MODEL CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class WorldModel {
  private grid: GridCell[][];
  private config: WorldModelConfig;
  private robotPath: RobotPoseSnapshot[] = [];
  private collectiblesFound: Set<string> = new Set();
  private collectiblesCollected: Set<string> = new Set();
  private obstacleLocations: Array<{ x: number; y: number; radius: number }> = [];

  // Grid dimensions
  private gridWidth: number;
  private gridHeight: number;
  private offsetX: number;
  private offsetY: number;

  constructor(config: Partial<WorldModelConfig> = {}) {
    this.config = {
      gridResolution: config.gridResolution ?? 10,  // 10cm per cell
      worldWidth: config.worldWidth ?? 500,         // 5m default
      worldHeight: config.worldHeight ?? 500,       // 5m default
      confidenceDecay: config.confidenceDecay ?? 0.995,
      explorationBonus: config.explorationBonus ?? 0.1,
    };

    // Calculate grid dimensions
    this.gridWidth = Math.ceil(this.config.worldWidth / this.config.gridResolution);
    this.gridHeight = Math.ceil(this.config.worldHeight / this.config.gridResolution);

    // Offset to center the grid (world coordinates can be negative)
    this.offsetX = Math.floor(this.gridWidth / 2);
    this.offsetY = Math.floor(this.gridHeight / 2);

    // Initialize grid
    this.grid = this.initializeGrid();
  }

  private initializeGrid(): GridCell[][] {
    const grid: GridCell[][] = [];
    for (let y = 0; y < this.gridHeight; y++) {
      grid[y] = [];
      for (let x = 0; x < this.gridWidth; x++) {
        grid[y][x] = {
          x,
          y,
          state: 'unknown',
          confidence: 0,
          lastUpdated: 0,
          visitCount: 0,
        };
      }
    }
    return grid;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COORDINATE CONVERSION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convert world coordinates (meters) to grid coordinates
   */
  worldToGrid(worldX: number, worldY: number): { gx: number; gy: number } {
    const gx = Math.floor((worldX * 100) / this.config.gridResolution) + this.offsetX;
    const gy = Math.floor((worldY * 100) / this.config.gridResolution) + this.offsetY;
    return { gx, gy };
  }

  /**
   * Convert grid coordinates to world coordinates (meters)
   */
  gridToWorld(gx: number, gy: number): { x: number; y: number } {
    const x = ((gx - this.offsetX) * this.config.gridResolution) / 100;
    const y = ((gy - this.offsetY) * this.config.gridResolution) / 100;
    return { x, y };
  }

  /**
   * Check if grid coordinates are valid
   */
  isValidGridCoord(gx: number, gy: number): boolean {
    return gx >= 0 && gx < this.gridWidth && gy >= 0 && gy < this.gridHeight;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ARENA BOUNDARY INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize the world model with known arena boundaries (walls)
   * This should be called when starting with a known arena to pre-populate
   * the world model with wall locations so the robot knows its limits.
   *
   * @param bounds The arena bounds in meters
   */
  initializeArenaBoundaries(bounds: { minX: number; maxX: number; minY: number; maxY: number }): void {
    const timestamp = Date.now();
    const wallConfidence = 0.95; // High confidence for known arena boundaries

    // Mark all cells along the boundaries as walls
    // We'll mark a few cells thick to ensure the robot sees them
    const wallThickness = 2; // cells

    // Bottom wall (minY)
    for (let x = bounds.minX; x <= bounds.maxX; x += this.config.gridResolution / 100) {
      for (let thickness = 0; thickness < wallThickness; thickness++) {
        const y = bounds.minY + (thickness * this.config.gridResolution / 100);
        const { gx, gy } = this.worldToGrid(x, y);
        if (this.isValidGridCoord(gx, gy)) {
          this.updateCell(gx, gy, 'wall', wallConfidence, timestamp);
        }
      }
    }

    // Top wall (maxY)
    for (let x = bounds.minX; x <= bounds.maxX; x += this.config.gridResolution / 100) {
      for (let thickness = 0; thickness < wallThickness; thickness++) {
        const y = bounds.maxY - (thickness * this.config.gridResolution / 100);
        const { gx, gy } = this.worldToGrid(x, y);
        if (this.isValidGridCoord(gx, gy)) {
          this.updateCell(gx, gy, 'wall', wallConfidence, timestamp);
        }
      }
    }

    // Left wall (minX)
    for (let y = bounds.minY; y <= bounds.maxY; y += this.config.gridResolution / 100) {
      for (let thickness = 0; thickness < wallThickness; thickness++) {
        const x = bounds.minX + (thickness * this.config.gridResolution / 100);
        const { gx, gy } = this.worldToGrid(x, y);
        if (this.isValidGridCoord(gx, gy)) {
          this.updateCell(gx, gy, 'wall', wallConfidence, timestamp);
        }
      }
    }

    // Right wall (maxX)
    for (let y = bounds.minY; y <= bounds.maxY; y += this.config.gridResolution / 100) {
      for (let thickness = 0; thickness < wallThickness; thickness++) {
        const x = bounds.maxX - (thickness * this.config.gridResolution / 100);
        const { gx, gy } = this.worldToGrid(x, y);
        if (this.isValidGridCoord(gx, gy)) {
          this.updateCell(gx, gy, 'wall', wallConfidence, timestamp);
        }
      }
    }
  }

  /**
   * Initialize arena boundaries from a wall array (from FloorMap)
   * This marks all wall segments in the world model
   */
  initializeWallsFromMap(walls: Array<{ x1: number; y1: number; x2: number; y2: number }>): void {
    const timestamp = Date.now();
    const wallConfidence = 0.95;
    const stepSize = this.config.gridResolution / 100; // Step in meters

    for (const wall of walls) {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.ceil(length / stepSize);

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = wall.x1 + dx * t;
        const y = wall.y1 + dy * t;

        const { gx, gy } = this.worldToGrid(x, y);
        if (this.isValidGridCoord(gx, gy)) {
          this.updateCell(gx, gy, 'wall', wallConfidence, timestamp);
        }

        // Also mark adjacent cells to make walls more visible
        const perpX = -dy / length;
        const perpY = dx / length;
        for (const offset of [-1, 1]) {
          const adjX = x + perpX * stepSize * offset;
          const adjY = y + perpY * stepSize * offset;
          const adj = this.worldToGrid(adjX, adjY);
          if (this.isValidGridCoord(adj.gx, adj.gy)) {
            this.updateCell(adj.gx, adj.gy, 'wall', wallConfidence * 0.8, timestamp);
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORLD MODEL UPDATES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update the world model with new sensor readings
   */
  updateFromSensors(
    pose: { x: number; y: number; rotation: number },
    distance: { front: number; frontLeft: number; frontRight: number; left: number; right: number; back: number },
    timestamp: number = Date.now()
  ): void {
    // Record robot position
    this.robotPath.push({
      x: pose.x,
      y: pose.y,
      rotation: pose.rotation,
      timestamp,
    });

    // Keep path history manageable
    if (this.robotPath.length > 1000) {
      this.robotPath = this.robotPath.slice(-500);
    }

    // Mark current position as explored
    const { gx, gy } = this.worldToGrid(pose.x, pose.y);
    if (this.isValidGridCoord(gx, gy)) {
      this.updateCell(gx, gy, 'explored', 1.0, timestamp);
      this.grid[gy][gx].visitCount++;
    }

    // Update cells based on distance sensor readings
    this.updateFromDistanceSensor(pose, distance.front, 0, timestamp);
    this.updateFromDistanceSensor(pose, distance.frontLeft, Math.PI / 6, timestamp);
    this.updateFromDistanceSensor(pose, distance.frontRight, -Math.PI / 6, timestamp);
    this.updateFromDistanceSensor(pose, distance.left, Math.PI / 2, timestamp);
    this.updateFromDistanceSensor(pose, distance.right, -Math.PI / 2, timestamp);
    this.updateFromDistanceSensor(pose, distance.back, Math.PI, timestamp);
  }

  /**
   * Update cells along a distance sensor ray
   */
  private updateFromDistanceSensor(
    pose: { x: number; y: number; rotation: number },
    distance: number,
    angleOffset: number,
    timestamp: number
  ): void {
    const angle = pose.rotation + angleOffset;
    const distanceMeters = distance / 100; // Convert cm to meters
    const stepSize = this.config.gridResolution / 100; // Step in meters

    // Ray cast from robot position
    for (let d = 0; d < distanceMeters; d += stepSize) {
      const wx = pose.x + Math.sin(angle) * d;
      const wy = pose.y - Math.cos(angle) * d;
      const { gx, gy } = this.worldToGrid(wx, wy);

      if (this.isValidGridCoord(gx, gy)) {
        // Mark intermediate cells as free
        const confidence = Math.max(0.5, 1.0 - (d / distanceMeters) * 0.5);
        if (this.grid[gy][gx].state === 'unknown' || this.grid[gy][gx].state === 'free') {
          this.updateCell(gx, gy, 'free', confidence, timestamp);
        }
      }
    }

    // Mark the endpoint as obstacle if distance indicates one
    if (distance < 200) { // Less than 2 meters indicates obstacle
      const wx = pose.x + Math.sin(angle) * distanceMeters;
      const wy = pose.y - Math.cos(angle) * distanceMeters;
      const { gx, gy } = this.worldToGrid(wx, wy);

      if (this.isValidGridCoord(gx, gy)) {
        this.updateCell(gx, gy, 'obstacle', 0.9, timestamp);
        this.grid[gy][gx].distanceReading = distance;
      }
    }
  }

  /**
   * Update a single cell in the grid
   */
  private updateCell(gx: number, gy: number, state: CellState, confidence: number, timestamp: number): void {
    if (!this.isValidGridCoord(gx, gy)) return;

    const cell = this.grid[gy][gx];

    // Don't downgrade explored cells to free
    if (cell.state === 'explored' && state === 'free') {
      return;
    }

    // IMPORTANT: Don't downgrade walls to obstacles or free
    // Walls are known boundaries and should be protected
    if (cell.state === 'wall' && (state === 'free' || state === 'obstacle')) {
      // Only allow upgrading wall confidence, not changing the state
      if (state === 'obstacle' && confidence > cell.confidence) {
        // Keep it as wall but boost confidence since obstacle detection confirms it
        cell.confidence = Math.max(cell.confidence, confidence);
        cell.lastUpdated = timestamp;
      }
      return;
    }

    // Walls have priority over obstacles (they're both barriers, but walls are known)
    if (cell.state === 'obstacle' && state === 'wall') {
      cell.state = 'wall';
      cell.confidence = Math.max(cell.confidence, confidence);
      cell.lastUpdated = timestamp;
      return;
    }

    // Update with highest confidence observation
    if (confidence >= cell.confidence || state === 'obstacle' || state === 'wall' || state === 'explored') {
      cell.state = state;
      cell.confidence = Math.max(cell.confidence, confidence);
      cell.lastUpdated = timestamp;
    }
  }

  /**
   * Update a cell from vision data
   * This is a public method for the camera vision model to update the world model
   */
  updateCellFromVision(
    worldX: number,
    worldY: number,
    state: CellState,
    confidence: number
  ): void {
    const { gx, gy } = this.worldToGrid(worldX, worldY);
    if (this.isValidGridCoord(gx, gy)) {
      this.updateCell(gx, gy, state, confidence, Date.now());
    }
  }

  /**
   * Update multiple cells along a ray from vision data
   * Used to mark areas as free based on camera vision (what we can see through)
   */
  updateRayFromVision(
    startX: number,
    startY: number,
    angle: number,
    distance: number,
    freeConfidence: number,
    obstacleState: CellState | null,
    obstacleConfidence: number
  ): void {
    const stepSize = this.config.gridResolution / 100; // Step in meters

    // Mark intermediate cells as free
    for (let d = stepSize; d < distance; d += stepSize) {
      const wx = startX + Math.sin(angle) * d;
      const wy = startY - Math.cos(angle) * d;
      const { gx, gy } = this.worldToGrid(wx, wy);

      if (this.isValidGridCoord(gx, gy)) {
        const cell = this.grid[gy][gx];
        // Only update if cell is unknown or if this is higher confidence
        if (cell.state === 'unknown' || cell.confidence < freeConfidence) {
          this.updateCell(gx, gy, 'free', freeConfidence * (1 - d / distance), Date.now());
        }
      }
    }

    // Mark endpoint as obstacle if specified
    if (obstacleState !== null) {
      const wx = startX + Math.sin(angle) * distance;
      const wy = startY - Math.cos(angle) * distance;
      const { gx, gy } = this.worldToGrid(wx, wy);

      if (this.isValidGridCoord(gx, gy)) {
        this.updateCell(gx, gy, obstacleState, obstacleConfidence, Date.now());
      }
    }
  }

  /**
   * Get cells that appear unexplored in a given direction from a position
   * Used for vision-based exploration planning
   */
  getUnexploredCellsInDirection(
    pose: { x: number; y: number; rotation: number },
    angleOffset: number,
    maxDistance: number,
    fovWidth: number
  ): { x: number; y: number; distance: number }[] {
    const unexplored: { x: number; y: number; distance: number }[] = [];
    const angle = pose.rotation + angleOffset;
    const stepSize = this.config.gridResolution / 100;
    const halfFov = fovWidth / 2;

    // Sample across the field of view
    for (let fovOffset = -halfFov; fovOffset <= halfFov; fovOffset += halfFov / 2) {
      const rayAngle = angle + fovOffset;

      for (let d = stepSize; d < maxDistance; d += stepSize) {
        const wx = pose.x + Math.sin(rayAngle) * d;
        const wy = pose.y - Math.cos(rayAngle) * d;
        const { gx, gy } = this.worldToGrid(wx, wy);

        if (this.isValidGridCoord(gx, gy)) {
          const cell = this.grid[gy][gx];
          if (cell.state === 'unknown') {
            unexplored.push({ x: wx, y: wy, distance: d });
          } else if (cell.state === 'obstacle' || cell.state === 'wall') {
            // Stop ray at obstacle
            break;
          }
        }
      }
    }

    return unexplored;
  }

  /**
   * Calculate the exploration value of a viewpoint
   * Higher values indicate better positions for gaining visual information
   */
  calculateViewpointValue(pose: { x: number; y: number; rotation: number }): number {
    let value = 0;
    const fov = Math.PI / 2; // 90 degrees
    const maxRange = 2.0; // 2 meters

    // Check multiple directions within FOV
    const directions = [-fov / 3, 0, fov / 3];

    for (const offset of directions) {
      const cells = this.getUnexploredCellsInDirection(pose, offset, maxRange, fov / 3);
      // More unexplored cells visible = higher value
      value += cells.length;
      // Closer unexplored cells are more valuable (easier to scan)
      for (const cell of cells) {
        value += (maxRange - cell.distance) / maxRange;
      }
    }

    return value;
  }

  /**
   * Record a collectible at a position
   */
  recordCollectible(id: string, x: number, y: number): void {
    this.collectiblesFound.add(id);
    const { gx, gy } = this.worldToGrid(x, y);
    if (this.isValidGridCoord(gx, gy)) {
      this.updateCell(gx, gy, 'collectible', 1.0, Date.now());
    }
  }

  /**
   * Record that a collectible was collected
   */
  recordCollected(id: string, x: number, y: number): void {
    this.collectiblesCollected.add(id);
    const { gx, gy } = this.worldToGrid(x, y);
    if (this.isValidGridCoord(gx, gy)) {
      this.updateCell(gx, gy, 'collected', 1.0, Date.now());
    }
  }

  /**
   * Decay confidence over time (call periodically)
   */
  decayConfidence(): void {
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        if (this.grid[y][x].state !== 'unknown') {
          this.grid[y][x].confidence *= this.config.confidenceDecay;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORLD MODEL QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get exploration progress (0.0 to 1.0)
   */
  getExplorationProgress(): number {
    let explored = 0;
    let total = 0;

    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        if (this.grid[y][x].state !== 'unknown') {
          explored++;
        }
        total++;
      }
    }

    return explored / total;
  }

  /**
   * Get count of known obstacles
   */
  getObstacleCount(): number {
    let count = 0;
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        if (this.grid[y][x].state === 'obstacle') {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Get a snapshot of the current world model state
   */
  getSnapshot(): WorldModelSnapshot {
    return {
      grid: this.grid.map(row => row.map(cell => ({ ...cell }))),
      robotPath: [...this.robotPath],
      explorationProgress: this.getExplorationProgress(),
      obstacleCount: this.getObstacleCount(),
      collectiblesFound: this.collectiblesFound.size,
      collectiblesCollected: this.collectiblesCollected.size,
      timestamp: Date.now(),
    };
  }

  /**
   * Get unexplored directions from current position
   */
  getUnexploredDirections(pose: { x: number; y: number }): Array<{ direction: string; distance: number; angle: number }> {
    const directions: Array<{ direction: string; distance: number; angle: number }> = [];
    const checkDistances = [0.5, 1.0, 1.5, 2.0]; // Meters to check
    const angles = [
      { name: 'front', angle: 0 },
      { name: 'front-left', angle: Math.PI / 4 },
      { name: 'front-right', angle: -Math.PI / 4 },
      { name: 'left', angle: Math.PI / 2 },
      { name: 'right', angle: -Math.PI / 2 },
      { name: 'back-left', angle: 3 * Math.PI / 4 },
      { name: 'back-right', angle: -3 * Math.PI / 4 },
      { name: 'back', angle: Math.PI },
    ];

    for (const { name, angle } of angles) {
      let unexploredDistance = 0;
      for (const distance of checkDistances) {
        const wx = pose.x + Math.sin(angle) * distance;
        const wy = pose.y - Math.cos(angle) * distance;
        const { gx, gy } = this.worldToGrid(wx, wy);

        if (this.isValidGridCoord(gx, gy) && this.grid[gy][gx].state === 'unknown') {
          unexploredDistance = distance;
          break;
        }
      }

      if (unexploredDistance > 0) {
        directions.push({
          direction: name,
          distance: unexploredDistance,
          angle,
        });
      }
    }

    return directions;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ASCII VISUALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate an ASCII representation of the world model
   * This is what the robot "thinks" the world looks like
   */
  generateASCIIMap(
    robotPose?: { x: number; y: number; rotation: number },
    viewSize: number = 21 // Must be odd for centering
  ): string {
    const halfSize = Math.floor(viewSize / 2);
    let centerX = this.offsetX;
    let centerY = this.offsetY;

    // Center on robot if pose provided
    if (robotPose) {
      const { gx, gy } = this.worldToGrid(robotPose.x, robotPose.y);
      centerX = gx;
      centerY = gy;
    }

    const lines: string[] = [];

    // Header
    lines.push('┌' + '─'.repeat(viewSize + 2) + '┐');
    lines.push('│ WORLD MODEL (Robot View) │');
    lines.push('├' + '─'.repeat(viewSize + 2) + '┤');

    // Grid
    for (let dy = -halfSize; dy <= halfSize; dy++) {
      let line = '│ ';
      for (let dx = -halfSize; dx <= halfSize; dx++) {
        const gx = centerX + dx;
        const gy = centerY + dy;

        // Check if this is robot position
        if (robotPose) {
          const robotGrid = this.worldToGrid(robotPose.x, robotPose.y);
          if (gx === robotGrid.gx && gy === robotGrid.gy) {
            // Robot direction indicator
            const dir = this.getDirectionChar(robotPose.rotation);
            line += dir;
            continue;
          }
        }

        if (!this.isValidGridCoord(gx, gy)) {
          line += '░'; // Out of bounds
        } else {
          const cell = this.grid[gy][gx];
          line += this.getCellChar(cell);
        }
      }
      line += ' │';
      lines.push(line);
    }

    // Footer with legend
    lines.push('├' + '─'.repeat(viewSize + 2) + '┤');
    lines.push('│ Legend:                   │');
    lines.push('│ · unknown  ░ boundary     │');
    lines.push('│ . free     █ obstacle     │');
    lines.push('│ * explored ◆ collectible  │');
    lines.push('│ ▲▶▼◀ robot direction      │');
    lines.push('└' + '─'.repeat(viewSize + 2) + '┘');

    return lines.join('\n');
  }

  /**
   * Generate a compact ASCII summary for LLM context
   */
  generateCompactSummary(robotPose: { x: number; y: number; rotation: number }): string {
    const progress = (this.getExplorationProgress() * 100).toFixed(1);
    const obstacles = this.getObstacleCount();
    const unexplored = this.getUnexploredDirections(robotPose);

    let summary = `WORLD MODEL STATUS:\n`;
    summary += `├─ Exploration: ${progress}%\n`;
    summary += `├─ Obstacles detected: ${obstacles}\n`;
    summary += `├─ Collectibles: ${this.collectiblesCollected.size}/${this.collectiblesFound.size} collected\n`;
    summary += `├─ Path history: ${this.robotPath.length} points\n`;

    if (unexplored.length > 0) {
      summary += `└─ Unexplored directions: ${unexplored.map(u => u.direction).join(', ')}\n`;
    } else {
      summary += `└─ All nearby areas explored\n`;
    }

    return summary;
  }

  /**
   * Generate a full cognitive analysis for the AI robot
   * This helps the robot "think" about its environment before acting
   */
  generateCognitiveAnalysis(
    robotPose: { x: number; y: number; rotation: number },
    sensorData: { front: number; frontLeft: number; frontRight: number; left: number; right: number; back: number }
  ): string {
    const progress = (this.getExplorationProgress() * 100).toFixed(1);
    const unexplored = this.getUnexploredDirections(robotPose);
    const directionName = this.getCompassDirection(robotPose.rotation);

    // Analyze immediate surroundings
    const immediateThreats = [];
    const clearPaths = [];

    if (sensorData.front < 30) immediateThreats.push('OBSTACLE AHEAD (CRITICAL)');
    else if (sensorData.front < 50) immediateThreats.push('obstacle ahead (caution)');
    else clearPaths.push(`front (${sensorData.front}cm)`);

    if (sensorData.left < 30) immediateThreats.push('obstacle left');
    else clearPaths.push(`left (${sensorData.left}cm)`);

    if (sensorData.right < 30) immediateThreats.push('obstacle right');
    else clearPaths.push(`right (${sensorData.right}cm)`);

    // Determine best exploration direction
    const bestDirection = clearPaths.length > 0
      ? clearPaths.reduce((a, b) => {
          const aNum = parseInt(a.match(/\d+/)?.[0] || '0');
          const bNum = parseInt(b.match(/\d+/)?.[0] || '0');
          return aNum > bNum ? a : b;
        })
      : 'none - surrounded!';

    // Build cognitive analysis
    let analysis = `╔══════════════════════════════════════════╗\n`;
    analysis += `║     COGNITIVE WORLD MODEL ANALYSIS       ║\n`;
    analysis += `╠══════════════════════════════════════════╣\n`;
    analysis += `║ POSITION: (${robotPose.x.toFixed(2)}, ${robotPose.y.toFixed(2)}) facing ${directionName}\n`;
    analysis += `║ EXPLORATION: ${progress}% complete\n`;
    analysis += `╟──────────────────────────────────────────╢\n`;
    analysis += `║ IMMEDIATE PERCEPTION:\n`;
    analysis += `║   Front: ${sensorData.front}cm  Left: ${sensorData.left}cm  Right: ${sensorData.right}cm\n`;

    if (immediateThreats.length > 0) {
      analysis += `║ ⚠ THREATS: ${immediateThreats.join(', ')}\n`;
    }
    if (clearPaths.length > 0) {
      analysis += `║ ✓ CLEAR: ${clearPaths.join(', ')}\n`;
    }

    analysis += `╟──────────────────────────────────────────╢\n`;
    analysis += `║ WORLD UNDERSTANDING:\n`;

    if (unexplored.length > 0) {
      analysis += `║   Unexplored areas: ${unexplored.map(u => u.direction).slice(0, 3).join(', ')}\n`;
      analysis += `║   → RECOMMENDATION: Explore toward ${unexplored[0].direction}\n`;
    } else {
      analysis += `║   All nearby areas mapped\n`;
      analysis += `║   → RECOMMENDATION: Continue systematic sweep\n`;
    }

    analysis += `║   Best clear path: ${bestDirection}\n`;
    analysis += `╚══════════════════════════════════════════╝`;

    return analysis;
  }

  /**
   * Get compass direction from rotation angle
   */
  private getCompassDirection(rotation: number): string {
    const normalized = ((rotation % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
    const degrees = (normalized * 180) / Math.PI;

    if (degrees < 22.5 || degrees >= 337.5) return 'North';
    if (degrees < 67.5) return 'NE';
    if (degrees < 112.5) return 'East';
    if (degrees < 157.5) return 'SE';
    if (degrees < 202.5) return 'South';
    if (degrees < 247.5) return 'SW';
    if (degrees < 292.5) return 'West';
    return 'NW';
  }

  /**
   * Get ASCII character for a cell state
   */
  private getCellChar(cell: GridCell): string {
    switch (cell.state) {
      case 'unknown': return '·';
      case 'free': return '.';
      case 'explored': return '*';
      case 'obstacle': return '█';
      case 'wall': return '▓';
      case 'path': return '○';
      case 'collectible': return '◆';
      case 'collected': return '◇';
      default: return '?';
    }
  }

  /**
   * Get direction character for robot heading
   */
  private getDirectionChar(rotation: number): string {
    // Normalize to 0-2π
    const normalized = ((rotation % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);

    // 8 directions
    if (normalized < Math.PI / 8 || normalized >= 15 * Math.PI / 8) return '▲'; // North
    if (normalized < 3 * Math.PI / 8) return '◣'; // NE
    if (normalized < 5 * Math.PI / 8) return '◀'; // East (note: our coord system)
    if (normalized < 7 * Math.PI / 8) return '◺'; // SE
    if (normalized < 9 * Math.PI / 8) return '▼'; // South
    if (normalized < 11 * Math.PI / 8) return '◿'; // SW
    if (normalized < 13 * Math.PI / 8) return '▶'; // West
    return '◤'; // NW
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MINI-MAP GENERATION FOR UI
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate mini-map data for UI rendering
   * Returns a simplified representation suitable for canvas rendering
   */
  generateMiniMapData(size: number = 50): {
    cells: Array<{ x: number; y: number; state: CellState; confidence: number }>;
    robotPosition: { x: number; y: number; rotation: number } | null;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
  } {
    // Downsample grid to mini-map size
    const scaleX = size / this.gridWidth;
    const scaleY = size / this.gridHeight;

    const cells: Array<{ x: number; y: number; state: CellState; confidence: number }> = [];

    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        const cell = this.grid[y][x];
        if (cell.state !== 'unknown') {
          cells.push({
            x: Math.floor(x * scaleX),
            y: Math.floor(y * scaleY),
            state: cell.state,
            confidence: cell.confidence,
          });
        }
      }
    }

    // Get latest robot position
    const lastPose = this.robotPath.length > 0 ? this.robotPath[this.robotPath.length - 1] : null;
    let robotPosition = null;
    if (lastPose) {
      const { gx, gy } = this.worldToGrid(lastPose.x, lastPose.y);
      robotPosition = {
        x: Math.floor(gx * scaleX),
        y: Math.floor(gy * scaleY),
        rotation: lastPose.rotation,
      };
    }

    return {
      cells,
      robotPosition,
      bounds: {
        minX: 0,
        maxX: size,
        minY: 0,
        maxY: size,
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const worldModels = new Map<string, WorldModel>();

/**
 * Get or create a world model for a specific robot/device
 */
export function getWorldModel(deviceId: string, config?: Partial<WorldModelConfig>): WorldModel {
  if (!worldModels.has(deviceId)) {
    worldModels.set(deviceId, new WorldModel(config));
  }
  return worldModels.get(deviceId)!;
}

/**
 * Clear a world model (e.g., when resetting simulation)
 */
export function clearWorldModel(deviceId: string): void {
  worldModels.delete(deviceId);
}

/**
 * Clear all world models
 */
export function clearAllWorldModels(): void {
  worldModels.clear();
}

export default WorldModel;
