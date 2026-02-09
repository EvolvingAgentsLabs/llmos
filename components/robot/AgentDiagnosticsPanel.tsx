'use client';

/**
 * Agent Diagnostics Panel
 *
 * Comprehensive real-time UI for understanding what is working and failing
 * in the AI physical agent's behavior. Shows:
 *
 * - Health scores (perception, decision, movement, exploration, goal)
 * - Event timeline with severity coloring
 * - Perception analysis (sensor coverage, blind spots)
 * - Decision analysis (LLM quality, action consistency)
 * - Physics analysis (movement, collisions, stuck detection)
 * - Camera/perspective analysis
 * - Representation issues (walls, objects, coordinate system)
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  useDiagnosticsStore,
  type DiagnosticCategory,
  type DiagnosticSeverity,
  type DiagnosticEvent,
  type AgentHealthScores,
} from '@/lib/debug/agent-diagnostics';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_COLORS: Record<DiagnosticCategory, string> = {
  perception: '#3b82f6',
  decision: '#a855f7',
  physics: '#f59e0b',
  camera: '#06b6d4',
  representation: '#ec4899',
  navigation: '#22c55e',
  stuck: '#ef4444',
};

const CATEGORY_LABELS: Record<DiagnosticCategory, string> = {
  perception: 'Perception',
  decision: 'Decision',
  physics: 'Physics',
  camera: 'Camera',
  representation: 'Representation',
  navigation: 'Navigation',
  stuck: 'Stuck',
};

const SEVERITY_COLORS: Record<DiagnosticSeverity, string> = {
  ok: '#22c55e',
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#ef4444',
  critical: '#dc2626',
};

const SEVERITY_BG: Record<DiagnosticSeverity, string> = {
  ok: 'bg-green-500/10 border-green-500/30',
  info: 'bg-blue-500/10 border-blue-500/30',
  warning: 'bg-yellow-500/10 border-yellow-500/30',
  error: 'bg-red-500/10 border-red-500/30',
  critical: 'bg-red-600/20 border-red-600/50',
};

const SEVERITY_ICONS: Record<DiagnosticSeverity, string> = {
  ok: '\u2713',
  info: '\u2139',
  warning: '\u26A0',
  error: '\u2717',
  critical: '\u2622',
};

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH SCORE BAR
// ═══════════════════════════════════════════════════════════════════════════

function HealthBar({ label, score, color }: { label: string; score: number; color?: string }) {
  const barColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#8b949e] w-20 truncate">{label}</span>
      <div className="flex-1 h-2 bg-[#21262d] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(2, score)}%`,
            backgroundColor: color || barColor,
          }}
        />
      </div>
      <span
        className="text-[10px] font-mono w-8 text-right"
        style={{ color: color || barColor }}
      >
        {score}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SENSOR RADAR DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

function SensorRadar({
  sensors,
}: {
  sensors?: {
    front: number;
    frontLeft: number;
    frontRight: number;
    left: number;
    right: number;
    back: number;
    backLeft: number;
    backRight: number;
  };
}) {
  if (!sensors) return null;

  const maxRange = 200;
  const size = 120;
  const center = size / 2;
  const radius = (size / 2) - 10;

  // Sensor directions in radians (0 = up/front)
  const sensorDirs: Array<{ key: string; angle: number; value: number; reported: boolean }> = [
    { key: 'front', angle: 0, value: sensors.front, reported: true },
    { key: 'frontRight', angle: Math.PI / 4, value: sensors.frontRight, reported: true },
    { key: 'right', angle: Math.PI / 2, value: sensors.right, reported: true },
    { key: 'backRight', angle: (3 * Math.PI) / 4, value: sensors.backRight, reported: true },
    { key: 'back', angle: Math.PI, value: sensors.back, reported: true },
    { key: 'backLeft', angle: -(3 * Math.PI) / 4, value: sensors.backLeft, reported: true },
    { key: 'left', angle: -Math.PI / 2, value: sensors.left, reported: true },
    { key: 'frontLeft', angle: -Math.PI / 4, value: sensors.frontLeft, reported: true },
  ];

  return (
    <svg width={size} height={size} className="block">
      {/* Range rings */}
      {[0.25, 0.5, 0.75, 1.0].map((r) => (
        <circle
          key={r}
          cx={center}
          cy={center}
          r={radius * r}
          fill="none"
          stroke="#30363d"
          strokeWidth="0.5"
          strokeDasharray={r < 1 ? '2 2' : undefined}
        />
      ))}

      {/* Range labels */}
      <text x={center + 2} y={center - radius * 0.5 + 3} fontSize="7" fill="#6e7681">1m</text>
      <text x={center + 2} y={center - radius + 3} fontSize="7" fill="#6e7681">2m</text>

      {/* Sensor rays */}
      {sensorDirs.map((s) => {
        const dist = Math.min(s.value / maxRange, 1.0);
        const endX = center + Math.sin(s.angle) * radius * dist;
        const endY = center - Math.cos(s.angle) * radius * dist;
        const dotColor = s.value < 30 ? '#ef4444' : s.value < 80 ? '#f59e0b' : '#22c55e';

        return (
          <g key={s.key}>
            {/* Ray line */}
            <line
              x1={center}
              y1={center}
              x2={endX}
              y2={endY}
              stroke={s.reported ? dotColor : `${dotColor}40`}
              strokeWidth={s.reported ? 1.5 : 0.75}
              strokeDasharray={s.reported ? undefined : '2 1'}
            />
            {/* Endpoint dot */}
            <circle
              cx={endX}
              cy={endY}
              r={s.reported ? 3 : 2}
              fill={dotColor}
              opacity={s.reported ? 1 : 0.4}
            />
            {/* Distance label */}
            <text
              x={endX + (Math.sin(s.angle) > 0 ? 4 : -4)}
              y={endY + 3}
              fontSize="7"
              fill={s.reported ? '#e6edf3' : '#6e7681'}
              textAnchor={Math.sin(s.angle) > 0 ? 'start' : 'end'}
            >
              {Math.round(s.value)}
            </text>
          </g>
        );
      })}

      {/* Robot indicator */}
      <polygon
        points={`${center},${center - 5} ${center + 3},${center + 3} ${center - 3},${center + 3}`}
        fill="#58a6ff"
      />

      {/* Legend */}
      <text x={2} y={size - 2} fontSize="6" fill="#6e7681">
        All 8 sensors reported to LLM (100% coverage)
      </text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LIST
// ═══════════════════════════════════════════════════════════════════════════

function EventItem({ event }: { event: DiagnosticEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border-l-2 px-2 py-1 cursor-pointer hover:bg-[#161b22] ${SEVERITY_BG[event.severity]}`}
      style={{ borderLeftColor: SEVERITY_COLORS[event.severity] }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px]" style={{ color: SEVERITY_COLORS[event.severity] }}>
          {SEVERITY_ICONS[event.severity]}
        </span>
        <span
          className="text-[9px] px-1 rounded"
          style={{
            backgroundColor: `${CATEGORY_COLORS[event.category]}20`,
            color: CATEGORY_COLORS[event.category],
          }}
        >
          {CATEGORY_LABELS[event.category]}
        </span>
        <span className="text-[10px] text-[#e6edf3] flex-1 truncate">{event.title}</span>
        <span className="text-[9px] text-[#6e7681] font-mono">C{event.cycle}</span>
      </div>
      {expanded && (
        <div className="mt-1 ml-4">
          <p className="text-[10px] text-[#8b949e] whitespace-pre-wrap">{event.detail}</p>
          {event.data && (
            <pre className="text-[9px] text-[#6e7681] mt-1 p-1 bg-[#0d1117] rounded overflow-x-auto">
              {JSON.stringify(event.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════════════════

type DiagTab = 'overview' | 'events' | 'perception' | 'decisions' | 'physics' | 'camera' | 'representation';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function AgentDiagnosticsPanel() {
  const [activeTab, setActiveTab] = useState<DiagTab>('overview');
  const [categoryFilter, setCategoryFilter] = useState<DiagnosticCategory | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<DiagnosticSeverity | 'all'>('all');
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const events = useDiagnosticsStore((s) => s.events);
  const health = useDiagnosticsStore((s) => s.health);
  const perceptionHistory = useDiagnosticsStore((s) => s.perceptionHistory);
  const decisionHistory = useDiagnosticsStore((s) => s.decisionHistory);
  const physicsHistory = useDiagnosticsStore((s) => s.physicsHistory);
  const cameraHistory = useDiagnosticsStore((s) => s.cameraHistory);
  const stuckCycles = useDiagnosticsStore((s) => s.stuckCycles);
  const representationIssues = useDiagnosticsStore((s) => s.representationIssues);
  const clear = useDiagnosticsStore((s) => s.clear);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (severityFilter !== 'all' && e.severity !== severityFilter) return false;
      return true;
    });
  }, [events, categoryFilter, severityFilter]);

  // Latest snapshots
  const latestPerception = perceptionHistory[perceptionHistory.length - 1] || null;
  const latestDecision = decisionHistory[decisionHistory.length - 1] || null;
  const latestPhysics = physicsHistory[physicsHistory.length - 1] || null;
  const latestCamera = cameraHistory[cameraHistory.length - 1] || null;

  // Event severity counts
  const severityCounts = useMemo(() => {
    const counts = { ok: 0, info: 0, warning: 0, error: 0, critical: 0 };
    events.forEach((e) => counts[e.severity]++);
    return counts;
  }, [events]);

  const tabs: { id: DiagTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'events', label: `Events (${events.length})` },
    { id: 'perception', label: 'Perception' },
    { id: 'decisions', label: 'Decisions' },
    { id: 'physics', label: 'Physics' },
    { id: 'camera', label: 'Camera' },
    { id: 'representation', label: 'Issues' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-[#e6edf3] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#30363d] bg-[#161b22] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{
              backgroundColor:
                health.overall >= 70 ? '#22c55e' : health.overall >= 40 ? '#f59e0b' : '#ef4444',
            }}
          />
          <h2 className="text-xs font-semibold">Agent Diagnostics</h2>
          <span className="text-[10px] font-mono text-[#8b949e]">
            Health: {health.overall}%
          </span>
          {stuckCycles > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-red-600/30 text-red-400 rounded animate-pulse">
              STUCK ({stuckCycles} cycles)
            </span>
          )}
        </div>
        <button
          onClick={clear}
          className="text-[10px] text-[#8b949e] hover:text-[#e6edf3] px-2 py-0.5 rounded hover:bg-[#21262d]"
        >
          Clear
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 px-2 py-1 border-b border-[#30363d] bg-[#161b22] flex-shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2 py-1 text-[10px] rounded whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-[#30363d] text-[#e6edf3]'
                : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ═════════════ OVERVIEW TAB ═════════════ */}
        {activeTab === 'overview' && (
          <div className="p-3 space-y-3">
            {/* Health Scores */}
            <div className="space-y-1.5">
              <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">Health Scores</h3>
              <HealthBar label="Perception" score={health.perception} />
              <HealthBar label="Decisions" score={health.decisionQuality} />
              <HealthBar label="Movement" score={health.movement} />
              <HealthBar label="Exploration" score={health.exploration} />
              <HealthBar label="Goal Progress" score={health.goalProgress} />
              <div className="pt-1 border-t border-[#21262d]">
                <HealthBar label="Overall" score={health.overall} />
              </div>
            </div>

            {/* Severity summary */}
            <div>
              <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider mb-1.5">
                Event Summary
              </h3>
              <div className="flex gap-2 flex-wrap">
                {(Object.entries(severityCounts) as Array<[DiagnosticSeverity, number]>).map(
                  ([sev, count]) =>
                    count > 0 && (
                      <span
                        key={sev}
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: `${SEVERITY_COLORS[sev]}15`,
                          color: SEVERITY_COLORS[sev],
                        }}
                      >
                        {SEVERITY_ICONS[sev]} {sev}: {count}
                      </span>
                    )
                )}
              </div>
            </div>

            {/* Sensor radar */}
            {latestPerception && (
              <div>
                <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider mb-1.5">
                  Sensor Radar (Cycle {latestPerception.cycle})
                </h3>
                <div className="flex justify-center">
                  <SensorRadar sensors={latestPerception.sensors} />
                </div>
              </div>
            )}

            {/* Quick status */}
            <div>
              <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider mb-1.5">
                Current Status
              </h3>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="p-1.5 bg-[#161b22] rounded border border-[#30363d]">
                  <span className="text-[#8b949e]">Position: </span>
                  <span className="font-mono">
                    {latestPhysics
                      ? `(${latestPhysics.pose.x.toFixed(2)}, ${latestPhysics.pose.y.toFixed(2)})`
                      : '---'}
                  </span>
                </div>
                <div className="p-1.5 bg-[#161b22] rounded border border-[#30363d]">
                  <span className="text-[#8b949e]">Heading: </span>
                  <span className="font-mono">
                    {latestPhysics
                      ? `${((latestPhysics.pose.rotation * 180) / Math.PI).toFixed(0)}deg`
                      : '---'}
                  </span>
                </div>
                <div className="p-1.5 bg-[#161b22] rounded border border-[#30363d]">
                  <span className="text-[#8b949e]">Velocity: </span>
                  <span className="font-mono">
                    {latestPhysics
                      ? `${latestPhysics.velocity.linear.toFixed(3)} m/s`
                      : '---'}
                  </span>
                </div>
                <div className="p-1.5 bg-[#161b22] rounded border border-[#30363d]">
                  <span className="text-[#8b949e]">Last LLM: </span>
                  <span className="font-mono">
                    {latestDecision ? `${latestDecision.responseTimeMs}ms` : '---'}
                  </span>
                </div>
              </div>
            </div>

            {/* Recent critical events */}
            {events.filter((e) => e.severity === 'error' || e.severity === 'critical').length > 0 && (
              <div>
                <h3 className="text-[10px] font-medium text-red-400 uppercase tracking-wider mb-1.5">
                  Recent Errors
                </h3>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {events
                    .filter((e) => e.severity === 'error' || e.severity === 'critical')
                    .slice(0, 5)
                    .map((e) => (
                      <EventItem key={e.id} event={e} />
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═════════════ EVENTS TAB ═════════════ */}
        {activeTab === 'events' && (
          <div className="flex flex-col h-full">
            {/* Filters */}
            <div className="flex gap-2 p-2 border-b border-[#30363d] flex-shrink-0 flex-wrap">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as DiagnosticCategory | 'all')}
                className="text-[10px] bg-[#21262d] border border-[#30363d] rounded px-1.5 py-0.5 text-[#e6edf3]"
              >
                <option value="all">All Categories</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as DiagnosticSeverity | 'all')}
                className="text-[10px] bg-[#21262d] border border-[#30363d] rounded px-1.5 py-0.5 text-[#e6edf3]"
              >
                <option value="all">All Severities</option>
                <option value="ok">OK</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
              </select>
              <span className="text-[10px] text-[#6e7681] ml-auto">
                {filteredEvents.length} events
              </span>
            </div>
            {/* Event list */}
            <div className="flex-1 overflow-y-auto space-y-0.5 p-1">
              {filteredEvents.length === 0 ? (
                <div className="text-center text-[#6e7681] text-xs py-8">
                  No events yet. Start the agent to see diagnostics.
                </div>
              ) : (
                filteredEvents.map((e) => <EventItem key={e.id} event={e} />)
              )}
              <div ref={eventsEndRef} />
            </div>
          </div>
        )}

        {/* ═════════════ PERCEPTION TAB ═════════════ */}
        {activeTab === 'perception' && (
          <div className="p-3 space-y-3">
            <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">
              Perception Analysis
            </h3>

            {latestPerception ? (
              <>
                {/* Sensor radar */}
                <div className="flex justify-center">
                  <SensorRadar sensors={latestPerception.sensors} />
                </div>

                {/* Scene description sent to LLM */}
                <div className="p-2 bg-[#161b22] rounded border border-[#30363d]">
                  <p className="text-[10px] text-[#8b949e] mb-1">Scene sent to LLM:</p>
                  <p className="text-[10px] text-[#e6edf3]">{latestPerception.sceneDescription}</p>
                </div>

                {/* Recommendation */}
                <div className="p-2 bg-[#161b22] rounded border border-[#30363d]">
                  <p className="text-[10px] text-[#8b949e] mb-1">Sensor recommendation:</p>
                  <p className="text-[10px] text-[#3fb950]">{latestPerception.recommendation}</p>
                </div>

                {/* Blocking status */}
                <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                  {['front', 'left', 'right', 'back'].map((dir) => {
                    const blocked = latestPerception[
                      `${dir}Blocked` as keyof typeof latestPerception
                    ] as boolean;
                    return (
                      <div
                        key={dir}
                        className={`p-1.5 rounded text-center border ${
                          blocked
                            ? 'bg-red-500/10 border-red-500/30 text-red-400'
                            : 'bg-green-500/10 border-green-500/30 text-green-400'
                        }`}
                      >
                        {dir}: {blocked ? 'BLOCKED' : 'clear'}
                      </div>
                    );
                  })}
                </div>

                {/* Objects detected */}
                <div className="flex gap-3 text-[10px]">
                  <span className="text-[#8b949e]">
                    Pushable objects: <span className="text-[#e6edf3]">{latestPerception.pushableObjectsDetected}</span>
                  </span>
                  <span className="text-[#8b949e]">
                    Dock zones: <span className="text-[#e6edf3]">{latestPerception.dockZonesDetected}</span>
                  </span>
                </div>

                {/* Perception history chart (text-based) */}
                <div>
                  <h4 className="text-[10px] text-[#8b949e] mb-1">Front Distance History (last 20 cycles)</h4>
                  <div className="flex items-end gap-0.5 h-12">
                    {perceptionHistory.slice(-20).map((p, i) => {
                      const h = Math.max(2, (p.sensors.front / 200) * 48);
                      const color = p.sensors.front < 30 ? '#ef4444' : p.sensors.front < 80 ? '#f59e0b' : '#22c55e';
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t"
                          style={{ height: `${h}px`, backgroundColor: color }}
                          title={`Cycle ${p.cycle}: ${p.sensors.front}cm`}
                        />
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[10px] text-[#6e7681] text-center py-4">
                No perception data yet. Start the agent.
              </p>
            )}
          </div>
        )}

        {/* ═════════════ DECISIONS TAB ═════════════ */}
        {activeTab === 'decisions' && (
          <div className="p-3 space-y-3">
            <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">
              LLM Decision Analysis
            </h3>

            {latestDecision ? (
              <>
                {/* Latest decision */}
                <div className="p-2 bg-[#161b22] rounded border border-[#30363d] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#a855f7] font-medium">
                      Cycle {latestDecision.cycle}
                    </span>
                    <span className="text-[10px] text-[#8b949e] font-mono">
                      {latestDecision.responseTimeMs}ms
                    </span>
                  </div>
                  <div className="text-[10px]">
                    <span className="text-[#8b949e]">Action: </span>
                    <span className="text-[#e6edf3] font-mono">{latestDecision.actionType}</span>
                    {latestDecision.targetDirection && (
                      <span className="text-[#3b82f6] ml-2">
                        -&gt; {latestDecision.targetDirection}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px]">
                    <span className="text-[#8b949e]">Wheels: </span>
                    <span className="font-mono text-[#e6edf3]">
                      L:{latestDecision.wheelCommands.left} R:{latestDecision.wheelCommands.right}
                    </span>
                  </div>
                  <div className="text-[10px]">
                    <span className="text-[#8b949e]">Reasoning: </span>
                    <span className="text-[#e6edf3] italic">
                      {latestDecision.reasoning.length > 200
                        ? latestDecision.reasoning.substring(0, 200) + '...'
                        : latestDecision.reasoning}
                    </span>
                  </div>
                </div>

                {/* Quality indicators */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div
                    className={`p-1.5 rounded border ${
                      latestDecision.parsedSuccessfully
                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}
                  >
                    JSON Parse: {latestDecision.parsedSuccessfully ? 'OK' : 'FAILED'}
                  </div>
                  <div
                    className={`p-1.5 rounded border ${
                      latestDecision.toolCallsExtracted > 0
                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}
                  >
                    Tool Calls: {latestDecision.toolCallsExtracted}
                  </div>
                  <div
                    className={`p-1.5 rounded border ${
                      latestDecision.matchesSensorRecommendation
                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                        : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                    }`}
                  >
                    Matches Sensors: {latestDecision.matchesSensorRecommendation ? 'Yes' : 'No'}
                  </div>
                  <div
                    className={`p-1.5 rounded border ${
                      !latestDecision.repeatsLastAction
                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                        : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                    }`}
                  >
                    Repeats Last: {latestDecision.repeatsLastAction ? 'Yes' : 'No'}
                  </div>
                </div>

                {/* Response time history */}
                <div>
                  <h4 className="text-[10px] text-[#8b949e] mb-1">LLM Response Time (last 20)</h4>
                  <div className="flex items-end gap-0.5 h-12">
                    {decisionHistory.slice(-20).map((d, i) => {
                      const maxMs = 15000;
                      const h = Math.max(2, (d.responseTimeMs / maxMs) * 48);
                      const color = d.responseTimeMs > 10000 ? '#ef4444' : d.responseTimeMs > 5000 ? '#f59e0b' : '#22c55e';
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t"
                          style={{ height: `${h}px`, backgroundColor: color }}
                          title={`Cycle ${d.cycle}: ${d.responseTimeMs}ms`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Decision history table */}
                <div>
                  <h4 className="text-[10px] text-[#8b949e] mb-1">Recent Decisions</h4>
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {decisionHistory
                      .slice(-10)
                      .reverse()
                      .map((d, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-[9px] p-1 bg-[#161b22] rounded"
                        >
                          <span className="text-[#6e7681] font-mono w-6">C{d.cycle}</span>
                          <span className="text-[#a855f7] w-12 truncate">{d.actionType}</span>
                          <span className="text-[#e6edf3] font-mono w-16">
                            L:{d.wheelCommands.left} R:{d.wheelCommands.right}
                          </span>
                          <span className="text-[#8b949e] flex-1 truncate">
                            {d.reasoning.substring(0, 60)}
                          </span>
                          <span className="text-[#6e7681] font-mono">{d.responseTimeMs}ms</span>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[10px] text-[#6e7681] text-center py-4">
                No decision data yet. Start the agent.
              </p>
            )}
          </div>
        )}

        {/* ═════════════ PHYSICS TAB ═════════════ */}
        {activeTab === 'physics' && (
          <div className="p-3 space-y-3">
            <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">
              Physics & Movement
            </h3>

            {latestPhysics ? (
              <>
                {/* Position and velocity */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="p-1.5 bg-[#161b22] rounded border border-[#30363d]">
                    <span className="text-[#8b949e]">X: </span>
                    <span className="font-mono">{latestPhysics.pose.x.toFixed(3)}m</span>
                  </div>
                  <div className="p-1.5 bg-[#161b22] rounded border border-[#30363d]">
                    <span className="text-[#8b949e]">Y: </span>
                    <span className="font-mono">{latestPhysics.pose.y.toFixed(3)}m</span>
                  </div>
                  <div className="p-1.5 bg-[#161b22] rounded border border-[#30363d]">
                    <span className="text-[#8b949e]">Linear V: </span>
                    <span className="font-mono">{latestPhysics.velocity.linear.toFixed(3)} m/s</span>
                  </div>
                  <div className="p-1.5 bg-[#161b22] rounded border border-[#30363d]">
                    <span className="text-[#8b949e]">Angular V: </span>
                    <span className="font-mono">{latestPhysics.velocity.angular.toFixed(3)} rad/s</span>
                  </div>
                </div>

                {/* Collision indicators */}
                <div className="flex gap-2">
                  <div
                    className={`flex-1 p-1.5 rounded text-center text-[10px] border ${
                      latestPhysics.frontBumper
                        ? 'bg-red-500/20 border-red-500/30 text-red-400'
                        : 'bg-[#161b22] border-[#30363d] text-[#8b949e]'
                    }`}
                  >
                    Front Bumper: {latestPhysics.frontBumper ? 'HIT' : 'clear'}
                  </div>
                  <div
                    className={`flex-1 p-1.5 rounded text-center text-[10px] border ${
                      latestPhysics.backBumper
                        ? 'bg-red-500/20 border-red-500/30 text-red-400'
                        : 'bg-[#161b22] border-[#30363d] text-[#8b949e]'
                    }`}
                  >
                    Back Bumper: {latestPhysics.backBumper ? 'HIT' : 'clear'}
                  </div>
                </div>

                {/* Proximity warnings */}
                <div className="flex gap-2 text-[10px]">
                  <div className="flex-1 p-1.5 bg-[#161b22] rounded border border-[#30363d]">
                    <span className="text-[#8b949e]">Closest wall: </span>
                    <span
                      className="font-mono"
                      style={{
                        color:
                          latestPhysics.closestWallDistance < 10
                            ? '#ef4444'
                            : latestPhysics.closestWallDistance < 30
                            ? '#f59e0b'
                            : '#22c55e',
                      }}
                    >
                      {latestPhysics.closestWallDistance.toFixed(1)}cm
                    </span>
                  </div>
                  <div className="flex-1 p-1.5 bg-[#161b22] rounded border border-[#30363d]">
                    <span className="text-[#8b949e]">Closest obstacle: </span>
                    <span
                      className="font-mono"
                      style={{
                        color:
                          latestPhysics.closestObstacleDistance < 10
                            ? '#ef4444'
                            : latestPhysics.closestObstacleDistance < 30
                            ? '#f59e0b'
                            : '#22c55e',
                      }}
                    >
                      {latestPhysics.closestObstacleDistance.toFixed(1)}cm
                    </span>
                  </div>
                </div>

                {/* Stuck indicator */}
                {stuckCycles > 0 && (
                  <div className="p-2 bg-red-600/20 border border-red-600/50 rounded text-[10px] text-red-400">
                    <strong>STUCK DETECTED:</strong> Robot has not moved significantly for{' '}
                    {stuckCycles} consecutive cycles. Distance moved per cycle:{' '}
                    {latestPhysics.distanceMoved.toFixed(4)}m
                  </div>
                )}

                {/* Pushable objects */}
                <div className="text-[10px]">
                  <span className="text-[#8b949e]">Objects in dock zones: </span>
                  <span
                    className="font-mono"
                    style={{
                      color: latestPhysics.objectsInDockZones > 0 ? '#22c55e' : '#8b949e',
                    }}
                  >
                    {latestPhysics.objectsInDockZones}
                  </span>
                  {latestPhysics.pushableObjectsMoved && (
                    <span className="text-[#f59e0b] ml-2">(object was pushed this cycle)</span>
                  )}
                </div>

                {/* Movement history */}
                <div>
                  <h4 className="text-[10px] text-[#8b949e] mb-1">Distance Per Cycle (last 20)</h4>
                  <div className="flex items-end gap-0.5 h-12">
                    {physicsHistory.slice(-20).map((p, i) => {
                      const maxDist = 0.1;
                      const h = Math.max(1, (p.distanceMoved / maxDist) * 48);
                      const color = p.distanceMoved < 0.005 ? '#ef4444' : '#22c55e';
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t"
                          style={{ height: `${h}px`, backgroundColor: color }}
                          title={`Cycle ${p.cycle}: ${(p.distanceMoved * 100).toFixed(1)}cm`}
                        />
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[10px] text-[#6e7681] text-center py-4">
                No physics data yet. Start the agent.
              </p>
            )}
          </div>
        )}

        {/* ═════════════ CAMERA TAB ═════════════ */}
        {activeTab === 'camera' && (
          <div className="p-3 space-y-3">
            <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">
              Camera & Perspective Analysis
            </h3>

            {latestCamera ? (
              <>
                {/* FOV coverage */}
                <div className="p-2 bg-[#161b22] rounded border border-[#30363d]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-[#8b949e]">FOV Coverage</span>
                    <span
                      className="text-[10px] font-mono"
                      style={{
                        color: latestCamera.fovCoveragePercent > 60 ? '#22c55e' : '#f59e0b',
                      }}
                    >
                      {latestCamera.fovCoveragePercent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${latestCamera.fovCoveragePercent}%`,
                        backgroundColor:
                          latestCamera.fovCoveragePercent > 60 ? '#22c55e' : '#f59e0b',
                      }}
                    />
                  </div>
                </div>

                {/* Goal target visibility */}
                <div
                  className={`p-2 rounded border text-[10px] ${
                    latestCamera.canSeeGoalTarget
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                  }`}
                >
                  Goal Target:{' '}
                  {latestCamera.canSeeGoalTarget ? (
                    <>
                      Visible - {latestCamera.goalTargetDirection} at{' '}
                      {latestCamera.goalTargetDistance}cm
                    </>
                  ) : (
                    'Not visible in current sensor range'
                  )}
                </div>

                {/* Blind spots */}
                <div>
                  <h4 className="text-[10px] text-[#f59e0b] mb-1">
                    Blind Spots ({latestCamera.blindSpots.length})
                  </h4>
                  <div className="space-y-0.5">
                    {latestCamera.blindSpots.map((bs, i) => (
                      <div
                        key={i}
                        className="text-[9px] p-1 bg-yellow-500/5 border border-yellow-500/20 rounded text-yellow-400"
                      >
                        {bs}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Issues */}
                <div>
                  <h4 className="text-[10px] text-[#ec4899] mb-1">
                    Perspective Issues ({latestCamera.issues.length})
                  </h4>
                  <div className="space-y-1">
                    {latestCamera.issues.map((issue, i) => (
                      <div
                        key={i}
                        className="text-[10px] p-2 bg-[#161b22] border border-[#30363d] rounded text-[#e6edf3]"
                      >
                        {issue}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[10px] text-[#6e7681] text-center py-4">
                No camera analysis yet. Start the agent.
              </p>
            )}
          </div>
        )}

        {/* ═════════════ REPRESENTATION TAB ═════════════ */}
        {activeTab === 'representation' && (
          <div className="p-3 space-y-3">
            <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">
              Representation & Simulator Issues
            </h3>

            {representationIssues.length > 0 ? (
              <div className="space-y-2">
                {representationIssues.map((issue, i) => {
                  // Determine severity by keyword
                  const isWarning =
                    issue.includes('mismatch') ||
                    issue.includes('zero-thickness') ||
                    issue.includes('limited') ||
                    issue.includes('not reported');
                  const isInfo = !isWarning;

                  return (
                    <div
                      key={i}
                      className={`p-2 rounded border text-[10px] ${
                        isWarning
                          ? 'bg-yellow-500/10 border-yellow-500/30'
                          : 'bg-blue-500/10 border-blue-500/30'
                      }`}
                    >
                      <span
                        style={{ color: isWarning ? '#f59e0b' : '#3b82f6' }}
                      >
                        {isWarning ? '\u26A0' : '\u2139'}{' '}
                      </span>
                      <span className="text-[#e6edf3]">{issue}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[10px] text-[#6e7681] text-center py-4">
                No representation issues logged yet. Start the agent to analyze the arena.
              </p>
            )}

            {/* Fixed issues */}
            <div className="mt-4">
              <h3 className="text-[10px] font-medium text-[#22c55e] uppercase tracking-wider mb-2">
                Implemented Fixes
              </h3>
              <div className="space-y-1.5 text-[10px]">
                <div className="p-2 bg-green-500/10 border border-green-500/30 rounded text-[#e6edf3]">
                  <strong className="text-green-400">1. Full 8-sensor FOV:</strong> take_picture now reports all 8
                  distance sensors (front, frontLeft, frontRight, left, right, back, backLeft,
                  backRight) - 100% coverage vs the previous 37.5%.
                </div>
                <div className="p-2 bg-green-500/10 border border-green-500/30 rounded text-[#e6edf3]">
                  <strong className="text-green-400">2. Real camera image:</strong> A real Three.js rendered screenshot
                  is captured each cycle and sent to the LLM via the vision API (multimodal). The LLM
                  now sees the actual 3D scene alongside sensor data.
                </div>
                <div className="p-2 bg-green-500/10 border border-green-500/30 rounded text-[#e6edf3]">
                  <strong className="text-green-400">3. Box collision physics:</strong> Pushable cube objects now use
                  AABB (axis-aligned bounding box) collision matching their visual cube shape.
                  Raycasting also uses box intersection instead of circle approximation.
                </div>
                <div className="p-2 bg-green-500/10 border border-green-500/30 rounded text-[#e6edf3]">
                  <strong className="text-green-400">4. Wall thickness (3cm):</strong> Walls now have 3cm physical
                  thickness. Collision detection and raycasting account for the wall surface offset,
                  improving realism and preventing edge-case pass-through.
                </div>
                <div className="p-2 bg-green-500/10 border border-green-500/30 rounded text-[#e6edf3]">
                  <strong className="text-green-400">5. Spatial context:</strong> Each take_picture now includes a
                  spatial context block with arena dimensions, robot absolute position/heading,
                  object absolute positions, and tactical pushing advice.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
