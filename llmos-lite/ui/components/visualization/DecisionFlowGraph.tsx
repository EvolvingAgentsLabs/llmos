/**
 * Decision Flow Graph Visualization
 *
 * Displays decision branches, voting, and predictions in a Git-like graph.
 * Inspired by GitHub's merge/branch visualization.
 */

'use client';

import React, { useMemo } from 'react';
import {
  DecisionNode,
  DecisionEdge,
  ProposedSolution,
  PredictedStep,
  VotingSession,
} from '@/lib/chat/types';

export interface DecisionFlowNode {
  id: string;
  type: 'question' | 'option' | 'decision' | 'prediction' | 'merge';
  label: string;
  description?: string;
  status: 'pending' | 'active' | 'selected' | 'rejected' | 'predicted';
  confidence?: number;
  votes?: number;
  column: number;
  row: number;
  parentId?: string;
  speculativelyComputed?: boolean;
}

export interface DecisionFlowEdge {
  from: string;
  to: string;
  type: 'branch' | 'merge' | 'speculative' | 'prediction';
}

export interface DecisionFlowGraphProps {
  nodes: DecisionFlowNode[];
  edges: DecisionFlowEdge[];
  votingSessions?: VotingSession[];
  predictions?: PredictedStep[];
  onNodeClick?: (nodeId: string) => void;
  onVote?: (nodeId: string) => void;
  showPredictions?: boolean;
  showSpeculative?: boolean;
  compact?: boolean;
}

// Node colors based on status
const NODE_COLORS = {
  pending: 'bg-gray-600 border-gray-500',
  active: 'bg-amber-600 border-amber-500 animate-pulse',
  selected: 'bg-green-600 border-green-500',
  rejected: 'bg-red-600/50 border-red-500/50',
  predicted: 'bg-purple-600/60 border-purple-500/60 border-dashed',
};

// Edge colors
const EDGE_COLORS = {
  branch: 'stroke-blue-500',
  merge: 'stroke-green-500',
  speculative: 'stroke-purple-500 stroke-dasharray-4',
  prediction: 'stroke-purple-400/50 stroke-dasharray-2',
};

export function DecisionFlowGraph({
  nodes,
  edges,
  votingSessions = [],
  predictions = [],
  onNodeClick,
  onVote,
  showPredictions = true,
  showSpeculative = true,
  compact = false,
}: DecisionFlowGraphProps) {
  // Calculate graph dimensions
  const { width, height, nodePositions } = useMemo(() => {
    const nodeWidth = compact ? 120 : 180;
    const nodeHeight = compact ? 40 : 60;
    const colGap = compact ? 30 : 50;
    const rowGap = compact ? 20 : 40;
    const padding = 20;

    const maxCol = Math.max(...nodes.map((n) => n.column), 0);
    const maxRow = Math.max(...nodes.map((n) => n.row), 0);

    const positions = new Map<string, { x: number; y: number }>();
    nodes.forEach((node) => {
      positions.set(node.id, {
        x: padding + node.column * (nodeWidth + colGap) + nodeWidth / 2,
        y: padding + node.row * (nodeHeight + rowGap) + nodeHeight / 2,
      });
    });

    return {
      width: padding * 2 + (maxCol + 1) * (nodeWidth + colGap),
      height: padding * 2 + (maxRow + 1) * (nodeHeight + rowGap),
      nodePositions: positions,
    };
  }, [nodes, compact]);

  // Filter nodes and edges based on display settings
  const visibleNodes = useMemo(() => {
    return nodes.filter((node) => {
      if (node.status === 'predicted' && !showPredictions) return false;
      if (node.speculativelyComputed && !showSpeculative) return false;
      return true;
    });
  }, [nodes, showPredictions, showSpeculative]);

  const visibleEdges = useMemo(() => {
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    return edges.filter((edge) => {
      if (edge.type === 'prediction' && !showPredictions) return false;
      if (edge.type === 'speculative' && !showSpeculative) return false;
      return visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to);
    });
  }, [edges, visibleNodes, showPredictions, showSpeculative]);

  return (
    <div className="decision-flow-graph overflow-auto bg-gray-900/50 rounded-lg p-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs">
        <div className="flex items-center gap-1">
          <div className={`w-3 h-3 rounded ${NODE_COLORS.pending}`} />
          <span className="text-gray-400">Pending</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={`w-3 h-3 rounded ${NODE_COLORS.active}`} />
          <span className="text-gray-400">Active</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={`w-3 h-3 rounded ${NODE_COLORS.selected}`} />
          <span className="text-gray-400">Selected</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={`w-3 h-3 rounded ${NODE_COLORS.rejected}`} />
          <span className="text-gray-400">Rejected</span>
        </div>
        {showPredictions && (
          <div className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${NODE_COLORS.predicted}`} />
            <span className="text-gray-400">Predicted</span>
          </div>
        )}
        {showSpeculative && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-purple-600/60 border border-purple-500">
              <span className="text-[6px] text-white flex items-center justify-center h-full">
                ⚡
              </span>
            </div>
            <span className="text-gray-400">Speculative</span>
          </div>
        )}
      </div>

      {/* SVG Graph */}
      <svg
        width={Math.max(width, 400)}
        height={Math.max(height, 200)}
        className="overflow-visible"
      >
        {/* Draw edges first (behind nodes) */}
        <g className="edges">
          {visibleEdges.map((edge, idx) => {
            const from = nodePositions.get(edge.from);
            const to = nodePositions.get(edge.to);
            if (!from || !to) return null;

            const isDashed = edge.type === 'prediction' || edge.type === 'speculative';
            const isPrediction = edge.type === 'prediction';
            const color = EDGE_COLORS[edge.type] || 'stroke-gray-500';

            // Calculate control points for curved edges (branches)
            const midY = (from.y + to.y) / 2;

            // Use curves for branch/merge, straight for others
            if (edge.type === 'branch' || edge.type === 'merge') {
              const controlX = from.x;
              const controlY = midY;
              return (
                <path
                  key={`edge-${idx}`}
                  d={`M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`}
                  fill="none"
                  className={color}
                  strokeWidth={2}
                  strokeDasharray={isDashed ? '4 4' : undefined}
                  opacity={1}
                />
              );
            }

            return (
              <line
                key={`edge-${idx}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className={color}
                strokeWidth={2}
                strokeDasharray={isDashed ? '4 4' : undefined}
                opacity={isPrediction ? 0.5 : 1}
              />
            );
          })}
        </g>

        {/* Draw nodes */}
        <g className="nodes">
          {visibleNodes.map((node) => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;

            const nodeWidth = compact ? 100 : 160;
            const nodeHeight = compact ? 30 : 50;

            return (
              <g
                key={node.id}
                className="cursor-pointer transition-transform hover:scale-105"
                onClick={() => onNodeClick?.(node.id)}
                transform={`translate(${pos.x - nodeWidth / 2}, ${pos.y - nodeHeight / 2})`}
              >
                {/* Node background */}
                <rect
                  width={nodeWidth}
                  height={nodeHeight}
                  rx={8}
                  className={`${NODE_COLORS[node.status]} fill-current`}
                  stroke={node.speculativelyComputed ? '#a855f7' : undefined}
                  strokeWidth={node.speculativelyComputed ? 2 : 0}
                  strokeDasharray={node.status === 'predicted' ? '4 4' : undefined}
                />

                {/* Node content */}
                <foreignObject width={nodeWidth} height={nodeHeight}>
                  <div className="flex flex-col items-center justify-center h-full px-2 text-white">
                    <div
                      className={`font-medium truncate w-full text-center ${
                        compact ? 'text-xs' : 'text-sm'
                      }`}
                      title={node.label}
                    >
                      {node.type === 'question' && '❓ '}
                      {node.type === 'option' && '🔘 '}
                      {node.type === 'decision' && '✅ '}
                      {node.type === 'prediction' && '🔮 '}
                      {node.type === 'merge' && '🔄 '}
                      {node.speculativelyComputed && '⚡ '}
                      {node.label}
                    </div>
                    {!compact && node.confidence !== undefined && (
                      <div className="text-xs opacity-75">
                        {(node.confidence * 100).toFixed(0)}% confidence
                      </div>
                    )}
                    {!compact && node.votes !== undefined && node.votes > 0 && (
                      <div className="text-xs opacity-75">
                        {node.votes} vote{node.votes !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </foreignObject>

                {/* Vote button for pending options */}
                {node.status === 'active' && node.type === 'option' && onVote && (
                  <g
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onVote(node.id);
                    }}
                  >
                    <rect
                      x={nodeWidth - 24}
                      y={-8}
                      width={24}
                      height={24}
                      rx={12}
                      fill="#3b82f6"
                      className="hover:fill-blue-400 transition-colors"
                    />
                    <text
                      x={nodeWidth - 12}
                      y={6}
                      textAnchor="middle"
                      fill="white"
                      fontSize={14}
                    >
                      ✓
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Active Voting Sessions */}
      {votingSessions.length > 0 && (
        <div className="mt-4 border-t border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2">
            Active Voting Sessions
          </h4>
          {votingSessions.map((session) => (
            <div
              key={session.id}
              className="bg-gray-800/50 rounded-lg p-3 mb-2"
            >
              <div className="text-sm text-white mb-2">{session.question}</div>
              <div className="flex gap-2 text-xs text-gray-400">
                <span>
                  {session.totalVotes} vote{session.totalVotes !== 1 ? 's' : ''}
                </span>
                <span>•</span>
                <span>Status: {session.status}</span>
                {session.winner && (
                  <>
                    <span>•</span>
                    <span className="text-green-400">Winner: {session.winner}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Predictions Timeline */}
      {showPredictions && predictions.length > 0 && (
        <div className="mt-4 border-t border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
            <span>🔮</span>
            Predicted Next Steps
          </h4>
          <div className="flex flex-col gap-2">
            {predictions.map((pred, idx) => (
              <div
                key={pred.id}
                className={`flex items-center gap-3 text-sm ${
                  pred.speculativelyComputed
                    ? 'text-purple-300'
                    : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    pred.speculativelyComputed
                      ? 'bg-purple-600/60'
                      : 'bg-gray-700'
                  }`}
                >
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span>{pred.description}</span>
                    {pred.speculativelyComputed && (
                      <span
                        className="text-xs bg-purple-600/40 px-1.5 py-0.5 rounded"
                        title="Pre-computing in background"
                      >
                        ⚡ Computing
                      </span>
                    )}
                  </div>
                  {pred.estimatedDuration && (
                    <div className="text-xs opacity-75">
                      Est: {pred.estimatedDuration}
                    </div>
                  )}
                </div>
                <div className="text-xs">
                  {(pred.probability * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Helper: Build decision flow from chat messages
 */
export function buildDecisionFlowFromMessages(
  messages: Array<{
    id: string;
    content: string;
    isDecisionPoint?: boolean;
    alternatives?: Array<{
      id: string;
      agentName: string;
      content: string;
      confidence: number;
      votes: number;
      selected?: boolean;
    }>;
    predictions?: PredictedStep[];
  }>
): { nodes: DecisionFlowNode[]; edges: DecisionFlowEdge[] } {
  const nodes: DecisionFlowNode[] = [];
  const edges: DecisionFlowEdge[] = [];

  let currentRow = 0;

  messages.forEach((msg) => {
    if (msg.isDecisionPoint && msg.alternatives) {
      // Add question node
      const questionId = `q-${msg.id}`;
      nodes.push({
        id: questionId,
        type: 'question',
        label: 'Decision Point',
        status: 'active',
        column: 0,
        row: currentRow,
      });

      currentRow++;

      // Add option nodes
      msg.alternatives.forEach((alt, idx) => {
        const optionId = `opt-${alt.id}`;
        nodes.push({
          id: optionId,
          type: 'option',
          label: alt.agentName,
          description: alt.content.substring(0, 100),
          status: alt.selected ? 'selected' : 'pending',
          confidence: alt.confidence,
          votes: alt.votes,
          column: idx,
          row: currentRow,
          parentId: questionId,
        });

        edges.push({
          from: questionId,
          to: optionId,
          type: 'branch',
        });
      });

      currentRow++;

      // Add prediction nodes if available
      if (msg.predictions) {
        msg.predictions.forEach((pred, idx) => {
          const predId = `pred-${pred.id}`;
          nodes.push({
            id: predId,
            type: 'prediction',
            label: pred.description.substring(0, 30),
            status: 'predicted',
            confidence: pred.probability,
            column: idx,
            row: currentRow,
            speculativelyComputed: pred.speculativelyComputed,
          });

          // Connect predictions to highest confidence option
          const topOption = msg.alternatives?.reduce((best, curr) =>
            (curr.confidence || 0) > (best.confidence || 0) ? curr : best
          );
          if (topOption) {
            edges.push({
              from: `opt-${topOption.id}`,
              to: predId,
              type: 'prediction',
            });
          }
        });

        currentRow++;
      }
    }
  });

  return { nodes, edges };
}

export default DecisionFlowGraph;
