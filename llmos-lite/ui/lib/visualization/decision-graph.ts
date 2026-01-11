/**
 * Decision Graph
 *
 * Data structures and algorithms for Git-like decision visualization
 */

import {
  DecisionNode,
  DecisionEdge,
  DecisionBranch,
  DecisionNodeType,
  DecisionNodeStatus,
  DecisionEvent,
} from '@/lib/chat/types';

export interface GraphLayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  branchSpacing: number;
}

export const DEFAULT_LAYOUT_OPTIONS: GraphLayoutOptions = {
  nodeWidth: 150,
  nodeHeight: 60,
  horizontalSpacing: 40,
  verticalSpacing: 80,
  branchSpacing: 180,
};

export interface LayoutNode extends DecisionNode {
  x: number;
  y: number;
  width: number;
  height: number;
  column: number;
  row: number;
  color: string;
}

export interface LayoutEdge extends DecisionEdge {
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
  dashArray?: string;
}

export interface GraphLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  columns: number;
  rows: number;
}

/**
 * Calculate layout for decision graph
 */
export function calculateLayout(
  branch: DecisionBranch,
  options: GraphLayoutOptions = DEFAULT_LAYOUT_OPTIONS
): GraphLayout {
  const nodes = Array.from(branch.nodes.values());
  const layoutNodes: LayoutNode[] = [];
  const layoutEdges: LayoutEdge[] = [];

  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0, columns: 0, rows: 0 };
  }

  // Build adjacency map
  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  nodes.forEach((node) => {
    if (node.parentId) {
      parentMap.set(node.id, node.parentId);
      const siblings = childrenMap.get(node.parentId) || [];
      siblings.push(node.id);
      childrenMap.set(node.parentId, siblings);
    }
  });

  // Find root nodes (nodes without parents)
  const roots = nodes.filter((n) => !n.parentId);

  // BFS to assign rows and columns
  const visited = new Set<string>();
  const nodePositions = new Map<string, { row: number; column: number }>();
  let maxRow = 0;
  let maxColumn = 0;

  const queue: { id: string; row: number; column: number }[] = [];

  roots.forEach((root, index) => {
    queue.push({ id: root.id, row: 0, column: index });
  });

  while (queue.length > 0) {
    const { id, row, column } = queue.shift()!;

    if (visited.has(id)) continue;
    visited.add(id);

    nodePositions.set(id, { row, column });
    maxRow = Math.max(maxRow, row);
    maxColumn = Math.max(maxColumn, column);

    const children = childrenMap.get(id) || [];
    children.forEach((childId, index) => {
      const childColumn = children.length > 1 ? column + index : column;
      queue.push({ id: childId, row: row + 1, column: childColumn });
    });
  }

  // Create layout nodes
  nodes.forEach((node) => {
    const pos = nodePositions.get(node.id) || { row: 0, column: 0 };
    const x = pos.column * options.branchSpacing + options.nodeWidth / 2;
    const y = pos.row * options.verticalSpacing + options.nodeHeight / 2;

    layoutNodes.push({
      ...node,
      x,
      y,
      width: options.nodeWidth,
      height: options.nodeHeight,
      column: pos.column,
      row: pos.row,
      color: getNodeColor(node),
    });
  });

  // Create layout edges
  branch.edges.forEach((edge) => {
    const fromNode = layoutNodes.find((n) => n.id === edge.from);
    const toNode = layoutNodes.find((n) => n.id === edge.to);

    if (fromNode && toNode) {
      layoutEdges.push({
        ...edge,
        points: calculateEdgePoints(fromNode, toNode, options),
        color: getEdgeColor(edge, fromNode, toNode),
        strokeWidth: edge.type === 'speculative' || edge.type === 'prediction' ? 1 : 2,
        dashArray: edge.type === 'speculative' || edge.type === 'prediction' ? '4,4' : undefined,
      });
    }
  });

  const width = (maxColumn + 1) * options.branchSpacing;
  const height = (maxRow + 1) * options.verticalSpacing + options.nodeHeight;

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width,
    height,
    columns: maxColumn + 1,
    rows: maxRow + 1,
  };
}

/**
 * Calculate edge points for smooth curves
 */
function calculateEdgePoints(
  from: LayoutNode,
  to: LayoutNode,
  options: GraphLayoutOptions
): { x: number; y: number }[] {
  const startX = from.x;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y - to.height / 2;

  // If nodes are in the same column, draw straight line
  if (from.column === to.column) {
    return [
      { x: startX, y: startY },
      { x: endX, y: endY },
    ];
  }

  // Draw curved path for branches
  const midY = (startY + endY) / 2;

  return [
    { x: startX, y: startY },
    { x: startX, y: midY },
    { x: endX, y: midY },
    { x: endX, y: endY },
  ];
}

/**
 * Get color based on node status and type
 */
function getNodeColor(node: DecisionNode): string {
  switch (node.status) {
    case 'selected':
      return '#22c55e'; // green
    case 'rejected':
      return '#6b7280'; // gray
    case 'active':
      return '#3b82f6'; // blue
    case 'exploring':
      return '#f59e0b'; // amber
    case 'predicted':
      return '#8b5cf6'; // purple
    case 'merged':
      return '#22c55e'; // green
    default:
      return '#94a3b8'; // slate
  }
}

/**
 * Get edge color based on type and connected nodes
 */
function getEdgeColor(edge: DecisionEdge, from: LayoutNode, to: LayoutNode): string {
  if (edge.type === 'prediction' || edge.type === 'speculative') {
    return '#8b5cf6'; // purple
  }

  if (to.status === 'selected' || to.status === 'merged') {
    return '#22c55e'; // green
  }

  if (to.status === 'rejected') {
    return '#6b7280'; // gray
  }

  return '#94a3b8'; // slate
}

/**
 * Generate SVG path from points
 */
export function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';

  let path = `M ${points[0].x} ${points[0].y}`;

  if (points.length === 2) {
    path += ` L ${points[1].x} ${points[1].y}`;
    return path;
  }

  // Use quadratic bezier for smooth curves
  for (let i = 1; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;

    if (i === 1) {
      path += ` Q ${curr.x} ${curr.y}, ${midX} ${midY}`;
    } else {
      path += ` T ${midX} ${midY}`;
    }
  }

  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;

  return path;
}

/**
 * Get node icon based on type
 */
export function getNodeIcon(type: DecisionNodeType): string {
  switch (type) {
    case 'question':
      return '?';
    case 'option':
      return '○';
    case 'decision':
      return '◆';
    case 'merge':
      return '◇';
    case 'prediction':
      return '⋯';
    case 'speculative':
      return '⚡';
    default:
      return '●';
  }
}

/**
 * Filter graph to show only relevant nodes
 */
export function filterGraph(
  branch: DecisionBranch,
  filter: {
    showRejected?: boolean;
    showPredictions?: boolean;
    focusNodeId?: string;
    depth?: number;
  }
): DecisionBranch {
  const {
    showRejected = true,
    showPredictions = true,
    focusNodeId,
    depth = Infinity,
  } = filter;

  const filteredNodes = new Map<string, DecisionNode>();
  const filteredEdges: DecisionEdge[] = [];

  // If focusing on a node, find its ancestors and descendants
  let relevantNodeIds: Set<string>;

  if (focusNodeId) {
    relevantNodeIds = new Set();
    const node = branch.nodes.get(focusNodeId);
    if (node) {
      // Add ancestors
      let current: DecisionNode | undefined = node;
      let ancestorDepth = 0;
      while (current && ancestorDepth < depth) {
        relevantNodeIds.add(current.id);
        current = current.parentId ? branch.nodes.get(current.parentId) : undefined;
        ancestorDepth++;
      }

      // Add descendants
      const addDescendants = (nodeId: string, currentDepth: number) => {
        if (currentDepth >= depth) return;
        const n = branch.nodes.get(nodeId);
        if (!n) return;
        relevantNodeIds.add(nodeId);
        n.children.forEach((childId) => addDescendants(childId, currentDepth + 1));
      };
      addDescendants(focusNodeId, 0);
    }
  } else {
    relevantNodeIds = new Set(branch.nodes.keys());
  }

  // Filter nodes
  branch.nodes.forEach((node, id) => {
    if (!relevantNodeIds.has(id)) return;

    if (!showRejected && node.status === 'rejected') return;
    if (!showPredictions && (node.status === 'predicted' || node.type === 'prediction')) return;

    filteredNodes.set(id, node);
  });

  // Filter edges
  branch.edges.forEach((edge) => {
    if (filteredNodes.has(edge.from) && filteredNodes.has(edge.to)) {
      if (!showPredictions && (edge.type === 'prediction' || edge.type === 'speculative')) {
        return;
      }
      filteredEdges.push(edge);
    }
  });

  return {
    ...branch,
    nodes: filteredNodes,
    edges: filteredEdges,
  };
}

/**
 * Find path from root to a specific node
 */
export function findPathToNode(
  branch: DecisionBranch,
  targetId: string
): DecisionNode[] {
  const path: DecisionNode[] = [];
  let current = branch.nodes.get(targetId);

  while (current) {
    path.unshift(current);
    current = current.parentId ? branch.nodes.get(current.parentId) : undefined;
  }

  return path;
}

/**
 * Calculate statistics for a branch
 */
export function calculateBranchStats(branch: DecisionBranch): {
  totalNodes: number;
  selectedCount: number;
  rejectedCount: number;
  pendingCount: number;
  avgConfidence: number;
  depth: number;
} {
  const nodes = Array.from(branch.nodes.values());
  let maxDepth = 0;
  let totalConfidence = 0;
  let confidenceCount = 0;

  const stats = {
    totalNodes: nodes.length,
    selectedCount: 0,
    rejectedCount: 0,
    pendingCount: 0,
    avgConfidence: 0,
    depth: 0,
  };

  nodes.forEach((node) => {
    switch (node.status) {
      case 'selected':
      case 'merged':
        stats.selectedCount++;
        break;
      case 'rejected':
        stats.rejectedCount++;
        break;
      case 'pending':
      case 'active':
        stats.pendingCount++;
        break;
    }

    if (node.metadata.confidence !== undefined) {
      totalConfidence += node.metadata.confidence;
      confidenceCount++;
    }

    // Calculate depth
    let depth = 0;
    let current = node;
    while (current.parentId) {
      depth++;
      current = branch.nodes.get(current.parentId) || current;
      if (!current.parentId) break;
    }
    maxDepth = Math.max(maxDepth, depth);
  });

  stats.avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
  stats.depth = maxDepth;

  return stats;
}
