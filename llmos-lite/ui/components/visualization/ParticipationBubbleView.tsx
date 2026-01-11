'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ParticipationBubble,
  BubbleParticipant,
  ParticipantRelationship,
} from '@/lib/chat/types';

interface ParticipationBubbleViewProps {
  bubbles: ParticipationBubble[];
  selectedBubbleId?: string;
  onSelectBubble?: (bubbleId: string) => void;
  onSelectParticipant?: (participantId: string) => void;
}

export default function ParticipationBubbleView({
  bubbles,
  selectedBubbleId,
  onSelectBubble,
  onSelectParticipant,
}: ParticipationBubbleViewProps) {
  const [activeBubbleId, setActiveBubbleId] = useState<string | null>(
    selectedBubbleId || null
  );

  const activeBubble = useMemo(
    () => bubbles.find((b) => b.id === activeBubbleId),
    [bubbles, activeBubbleId]
  );

  useEffect(() => {
    if (selectedBubbleId) {
      setActiveBubbleId(selectedBubbleId);
    }
  }, [selectedBubbleId]);

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary/50 bg-bg-secondary/30">
        <h3 className="text-sm font-semibold text-fg-primary">Participation Bubbles</h3>
        <span className="text-xs text-fg-muted">{bubbles.length} topics</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Bubble list */}
        <div className="w-48 border-r border-border-primary/50 overflow-y-auto p-2 space-y-1">
          {bubbles.length === 0 ? (
            <p className="text-xs text-fg-muted text-center py-4">No topics yet</p>
          ) : (
            bubbles.map((bubble) => (
              <BubbleListItem
                key={bubble.id}
                bubble={bubble}
                isActive={activeBubbleId === bubble.id}
                onClick={() => {
                  setActiveBubbleId(bubble.id);
                  onSelectBubble?.(bubble.id);
                }}
              />
            ))
          )}
        </div>

        {/* Bubble visualization */}
        <div className="flex-1 overflow-hidden">
          {activeBubble ? (
            <BubbleVisualization
              bubble={activeBubble}
              onSelectParticipant={onSelectParticipant}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-fg-muted">Select a topic to view participants</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface BubbleListItemProps {
  bubble: ParticipationBubble;
  isActive: boolean;
  onClick: () => void;
}

function BubbleListItem({ bubble, isActive, onClick }: BubbleListItemProps) {
  const onlineCount = bubble.participants.filter((p) => p.online).length;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2 rounded-lg transition-all ${
        isActive
          ? 'bg-accent-primary/20 border border-accent-primary/50'
          : 'bg-bg-tertiary/50 border border-transparent hover:bg-bg-elevated'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          isActive ? 'bg-accent-primary/30' : 'bg-bg-secondary'
        }`}>
          <span className="text-xs font-bold text-fg-primary">
            {bubble.participants.length}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-fg-primary truncate capitalize">
            {bubble.topic}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-fg-muted">
              {bubble.messageCount} msgs
            </span>
            <span className="text-[10px] text-accent-success flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-success" />
              {onlineCount} online
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

interface BubbleVisualizationProps {
  bubble: ParticipationBubble;
  onSelectParticipant?: (participantId: string) => void;
}

function BubbleVisualization({ bubble, onSelectParticipant }: BubbleVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current?.parentElement) {
        const rect = svgRef.current.parentElement.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Calculate positions using force-directed layout (simplified)
  const positions = useMemo(() => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const radius = Math.min(dimensions.width, dimensions.height) / 3;

    const posMap = new Map<string, { x: number; y: number }>();

    bubble.participants.forEach((participant, index) => {
      const angle = (2 * Math.PI * index) / bubble.participants.length - Math.PI / 2;
      posMap.set(participant.participantId, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });

    return posMap;
  }, [bubble.participants, dimensions]);

  const getRelationshipColor = (type: string) => {
    switch (type) {
      case 'collaborates':
        return '#3b82f6';
      case 'reviews':
        return '#22c55e';
      case 'delegates':
        return '#f59e0b';
      case 'supervises':
        return '#8b5cf6';
      case 'assists':
        return '#06b6d4';
      default:
        return '#94a3b8';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Bubble header */}
      <div className="p-4 border-b border-border-primary/30">
        <h4 className="text-sm font-semibold text-fg-primary capitalize">{bubble.topic}</h4>
        {bubble.description && (
          <p className="text-xs text-fg-muted mt-1">{bubble.description}</p>
        )}
        <div className="flex items-center gap-4 mt-2 text-[10px]">
          <span className="text-fg-muted">{bubble.messageCount} messages</span>
          <span className="text-fg-muted">{bubble.decisionCount} decisions</span>
          <span className="text-fg-muted">
            Last active: {new Date(bubble.lastActivity).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* SVG visualization */}
      <div className="flex-1 relative">
        <svg
          ref={svgRef}
          className="w-full h-full"
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        >
          {/* Relationships (edges) */}
          <g className="relationships">
            {bubble.relationships.map((rel) => {
              const fromPos = positions.get(rel.from);
              const toPos = positions.get(rel.to);
              if (!fromPos || !toPos) return null;

              const isHighlighted = hoveredId === rel.from || hoveredId === rel.to;

              return (
                <g key={rel.id}>
                  <line
                    x1={fromPos.x}
                    y1={fromPos.y}
                    x2={toPos.x}
                    y2={toPos.y}
                    stroke={getRelationshipColor(rel.type)}
                    strokeWidth={isHighlighted ? 3 : 1 + rel.strength * 2}
                    strokeOpacity={isHighlighted ? 1 : 0.4}
                    className="transition-all duration-200"
                  />
                  {/* Arrow for direction */}
                  {!rel.bidirectional && (
                    <polygon
                      points={calculateArrowPoints(fromPos, toPos)}
                      fill={getRelationshipColor(rel.type)}
                      opacity={isHighlighted ? 1 : 0.6}
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* Participants (nodes) */}
          <g className="participants">
            {bubble.participants.map((participant) => {
              const pos = positions.get(participant.participantId);
              if (!pos) return null;

              return (
                <ParticipantNode
                  key={participant.id}
                  participant={participant}
                  position={pos}
                  isHovered={hoveredId === participant.participantId}
                  onHover={setHoveredId}
                  onClick={() => onSelectParticipant?.(participant.participantId)}
                />
              );
            })}
          </g>
        </svg>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 p-2 bg-bg-secondary/80 backdrop-blur-sm rounded-lg border border-border-primary/50">
          <p className="text-[10px] font-semibold text-fg-muted mb-1">Relationships</p>
          <div className="space-y-1">
            {[
              { type: 'collaborates', label: 'Collaborates' },
              { type: 'reviews', label: 'Reviews' },
              { type: 'delegates', label: 'Delegates' },
              { type: 'assists', label: 'Assists' },
            ].map(({ type, label }) => (
              <div key={type} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-0.5 rounded"
                  style={{ backgroundColor: getRelationshipColor(type) }}
                />
                <span className="text-[9px] text-fg-muted">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ParticipantNodeProps {
  participant: BubbleParticipant;
  position: { x: number; y: number };
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
}

function ParticipantNode({
  participant,
  position,
  isHovered,
  onHover,
  onClick,
}: ParticipantNodeProps) {
  const radius = isHovered ? 30 : 25;
  const strokeWidth = isHovered ? 3 : 2;

  const getTypeColor = () => {
    switch (participant.type) {
      case 'user':
        return { fill: '#8b5cf6', stroke: '#a78bfa' };
      case 'agent':
        return { fill: '#3b82f6', stroke: '#60a5fa' };
      default:
        return { fill: '#6b7280', stroke: '#9ca3af' };
    }
  };

  const colors = getTypeColor();

  return (
    <g
      onMouseEnter={() => onHover(participant.participantId)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {/* Outer ring for online status */}
      {participant.online && (
        <circle
          cx={position.x}
          cy={position.y}
          r={radius + 4}
          fill="none"
          stroke="#22c55e"
          strokeWidth={2}
          opacity={0.6}
          className="animate-pulse"
        />
      )}

      {/* Main circle */}
      <circle
        cx={position.x}
        cy={position.y}
        r={radius}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={strokeWidth}
        className="transition-all duration-200"
      />

      {/* Avatar/Initial */}
      <text
        x={position.x}
        y={position.y}
        textAnchor="middle"
        dominantBaseline="central"
        className="text-sm font-bold fill-white pointer-events-none"
      >
        {participant.name.charAt(0).toUpperCase()}
      </text>

      {/* Name label */}
      <text
        x={position.x}
        y={position.y + radius + 14}
        textAnchor="middle"
        className="text-[10px] fill-fg-secondary pointer-events-none"
      >
        {participant.name}
      </text>

      {/* Contribution count badge */}
      {participant.contributions > 0 && (
        <g>
          <circle
            cx={position.x + radius * 0.7}
            cy={position.y - radius * 0.7}
            r={10}
            fill="#f59e0b"
          />
          <text
            x={position.x + radius * 0.7}
            y={position.y - radius * 0.7}
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[8px] font-bold fill-white pointer-events-none"
          >
            {participant.contributions > 99 ? '99+' : participant.contributions}
          </text>
        </g>
      )}

      {/* Role indicator */}
      {participant.role === 'owner' && (
        <g>
          <circle
            cx={position.x - radius * 0.7}
            cy={position.y - radius * 0.7}
            r={8}
            fill="#8b5cf6"
          />
          <text
            x={position.x - radius * 0.7}
            y={position.y - radius * 0.7}
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[8px] fill-white pointer-events-none"
          >
            ★
          </text>
        </g>
      )}
    </g>
  );
}

// Helper function to calculate arrow points
function calculateArrowPoints(
  from: { x: number; y: number },
  to: { x: number; y: number }
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  // Normalize
  const nx = dx / length;
  const ny = dy / length;

  // Arrow position (near the end)
  const arrowPos = 0.7;
  const ax = from.x + dx * arrowPos;
  const ay = from.y + dy * arrowPos;

  // Arrow size
  const arrowSize = 6;

  // Perpendicular vector
  const px = -ny * arrowSize;
  const py = nx * arrowSize;

  // Arrow points
  const tip = { x: ax + nx * arrowSize, y: ay + ny * arrowSize };
  const left = { x: ax + px, y: ay + py };
  const right = { x: ax - px, y: ay - py };

  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
}
