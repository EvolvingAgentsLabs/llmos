'use client';

/**
 * Agent Diagnostics Panel — Simplified
 *
 * Focused on what the robot actually does:
 * - Camera: Latest image captured by the robot's camera
 * - Processing: LLM decisions, reasoning, wheel commands, response times
 * - World Model: Internal representation of explored/obstacle areas
 * - Events: Diagnostic event timeline
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  useDiagnosticsStore,
  type DiagnosticCategory,
  type DiagnosticSeverity,
  type DiagnosticEvent,
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
// HEALTH BAR
// ═══════════════════════════════════════════════════════════════════════════

function HealthBar({ label, score }: { label: string; score: number }) {
  const barColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#8b949e] w-20 truncate">{label}</span>
      <div className="flex-1 h-2 bg-[#21262d] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(2, score)}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="text-[10px] font-mono w-8 text-right" style={{ color: barColor }}>
        {score}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT ITEM
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
// DISTANCE INDICATOR (compact inline sensors display)
// ═══════════════════════════════════════════════════════════════════════════

function DistanceIndicator({
  sensors,
}: {
  sensors: {
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
  const colorFor = (v: number) =>
    v < 30 ? '#ef4444' : v < 80 ? '#f59e0b' : '#22c55e';

  const dirs: [string, number][] = [
    ['F', sensors.front],
    ['FL', sensors.frontLeft],
    ['FR', sensors.frontRight],
    ['L', sensors.left],
    ['R', sensors.right],
    ['BL', sensors.backLeft],
    ['BR', sensors.backRight],
    ['B', sensors.back],
  ];

  return (
    <div className="flex flex-wrap gap-1">
      {dirs.map(([label, val]) => (
        <span
          key={label}
          className="text-[9px] font-mono px-1 py-0.5 rounded border border-[#30363d]"
          style={{ color: colorFor(val) }}
          title={`${label}: ${Math.round(val)}cm`}
        >
          {label}:{Math.round(val)}
        </span>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════════════════

type DiagTab = 'camera' | 'processing' | 'world' | 'events';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function AgentDiagnosticsPanel() {
  const [activeTab, setActiveTab] = useState<DiagTab>('camera');
  const [categoryFilter, setCategoryFilter] = useState<DiagnosticCategory | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<DiagnosticSeverity | 'all'>('all');
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const events = useDiagnosticsStore((s) => s.events);
  const health = useDiagnosticsStore((s) => s.health);
  const perceptionHistory = useDiagnosticsStore((s) => s.perceptionHistory);
  const decisionHistory = useDiagnosticsStore((s) => s.decisionHistory);
  const physicsHistory = useDiagnosticsStore((s) => s.physicsHistory);
  const stuckCycles = useDiagnosticsStore((s) => s.stuckCycles);
  const representationIssues = useDiagnosticsStore((s) => s.representationIssues);
  const latestCameraImageUrl = useDiagnosticsStore((s) => s.latestCameraImageUrl);
  const latestCameraTimestamp = useDiagnosticsStore((s) => s.latestCameraTimestamp);
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

  const tabs: { id: DiagTab; label: string }[] = [
    { id: 'camera', label: 'Camera' },
    { id: 'processing', label: 'Processing' },
    { id: 'world', label: 'World Model' },
    { id: 'events', label: `Events (${events.length})` },
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
      <div className="flex gap-0.5 px-2 py-1 border-b border-[#30363d] bg-[#161b22] flex-shrink-0">
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
        {/* ═════════════ CAMERA TAB ═════════════ */}
        {activeTab === 'camera' && (
          <div className="p-3 space-y-3">
            <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">
              Robot Camera View
            </h3>

            {/* Latest camera image */}
            {latestCameraImageUrl ? (
              <div className="rounded-lg border border-[#30363d] overflow-hidden">
                <div className="px-2 py-1 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between">
                  <span className="text-[9px] text-[#8b949e] uppercase tracking-wider">
                    Latest Capture
                  </span>
                  <span className="text-[9px] text-[#6e7681] font-mono">
                    {new Date(latestCameraTimestamp).toLocaleTimeString()}
                  </span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={latestCameraImageUrl}
                  alt="Robot camera view"
                  className="w-full"
                  style={{ imageRendering: 'auto' }}
                />
              </div>
            ) : (
              <div className="p-6 rounded-lg border border-[#30363d] bg-[#161b22] text-center">
                <p className="text-[10px] text-[#6e7681]">
                  No camera image yet. Start the agent to capture images.
                </p>
              </div>
            )}

            {/* Distance sensors (compact) */}
            {latestPerception && (
              <div>
                <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider mb-1.5">
                  Distance Sensors (cm)
                </h3>
                <DistanceIndicator sensors={latestPerception.sensors} />
              </div>
            )}

            {/* Quick status */}
            <div>
              <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider mb-1.5">
                Status
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
                  <span className="text-[#8b949e]">LLM Latency: </span>
                  <span className="font-mono">
                    {latestDecision ? `${latestDecision.responseTimeMs}ms` : '---'}
                  </span>
                </div>
              </div>
            </div>

            {/* Health scores */}
            <div className="space-y-1.5">
              <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">
                Health
              </h3>
              <HealthBar label="Perception" score={health.perception} />
              <HealthBar label="Decisions" score={health.decisionQuality} />
              <HealthBar label="Movement" score={health.movement} />
              <HealthBar label="Goal" score={health.goalProgress} />
              <div className="pt-1 border-t border-[#21262d]">
                <HealthBar label="Overall" score={health.overall} />
              </div>
            </div>
          </div>
        )}

        {/* ═════════════ PROCESSING TAB ═════════════ */}
        {activeTab === 'processing' && (
          <div className="p-3 space-y-3">
            <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">
              Robot Processing
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
                      {latestDecision.reasoning.length > 300
                        ? latestDecision.reasoning.substring(0, 300) + '...'
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

                {/* Collision / bumper status */}
                {latestPhysics && (
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
                )}

                {/* Stuck indicator */}
                {stuckCycles > 0 && (
                  <div className="p-2 bg-red-600/20 border border-red-600/50 rounded text-[10px] text-red-400">
                    <strong>STUCK:</strong> {stuckCycles} consecutive cycles without significant movement.
                    {latestPhysics && ` Moved: ${latestPhysics.distanceMoved.toFixed(4)}m`}
                  </div>
                )}

                {/* LLM response time history */}
                <div>
                  <h4 className="text-[10px] text-[#8b949e] mb-1">LLM Response Time (last 20)</h4>
                  <div className="flex items-end gap-0.5 h-12">
                    {decisionHistory.slice(-20).map((d, i) => {
                      const maxMs = 15000;
                      const h = Math.max(2, (d.responseTimeMs / maxMs) * 48);
                      const color =
                        d.responseTimeMs > 10000
                          ? '#ef4444'
                          : d.responseTimeMs > 5000
                          ? '#f59e0b'
                          : '#22c55e';
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

                {/* Recent decisions table */}
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

                {/* Movement history */}
                {physicsHistory.length > 0 && (
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
                )}
              </>
            ) : (
              <p className="text-[10px] text-[#6e7681] text-center py-4">
                No processing data yet. Start the agent.
              </p>
            )}
          </div>
        )}

        {/* ═════════════ WORLD MODEL TAB ═════════════ */}
        {activeTab === 'world' && (
          <div className="p-3 space-y-3">
            <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">
              Internal World Representation
            </h3>

            {/* Scene description sent to LLM */}
            {latestPerception ? (
              <>
                <div className="p-2 bg-[#161b22] rounded border border-[#30363d]">
                  <p className="text-[10px] text-[#8b949e] mb-1">Scene sent to LLM:</p>
                  <p className="text-[10px] text-[#e6edf3]">{latestPerception.sceneDescription}</p>
                </div>

                {/* Blocking status */}
                <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                  {(['front', 'left', 'right', 'back'] as const).map((dir) => {
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
                    Pushable objects:{' '}
                    <span className="text-[#e6edf3]">{latestPerception.pushableObjectsDetected}</span>
                  </span>
                  <span className="text-[#8b949e]">
                    Dock zones:{' '}
                    <span className="text-[#e6edf3]">{latestPerception.dockZonesDetected}</span>
                  </span>
                </div>

                {/* Proximity */}
                {latestPhysics && (
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
                )}

                {/* Pushable objects in dock zones */}
                {latestPhysics && latestPhysics.objectsInDockZones > 0 && (
                  <div className="p-2 bg-green-500/10 border border-green-500/30 rounded text-[10px] text-green-400">
                    Objects in dock zones: {latestPhysics.objectsInDockZones}
                  </div>
                )}

                {/* Front distance history */}
                <div>
                  <h4 className="text-[10px] text-[#8b949e] mb-1">
                    Front Distance History (last 20)
                  </h4>
                  <div className="flex items-end gap-0.5 h-12">
                    {perceptionHistory.slice(-20).map((p, i) => {
                      const h = Math.max(2, (p.sensors.front / 200) * 48);
                      const color =
                        p.sensors.front < 30
                          ? '#ef4444'
                          : p.sensors.front < 80
                          ? '#f59e0b'
                          : '#22c55e';
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
                No world model data yet. Start the agent.
              </p>
            )}

            {/* Representation notes */}
            {representationIssues.length > 0 && (
              <div>
                <h3 className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider mb-1.5">
                  Arena Notes
                </h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {representationIssues.map((issue, i) => (
                    <div
                      key={i}
                      className="p-1.5 rounded border text-[9px] bg-blue-500/10 border-blue-500/30 text-[#e6edf3]"
                    >
                      {issue}
                    </div>
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
                onChange={(e) =>
                  setCategoryFilter(e.target.value as DiagnosticCategory | 'all')
                }
                className="text-[10px] bg-[#21262d] border border-[#30363d] rounded px-1.5 py-0.5 text-[#e6edf3]"
              >
                <option value="all">All Categories</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={severityFilter}
                onChange={(e) =>
                  setSeverityFilter(e.target.value as DiagnosticSeverity | 'all')
                }
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
      </div>
    </div>
  );
}
