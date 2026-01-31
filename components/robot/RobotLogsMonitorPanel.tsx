/**
 * Robot Logs Monitor Panel
 *
 * Comprehensive UI for viewing, analyzing, and exporting robot session logs.
 * Includes trajectory visualization, LLM decision timeline, and tool call analysis.
 *
 * Main goal: Help understand what's happening so the robot behavior can be
 * improved by itself (dreaming engine) or by other LLMs.
 *
 * Features:
 * - Visual trajectory plotting with failure markers
 * - Timeline of LLM decisions and reasoning
 * - Tool call visualization with success/failure states
 * - Log export in multiple formats (JSON, CSV)
 * - Session comparison capabilities
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getBlackBoxRecorder,
  RecordingSession,
  RecordedFrame,
  FailureMarker,
  SessionAnalysis,
} from '@/lib/evolution/black-box-recorder';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface RobotLogsMonitorPanelProps {
  deviceId?: string;
  onSessionSelect?: (sessionId: string) => void;
}

interface TimelineEvent {
  time: number;
  relativeTime: number;
  type: 'tool_call' | 'reasoning' | 'failure' | 'confidence_change';
  title: string;
  description: string;
  data?: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'error' | 'success';
  frameIndex: number;
}

type ExportFormat = 'json' | 'csv' | 'analysis';
type ViewTab = 'trajectory' | 'timeline' | 'tools' | 'export';

// ═══════════════════════════════════════════════════════════════════════════
// TRAJECTORY VISUALIZATION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface TrajectoryVisualizationProps {
  session: RecordingSession;
  analysis: SessionAnalysis | null;
  selectedFrameIndex: number | null;
  onFrameSelect: (index: number) => void;
}

function TrajectoryVisualization({
  session,
  analysis,
  selectedFrameIndex,
  onFrameSelect,
}: TrajectoryVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  // Calculate bounds and scale for trajectory
  const { trajectory, bounds, scale, offset } = useMemo(() => {
    const traj = analysis?.trajectory || [];
    if (traj.length === 0) {
      return {
        trajectory: [],
        bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
        scale: 1,
        offset: { x: 0, y: 0 },
      };
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const point of traj) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    // Add padding
    const padding = 20;
    const width = maxX - minX || 100;
    const height = maxY - minY || 100;
    const svgWidth = 400;
    const svgHeight = 300;

    const scaleX = (svgWidth - padding * 2) / width;
    const scaleY = (svgHeight - padding * 2) / height;
    const s = Math.min(scaleX, scaleY);

    return {
      trajectory: traj,
      bounds: { minX, maxX, minY, maxY },
      scale: s,
      offset: {
        x: padding - minX * s + (svgWidth - padding * 2 - width * s) / 2,
        y: padding - minY * s + (svgHeight - padding * 2 - height * s) / 2,
      },
    };
  }, [analysis]);

  // Transform point to SVG coordinates
  const transformPoint = useCallback(
    (x: number, y: number) => ({
      x: x * scale + offset.x,
      y: 300 - (y * scale + offset.y), // Flip Y axis
    }),
    [scale, offset]
  );

  // Generate path string
  const pathData = useMemo(() => {
    if (trajectory.length === 0) return '';
    const points = trajectory.map((p) => transformPoint(p.x, p.y));
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }, [trajectory, transformPoint]);

  // Failure positions
  const failurePositions = useMemo(() => {
    return session.failures.map((failure) => {
      const frame = session.frames[failure.frameIndex];
      if (!frame?.telemetry?.pose) return null;
      const pos = transformPoint(frame.telemetry.pose.x, frame.telemetry.pose.y);
      return { ...pos, failure, frameIndex: failure.frameIndex };
    }).filter(Boolean);
  }, [session, transformPoint]);

  // Selected frame position
  const selectedPosition = useMemo(() => {
    if (selectedFrameIndex === null) return null;
    const frame = session.frames[selectedFrameIndex];
    if (!frame?.telemetry?.pose) return null;
    return transformPoint(frame.telemetry.pose.x, frame.telemetry.pose.y);
  }, [selectedFrameIndex, session.frames, transformPoint]);

  if (trajectory.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-zinc-800/50 rounded-lg">
        <p className="text-zinc-500 text-sm">No trajectory data available</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width="100%"
        height="300"
        viewBox="0 0 400 300"
        className="bg-zinc-900 rounded-lg border border-zinc-700"
      >
        {/* Grid */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Trajectory path */}
        <path
          d={pathData}
          fill="none"
          stroke="url(#trajectoryGradient)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Gradient definition */}
        <defs>
          <linearGradient id="trajectoryGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>

        {/* Start point */}
        {trajectory.length > 0 && (
          <circle
            cx={transformPoint(trajectory[0].x, trajectory[0].y).x}
            cy={transformPoint(trajectory[0].x, trajectory[0].y).y}
            r="6"
            fill="#22c55e"
            stroke="#fff"
            strokeWidth="2"
          />
        )}

        {/* End point */}
        {trajectory.length > 1 && (
          <circle
            cx={transformPoint(trajectory[trajectory.length - 1].x, trajectory[trajectory.length - 1].y).x}
            cy={transformPoint(trajectory[trajectory.length - 1].x, trajectory[trajectory.length - 1].y).y}
            r="6"
            fill="#8b5cf6"
            stroke="#fff"
            strokeWidth="2"
          />
        )}

        {/* Failure markers */}
        {failurePositions.map((fp, i) => fp && (
          <g key={i}>
            <circle
              cx={fp.x}
              cy={fp.y}
              r="8"
              fill={fp.failure.severity === 'critical' ? '#ef4444' : '#f59e0b'}
              opacity="0.8"
              className="cursor-pointer"
              onClick={() => onFrameSelect(fp.frameIndex)}
              onMouseEnter={() => setHoveredPoint(fp.frameIndex)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
            <text
              x={fp.x}
              y={fp.y + 4}
              textAnchor="middle"
              fontSize="10"
              fill="white"
              fontWeight="bold"
              className="pointer-events-none"
            >
              !
            </text>
          </g>
        ))}

        {/* Selected frame marker */}
        {selectedPosition && (
          <circle
            cx={selectedPosition.x}
            cy={selectedPosition.y}
            r="10"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeDasharray="4 2"
          >
            <animate
              attributeName="r"
              values="8;12;8"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </circle>
        )}

        {/* Interactive trajectory points */}
        {trajectory.map((point, i) => {
          const pos = transformPoint(point.x, point.y);
          // Only render every Nth point for performance
          if (i % Math.max(1, Math.floor(trajectory.length / 50)) !== 0) return null;
          return (
            <circle
              key={i}
              cx={pos.x}
              cy={pos.y}
              r={hoveredPoint === i ? 5 : 3}
              fill={hoveredPoint === i ? '#60a5fa' : 'rgba(96, 165, 250, 0.5)'}
              className="cursor-pointer transition-all"
              onClick={() => {
                // Find closest frame
                const frameIndex = session.frames.findIndex(
                  (f) => f.relativeTime >= point.time
                );
                if (frameIndex >= 0) onFrameSelect(frameIndex);
              }}
              onMouseEnter={() => setHoveredPoint(i)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Start</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-purple-500" />
          <span>End</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>Critical Failure</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>Warning</span>
        </div>
      </div>

      {/* Stats overlay */}
      <div className="absolute top-2 right-2 bg-zinc-800/90 rounded px-2 py-1 text-xs">
        <div className="text-zinc-400">
          Distance: <span className="text-zinc-200">{analysis?.performance.totalDistance.toFixed(1) || 0} cm</span>
        </div>
        <div className="text-zinc-400">
          Points: <span className="text-zinc-200">{trajectory.length}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMELINE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface TimelineViewProps {
  session: RecordingSession;
  events: TimelineEvent[];
  selectedFrameIndex: number | null;
  onFrameSelect: (index: number) => void;
}

function TimelineView({
  session,
  events,
  selectedFrameIndex,
  onFrameSelect,
}: TimelineViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<TimelineEvent['type'] | 'all'>('all');

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.type === filter);
  }, [events, filter]);

  // Auto-scroll to selected event
  useEffect(() => {
    if (selectedFrameIndex === null || !containerRef.current) return;
    const eventElement = containerRef.current.querySelector(
      `[data-frame="${selectedFrameIndex}"]`
    );
    if (eventElement) {
      eventElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedFrameIndex]);

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'error': return 'border-red-500 bg-red-500/10';
      case 'warning': return 'border-yellow-500 bg-yellow-500/10';
      case 'success': return 'border-green-500 bg-green-500/10';
      default: return 'border-blue-500 bg-blue-500/10';
    }
  };

  const getTypeIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'tool_call': return 'T';
      case 'reasoning': return 'R';
      case 'failure': return '!';
      case 'confidence_change': return 'C';
    }
  };

  const getTypeColor = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'tool_call': return 'bg-blue-500';
      case 'reasoning': return 'bg-purple-500';
      case 'failure': return 'bg-red-500';
      case 'confidence_change': return 'bg-yellow-500';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-2 p-2 border-b border-zinc-700">
        <span className="text-xs text-zinc-400">Filter:</span>
        {(['all', 'tool_call', 'reasoning', 'failure', 'confidence_change'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`
              px-2 py-0.5 text-xs rounded transition-colors
              ${filter === f
                ? 'bg-zinc-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
              }
            `}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ')}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-500">
          {filteredEvents.length} events
        </span>
      </div>

      {/* Timeline */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredEvents.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-8">
            No events to display
          </div>
        )}

        {filteredEvents.map((event, i) => (
          <div
            key={i}
            data-frame={event.frameIndex}
            onClick={() => onFrameSelect(event.frameIndex)}
            className={`
              relative pl-8 pr-3 py-2 rounded-lg border-l-2 cursor-pointer
              transition-all hover:bg-zinc-800/50
              ${selectedFrameIndex === event.frameIndex ? 'ring-1 ring-white/30' : ''}
              ${getSeverityColor(event.severity)}
            `}
          >
            {/* Type indicator */}
            <div className={`
              absolute left-2 top-2 w-5 h-5 rounded-full flex items-center justify-center
              text-xs font-bold text-white
              ${getTypeColor(event.type)}
            `}>
              {getTypeIcon(event.type)}
            </div>

            {/* Time */}
            <div className="text-xs text-zinc-500 mb-1">
              {(event.relativeTime / 1000).toFixed(2)}s - Frame #{event.frameIndex}
            </div>

            {/* Title */}
            <div className="text-sm font-medium text-zinc-200">
              {event.title}
            </div>

            {/* Description */}
            <div className="text-xs text-zinc-400 mt-1">
              {event.description}
            </div>

            {/* Data preview */}
            {event.data && Object.keys(event.data).length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
                  View data
                </summary>
                <pre className="mt-1 p-2 bg-zinc-900 rounded text-xs text-zinc-400 overflow-x-auto">
                  {JSON.stringify(event.data, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL CALLS ANALYSIS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface ToolCallsViewProps {
  session: RecordingSession;
  analysis: SessionAnalysis | null;
  selectedFrameIndex: number | null;
  onFrameSelect: (index: number) => void;
}

function ToolCallsView({
  session,
  analysis,
  selectedFrameIndex,
  onFrameSelect,
}: ToolCallsViewProps) {
  const toolStats = analysis?.toolUsage || {};

  // Extract all tool calls with context
  const toolCalls = useMemo(() => {
    const calls: Array<{
      frameIndex: number;
      relativeTime: number;
      name: string;
      args: Record<string, unknown>;
      success?: boolean;
      reasoning?: string;
    }> = [];

    session.frames.forEach((frame, index) => {
      frame.toolCalls.forEach((tc) => {
        const result = frame.toolResults.find((r) => r.name === tc.name);
        calls.push({
          frameIndex: index,
          relativeTime: frame.relativeTime,
          name: tc.name,
          args: tc.args,
          success: result?.success,
          reasoning: frame.reasoning,
        });
      });
    });

    return calls;
  }, [session]);

  return (
    <div className="flex flex-col h-full">
      {/* Stats overview */}
      <div className="p-3 border-b border-zinc-700">
        <h4 className="text-xs font-medium text-zinc-400 mb-2">Tool Usage Statistics</h4>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(toolStats).map(([name, stats]) => (
            <div key={name} className="p-2 bg-zinc-800 rounded">
              <div className="text-xs font-medium text-zinc-200 truncate">
                {name.replace('hal_', '')}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-zinc-500">{stats.count}x</span>
                <span className={`text-xs ${
                  stats.successRate >= 0.9 ? 'text-green-400' :
                  stats.successRate >= 0.7 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {(stats.successRate * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tool calls list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <h4 className="text-xs font-medium text-zinc-400 mb-2 sticky top-0 bg-zinc-900 py-1">
          Tool Calls ({toolCalls.length})
        </h4>

        {toolCalls.map((call, i) => (
          <div
            key={i}
            onClick={() => onFrameSelect(call.frameIndex)}
            className={`
              p-2 rounded cursor-pointer transition-colors
              ${selectedFrameIndex === call.frameIndex
                ? 'bg-zinc-700 ring-1 ring-white/20'
                : 'bg-zinc-800/50 hover:bg-zinc-800'
              }
            `}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-blue-400">
                {call.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">
                  {(call.relativeTime / 1000).toFixed(2)}s
                </span>
                {call.success !== undefined && (
                  <span className={`
                    w-2 h-2 rounded-full
                    ${call.success ? 'bg-green-500' : 'bg-red-500'}
                  `} />
                )}
              </div>
            </div>

            {/* Arguments preview */}
            <div className="text-xs text-zinc-500 mt-1 font-mono truncate">
              {JSON.stringify(call.args)}
            </div>

            {/* Reasoning context */}
            {call.reasoning && (
              <div className="text-xs text-purple-400/70 mt-1 truncate italic">
                {call.reasoning.substring(0, 100)}...
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT VIEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface ExportViewProps {
  session: RecordingSession;
  analysis: SessionAnalysis | null;
}

function ExportView({ session, analysis }: ExportViewProps) {
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const handleExport = useCallback(async (format: ExportFormat) => {
    setExporting(true);

    try {
      let content: string;
      let filename: string;
      let mimeType: string;

      const recorder = getBlackBoxRecorder();

      switch (format) {
        case 'json':
          content = JSON.stringify(session, null, 2);
          filename = `session_${session.id}.json`;
          mimeType = 'application/json';
          break;

        case 'csv':
          content = recorder.exportSessionToCSV(session);
          filename = `session_${session.id}.csv`;
          mimeType = 'text/csv';
          break;

        case 'analysis':
          const analysisData = analysis || recorder.analyzeSession(session);
          content = JSON.stringify({
            session: {
              id: session.id,
              skillName: session.skillName,
              duration: session.metadata.duration,
              status: session.status,
            },
            analysis: analysisData,
            exportedAt: new Date().toISOString(),
            exportedFor: 'LLM analysis and improvement suggestions',
          }, null, 2);
          filename = `analysis_${session.id}.json`;
          mimeType = 'application/json';
          break;
      }

      // Create and trigger download
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastExport(`Exported ${filename}`);
    } catch (error) {
      console.error('Export failed:', error);
      setLastExport('Export failed');
    } finally {
      setExporting(false);
    }
  }, [session, analysis]);

  const copyToClipboard = useCallback(async (format: 'json' | 'analysis') => {
    try {
      const recorder = getBlackBoxRecorder();
      let content: string;

      if (format === 'json') {
        content = JSON.stringify(session, null, 2);
      } else {
        const analysisData = analysis || recorder.analyzeSession(session);
        content = JSON.stringify({
          session: {
            id: session.id,
            skillName: session.skillName,
            duration: session.metadata.duration,
            status: session.status,
          },
          analysis: analysisData,
          prompt: 'Analyze this robot session data. Identify what went wrong with the trajectory and suggest specific improvements to the skill behavior.',
        }, null, 2);
      }

      await navigator.clipboard.writeText(content);
      setLastExport('Copied to clipboard');
    } catch {
      setLastExport('Copy failed');
    }
  }, [session, analysis]);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h4 className="text-sm font-medium text-zinc-200 mb-2">Export Session Data</h4>
        <p className="text-xs text-zinc-400 mb-4">
          Export session data for external analysis or to share with other LLMs for improvement suggestions.
        </p>

        <div className="grid grid-cols-1 gap-3">
          {/* Full JSON Export */}
          <div className="p-3 bg-zinc-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h5 className="text-sm font-medium text-zinc-200">Full Session (JSON)</h5>
                <p className="text-xs text-zinc-500">Complete session data including all frames</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard('json')}
                  className="px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded"
                >
                  Copy
                </button>
                <button
                  onClick={() => handleExport('json')}
                  disabled={exporting}
                  className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
                >
                  Download
                </button>
              </div>
            </div>
          </div>

          {/* CSV Export */}
          <div className="p-3 bg-zinc-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h5 className="text-sm font-medium text-zinc-200">Telemetry Data (CSV)</h5>
                <p className="text-xs text-zinc-500">Position, sensors, and motor data in spreadsheet format</p>
              </div>
              <button
                onClick={() => handleExport('csv')}
                disabled={exporting}
                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
              >
                Download
              </button>
            </div>
          </div>

          {/* Analysis Export */}
          <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h5 className="text-sm font-medium text-purple-300">Analysis Report (JSON)</h5>
                <p className="text-xs text-purple-400/70">
                  Processed analysis with trajectory, failures, and recommendations - ideal for LLM analysis
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard('analysis')}
                  className="px-3 py-1 text-xs bg-purple-700 hover:bg-purple-600 text-white rounded"
                >
                  Copy for LLM
                </button>
                <button
                  onClick={() => handleExport('analysis')}
                  disabled={exporting}
                  className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded disabled:opacity-50"
                >
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export status */}
      {lastExport && (
        <div className="text-xs text-green-400 text-center">
          {lastExport}
        </div>
      )}

      {/* Session summary */}
      <div className="pt-4 border-t border-zinc-700">
        <h4 className="text-sm font-medium text-zinc-200 mb-2">Session Summary</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 bg-zinc-800 rounded">
            <span className="text-zinc-500">Frames:</span>
            <span className="ml-2 text-zinc-200">{session.metadata.totalFrames}</span>
          </div>
          <div className="p-2 bg-zinc-800 rounded">
            <span className="text-zinc-500">Duration:</span>
            <span className="ml-2 text-zinc-200">{(session.metadata.duration / 1000).toFixed(1)}s</span>
          </div>
          <div className="p-2 bg-zinc-800 rounded">
            <span className="text-zinc-500">Failures:</span>
            <span className={`ml-2 ${session.metadata.failureCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {session.metadata.failureCount}
            </span>
          </div>
          <div className="p-2 bg-zinc-800 rounded">
            <span className="text-zinc-500">Tool Calls:</span>
            <span className="ml-2 text-zinc-200">{session.metadata.toolCallCount}</span>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {analysis?.recommendations && analysis.recommendations.length > 0 && (
        <div className="pt-4 border-t border-zinc-700">
          <h4 className="text-sm font-medium text-zinc-200 mb-2">Auto-Generated Recommendations</h4>
          <ul className="space-y-1">
            {analysis.recommendations.map((rec, i) => (
              <li key={i} className="text-xs text-yellow-400 flex items-start gap-2">
                <span className="text-yellow-500">-</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FRAME DETAIL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface FrameDetailProps {
  frame: RecordedFrame;
  frameIndex: number;
  failures: FailureMarker[];
}

function FrameDetail({ frame, frameIndex, failures }: FrameDetailProps) {
  const frameFailures = failures.filter((f) => f.frameIndex === frameIndex);

  return (
    <div className="p-3 border-t border-zinc-700 bg-zinc-800/50">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-zinc-200">
          Frame #{frameIndex}
        </h4>
        <span className="text-xs text-zinc-500">
          {(frame.relativeTime / 1000).toFixed(2)}s
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        {/* Position */}
        {frame.telemetry.pose && (
          <div>
            <span className="text-zinc-500">Position:</span>
            <div className="font-mono text-zinc-300">
              x: {frame.telemetry.pose.x.toFixed(1)}, y: {frame.telemetry.pose.y.toFixed(1)}
            </div>
            <div className="font-mono text-zinc-300">
              yaw: {(frame.telemetry.pose.yaw * 180 / Math.PI).toFixed(1)}
            </div>
          </div>
        )}

        {/* Motors */}
        {frame.telemetry.motors && (
          <div>
            <span className="text-zinc-500">Motors:</span>
            <div className="font-mono text-zinc-300">
              L: {frame.telemetry.motors.left}, R: {frame.telemetry.motors.right}
            </div>
          </div>
        )}

        {/* Confidence */}
        {frame.confidence !== undefined && (
          <div>
            <span className="text-zinc-500">Confidence:</span>
            <div className={`font-mono ${
              frame.confidence >= 0.7 ? 'text-green-400' :
              frame.confidence >= 0.4 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {(frame.confidence * 100).toFixed(0)}%
            </div>
          </div>
        )}

        {/* Sensors */}
        {frame.telemetry.sensors?.distance && (
          <div>
            <span className="text-zinc-500">Distance:</span>
            <div className="font-mono text-zinc-300">
              {frame.telemetry.sensors.distance.join(', ')} cm
            </div>
          </div>
        )}
      </div>

      {/* Reasoning */}
      {frame.reasoning && (
        <div className="mt-3">
          <span className="text-xs text-zinc-500">LLM Reasoning:</span>
          <div className="mt-1 p-2 bg-purple-500/10 border border-purple-500/30 rounded text-xs text-purple-300">
            {frame.reasoning}
          </div>
        </div>
      )}

      {/* Tool calls */}
      {frame.toolCalls.length > 0 && (
        <div className="mt-3">
          <span className="text-xs text-zinc-500">Tool Calls:</span>
          <div className="mt-1 space-y-1">
            {frame.toolCalls.map((tc, i) => (
              <div key={i} className="p-1 bg-blue-500/10 border border-blue-500/30 rounded text-xs">
                <span className="text-blue-300 font-mono">{tc.name}</span>
                <span className="text-blue-400/70 ml-2">{JSON.stringify(tc.args)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failures at this frame */}
      {frameFailures.length > 0 && (
        <div className="mt-3">
          <span className="text-xs text-zinc-500">Failures:</span>
          <div className="mt-1 space-y-1">
            {frameFailures.map((f, i) => (
              <div key={i} className={`
                p-2 rounded text-xs
                ${f.severity === 'critical' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}
              `}>
                <span className="font-medium">{f.type}</span>: {f.description}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Camera frame */}
      {frame.cameraFrame && (
        <div className="mt-3">
          <span className="text-xs text-zinc-500">Camera Frame:</span>
          <img
            src={frame.cameraFrame}
            alt="Camera frame"
            className="mt-1 w-full rounded border border-zinc-700"
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION SELECTOR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface SessionSelectorProps {
  sessions: Array<{
    id: string;
    skillName: string;
    startTime: number;
    status: string;
    failureCount: number;
  }>;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  loading: boolean;
}

function SessionSelector({
  sessions,
  selectedSessionId,
  onSelectSession,
  loading,
}: SessionSelectorProps) {
  if (loading) {
    return (
      <div className="p-4 text-center text-zinc-500 text-sm">
        Loading sessions...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-4 text-center text-zinc-500 text-sm">
        No recorded sessions yet. Run a skill to start recording.
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {sessions.map((session) => {
        const date = new Date(session.startTime);
        const isSelected = selectedSessionId === session.id;

        return (
          <button
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`
              w-full text-left p-2 rounded transition-colors
              ${isSelected
                ? 'bg-zinc-700 ring-1 ring-blue-500/50'
                : 'bg-zinc-800/50 hover:bg-zinc-800'
              }
            `}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-200 truncate">
                {session.skillName}
              </span>
              <span className={`
                text-xs px-1.5 py-0.5 rounded
                ${session.status === 'failed'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-green-500/20 text-green-400'
                }
              `}>
                {session.failureCount > 0 ? `${session.failureCount} failures` : 'success'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {date.toLocaleDateString()} {date.toLocaleTimeString()}
            </p>
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function RobotLogsMonitorPanel({
  deviceId,
  onSessionSelect,
}: RobotLogsMonitorPanelProps) {
  // State
  const [sessions, setSessions] = useState<Array<{
    id: string;
    skillName: string;
    startTime: number;
    status: string;
    failureCount: number;
  }>>([]);
  const [selectedSession, setSelectedSession] = useState<RecordingSession | null>(null);
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>('trajectory');
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null);

  // Build timeline events from session
  const timelineEvents = useMemo((): TimelineEvent[] => {
    if (!selectedSession) return [];

    const events: TimelineEvent[] = [];

    // Add failure events
    for (const failure of selectedSession.failures) {
      events.push({
        time: failure.timestamp,
        relativeTime: failure.timestamp - selectedSession.startTime,
        type: 'failure',
        title: `${failure.type.replace(/_/g, ' ')}`,
        description: failure.description,
        severity: failure.severity === 'critical' ? 'error' : 'warning',
        frameIndex: failure.frameIndex,
        data: { severity: failure.severity, sensorSnapshot: failure.sensorSnapshot },
      });
    }

    // Add tool call and reasoning events
    let lastConfidence: number | undefined;
    selectedSession.frames.forEach((frame, index) => {
      // Tool calls
      for (const tc of frame.toolCalls) {
        const result = frame.toolResults.find((r) => r.name === tc.name);
        events.push({
          time: frame.timestamp,
          relativeTime: frame.relativeTime,
          type: 'tool_call',
          title: tc.name.replace('hal_', ''),
          description: JSON.stringify(tc.args),
          severity: result?.success === false ? 'error' : 'info',
          frameIndex: index,
          data: { args: tc.args, result },
        });
      }

      // Reasoning
      if (frame.reasoning && frame.reasoning.length > 0) {
        events.push({
          time: frame.timestamp,
          relativeTime: frame.relativeTime,
          type: 'reasoning',
          title: 'LLM Decision',
          description: frame.reasoning,
          severity: 'info',
          frameIndex: index,
        });
      }

      // Significant confidence changes
      if (frame.confidence !== undefined && lastConfidence !== undefined) {
        const change = frame.confidence - lastConfidence;
        if (Math.abs(change) > 0.2) {
          events.push({
            time: frame.timestamp,
            relativeTime: frame.relativeTime,
            type: 'confidence_change',
            title: change > 0 ? 'Confidence Increased' : 'Confidence Dropped',
            description: `${(lastConfidence * 100).toFixed(0)}% -> ${(frame.confidence * 100).toFixed(0)}%`,
            severity: change > 0 ? 'success' : 'warning',
            frameIndex: index,
            data: { previous: lastConfidence, current: frame.confidence },
          });
        }
      }
      lastConfidence = frame.confidence;
    });

    // Sort by time
    events.sort((a, b) => a.relativeTime - b.relativeTime);

    return events;
  }, [selectedSession]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const recorder = getBlackBoxRecorder();
      const sessionList = await recorder.listSessions();
      setSessions(sessionList);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSessionDetails = async (sessionId: string) => {
    const recorder = getBlackBoxRecorder();
    const session = await recorder.loadSession(sessionId);
    if (session) {
      setSelectedSession(session);
      setAnalysis(recorder.analyzeSession(session));
      setSelectedFrameIndex(null);
      onSessionSelect?.(sessionId);
    }
  };

  const handleFrameSelect = useCallback((index: number) => {
    setSelectedFrameIndex(index);
  }, []);

  return (
    <div className="h-full flex flex-col bg-zinc-900 rounded-lg border border-zinc-700">
      {/* Header */}
      <div className="p-3 border-b border-zinc-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <h3 className="text-sm font-medium text-zinc-200">Robot Logs Monitor</h3>
          </div>
          <button
            onClick={loadSessions}
            className="px-2 py-1 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* View tabs (only show when session selected) */}
        {selectedSession && (
          <div className="flex gap-1 mt-3">
            {(['trajectory', 'timeline', 'tools', 'export'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  px-3 py-1 text-xs rounded transition-colors
                  ${activeTab === tab
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                  }
                `}
              >
                {tab === 'trajectory' && 'Trajectory'}
                {tab === 'timeline' && 'Timeline'}
                {tab === 'tools' && 'Tool Calls'}
                {tab === 'export' && 'Export'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Session list sidebar */}
        <div className="w-48 border-r border-zinc-700 overflow-y-auto">
          <div className="p-2 border-b border-zinc-700">
            <h4 className="text-xs font-medium text-zinc-400">Sessions</h4>
          </div>
          <SessionSelector
            sessions={sessions}
            selectedSessionId={selectedSession?.id || null}
            onSelectSession={loadSessionDetails}
            loading={loading}
          />
        </div>

        {/* Main view area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedSession ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
              Select a session to view details
            </div>
          ) : (
            <>
              {/* Tab content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === 'trajectory' && (
                  <div className="h-full p-3 overflow-y-auto">
                    <TrajectoryVisualization
                      session={selectedSession}
                      analysis={analysis}
                      selectedFrameIndex={selectedFrameIndex}
                      onFrameSelect={handleFrameSelect}
                    />
                  </div>
                )}

                {activeTab === 'timeline' && (
                  <TimelineView
                    session={selectedSession}
                    events={timelineEvents}
                    selectedFrameIndex={selectedFrameIndex}
                    onFrameSelect={handleFrameSelect}
                  />
                )}

                {activeTab === 'tools' && (
                  <ToolCallsView
                    session={selectedSession}
                    analysis={analysis}
                    selectedFrameIndex={selectedFrameIndex}
                    onFrameSelect={handleFrameSelect}
                  />
                )}

                {activeTab === 'export' && (
                  <div className="h-full overflow-y-auto">
                    <ExportView session={selectedSession} analysis={analysis} />
                  </div>
                )}
              </div>

              {/* Frame detail panel (when frame selected) */}
              {selectedFrameIndex !== null && selectedSession.frames[selectedFrameIndex] && (
                <FrameDetail
                  frame={selectedSession.frames[selectedFrameIndex]}
                  frameIndex={selectedFrameIndex}
                  failures={selectedSession.failures}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer status */}
      <div className="p-2 border-t border-zinc-700 text-xs text-zinc-500 flex items-center justify-between">
        <span>
          {selectedSession
            ? `${selectedSession.skillName} - ${selectedSession.metadata.totalFrames} frames`
            : 'No session selected'
          }
        </span>
        {analysis && (
          <span className="text-zinc-400">
            {analysis.recommendations.length} recommendations
          </span>
        )}
      </div>
    </div>
  );
}

export default RobotLogsMonitorPanel;
