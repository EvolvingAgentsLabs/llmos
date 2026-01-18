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
  const agentActivity = {
    phase: state.agentState.currentPhase as 'idle' | 'analyzing' | 'planning' | 'voting' | 'executing' | 'sub-agent-execution' | 'completed',
    activeAgents: state.agentState.activeAgents.length,
    isLoading: state.isLoading,
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
              <span className="text-xs font-semibold text-[#e6edf3]">Robot Programs</span>
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
                  My Robots
                </div>
                <FileTreeItem
                  name="wall-avoider-v1.c"
                  type="file"
                  icon="🤖"
                  onClick={() => handleProgramSelect('user/my-robots/wall-avoider-v1.c')}
                />
                <FileTreeItem
                  name="maze-solver.c"
                  type="file"
                  icon="🧩"
                  onClick={() => handleProgramSelect('user/my-robots/maze-solver.c')}
                />
                <FileTreeItem
                  name="line-follower.c"
                  type="file"
                  icon="➡️"
                  onClick={() => handleProgramSelect('user/my-robots/line-follower.c')}
                />
                <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1 mt-3">
                  Telemetry
                </div>
                <FileTreeItem
                  name="session-1.log"
                  type="file"
                  icon="📊"
                  onClick={() => handleProgramSelect('user/telemetry/session-1.log')}
                />
              </div>
            )}

            {/* Team Volume */}
            {activeVolume === 'team' && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1">
                  Shared Programs
                </div>
                <FileTreeItem
                  name="challenge-1-solution.c"
                  type="file"
                  icon="🏆"
                  onClick={() => handleProgramSelect('team/shared/challenge-1-solution.c')}
                />
                <FileTreeItem
                  name="swarm-coordinator.c"
                  type="file"
                  icon="🤖"
                  onClick={() => handleProgramSelect('team/shared/swarm-coordinator.c')}
                />
              </div>
            )}

            {/* System Volume */}
            {activeVolume === 'system' && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1">
                  Templates
                </div>
                <FileTreeItem
                  name="basic-drive.c"
                  type="file"
                  icon="📄"
                  onClick={() => handleProgramSelect('system/templates/basic-drive.c')}
                />
                <FileTreeItem
                  name="obstacle-avoider.c"
                  type="file"
                  icon="📄"
                  onClick={() => handleProgramSelect('system/templates/obstacle-avoider.c')}
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
              <span className="text-xs font-semibold text-[#e6edf3]">Robot Programming</span>
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
          title="Show robot programming chat"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-[#8b949e]" />
        </button>
      )}
    </div>
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
