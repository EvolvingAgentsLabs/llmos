'use client';

import React, { useMemo, useCallback } from 'react';
import {
  SceneGraphManager,
  SceneContext,
} from '@/lib/runtime/scene-graph/scene-graph-manager';
import {
  SceneNode,
  SceneEdge,
  SceneChangeEvent,
  ObjectCategory,
} from '@/lib/runtime/scene-graph/types';

// ============================================================================
// Types
// ============================================================================

interface SceneGraphVisualizationProps {
  manager: SceneGraphManager;
  width?: number;
  height?: number;
  showWaypoints?: boolean;
  showEdges?: boolean;
  showLabels?: boolean;
  highlightedNodeId?: string;
  onNodeClick?: (node: SceneNode) => void;
  className?: string;
}

interface NodeDisplayInfo {
  node: SceneNode;
  x: number;
  y: number;
  color: string;
  size: number;
  label: string;
}

interface EdgeDisplayInfo {
  edge: SceneEdge;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  dashed: boolean;
}

// ============================================================================
// Color Schemes
// ============================================================================

const CATEGORY_COLORS: Record<ObjectCategory, string> = {
  furniture: '#8B5CF6',    // Purple
  collectible: '#F59E0B',  // Amber
  obstacle: '#EF4444',     // Red
  wall: '#6B7280',         // Gray
  door: '#10B981',         // Emerald
  container: '#3B82F6',    // Blue
  surface: '#84CC16',      // Lime
  decoration: '#EC4899',   // Pink
  unknown: '#9CA3AF',      // Gray
};

const NODE_TYPE_COLORS: Record<string, string> = {
  robot: '#22D3EE',     // Cyan
  waypoint: '#A3E635',  // Lime
  landmark: '#FBBF24',  // Yellow
  room: '#818CF8',      // Indigo
  region: '#C4B5FD',    // Light indigo
};

const EDGE_COLORS: Record<string, string> = {
  near: '#9CA3AF',
  connected_to: '#22D3EE',
  in: '#818CF8',
  on_top_of: '#F59E0B',
  visible_from: '#84CC16',
  adjacent_to: '#A3E635',
  default: '#6B7280',
};

// ============================================================================
// SceneGraphVisualization Component
// ============================================================================

export function SceneGraphVisualization({
  manager,
  width = 400,
  height = 400,
  showWaypoints = true,
  showEdges = true,
  showLabels = true,
  highlightedNodeId,
  onNodeClick,
  className = '',
}: SceneGraphVisualizationProps) {
  // Get current context
  const context = manager.getSceneContext();
  const sceneGraph = manager.getSceneGraph();
  const topology = manager.getTopology();

  // Calculate bounds and transform
  const { nodes, edges, bounds } = useMemo(() => {
    const allNodes = sceneGraph.getAllNodes();
    const allEdges = sceneGraph.getAllEdges();
    const waypoints = topology.getAllWaypoints();

    // Combine nodes and waypoints
    const displayNodes = showWaypoints
      ? [...allNodes, ...waypoints.filter((w) => !allNodes.find((n) => n.id === w.id))]
      : allNodes.filter((n) => n.type !== 'waypoint');

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const node of displayNodes) {
      const pos = node.geometry.pose.position;
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minZ = Math.min(minZ, pos.z);
      maxZ = Math.max(maxZ, pos.z);
    }

    // Add padding
    const padding = 0.5;
    minX -= padding;
    maxX += padding;
    minZ -= padding;
    maxZ += padding;

    // Handle empty scene
    if (!isFinite(minX)) {
      minX = -2;
      maxX = 2;
      minZ = -2;
      maxZ = 2;
    }

    return {
      nodes: displayNodes,
      edges: allEdges,
      bounds: { minX, maxX, minZ, maxZ },
    };
  }, [sceneGraph, topology, showWaypoints]);

  // Transform world coordinates to screen coordinates
  const worldToScreen = useCallback(
    (worldX: number, worldZ: number) => {
      const rangeX = bounds.maxX - bounds.minX || 1;
      const rangeZ = bounds.maxZ - bounds.minZ || 1;

      const margin = 40;
      const availableWidth = width - 2 * margin;
      const availableHeight = height - 2 * margin;

      const x = margin + ((worldX - bounds.minX) / rangeX) * availableWidth;
      const y = margin + ((worldZ - bounds.minZ) / rangeZ) * availableHeight;

      return { x, y };
    },
    [bounds, width, height]
  );

  // Prepare node display info
  const nodeDisplayInfo: NodeDisplayInfo[] = useMemo(() => {
    return nodes.map((node) => {
      const pos = node.geometry.pose.position;
      const screen = worldToScreen(pos.x, pos.z);

      let color = NODE_TYPE_COLORS[node.type] || CATEGORY_COLORS[node.semantics.category];
      let size = 8;

      if (node.type === 'robot') {
        size = 12;
      } else if (node.type === 'waypoint') {
        size = 5;
        color = NODE_TYPE_COLORS.waypoint;
      } else if (node.type === 'room' || node.type === 'region') {
        size = 16;
      }

      // Reduce size based on confidence
      size *= Math.max(0.5, node.timeStats.confidence);

      return {
        node,
        x: screen.x,
        y: screen.y,
        color,
        size,
        label: node.semantics.label,
      };
    });
  }, [nodes, worldToScreen]);

  // Prepare edge display info
  const edgeDisplayInfo: EdgeDisplayInfo[] = useMemo(() => {
    if (!showEdges) return [];

    return edges
      .filter((edge) => {
        const source = nodes.find((n) => n.id === edge.sourceId);
        const target = nodes.find((n) => n.id === edge.targetId);
        return source && target;
      })
      .map((edge) => {
        const source = nodes.find((n) => n.id === edge.sourceId)!;
        const target = nodes.find((n) => n.id === edge.targetId)!;

        const sourceScreen = worldToScreen(
          source.geometry.pose.position.x,
          source.geometry.pose.position.z
        );
        const targetScreen = worldToScreen(
          target.geometry.pose.position.x,
          target.geometry.pose.position.z
        );

        const color = EDGE_COLORS[edge.relation] || EDGE_COLORS.default;
        const dashed = edge.relation === 'visible_from' || edge.relation === 'near';

        return {
          edge,
          x1: sourceScreen.x,
          y1: sourceScreen.y,
          x2: targetScreen.x,
          y2: targetScreen.y,
          color,
          dashed,
        };
      });
  }, [edges, nodes, showEdges, worldToScreen]);

  // Navigation path
  const navigationPath = useMemo(() => {
    const navState = topology.getNavigationState();
    if (!navState.currentPath) return null;

    return navState.currentPath.positions.map((pos) => worldToScreen(pos.x, pos.z));
  }, [topology, worldToScreen]);

  // Handle node click
  const handleNodeClick = useCallback(
    (node: SceneNode) => {
      onNodeClick?.(node);
    },
    [onNodeClick]
  );

  return (
    <div className={`scene-graph-visualization ${className}`}>
      <svg
        width={width}
        height={height}
        className="bg-gray-900 rounded-lg"
        style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
      >
        {/* Grid background */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="#374151"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Navigation path */}
        {navigationPath && navigationPath.length > 1 && (
          <path
            d={`M ${navigationPath.map((p) => `${p.x},${p.y}`).join(' L ')}`}
            fill="none"
            stroke="#22D3EE"
            strokeWidth="3"
            strokeDasharray="8 4"
            opacity="0.8"
          />
        )}

        {/* Edges */}
        {edgeDisplayInfo.map((info) => (
          <line
            key={info.edge.id}
            x1={info.x1}
            y1={info.y1}
            x2={info.x2}
            y2={info.y2}
            stroke={info.color}
            strokeWidth={1.5}
            strokeDasharray={info.dashed ? '4 2' : undefined}
            opacity={0.6}
          />
        ))}

        {/* Nodes */}
        {nodeDisplayInfo.map((info) => (
          <g
            key={info.node.id}
            onClick={() => handleNodeClick(info.node)}
            style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
          >
            {/* Highlight ring for selected node */}
            {highlightedNodeId === info.node.id && (
              <circle
                cx={info.x}
                cy={info.y}
                r={info.size + 4}
                fill="none"
                stroke="#FBBF24"
                strokeWidth="2"
                className="animate-pulse"
              />
            )}

            {/* Robot has special shape (triangle) */}
            {info.node.type === 'robot' ? (
              <RobotMarker
                x={info.x}
                y={info.y}
                size={info.size}
                rotation={
                  (info.node.semantics.attributes.rotation as number) || 0
                }
                color={info.color}
              />
            ) : info.node.type === 'waypoint' ? (
              /* Waypoints are diamonds */
              <WaypointMarker
                x={info.x}
                y={info.y}
                size={info.size}
                color={info.color}
              />
            ) : (
              /* Regular nodes are circles */
              <circle
                cx={info.x}
                cy={info.y}
                r={info.size}
                fill={info.color}
                stroke={info.node.isActive ? 'white' : '#4B5563'}
                strokeWidth={info.node.isActive ? 2 : 1}
                opacity={info.node.isActive ? 1 : 0.5}
              />
            )}

            {/* Label */}
            {showLabels && info.node.type !== 'waypoint' && (
              <text
                x={info.x}
                y={info.y + info.size + 12}
                textAnchor="middle"
                fill="white"
                fontSize="10"
                opacity="0.9"
              >
                {info.label.length > 12
                  ? info.label.slice(0, 10) + '...'
                  : info.label}
              </text>
            )}
          </g>
        ))}

        {/* Legend */}
        <g transform={`translate(${width - 100}, 10)`}>
          <rect
            width="90"
            height="100"
            fill="#1F2937"
            rx="4"
            opacity="0.9"
          />
          <text x="8" y="16" fill="white" fontSize="10" fontWeight="bold">
            Legend
          </text>

          <circle cx="14" cy="30" r="4" fill={NODE_TYPE_COLORS.robot} />
          <text x="24" y="33" fill="white" fontSize="8">
            Robot
          </text>

          <circle cx="14" cy="45" r="4" fill={CATEGORY_COLORS.collectible} />
          <text x="24" y="48" fill="white" fontSize="8">
            Collectible
          </text>

          <circle cx="14" cy="60" r="4" fill={CATEGORY_COLORS.obstacle} />
          <text x="24" y="63" fill="white" fontSize="8">
            Obstacle
          </text>

          <circle cx="14" cy="75" r="3" fill={NODE_TYPE_COLORS.waypoint} />
          <text x="24" y="78" fill="white" fontSize="8">
            Waypoint
          </text>

          <line
            x1="10"
            y1="90"
            x2="30"
            y2="90"
            stroke="#22D3EE"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
          <text x="35" y="93" fill="white" fontSize="8">
            Path
          </text>
        </g>
      </svg>
    </div>
  );
}

// ============================================================================
// Robot Marker Component
// ============================================================================

interface RobotMarkerProps {
  x: number;
  y: number;
  size: number;
  rotation: number;
  color: string;
}

function RobotMarker({ x, y, size, rotation, color }: RobotMarkerProps) {
  // Convert rotation to degrees for SVG transform
  const rotationDeg = (rotation * 180) / Math.PI;

  // Triangle pointing up (will be rotated)
  const points = [
    [0, -size],
    [size * 0.7, size * 0.7],
    [-size * 0.7, size * 0.7],
  ]
    .map(([px, py]) => `${px},${py}`)
    .join(' ');

  return (
    <g transform={`translate(${x}, ${y}) rotate(${rotationDeg})`}>
      <polygon
        points={points}
        fill={color}
        stroke="white"
        strokeWidth="2"
      />
      {/* Direction indicator */}
      <circle cx="0" cy={-size + 3} r="2" fill="white" />
    </g>
  );
}

// ============================================================================
// Waypoint Marker Component
// ============================================================================

interface WaypointMarkerProps {
  x: number;
  y: number;
  size: number;
  color: string;
}

function WaypointMarker({ x, y, size, color }: WaypointMarkerProps) {
  // Diamond shape
  const points = [
    [0, -size],
    [size, 0],
    [0, size],
    [-size, 0],
  ]
    .map(([px, py]) => `${x + px},${y + py}`)
    .join(' ');

  return (
    <polygon
      points={points}
      fill={color}
      stroke="#1F2937"
      strokeWidth="1"
      opacity="0.7"
    />
  );
}

// ============================================================================
// Scene Graph Stats Panel Component
// ============================================================================

interface SceneGraphStatsPanelProps {
  manager: SceneGraphManager;
  className?: string;
}

export function SceneGraphStatsPanel({
  manager,
  className = '',
}: SceneGraphStatsPanelProps) {
  const stats = manager.getStats();
  const topoStats = manager.getTopologyStats();
  const context = manager.getSceneContext();

  return (
    <div
      className={`scene-graph-stats bg-gray-800 rounded-lg p-3 text-white text-sm ${className}`}
    >
      <h3 className="font-bold mb-2 text-cyan-400">Scene Graph</h3>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-400">Objects:</span>
          <span className="ml-2 font-mono">{stats.objectCount}</span>
        </div>
        <div>
          <span className="text-gray-400">Waypoints:</span>
          <span className="ml-2 font-mono">{topoStats.waypointCount}</span>
        </div>
        <div>
          <span className="text-gray-400">Regions:</span>
          <span className="ml-2 font-mono">{topoStats.regionCount}</span>
        </div>
        <div>
          <span className="text-gray-400">Connections:</span>
          <span className="ml-2 font-mono">{topoStats.connectionCount}</span>
        </div>
        <div>
          <span className="text-gray-400">Edges:</span>
          <span className="ml-2 font-mono">{stats.totalEdges}</span>
        </div>
        <div>
          <span className="text-gray-400">Confidence:</span>
          <span className="ml-2 font-mono">
            {(stats.averageConfidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {context.navigation.isNavigating && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <div className="text-cyan-400 text-xs">Navigating</div>
          <div className="text-xs">
            Target: {context.navigation.targetLabel || 'unknown'}
          </div>
          <div className="text-xs">
            Distance: {context.navigation.pathLength?.toFixed(2) || '?'}m
          </div>
        </div>
      )}

      {context.recentChanges.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <div className="text-yellow-400 text-xs mb-1">Recent Changes</div>
          {context.recentChanges.slice(-3).map((change, i) => (
            <div key={i} className="text-xs text-gray-300 truncate">
              {change.description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Scene Description Panel Component
// ============================================================================

interface SceneDescriptionPanelProps {
  manager: SceneGraphManager;
  className?: string;
}

export function SceneDescriptionPanel({
  manager,
  className = '',
}: SceneDescriptionPanelProps) {
  const description = manager.describeScene();

  return (
    <div
      className={`scene-description bg-gray-800 rounded-lg p-3 text-white text-sm ${className}`}
    >
      <h3 className="font-bold mb-2 text-green-400">Scene Description</h3>
      <pre className="text-xs whitespace-pre-wrap text-gray-300 font-mono">
        {description}
      </pre>
    </div>
  );
}

export default SceneGraphVisualization;
