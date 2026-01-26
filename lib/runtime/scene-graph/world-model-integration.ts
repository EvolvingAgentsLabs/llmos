/**
 * World Model Integration
 *
 * Bridges the Scene Graph with the existing WorldModel (occupancy grid).
 * Syncs data between the two systems for comprehensive spatial understanding.
 */

import { WorldModel, getWorldModel, CellState } from '../world-model';
import { SceneGraphManager, getSceneGraphManager } from './scene-graph-manager';
import { Vector3, ObjectCategory } from './types';

// ============================================================================
// Integration Types
// ============================================================================

export interface WorldModelSceneGraphBridge {
  worldModel: WorldModel;
  sceneGraphManager: SceneGraphManager;
  syncInterval: NodeJS.Timeout | null;
}

export interface IntegrationConfig {
  /** Sync interval in ms */
  syncInterval: number;

  /** Auto-generate waypoints from explored cells */
  autoGenerateWaypoints: boolean;

  /** Waypoint spacing in meters */
  waypointSpacing: number;

  /** Track collectibles in scene graph */
  trackCollectibles: boolean;

  /** Track obstacles in scene graph */
  trackObstacles: boolean;
}

const DEFAULT_INTEGRATION_CONFIG: IntegrationConfig = {
  syncInterval: 500,
  autoGenerateWaypoints: true,
  waypointSpacing: 0.3,
  trackCollectibles: true,
  trackObstacles: true,
};

// ============================================================================
// Integration Bridge
// ============================================================================

const bridges = new Map<string, WorldModelSceneGraphBridge>();

/**
 * Create an integrated world model + scene graph for a device
 */
export function createIntegratedWorldModel(
  deviceId: string,
  config: Partial<IntegrationConfig> = {}
): WorldModelSceneGraphBridge {
  const fullConfig = { ...DEFAULT_INTEGRATION_CONFIG, ...config };

  // Get or create both systems
  const worldModel = getWorldModel(deviceId);
  const sceneGraphManager = getSceneGraphManager(deviceId, {
    autoGenerateWaypoints: fullConfig.autoGenerateWaypoints,
    waypointSpacing: fullConfig.waypointSpacing,
  });

  const bridge: WorldModelSceneGraphBridge = {
    worldModel,
    sceneGraphManager,
    syncInterval: null,
  };

  bridges.set(deviceId, bridge);

  return bridge;
}

/**
 * Get an existing bridge
 */
export function getIntegratedWorldModel(deviceId: string): WorldModelSceneGraphBridge | null {
  return bridges.get(deviceId) || null;
}

/**
 * Start automatic synchronization between world model and scene graph
 */
export function startSync(deviceId: string, config: Partial<IntegrationConfig> = {}): void {
  const bridge = bridges.get(deviceId);
  if (!bridge) return;

  const fullConfig = { ...DEFAULT_INTEGRATION_CONFIG, ...config };

  // Stop existing sync
  if (bridge.syncInterval) {
    clearInterval(bridge.syncInterval);
  }

  // Start sync loop
  bridge.syncInterval = setInterval(() => {
    syncWorldModelToSceneGraph(bridge, fullConfig);
  }, fullConfig.syncInterval);
}

/**
 * Stop synchronization
 */
export function stopSync(deviceId: string): void {
  const bridge = bridges.get(deviceId);
  if (!bridge) return;

  if (bridge.syncInterval) {
    clearInterval(bridge.syncInterval);
    bridge.syncInterval = null;
  }
}

/**
 * Manually sync world model data to scene graph
 */
export function syncWorldModelToSceneGraph(
  bridge: WorldModelSceneGraphBridge,
  config: IntegrationConfig = DEFAULT_INTEGRATION_CONFIG
): void {
  const { worldModel, sceneGraphManager } = bridge;

  // Get world model snapshot
  const snapshot = worldModel.getSnapshot();
  const miniMap = worldModel.generateMiniMapData();

  // Update robot position
  if (miniMap.robotPosition) {
    const robotPose = snapshot.robotPath[snapshot.robotPath.length - 1];
    if (robotPose) {
      sceneGraphManager.updateRobotState({
        position: {
          x: robotPose.x,
          y: 0,
          z: robotPose.y, // World model uses y for z-axis
        },
        rotation: robotPose.rotation,
        timestamp: robotPose.timestamp,
      });
    }
  }

  // Sync collectibles
  if (config.trackCollectibles) {
    syncCollectibles(bridge);
  }

  // Sync obstacles
  if (config.trackObstacles) {
    syncObstacles(bridge);
  }
}

/**
 * Sync collectibles from world model to scene graph
 */
function syncCollectibles(bridge: WorldModelSceneGraphBridge): void {
  const { worldModel, sceneGraphManager } = bridge;
  const snapshot = worldModel.getSnapshot();

  // Get collectible cells from grid
  for (const row of snapshot.grid) {
    for (const cell of row) {
      if (cell.state === 'collectible') {
        const worldPos = worldModel.gridToWorld(cell.x, cell.y);
        const id = `collectible-${cell.x}-${cell.y}`;

        sceneGraphManager.observeObject({
          id,
          label: 'collectible',
          position: {
            x: worldPos.x,
            y: 0.05, // Slightly above ground
            z: worldPos.y,
          },
          category: 'collectible',
          confidence: cell.confidence,
          timestamp: cell.lastUpdated,
        });
      } else if (cell.state === 'collected') {
        const id = `collectible-${cell.x}-${cell.y}`;
        sceneGraphManager.removeObject(id);
      }
    }
  }
}

/**
 * Sync obstacles from world model to scene graph
 */
function syncObstacles(bridge: WorldModelSceneGraphBridge): void {
  const { worldModel, sceneGraphManager } = bridge;
  const snapshot = worldModel.getSnapshot();

  // Get obstacle cells
  const obstacleGroups: Map<string, { cells: { x: number; y: number }[]; confidence: number }> =
    new Map();

  // Group adjacent obstacle cells
  for (const row of snapshot.grid) {
    for (const cell of row) {
      if (cell.state === 'obstacle' || cell.state === 'wall') {
        // Simple grouping by rounding to larger grid
        const groupX = Math.floor(cell.x / 3) * 3;
        const groupY = Math.floor(cell.y / 3) * 3;
        const groupKey = `${groupX}-${groupY}`;

        if (!obstacleGroups.has(groupKey)) {
          obstacleGroups.set(groupKey, { cells: [], confidence: 0 });
        }

        const group = obstacleGroups.get(groupKey)!;
        group.cells.push({ x: cell.x, y: cell.y });
        group.confidence = Math.max(group.confidence, cell.confidence);
      }
    }
  }

  // Create scene graph nodes for obstacle groups
  for (const [groupKey, group] of obstacleGroups) {
    if (group.cells.length === 0) continue;

    // Calculate centroid
    let sumX = 0,
      sumY = 0;
    for (const cell of group.cells) {
      const worldPos = worldModel.gridToWorld(cell.x, cell.y);
      sumX += worldPos.x;
      sumY += worldPos.y;
    }

    const centroidX = sumX / group.cells.length;
    const centroidY = sumY / group.cells.length;

    const id = `obstacle-${groupKey}`;
    sceneGraphManager.observeObject({
      id,
      label: 'obstacle',
      position: {
        x: centroidX,
        y: 0.1,
        z: centroidY,
      },
      dimensions: {
        x: group.cells.length * 0.1 * 0.5,
        y: 0.2,
        z: group.cells.length * 0.1 * 0.5,
      },
      category: 'obstacle',
      confidence: group.confidence,
      timestamp: Date.now(),
    });
  }
}

/**
 * Update world model with scene graph changes (reverse sync)
 *
 * Note: Only collectibles can be synced back to the world model.
 * Obstacles are inferred from sensor readings in the world model,
 * so we don't sync them back to avoid conflicts.
 */
export function syncSceneGraphToWorldModel(
  bridge: WorldModelSceneGraphBridge
): void {
  const { worldModel, sceneGraphManager } = bridge;
  const sceneGraph = sceneGraphManager.getSceneGraph();

  // Get all collectibles from scene graph and record them in world model
  const collectibles = sceneGraph.getNodesByCategory('collectible');

  for (const collectible of collectibles) {
    const pos = collectible.geometry.pose.position;
    // Use recordCollectible which is the public API
    worldModel.recordCollectible(`sg-${collectible.id}`, pos.x, pos.z);
  }

  // Note: Obstacles are not synced back because the world model
  // infers obstacles from sensor readings. The scene graph's obstacle
  // tracking is for higher-level reasoning, not grid-level mapping.
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get a combined cognitive analysis from both systems
 */
export function getCombinedCognitiveAnalysis(deviceId: string): string {
  const bridge = bridges.get(deviceId);
  if (!bridge) return 'No integrated world model available';

  const { worldModel, sceneGraphManager } = bridge;

  // Get robot state for world model analysis
  const robotState = sceneGraphManager.getRobotState();
  const robotPose = robotState
    ? { x: robotState.position.x, y: robotState.position.z, rotation: robotState.rotation }
    : { x: 0, y: 0, rotation: 0 };

  // Default sensor data (no obstacles detected) for analysis context
  const defaultSensorData = {
    front: 200,
    frontLeft: 200,
    frontRight: 200,
    left: 200,
    right: 200,
    back: 200,
  };

  // Get world model analysis
  const worldModelAnalysis = worldModel.generateCognitiveAnalysis(robotPose, defaultSensorData);

  // Get scene graph description
  const sceneDescription = sceneGraphManager.describeScene();

  // Get recent changes
  const context = sceneGraphManager.getSceneContext();
  const recentChanges = context.recentChanges
    .slice(-5)
    .map((c) => `- ${c.description}`)
    .join('\n');

  return `
## World Model Analysis
${worldModelAnalysis}

## Scene Graph
${sceneDescription}

## Recent Changes
${recentChanges || 'No recent changes'}

## Statistics
- Objects tracked: ${context.stats.objectCount}
- Waypoints: ${context.stats.waypointCount}
- Navigation edges: ${context.stats.totalEdges}
- Average confidence: ${(context.stats.averageConfidence * 100).toFixed(0)}%
`.trim();
}

/**
 * Query the combined system with natural language
 */
export function queryIntegratedSystem(
  deviceId: string,
  query: string
): {
  sceneGraphResult: ReturnType<SceneGraphManager['query']>;
  worldModelContext: string;
} | null {
  const bridge = bridges.get(deviceId);
  if (!bridge) return null;

  const { worldModel, sceneGraphManager } = bridge;

  // Query scene graph
  const sceneGraphResult = sceneGraphManager.query(query);

  // Get world model context for the query
  const robotState = sceneGraphManager.getRobotState();
  const robotPose = robotState
    ? { x: robotState.position.x, y: robotState.position.z, rotation: robotState.rotation }
    : null;

  // Default sensor data for context generation
  const defaultSensorData = {
    front: 200,
    frontLeft: 200,
    frontRight: 200,
    left: 200,
    right: 200,
    back: 200,
  };

  const worldModelContext = robotPose
    ? worldModel.generateCognitiveAnalysis(robotPose, defaultSensorData)
    : 'Robot position unknown';

  return {
    sceneGraphResult,
    worldModelContext,
  };
}

/**
 * Clean up integration
 */
export function cleanupIntegration(deviceId: string): void {
  stopSync(deviceId);
  bridges.delete(deviceId);
}

/**
 * Clean up all integrations
 */
export function cleanupAllIntegrations(): void {
  for (const [deviceId] of bridges) {
    cleanupIntegration(deviceId);
  }
}
