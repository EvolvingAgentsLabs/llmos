'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { DecisionBranch, DecisionNode } from '@/lib/chat/types';
import {
  calculateLayout,
  filterGraph,
  pointsToPath,
  getNodeIcon,
  calculateBranchStats,
  GraphLayout,
  LayoutNode,
  LayoutEdge,
  DEFAULT_LAYOUT_OPTIONS,
} from '@/lib/visualization/decision-graph';

interface DecisionBranchViewProps {
  branch: DecisionBranch;
  onSelectNode?: (node: DecisionNode) => void;
  onVote?: (nodeId: string, vote: 'up' | 'down') => void;
  selectedNodeId?: string;
  showPredictions?: boolean;
  showRejected?: boolean;
  compact?: boolean;
}

export default function DecisionBranchView({
  branch,
  onSelectNode,
  onVote,
  selectedNodeId,
  showPredictions = true,
  showRejected = true,
  compact = false,
}: DecisionBranchViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Calculate layout
  const layout = useMemo<GraphLayout>(() => {
    const filteredBranch = filterGraph(branch, {
      showRejected,
      showPredictions,
    });
    return calculateLayout(filteredBranch, {
      ...DEFAULT_LAYOUT_OPTIONS,
      nodeWidth: compact ? 100 : 150,
      nodeHeight: compact ? 40 : 60,
      verticalSpacing: compact ? 60 : 80,
      branchSpacing: compact ? 120 : 180,
    });
  }, [branch, showRejected, showPredictions, compact]);

  // Calculate stats
  const stats = useMemo(() => calculateBranchStats(branch), [branch]);

  // Center view on load or when layout changes
  useEffect(() => {
    if (containerRef.current && layout.width > 0) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      // Calculate scale to fit
      const scaleX = containerWidth / (layout.width + 100);
      const scaleY = containerHeight / (layout.height + 100);
      const scale = Math.min(scaleX, scaleY, 1);

      // Center
      const x = (containerWidth - layout.width * scale) / 2;
      const y = 50;

      setTransform({ x, y, scale });
    }
  }, [layout]);

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setTransform((prev) => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(2, transform.scale * delta));

    // Zoom towards cursor
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
      const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);

      setTransform({ x: newX, y: newY, scale: newScale });
    }
  };

  // Reset view
  const resetView = () => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const x = (containerWidth - layout.width) / 2;
      setTransform({ x, y: 50, scale: 1 });
    }
  };

  // Focus on a node
  const focusNode = useCallback((nodeId: string) => {
    const node = layout.nodes.find((n) => n.id === nodeId);
    if (node && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      setTransform({
        x: containerWidth / 2 - node.x * transform.scale,
        y: containerHeight / 2 - node.y * transform.scale,
        scale: transform.scale,
      });
    }
  }, [layout.nodes, transform.scale]);

  // Focus on selected node when it changes
  useEffect(() => {
    if (selectedNodeId) {
      focusNode(selectedNodeId);
    }
  }, [selectedNodeId, focusNode]);

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary/50 bg-bg-secondary/30">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold text-fg-secondary">Decision Flow</h3>
          <div className="flex items-center gap-2 text-[10px] text-fg-muted">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent-success" />
              {stats.selectedCount} selected
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-fg-muted" />
              {stats.rejectedCount} rejected
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent-primary" />
              {stats.pendingCount} pending
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTransform((p) => ({ ...p, scale: Math.min(2, p.scale * 1.2) }))}
            className="p-1 rounded hover:bg-bg-elevated text-fg-secondary"
            title="Zoom in"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </button>
          <button
            onClick={() => setTransform((p) => ({ ...p, scale: Math.max(0.1, p.scale * 0.8) }))}
            className="p-1 rounded hover:bg-bg-elevated text-fg-secondary"
            title="Zoom out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <button
            onClick={resetView}
            className="p-1 rounded hover:bg-bg-elevated text-fg-secondary"
            title="Reset view"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          <span className="text-[10px] text-fg-muted">
            {Math.round(transform.scale * 100)}%
          </span>
        </div>
      </div>

      {/* Graph container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Edges */}
          <g className="edges">
            {layout.edges.map((edge) => (
              <path
                key={edge.id}
                d={pointsToPath(edge.points)}
                fill="none"
                stroke={edge.color}
                strokeWidth={edge.strokeWidth}
                strokeDasharray={edge.dashArray}
                className="transition-all duration-300"
                style={{ opacity: hoveredNodeId && hoveredNodeId !== edge.from && hoveredNodeId !== edge.to ? 0.3 : 1 }}
              />
            ))}
          </g>

          {/* Nodes */}
          <g className="nodes">
            {layout.nodes.map((node) => (
              <NodeComponent
                key={node.id}
                node={node}
                isSelected={selectedNodeId === node.id}
                isHovered={hoveredNodeId === node.id}
                onSelect={() => onSelectNode?.(node)}
                onHover={setHoveredNodeId}
                onVote={onVote}
                compact={compact}
                dimmed={hoveredNodeId !== null && hoveredNodeId !== node.id}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-border-primary/50 bg-bg-secondary/30">
        <div className="flex items-center gap-4 text-[10px]">
          <span className="text-fg-muted">Legend:</span>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-accent-success" />
            <span className="text-fg-secondary">Selected</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-accent-primary" />
            <span className="text-fg-secondary">Active</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-fg-muted" />
            <span className="text-fg-secondary">Rejected</span>
          </div>
          {showPredictions && (
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-purple-500 opacity-50" />
              <span className="text-fg-secondary">Predicted</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface NodeComponentProps {
  node: LayoutNode;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onHover: (nodeId: string | null) => void;
  onVote?: (nodeId: string, vote: 'up' | 'down') => void;
  compact: boolean;
  dimmed: boolean;
}

function NodeComponent({
  node,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  onVote,
  compact,
  dimmed,
}: NodeComponentProps) {
  const radius = 4;
  const width = node.width;
  const height = node.height;
  const x = node.x - width / 2;
  const y = node.y - height / 2;

  const getStatusBg = () => {
    switch (node.status) {
      case 'selected':
      case 'merged':
        return '#22c55e20';
      case 'rejected':
        return '#6b728020';
      case 'active':
        return '#3b82f620';
      case 'exploring':
        return '#f59e0b20';
      case 'predicted':
        return '#8b5cf620';
      default:
        return '#94a3b820';
    }
  };

  return (
    <g
      onClick={onSelect}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        cursor: 'pointer',
        opacity: dimmed ? 0.4 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Node background */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={radius}
        fill={getStatusBg()}
        stroke={node.color}
        strokeWidth={isSelected ? 3 : isHovered ? 2 : 1}
        className="transition-all duration-200"
      />

      {/* Node icon */}
      <text
        x={x + 12}
        y={y + height / 2}
        dominantBaseline="middle"
        className="text-sm"
        fill={node.color}
      >
        {getNodeIcon(node.type)}
      </text>

      {/* Node content */}
      <text
        x={x + 28}
        y={y + (compact ? height / 2 : height / 2 - 6)}
        dominantBaseline="middle"
        className="text-xs font-medium"
        fill={isSelected ? '#f8fafc' : '#94a3b8'}
      >
        {node.content.length > (compact ? 12 : 18)
          ? node.content.slice(0, compact ? 12 : 18) + '...'
          : node.content}
      </text>

      {/* Confidence badge */}
      {!compact && node.metadata.confidence !== undefined && (
        <text
          x={x + 28}
          y={y + height / 2 + 8}
          className="text-[9px]"
          fill="#64748b"
        >
          {(node.metadata.confidence * 100).toFixed(0)}% confidence
        </text>
      )}

      {/* Vote count badge */}
      {node.metadata.votes !== undefined && node.metadata.votes > 0 && (
        <g>
          <circle
            cx={x + width - 12}
            cy={y + 12}
            r={10}
            fill="#3b82f6"
          />
          <text
            x={x + width - 12}
            y={y + 12}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[9px] font-bold"
            fill="white"
          >
            {node.metadata.votes}
          </text>
        </g>
      )}

      {/* Selected indicator */}
      {isSelected && (
        <rect
          x={x - 2}
          y={y - 2}
          width={width + 4}
          height={height + 4}
          rx={radius + 2}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeDasharray="4,2"
          className="animate-pulse"
        />
      )}

      {/* Winner badge */}
      {(node.status === 'selected' || node.status === 'merged') && (
        <g>
          <rect
            x={x + width - 40}
            y={y - 8}
            width={32}
            height={16}
            rx={8}
            fill="#22c55e"
          />
          <text
            x={x + width - 24}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[8px] font-bold"
            fill="white"
          >
            WIN
          </text>
        </g>
      )}
    </g>
  );
}
