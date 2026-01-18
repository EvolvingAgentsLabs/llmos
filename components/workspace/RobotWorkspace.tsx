'use client';

import { useState, useCallback, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import RobotWorldPanel from '../robot/RobotWorldPanel';
import ChatPanel from '../chat/ChatPanel';
import { ChevronLeft, ChevronRight, FolderTree, FileCode, Layers, X, FileText, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { generateRobotConfig, robotIconToDataURL } from '@/lib/agents/robot-icon-generator';

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

  // File viewer state
  const [viewMode, setViewMode] = useState<'agents' | 'files'>('agents');
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string; volume: string } | null>(null);
  const [fileTree, setFileTree] = useState<any[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());

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

  // Load file tree from volume
  const loadFileTree = useCallback(async (volume: 'user' | 'team' | 'system') => {
    setIsLoadingFiles(true);
    try {
      // Use Electron FS API to list files
      if (typeof window !== 'undefined' && (window as any).electronFS) {
        const entries = await (window as any).electronFS.list(volume, '');
        console.log(`[RobotWorkspace] Loaded ${entries.length} entries from ${volume} volume`);

        // Convert FileInfo[] to tree node format
        const formattedEntries = entries.map((entry: any) => ({
          name: entry.name,
          path: entry.path,
          type: entry.isDirectory ? 'directory' : 'file',
          children: entry.isDirectory ? [] : undefined,
          loaded: false,
        }));

        setFileTree(formattedEntries);
        setExpandedFolders(new Set());
      } else {
        console.warn('[RobotWorkspace] Electron FS API not available');
        setFileTree([]);
      }
    } catch (error) {
      console.error('[RobotWorkspace] Failed to load file tree:', error);
      setFileTree([]);
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  // Toggle folder expansion and load children if needed
  const toggleFolder = useCallback(async (folderPath: string, volume: 'user' | 'team' | 'system') => {
    const isExpanded = expandedFolders.has(folderPath);

    if (isExpanded) {
      // Collapse folder
      const newExpanded = new Set(expandedFolders);
      newExpanded.delete(folderPath);
      setExpandedFolders(newExpanded);
    } else {
      // Expand folder and load children if not loaded
      const newExpanded = new Set(expandedFolders);
      newExpanded.add(folderPath);
      setExpandedFolders(newExpanded);

      // Find the folder in the tree and load children if needed
      const loadChildren = async (nodes: any[]): Promise<any[]> => {
        const result = [];
        for (const node of nodes) {
          if (node.path === folderPath && node.type === 'directory' && !node.loaded) {
            // Load children
            setLoadingFolders(prev => new Set(prev).add(folderPath));
            try {
              if (typeof window !== 'undefined' && (window as any).electronFS) {
                const entries = await (window as any).electronFS.list(volume, folderPath);
                console.log(`[RobotWorkspace] Loaded ${entries.length} entries from ${folderPath}`);

                const children = entries.map((entry: any) => ({
                  name: entry.name,
                  path: entry.path,
                  type: entry.isDirectory ? 'directory' : 'file',
                  children: entry.isDirectory ? [] : undefined,
                  loaded: false,
                }));

                result.push({ ...node, children, loaded: true });
              }
            } catch (error) {
              console.error(`[RobotWorkspace] Failed to load folder ${folderPath}:`, error);
              result.push(node);
            } finally {
              setLoadingFolders(prev => {
                const newSet = new Set(prev);
                newSet.delete(folderPath);
                return newSet;
              });
            }
          } else if (node.children) {
            result.push({ ...node, children: await loadChildren(node.children) });
          } else {
            result.push(node);
          }
        }
        return result;
      };

      setFileTree(await loadChildren(fileTree));
    }
  }, [expandedFolders, fileTree]);

  // Load file content
  const loadFileContent = useCallback(async (path: string, volume: 'user' | 'team' | 'system') => {
    try {
      // Use Electron FS API to read file
      if (typeof window !== 'undefined' && (window as any).electronFS) {
        const content = await (window as any).electronFS.read(volume, path);
        console.log(`[RobotWorkspace] Loaded file: ${volume}/${path}`);

        setSelectedFile({
          path,
          content,
          volume,
        });
      } else {
        console.warn('[RobotWorkspace] Electron FS API not available');
      }
    } catch (error) {
      console.error('[RobotWorkspace] Failed to load file content:', error);
    }
  }, []);

  // Load file tree when volume or view mode changes
  useEffect(() => {
    if (viewMode === 'files') {
      loadFileTree(activeVolume);
    }
  }, [viewMode, activeVolume, loadFileTree]);

  return (
    <div className="h-full flex bg-[#0d1117] overflow-hidden">
      {/* Left Sidebar: File Browser & Volumes */}
      {showFileBrowser && (
        <div className="w-64 flex flex-col border-r border-[#30363d] bg-[#0d1117] flex-shrink-0">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
            <div className="flex items-center gap-2">
              {viewMode === 'agents' ? (
                <FolderTree className="w-4 h-4 text-[#58a6ff]" />
              ) : (
                <FileText className="w-4 h-4 text-[#3fb950]" />
              )}
              <span className="text-xs font-semibold text-[#e6edf3]">
                {viewMode === 'agents' ? 'AI Robot Agents' : 'File Explorer'}
              </span>
            </div>
            <button
              onClick={toggleFileBrowser}
              className="w-6 h-6 rounded hover:bg-[#21262d] flex items-center justify-center transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-[#8b949e]" />
            </button>
          </div>

          {/* View Mode Switcher */}
          <div className="flex border-b border-[#30363d] bg-[#0d1117]">
            <button
              onClick={() => setViewMode('agents')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                viewMode === 'agents'
                  ? 'text-[#58a6ff] border-b-2 border-[#58a6ff] bg-[#161b22]'
                  : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              Agents
            </button>
            <button
              onClick={() => setViewMode('files')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                viewMode === 'files'
                  ? 'text-[#3fb950] border-b-2 border-[#3fb950] bg-[#161b22]'
                  : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Files
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

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-2">
            {/* AGENTS VIEW */}
            {viewMode === 'agents' && activeVolume === 'user' && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1">
                  My AI Agents
                </div>
                <AgentTreeItem
                  name="Wall Avoider"
                  description="Navigate without collisions"
                  agentId="user-wall-avoider"
                  capabilities={['distance-sensors', 'reactive-control', 'led-feedback']}
                  onClick={() => handleProgramSelect('user/agents/wall-avoider')}
                />
                <AgentTreeItem
                  name="Maze Solver"
                  description="Path planning & navigation"
                  agentId="user-maze-solver"
                  capabilities={['mapping', 'path-finding', 'llm-reasoning']}
                  onClick={() => handleProgramSelect('user/agents/maze-solver')}
                />
                <AgentTreeItem
                  name="Line Follower"
                  description="PID control with LLM tuning"
                  agentId="user-line-follower"
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

            {/* AGENTS VIEW - Team Volume */}
            {viewMode === 'agents' && activeVolume === 'team' && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1">
                  Shared AI Agents
                </div>
                <AgentTreeItem
                  name="Competition Winner"
                  description="Multi-agent challenge solver"
                  agentId="team-challenge-winner"
                  capabilities={['multi-agent', 'llm-coordination', 'advanced-planning']}
                  onClick={() => handleProgramSelect('team/agents/challenge-winner')}
                />
                <AgentTreeItem
                  name="Swarm Coordinator"
                  description="Multi-robot coordination"
                  agentId="team-swarm-coordinator"
                  capabilities={['swarm-intelligence', 'communication', 'distributed-ai']}
                  onClick={() => handleProgramSelect('team/agents/swarm-coordinator')}
                />
              </div>
            )}

            {/* AGENTS VIEW - System Volume */}
            {viewMode === 'agents' && activeVolume === 'system' && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1">
                  Agent Templates
                </div>
                <AgentTreeItem
                  name="Basic Navigator"
                  description="Simple movement control"
                  agentId="system-basic-navigator"
                  capabilities={['motor-control', 'basic-sensors']}
                  onClick={() => handleProgramSelect('system/templates/basic-navigator')}
                />
                <AgentTreeItem
                  name="Reactive Agent"
                  description="Sensor-based reactive behavior"
                  agentId="system-reactive-agent"
                  capabilities={['distance-sensors', 'reactive-control']}
                  onClick={() => handleProgramSelect('system/templates/reactive-agent')}
                />
                <AgentTreeItem
                  name="LLM-Powered Agent"
                  description="Claude-driven decision making"
                  agentId="system-llm-agent"
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

            {/* FILES VIEW */}
            {viewMode === 'files' && (
              <div className="space-y-1">
                {isLoadingFiles ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#58a6ff]"></div>
                  </div>
                ) : fileTree && fileTree.length > 0 ? (
                  <>
                    <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1">
                      {activeVolume} Volume
                    </div>
                    {fileTree.map((entry: any, index: number) => (
                      <TreeNode
                        key={index}
                        node={entry}
                        volume={activeVolume}
                        depth={0}
                        expandedFolders={expandedFolders}
                        loadingFolders={loadingFolders}
                        onToggleFolder={toggleFolder}
                        onFileClick={loadFileContent}
                      />
                    ))}
                  </>
                ) : (
                  <div className="text-xs text-[#8b949e] px-2 py-4 text-center">
                    No files in this volume
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* File Content Modal */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg shadow-2xl w-[90%] max-w-4xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between rounded-t-lg">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#3fb950]" />
                <span className="text-sm font-semibold text-[#e6edf3]">{selectedFile.path}</span>
                <span className="text-xs text-[#8b949e] px-2 py-0.5 rounded bg-[#21262d]">
                  {selectedFile.volume}
                </span>
              </div>
              <button
                onClick={() => setSelectedFile(null)}
                className="w-6 h-6 rounded hover:bg-[#21262d] flex items-center justify-center transition-colors"
                title="Close"
              >
                <X className="w-4 h-4 text-[#8b949e]" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4 bg-[#0d1117]">
              <pre className="text-xs text-[#e6edf3] font-mono whitespace-pre-wrap break-words">
                {selectedFile.content}
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 border-t border-[#30363d] bg-[#161b22] flex justify-end gap-2 rounded-b-lg">
              <button
                onClick={() => setSelectedFile(null)}
                className="px-3 py-1.5 text-xs font-medium text-[#e6edf3] bg-[#21262d] hover:bg-[#30363d] rounded transition-colors"
              >
                Close
              </button>
            </div>
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
  agentId?: string; // For deterministic icon generation
  capabilities: string[];
  isActive?: boolean;
  onClick?: () => void;
}

function AgentTreeItem({ name, description, agentId, capabilities, isActive, onClick }: AgentTreeItemProps) {
  // Generate unique robot icon based on agent ID (or name if no ID provided)
  const iconId = agentId || name.toLowerCase().replace(/\s+/g, '-');
  const robotConfig = generateRobotConfig(iconId);
  const iconDataUrl = robotIconToDataURL(robotConfig, 24);

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
        <img
          src={iconDataUrl}
          alt={name}
          className="w-5 h-5 flex-shrink-0"
          style={{ imageRendering: 'pixelated' }}
        />
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

// Tree node component for hierarchical file browsing
interface TreeNodeProps {
  node: any;
  volume: 'user' | 'team' | 'system';
  depth: number;
  expandedFolders: Set<string>;
  loadingFolders: Set<string>;
  onToggleFolder: (path: string, volume: 'user' | 'team' | 'system') => void;
  onFileClick: (path: string, volume: 'user' | 'team' | 'system') => void;
}

function TreeNode({ node, volume, depth, expandedFolders, loadingFolders, onToggleFolder, onFileClick }: TreeNodeProps) {
  const isExpanded = expandedFolders.has(node.path);
  const isLoading = loadingFolders.has(node.path);
  const handleClick = () => {
    if (node.type === 'directory') {
      onToggleFolder(node.path, volume);
    } else {
      onFileClick(node.path, volume);
    }
  };

  // Determine file extension for icon
  const getFileIcon = () => {
    const ext = node.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return '📜';
      case 'json':
        return '📋';
      case 'md':
        return '📝';
      case 'wat':
      case 'wasm':
        return '⚙️';
      case 'as':
        return '🔧';
      case 'txt':
        return '📄';
      default:
        return '📄';
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`w-full text-left px-2 py-1 rounded-md text-xs flex items-center gap-1.5 transition-colors ${
          node.type === 'file'
            ? 'text-[#e6edf3] hover:bg-[#21262d]'
            : 'text-[#e6edf3] hover:bg-[#21262d]'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {/* Expand/collapse icon for folders */}
        {node.type === 'directory' && (
          <span className="flex-shrink-0">
            {isLoading ? (
              <div className="w-3 h-3 border border-[#8b949e] border-t-transparent rounded-full animate-spin" />
            ) : isExpanded ? (
              <ChevronDown className="w-3 h-3 text-[#8b949e]" />
            ) : (
              <ChevronRight className="w-3 h-3 text-[#8b949e]" />
            )}
          </span>
        )}

        {/* Icon */}
        {node.type === 'directory' ? (
          isExpanded ? (
            <FolderOpen className="w-3.5 h-3.5 text-[#8b949e] flex-shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-[#8b949e] flex-shrink-0" />
          )
        ) : (
          <span className="text-sm flex-shrink-0">{getFileIcon()}</span>
        )}

        {/* Name */}
        <span className="flex-1 truncate">{node.name}</span>

        {/* File indicator */}
        {node.type === 'file' && <FileCode className="w-3 h-3 text-[#8b949e] flex-shrink-0" />}
      </button>

      {/* Children (if expanded) */}
      {node.type === 'directory' && isExpanded && node.children && node.children.length > 0 && (
        <>
          {node.children.map((child: any, index: number) => (
            <TreeNode
              key={index}
              node={child}
              volume={volume}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              loadingFolders={loadingFolders}
              onToggleFolder={onToggleFolder}
              onFileClick={onFileClick}
            />
          ))}
        </>
      )}
    </>
  );
}
