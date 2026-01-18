'use client';

import { useState, useCallback } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import RobotWorldPanel from '../robot/RobotWorldPanel';
import ChatPanel from '../chat/ChatPanel';
import { ChevronLeft, ChevronRight, FolderTree, FileCode } from 'lucide-react';

/**
 * RobotWorkspace - The new primary workspace layout
 *
 * Layout Philosophy:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                          LLMos Robot AI                      │
 * ├──────────┬──────────────────────────────────┬───────────────┤
 * │          │                                  │               │
 * │  Files & │      🤖 3D Robot World          │     Chat      │
 * │  Volumes │         (Primary)                │  (Programs    │
 * │          │                                  │   Robot)      │
 * │  [Tree]  │   Live 3D visualization         │               │
 * │          │   Sim or Real execution         │   Natural     │
 * │  user/   │   Camera controls               │   language    │
 * │  team/   │   Telemetry overlay             │   robot       │
 * │  system/ │                                  │   programming │
 * │          │                                  │               │
 * └──────────┴──────────────────────────────────┴───────────────┘
 *
 * Key Features:
 * - 3D Robot World is PRIMARY (largest panel)
 * - Chat programs robot firmware through natural language
 * - File browser shows robot programs organized by volume
 * - Collapsible sidebars for more 3D space
 */

interface RobotWorkspaceProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange?: (volume: 'system' | 'team' | 'user') => void;
}

export default function RobotWorkspace({ activeVolume, onVolumeChange }: RobotWorkspaceProps) {
  const { state, updatePreferences } = useWorkspace();

  const [showFileBrowser, setShowFileBrowser] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [currentMap, setCurrentMap] = useState('standard5x5Empty');
  const [selectedRobotProgram, setSelectedRobotProgram] = useState<string | null>(null);

  // Extract agent activity from workspace state
  // Map the simple agentState string to the AgentActivity interface expected by RobotWorldPanel
  const agentActivity = {
    phase: state.agentState === 'thinking' ? 'analyzing' :
           state.agentState === 'executing' ? 'executing' :
           state.agentState === 'success' ? 'completed' : 'idle' as 'idle' | 'analyzing' | 'planning' | 'voting' | 'executing' | 'sub-agent-execution' | 'completed',
    activeAgents: state.agentState !== 'idle' ? 1 : 0,
    isLoading: state.agentState === 'thinking' || state.agentState === 'executing',
  };

  // Toggle sidebars
  const toggleFileBrowser = useCallback(() => {
    setShowFileBrowser(!showFileBrowser);
  }, [showFileBrowser]);

  const toggleChat = useCallback(() => {
    setShowChat(!showChat);
  }, [showChat]);

  // Handle file/program selection
  const handleProgramSelect = useCallback((programPath: string) => {
    setSelectedRobotProgram(programPath);
    // TODO: Load program code into editor or display
  }, []);

  // Handle robot click in 3D view
  const handleRobotClick = useCallback(() => {
    console.log('[RobotWorkspace] Robot clicked - show firmware code');
    // TODO: Open code editor with current firmware
  }, []);

  // Handle arena click in 3D view
  const handleArenaClick = useCallback((x: number, y: number) => {
    console.log(`[RobotWorkspace] Arena clicked at (${x}, ${y}) - set waypoint`);
    // TODO: Add waypoint or target position
  }, []);

  return (
    <div className="h-full flex bg-[#0d1117] overflow-hidden">
      {/* Left Sidebar: File Browser & Volumes */}
      {showFileBrowser && (
        <div className="w-64 flex flex-col border-r border-[#30363d] bg-[#0d1117] flex-shrink-0">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-[#58a6ff]" />
              <span className="text-xs font-semibold text-[#e6edf3]">AI Robot Agents</span>
            </div>
            <button
              onClick={toggleFileBrowser}
              className="w-6 h-6 rounded hover:bg-[#21262d] flex items-center justify-center transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-[#8b949e]" />
            </button>
          </div>

          {/* Volume Tabs */}
          <div className="flex border-b border-[#30363d] bg-[#161b22]">
            {(['user', 'team', 'system'] as const).map((volume) => (
              <button
                key={volume}
                onClick={() => onVolumeChange?.(volume)}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  activeVolume === volume
                    ? 'text-[#58a6ff] border-b-2 border-[#58a6ff]'
                    : 'text-[#8b949e] hover:text-[#e6edf3]'
                }`}
              >
                {volume}
              </button>
            ))}
          </div>

          {/* File Tree */}
          <div className="flex-1 overflow-y-auto p-2">
            {/* User Volume */}
            {activeVolume === 'user' && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1">
                  My AI Agents
                </div>
                <AgentTreeItem
                  name="Wall Avoider"
                  description="Navigate without collisions"
                  icon="🤖"
                  capabilities={['distance-sensors', 'reactive-control', 'led-feedback']}
                  onClick={() => handleProgramSelect('user/agents/wall-avoider')}
                />
                <AgentTreeItem
                  name="Maze Solver"
                  description="Path planning & navigation"
                  icon="🧩"
                  capabilities={['mapping', 'path-finding', 'llm-reasoning']}
                  onClick={() => handleProgramSelect('user/agents/maze-solver')}
                />
                <AgentTreeItem
                  name="Line Follower"
                  description="PID control with LLM tuning"
                  icon="➡️"
                  capabilities={['line-sensors', 'pid-control', 'adaptive-tuning']}
                  onClick={() => handleProgramSelect('user/agents/line-follower')}
                />
                <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1 mt-3">
                  Agent Logs
                </div>
                <FileTreeItem
                  name="session-1.log"
                  type="file"
                  icon="📊"
                  onClick={() => handleProgramSelect('user/logs/session-1.log')}
                />
              </div>
            )}

            {/* Team Volume */}
            {activeVolume === 'team' && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1">
                  Shared AI Agents
                </div>
                <AgentTreeItem
                  name="Competition Winner"
                  description="Multi-agent challenge solver"
                  icon="🏆"
                  capabilities={['multi-agent', 'llm-coordination', 'advanced-planning']}
                  onClick={() => handleProgramSelect('team/agents/challenge-winner')}
                />
                <AgentTreeItem
                  name="Swarm Coordinator"
                  description="Multi-robot coordination"
                  icon="🤝"
                  capabilities={['swarm-intelligence', 'communication', 'distributed-ai']}
                  onClick={() => handleProgramSelect('team/agents/swarm-coordinator')}
                />
              </div>
            )}

            {/* System Volume */}
            {activeVolume === 'system' && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1">
                  Agent Templates
                </div>
                <AgentTreeItem
                  name="Basic Navigator"
                  description="Simple movement control"
                  icon="📘"
                  capabilities={['motor-control', 'basic-sensors']}
                  onClick={() => handleProgramSelect('system/templates/basic-navigator')}
                />
                <AgentTreeItem
                  name="Reactive Agent"
                  description="Sensor-based reactive behavior"
                  icon="⚡"
                  capabilities={['distance-sensors', 'reactive-control']}
                  onClick={() => handleProgramSelect('system/templates/reactive-agent')}
                />
                <AgentTreeItem
                  name="LLM-Powered Agent"
                  description="Claude-driven decision making"
                  icon="🧠"
                  capabilities={['llm-reasoning', 'tool-calling', 'adaptive-behavior']}
                  onClick={() => handleProgramSelect('system/templates/llm-agent')}
                />
                <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1 mt-3">
                  Standard Maps
                </div>
                <FileTreeItem
                  name="5m × 5m Empty"
                  type="map"
                  icon="🗺️"
                  isActive={currentMap === 'standard5x5Empty'}
                  onClick={() => setCurrentMap('standard5x5Empty')}
                />
                <FileTreeItem
                  name="5m × 5m Obstacles"
                  type="map"
                  icon="🗺️"
                  isActive={currentMap === 'standard5x5Obstacles'}
                  onClick={() => setCurrentMap('standard5x5Obstacles')}
                />
                <FileTreeItem
                  name="5m × 5m Line Track"
                  type="map"
                  icon="🗺️"
                  isActive={currentMap === 'standard5x5LineTrack'}
                  onClick={() => setCurrentMap('standard5x5LineTrack')}
                />
                <FileTreeItem
                  name="5m × 5m Maze"
                  type="map"
                  icon="🗺️"
                  isActive={currentMap === 'standard5x5Maze'}
                  onClick={() => setCurrentMap('standard5x5Maze')}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collapse trigger when hidden */}
      {!showFileBrowser && (
        <button
          onClick={toggleFileBrowser}
          className="w-8 flex-shrink-0 border-r border-[#30363d] bg-[#161b22] hover:bg-[#21262d] flex items-center justify-center transition-colors"
          title="Show file browser"
        >
          <ChevronRight className="w-3.5 h-3.5 text-[#8b949e]" />
        </button>
      )}

      {/* Center: 3D Robot World (PRIMARY) */}
      <div className="flex-1 flex flex-col min-w-0">
        <RobotWorldPanel
          currentMap={currentMap}
          onRobotClick={handleRobotClick}
          onArenaClick={handleArenaClick}
          agentActivity={agentActivity}
        />
      </div>

      {/* Right Sidebar: Chat (Programs Robot) */}
      {showChat && (
        <div className="w-96 flex flex-col border-l border-[#30363d] bg-[#0d1117] flex-shrink-0">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-[#3fb950]" />
              <span className="text-xs font-semibold text-[#e6edf3]">AI Agent Creator</span>
            </div>
            <button
              onClick={toggleChat}
              className="w-6 h-6 rounded hover:bg-[#21262d] flex items-center justify-center transition-colors"
              title="Collapse chat"
            >
              <ChevronRight className="w-3.5 h-3.5 text-[#8b949e]" />
            </button>
          </div>

          {/* Chat Panel */}
          <div className="flex-1 overflow-hidden">
            <ChatPanel activeVolume={activeVolume} />
          </div>
        </div>
      )}

      {/* Collapse trigger when hidden */}
      {!showChat && (
        <button
          onClick={toggleChat}
          className="w-8 flex-shrink-0 border-l border-[#30363d] bg-[#161b22] hover:bg-[#21262d] flex items-center justify-center transition-colors"
          title="Show AI agent creator"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-[#8b949e]" />
        </button>
      )}
    </div>
  );
}

// AI Agent tree item component
interface AgentTreeItemProps {
  name: string;
  description: string;
  icon?: string;
  capabilities: string[];
  isActive?: boolean;
  onClick?: () => void;
}

function AgentTreeItem({ name, description, icon, capabilities, isActive, onClick }: AgentTreeItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-2 rounded-md text-xs flex flex-col gap-1 transition-colors ${
        isActive
          ? 'bg-[#58a6ff]/20 border border-[#58a6ff]/50'
          : 'bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff]/50 hover:bg-[#21262d]'
      }`}
    >
      <div className="flex items-center gap-2">
        {icon && <span className="text-base">{icon}</span>}
        <span className={`font-medium flex-1 ${isActive ? 'text-[#58a6ff]' : 'text-[#e6edf3]'}`}>{name}</span>
        <span className="text-[10px] text-[#8b949e] px-1.5 py-0.5 rounded bg-[#21262d]">AI</span>
      </div>
      <p className="text-[10px] text-[#8b949e] pl-6">{description}</p>
      <div className="flex flex-wrap gap-1 pl-6">
        {capabilities.slice(0, 2).map((cap) => (
          <span
            key={cap}
            className="text-[9px] px-1.5 py-0.5 rounded bg-[#238636]/20 text-[#3fb950] border border-[#238636]/30"
          >
            {cap}
          </span>
        ))}
        {capabilities.length > 2 && (
          <span className="text-[9px] px-1 py-0.5 text-[#8b949e]">+{capabilities.length - 2}</span>
        )}
      </div>
    </button>
  );
}

// File tree item component
interface FileTreeItemProps {
  name: string;
  type: 'file' | 'folder' | 'map';
  icon?: string;
  isActive?: boolean;
  onClick?: () => void;
}

function FileTreeItem({ name, type, icon, isActive, onClick }: FileTreeItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${
        isActive
          ? 'bg-[#58a6ff]/20 border border-[#58a6ff]/50 text-[#58a6ff]'
          : 'text-[#e6edf3] hover:bg-[#21262d]'
      }`}
    >
      {icon && <span className="text-sm">{icon}</span>}
      <span className="flex-1 truncate">{name}</span>
      {type === 'file' && <FileCode className="w-3 h-3 text-[#8b949e]" />}
      {type === 'folder' && <FolderTree className="w-3 h-3 text-[#8b949e]" />}
    </button>
  );
}
