'use client';

import { useMemo, useState } from 'react';
import { DecisionBranch, DecisionNode } from '@/lib/chat/types';

interface GitGraphViewProps {
  branch: DecisionBranch;
  onSelectNode?: (node: DecisionNode) => void;
  selectedNodeId?: string;
}

// Branch colors similar to VSCode Git Graph
const BRANCH_COLORS = [
  '#f14c4c', // red
  '#3fb950', // green
  '#58a6ff', // blue
  '#d29922', // orange/yellow
  '#a371f7', // purple
  '#f778ba', // pink
  '#79c0ff', // light blue
  '#ffa657', // orange
];

interface GraphNode {
  id: string;
  content: string;
  column: number;
  row: number;
  type: 'user' | 'assistant' | 'decision';
  status: string;
  timestamp: number;
  children: string[];
  parentId?: string;
}

export default function GitGraphView({
  branch,
  onSelectNode,
  selectedNodeId,
}: GitGraphViewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Build graph nodes with git-like layout
  const { nodes, maxColumn } = useMemo(() => {
    const graphNodes: GraphNode[] = [];
    const nodesMap = branch.nodes;
    let row = 0;
    let maxCol = 0;

    // Process nodes in order (BFS from root)
    const visited = new Set<string>();
    const queue: { id: string; column: number }[] = [{ id: branch.rootId, column: 0 }];

    while (queue.length > 0) {
      const { id, column } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const node = nodesMap.get(id);
      if (!node) continue;

      const isUser = node.type === 'question';

      graphNodes.push({
        id: node.id,
        content: node.content,
        column,
        row,
        type: isUser ? 'user' : 'assistant',
        status: node.status,
        timestamp: node.timestamp || Date.now(),
        children: node.children,
        parentId: node.parentId,
      });

      maxCol = Math.max(maxCol, column);
      row++;

      // Queue children - first child stays on same column, others branch out
      node.children.forEach((childId, idx) => {
        queue.push({
          id: childId,
          column: idx === 0 ? column : maxCol + idx
        });
      });
    }

    return { nodes: graphNodes, maxColumn: maxCol };
  }, [branch]);

  const ROW_HEIGHT = 32;
  const COLUMN_WIDTH = 16;
  const NODE_RADIUS = 6;
  const GRAPH_PADDING = 20;

  const graphWidth = (maxColumn + 1) * COLUMN_WIDTH + GRAPH_PADDING * 2;
  const graphHeight = nodes.length * ROW_HEIGHT + GRAPH_PADDING;

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[#30363d] bg-[#161b22]">
        <svg className="w-4 h-4 text-[#58a6ff]" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z" />
        </svg>
        <span className="text-sm font-medium text-[#c9d1d9]">Conversation Graph</span>
        <span className="text-xs text-[#8b949e]">{nodes.length} messages</span>
      </div>

      {/* Graph Content */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-h-full">
          {/* SVG Rail Graph */}
          <div className="flex-shrink-0" style={{ width: graphWidth }}>
            <svg
              width={graphWidth}
              height={graphHeight}
              className="block"
            >
              {/* Draw branch rails (vertical lines) */}
              {Array.from({ length: maxColumn + 1 }, (_, col) => (
                <line
                  key={`rail-${col}`}
                  x1={GRAPH_PADDING + col * COLUMN_WIDTH}
                  y1={GRAPH_PADDING / 2}
                  x2={GRAPH_PADDING + col * COLUMN_WIDTH}
                  y2={graphHeight}
                  stroke={BRANCH_COLORS[col % BRANCH_COLORS.length]}
                  strokeWidth={2}
                  opacity={0.3}
                />
              ))}

              {/* Draw connections */}
              {nodes.map((node, idx) => {
                if (!node.parentId) return null;
                const parentNode = nodes.find(n => n.id === node.parentId);
                if (!parentNode) return null;

                const startX = GRAPH_PADDING + parentNode.column * COLUMN_WIDTH;
                const startY = GRAPH_PADDING + parentNode.row * ROW_HEIGHT;
                const endX = GRAPH_PADDING + node.column * COLUMN_WIDTH;
                const endY = GRAPH_PADDING + node.row * ROW_HEIGHT;
                const color = BRANCH_COLORS[node.column % BRANCH_COLORS.length];

                if (parentNode.column === node.column) {
                  // Straight line
                  return (
                    <line
                      key={`edge-${node.id}`}
                      x1={startX}
                      y1={startY}
                      x2={endX}
                      y2={endY}
                      stroke={color}
                      strokeWidth={2}
                    />
                  );
                } else {
                  // Curved branch
                  const midY = startY + (endY - startY) * 0.5;
                  return (
                    <path
                      key={`edge-${node.id}`}
                      d={`M ${startX} ${startY}
                          L ${startX} ${midY - 10}
                          Q ${startX} ${midY} ${startX + (endX - startX) * 0.5} ${midY}
                          Q ${endX} ${midY} ${endX} ${midY + 10}
                          L ${endX} ${endY}`}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                    />
                  );
                }
              })}

              {/* Draw commit nodes */}
              {nodes.map((node) => {
                const cx = GRAPH_PADDING + node.column * COLUMN_WIDTH;
                const cy = GRAPH_PADDING + node.row * ROW_HEIGHT;
                const color = BRANCH_COLORS[node.column % BRANCH_COLORS.length];
                const isSelected = selectedNodeId === node.id;
                const isHovered = hoveredId === node.id;

                return (
                  <g key={`node-${node.id}`}>
                    {/* Selection ring */}
                    {(isSelected || isHovered) && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={NODE_RADIUS + 3}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        opacity={0.5}
                      />
                    )}
                    {/* Node circle */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={NODE_RADIUS}
                      fill={node.type === 'user' ? '#161b22' : color}
                      stroke={color}
                      strokeWidth={2}
                      className="cursor-pointer transition-all"
                      onMouseEnter={() => setHoveredId(node.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => {
                        const originalNode = branch.nodes.get(node.id);
                        if (originalNode && onSelectNode) {
                          onSelectNode(originalNode);
                        }
                      }}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Message list */}
          <div className="flex-1 min-w-0">
            {nodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const isHovered = hoveredId === node.id;
              const color = BRANCH_COLORS[node.column % BRANCH_COLORS.length];

              return (
                <div
                  key={`row-${node.id}`}
                  className={`flex items-center gap-3 px-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#1f6feb33]'
                      : isHovered
                        ? 'bg-[#30363d]'
                        : 'hover:bg-[#21262d]'
                  }`}
                  style={{ height: ROW_HEIGHT }}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => {
                    const originalNode = branch.nodes.get(node.id);
                    if (originalNode && onSelectNode) {
                      onSelectNode(originalNode);
                    }
                  }}
                >
                  {/* Author icon */}
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                    style={{
                      backgroundColor: node.type === 'user' ? '#238636' : '#1f6feb',
                      color: '#fff'
                    }}
                  >
                    {node.type === 'user' ? 'U' : 'A'}
                  </div>

                  {/* Message preview */}
                  <div className="flex-1 min-w-0 truncate text-sm text-[#c9d1d9]">
                    {node.content}
                  </div>

                  {/* Timestamp */}
                  <div className="flex-shrink-0 text-xs text-[#8b949e]">
                    {formatTimestamp(node.timestamp)}
                  </div>

                  {/* Branch indicator */}
                  {node.children.length > 1 && (
                    <div
                      className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{ backgroundColor: color + '33', color }}
                    >
                      +{node.children.length - 1} branch
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer with stats */}
      <div className="flex items-center gap-4 px-3 py-2 border-t border-[#30363d] bg-[#161b22] text-xs text-[#8b949e]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#238636]" />
          User messages: {nodes.filter(n => n.type === 'user').length}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#1f6feb]" />
          Assistant: {nodes.filter(n => n.type === 'assistant').length}
        </span>
        {maxColumn > 0 && (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z" />
            </svg>
            {maxColumn + 1} branches
          </span>
        )}
      </div>
    </div>
  );
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}
