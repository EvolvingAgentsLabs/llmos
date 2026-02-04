'use client';

import { useState, useCallback, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import RobotWorldPanel from '../robot/RobotWorldPanel';
import ChatPanel from '../chat/ChatPanel';
import RobotAgentPanel from '../robot/RobotAgentPanel';
import { ChevronLeft, ChevronRight, FolderTree, FileCode, Layers, X, FileText, ChevronDown, Folder, FolderOpen, Bot, MessageSquare, Copy, Edit3, Save, MoreVertical, Home, ChevronUp, Play, Cpu, Trash2 } from 'lucide-react';
import { WorldModel } from '@/lib/runtime/world-model';
import { generateRobotConfig, robotIconToDataURL } from '@/lib/agents/robot-icon-generator';
import { artifactManager } from '@/lib/artifacts/artifact-manager';
import { Artifact, ArtifactVolume } from '@/lib/artifacts/types';
import { getVFS } from '@/lib/virtual-fs';

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
  const [rightPanelMode, setRightPanelMode] = useState<'chat' | 'agent'>('agent');
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  // File viewer state
  const [viewMode, setViewMode] = useState<'agents' | 'files'>('agents');
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string; volume: string; isEditing?: boolean; artifactId?: string } | null>(null);
  const [fileTree, setFileTree] = useState<any[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());

  // Folder navigation state
  const [currentPath, setCurrentPath] = useState<string>('');

  // Agent artifacts state
  const [agents, setAgents] = useState<Artifact[]>([]);
  const [robotAgents, setRobotAgents] = useState<Artifact[]>([]); // Filtered robot-only agents
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; agent: Artifact } | null>(null);

  // Selected robot agent for simulation
  const [selectedRobotAgent, setSelectedRobotAgent] = useState<Artifact | null>(null);

  // World model state - shared between RobotAgentPanel and RobotWorldPanel for visualization
  const [worldModel, setWorldModel] = useState<WorldModel | null>(null);

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

  // Folder navigation functions
  const navigateToRoot = useCallback(() => {
    setCurrentPath('');
    setExpandedFolders(new Set());
  }, []);

  const navigateUp = useCallback(() => {
    if (currentPath) {
      const parts = currentPath.split('/').filter(Boolean);
      if (parts.length > 1) {
        const parentPath = parts.slice(0, -1).join('/');
        setCurrentPath(parentPath);
      } else {
        setCurrentPath('');
      }
    }
  }, [currentPath]);

  const navigateToPath = useCallback((path: string) => {
    setCurrentPath(path);
    // Expand the path
    const parts = path.split('/').filter(Boolean);
    const newExpanded = new Set<string>();
    let buildPath = '';
    parts.forEach(part => {
      buildPath = buildPath ? `${buildPath}/${part}` : part;
      newExpanded.add(buildPath);
    });
    setExpandedFolders(newExpanded);
  }, []);

  // Get breadcrumb segments from current path
  const getPathSegments = useCallback((): { name: string; path: string }[] => {
    if (!currentPath) return [];
    const parts = currentPath.split('/').filter(Boolean);
    const segments: { name: string; path: string }[] = [];
    let buildPath = '';
    parts.forEach(part => {
      buildPath = buildPath ? `${buildPath}/${part}` : part;
      segments.push({ name: part, path: buildPath });
    });
    return segments;
  }, [currentPath]);

  // Filter file tree based on current path
  const getFilteredFileTree = useCallback(() => {
    if (!currentPath) return fileTree;

    // Navigate to the current path in the tree
    const parts = currentPath.split('/').filter(Boolean);
    let current = fileTree;

    for (const part of parts) {
      const found = current.find((node: any) => node.name === part && node.type === 'directory');
      if (found && found.children) {
        current = found.children;
      } else {
        return [];
      }
    }

    return current;
  }, [currentPath, fileTree]);

  const canNavigateUp = currentPath !== '';

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

  // Load file tree from volume (with VFS fallback)
  const loadFileTree = useCallback(async (volume: 'user' | 'team' | 'system') => {
    setIsLoadingFiles(true);
    try {
      let entries: any[] = [];

      // Try Electron FS API first
      if (typeof window !== 'undefined' && (window as any).electronFS) {
        try {
          entries = await (window as any).electronFS.list(volume, '');
          console.log(`[RobotWorkspace] Loaded ${entries.length} entries from ${volume} volume via Electron FS`);
        } catch (electronError) {
          console.warn('[RobotWorkspace] Electron FS failed, falling back to VFS:', electronError);
        }
      }

      // If Electron FS not available or returned empty, fall back to VFS
      if (entries.length === 0 && typeof window !== 'undefined') {
        const vfs = getVFS();
        const vfsResult = vfs.listDirectory(volume);

        // Convert VFS files to tree node format
        const vfsFiles = vfsResult.files.map((file) => ({
          name: file.path.split('/').pop() || file.path,
          path: file.path.replace(`${volume}/`, ''),
          type: 'file' as const,
          children: undefined,
          loaded: true,
        }));

        // Convert VFS directories to tree node format
        const vfsDirs = vfsResult.directories
          .filter(dir => dir !== volume && dir.startsWith(`${volume}/`))
          .map((dir) => ({
            name: dir.split('/').pop() || dir,
            path: dir.replace(`${volume}/`, ''),
            type: 'directory' as const,
            children: [],
            loaded: false,
          }));

        entries = [...vfsDirs, ...vfsFiles];
        console.log(`[RobotWorkspace] Loaded ${entries.length} entries from ${volume} volume via VFS`);

        // Also include artifacts as virtual files
        await artifactManager.initialize();
        const volumeArtifacts = artifactManager.filter({ volume });
        for (const artifact of volumeArtifacts) {
          if (artifact.type === 'agent' && artifact.codeView) {
            // Check if we already have this file
            const fileName = `${artifact.name.replace(/\s+/g, '-')}.md`;
            const existingFile = entries.find(e => e.name === fileName);
            if (!existingFile) {
              entries.push({
                name: fileName,
                path: `agents/${fileName}`,
                type: 'file',
                children: undefined,
                loaded: true,
                artifactId: artifact.id,
              });
            }
          }
        }

        // Create agents directory if there are agent files
        const agentFiles = entries.filter(e => e.path?.startsWith('agents/'));
        if (agentFiles.length > 0 && !entries.find(e => e.path === 'agents' && e.type === 'directory')) {
          entries.unshift({
            name: 'agents',
            path: 'agents',
            type: 'directory',
            children: agentFiles,
            loaded: true,
          });
          // Remove agent files from root level
          entries = entries.filter(e => !e.path?.startsWith('agents/') || e.path === 'agents');
        }
      }

      // Convert FileInfo[] to tree node format
      const formattedEntries = entries.map((entry: any) => ({
        name: entry.name,
        path: entry.path,
        type: entry.isDirectory ? 'directory' : entry.type || 'file',
        children: entry.isDirectory ? [] : entry.children,
        loaded: entry.loaded || false,
        artifactId: entry.artifactId,
      }));

      setFileTree(formattedEntries);
      setExpandedFolders(new Set());
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

  // Load file content (with VFS fallback)
  const loadFileContent = useCallback(async (path: string, volume: 'user' | 'team' | 'system', artifactId?: string) => {
    try {
      let content: string | null = null;

      // If we have an artifactId, load from artifact manager
      if (artifactId) {
        const artifact = artifactManager.get(artifactId);
        if (artifact?.codeView) {
          content = artifact.codeView;
          console.log(`[RobotWorkspace] Loaded file from artifact: ${artifact.name}`);
          setSelectedFile({
            path: artifact.filePath || artifact.name,
            content,
            volume,
            artifactId,
          });
          setEditContent(content);
          return;
        }
      }

      // Try Electron FS API first
      if (typeof window !== 'undefined' && (window as any).electronFS) {
        try {
          content = await (window as any).electronFS.read(volume, path);
          console.log(`[RobotWorkspace] Loaded file via Electron FS: ${volume}/${path}`);
        } catch (electronError) {
          console.warn('[RobotWorkspace] Electron FS read failed, falling back to VFS:', electronError);
        }
      }

      // Fall back to VFS
      if (!content && typeof window !== 'undefined') {
        const vfs = getVFS();
        const fullPath = `${volume}/${path}`;
        content = vfs.readFileContent(fullPath);
        if (content) {
          console.log(`[RobotWorkspace] Loaded file via VFS: ${fullPath}`);
        }
      }

      if (content !== null) {
        setSelectedFile({
          path,
          content,
          volume,
        });
        setEditContent(content);
      } else {
        console.warn(`[RobotWorkspace] File not found: ${volume}/${path}`);
      }
    } catch (error) {
      console.error('[RobotWorkspace] Failed to load file content:', error);
    }
  }, []);

  // Load agents from artifact manager
  const loadAgents = useCallback(async () => {
    setIsLoadingAgents(true);
    try {
      // Initialize artifact manager if not already done
      await artifactManager.initialize();

      // Get all agents filtered by volume
      const allAgents = artifactManager.filter({ type: 'agent', volume: activeVolume });
      setAgents(allAgents);

      // Filter robot agents (those with 'robot' or 'hardware' tags, or containing 'robot' in name)
      const robotOnlyAgents = allAgents.filter(agent => {
        const hasRobotTag = agent.tags?.some(tag =>
          tag.toLowerCase() === 'robot' || tag.toLowerCase() === 'hardware'
        );
        const hasRobotInName = agent.name.toLowerCase().includes('robot');
        return hasRobotTag || hasRobotInName;
      });
      setRobotAgents(robotOnlyAgents);

      console.log(`[RobotWorkspace] Loaded ${allAgents.length} agents (${robotOnlyAgents.length} robot agents) from ${activeVolume} volume`);
    } catch (error) {
      console.error('[RobotWorkspace] Failed to load agents:', error);
      setAgents([]);
      setRobotAgents([]);
    } finally {
      setIsLoadingAgents(false);
    }
  }, [activeVolume]);

  // Copy agent to another volume
  const copyAgentToVolume = useCallback(async (agent: Artifact, targetVolume: ArtifactVolume) => {
    try {
      // Fork the artifact to the target volume
      const forkedAgent = artifactManager.fork(agent.id, targetVolume);
      if (forkedAgent) {
        // Rename to remove "(fork)" suffix and update name
        const newName = agent.name.replace(' (fork)', '');
        artifactManager.update(forkedAgent.id, { name: newName });
        console.log(`[RobotWorkspace] Copied agent "${agent.name}" to ${targetVolume} volume`);

        // Reload agents if we're viewing the target volume
        if (activeVolume === targetVolume) {
          loadAgents();
        }
      }
    } catch (error) {
      console.error('[RobotWorkspace] Failed to copy agent:', error);
    }
    setContextMenu(null);
  }, [activeVolume, loadAgents]);

  // Save edited agent content
  const saveAgentContent = useCallback(() => {
    if (!selectedFile || !selectedFile.artifactId) return;

    try {
      artifactManager.update(selectedFile.artifactId, {
        codeView: editContent,
      });
      setSelectedFile({ ...selectedFile, content: editContent, isEditing: false });
      console.log(`[RobotWorkspace] Saved agent content for ${selectedFile.path}`);

      // Reload agents to reflect changes
      loadAgents();
    } catch (error) {
      console.error('[RobotWorkspace] Failed to save agent:', error);
    }
  }, [selectedFile, editContent, loadAgents]);

  // Delete robot agent (only for user volume)
  const deleteRobotAgent = useCallback(async (agent: Artifact) => {
    if (agent.volume !== 'user') {
      console.warn('[RobotWorkspace] Can only delete agents from user volume');
      return;
    }

    try {
      artifactManager.delete(agent.id);
      console.log(`[RobotWorkspace] Deleted robot agent: ${agent.name}`);

      // Clear selection if this was the selected agent
      if (selectedRobotAgent?.id === agent.id) {
        setSelectedRobotAgent(null);
      }

      // Reload agents
      loadAgents();
    } catch (error) {
      console.error('[RobotWorkspace] Failed to delete agent:', error);
    }
  }, [selectedRobotAgent, loadAgents]);

  // View/edit agent
  const openAgentFile = useCallback((agent: Artifact) => {
    setSelectedFile({
      path: agent.filePath || agent.name,
      content: agent.codeView || '',
      volume: agent.volume,
      isEditing: false,
      artifactId: agent.id,
    });
    setEditContent(agent.codeView || '');
  }, []);

  // Select robot agent for simulation
  const selectRobotAgentForSimulation = useCallback((agent: Artifact) => {
    setSelectedRobotAgent(agent);
    // Switch to agent panel mode to run the selected agent
    setRightPanelMode('agent');
    console.log(`[RobotWorkspace] Selected robot agent for simulation: ${agent.name}`);
  }, []);

  // Handle behavior change to sync 3D world map with selected behavior
  const handleBehaviorChange = useCallback((behavior: string, recommendedMap: string) => {
    console.log(`[RobotWorkspace] Behavior changed to "${behavior}", switching to map "${recommendedMap}"`);
    setCurrentMap(recommendedMap);
  }, []);

  // Refresh robot agents list (called after agent registration)
  const refreshRobotAgents = useCallback(() => {
    loadAgents();
  }, [loadAgents]);

  // Load file tree when volume or view mode changes
  useEffect(() => {
    if (viewMode === 'files') {
      loadFileTree(activeVolume);
    }
  }, [viewMode, activeVolume, loadFileTree]);

  // Load agents when volume or view mode changes
  useEffect(() => {
    if (viewMode === 'agents') {
      loadAgents();
    }
  }, [viewMode, activeVolume, loadAgents]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  return (
    <div className="h-full flex bg-[#0d1117] overflow-hidden">
      {/* Left Sidebar: File Browser & Volumes */}
      {showFileBrowser && (
        <div className="w-64 flex flex-col border-r border-[#30363d] bg-[#0d1117] flex-shrink-0">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
            <div className="flex items-center gap-2">
              {viewMode === 'agents' ? (
                <Cpu className="w-4 h-4 text-[#58a6ff]" />
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
              <Cpu className="w-3.5 h-3.5" />
              Robot Agents
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
                onClick={() => {
                  onVolumeChange?.(volume);
                  setCurrentPath(''); // Reset path when changing volumes
                }}
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

          {/* Navigation Bar (only visible in Files view) */}
          {viewMode === 'files' && (
            <div className="px-2 py-1.5 border-b border-[#30363d] bg-[#0d1117] flex items-center gap-1">
              {/* Home button */}
              <button
                onClick={navigateToRoot}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#21262d] transition-colors text-[#8b949e] hover:text-[#e6edf3]"
                title="Go to root"
              >
                <Home className="w-3.5 h-3.5" />
              </button>

              {/* Up button */}
              <button
                onClick={canNavigateUp ? navigateUp : undefined}
                disabled={!canNavigateUp}
                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                  canNavigateUp
                    ? 'hover:bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3] cursor-pointer'
                    : 'text-[#8b949e]/30 cursor-not-allowed'
                }`}
                title="Go up one level"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>

              {/* Separator */}
              <div className="w-px h-4 bg-[#30363d] mx-1" />

              {/* Breadcrumb path */}
              <div className="flex-1 flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0">
                {/* Root */}
                <button
                  onClick={navigateToRoot}
                  className={`text-[11px] px-1.5 py-0.5 rounded transition-colors truncate ${
                    currentPath === ''
                      ? 'text-[#e6edf3] font-medium bg-[#21262d]'
                      : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]'
                  }`}
                  title={`/${activeVolume}`}
                >
                  {activeVolume}
                </button>
                {getPathSegments().map((segment, index) => (
                  <div key={segment.path} className="flex items-center flex-shrink-0">
                    <ChevronRight className="w-3 h-3 text-[#8b949e]/50 flex-shrink-0" />
                    <button
                      onClick={() => navigateToPath(segment.path)}
                      className={`text-[11px] px-1.5 py-0.5 rounded transition-colors truncate max-w-[100px] ${
                        index === getPathSegments().length - 1
                          ? 'text-[#e6edf3] font-medium bg-[#21262d]'
                          : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]'
                      }`}
                      title={segment.path}
                    >
                      {segment.name}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Path Display (shown at bottom) */}
          {viewMode === 'files' && (
            <div className="px-2 py-1 border-b border-[#30363d]/50 bg-[#0d1117]/50">
              <div className="text-[10px] text-[#6e7681] font-mono truncate" title={`/${activeVolume}${currentPath ? '/' + currentPath : ''}`}>
                /{activeVolume}{currentPath ? '/' + currentPath : ''}
              </div>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-2">
            {/* AGENTS VIEW - Robot Agents Only */}
            {viewMode === 'agents' && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1 flex items-center gap-1.5">
                  <Cpu className="w-3 h-3 text-[#58a6ff]" />
                  {activeVolume === 'user' ? 'My Robot Agents' : activeVolume === 'team' ? 'Shared Robot Agents' : 'Robot Agent Templates'}
                </div>

                {isLoadingAgents ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#58a6ff]"></div>
                  </div>
                ) : robotAgents.length > 0 ? (
                  robotAgents.map((agent) => (
                    <RobotAgentTreeItem
                      key={agent.id}
                      agent={agent}
                      activeVolume={activeVolume}
                      isSelected={selectedRobotAgent?.id === agent.id}
                      onSelect={() => selectRobotAgentForSimulation(agent)}
                      onView={() => openAgentFile(agent)}
                      onCopy={(targetVolume) => copyAgentToVolume(agent, targetVolume)}
                      onDelete={activeVolume === 'user' ? () => deleteRobotAgent(agent) : undefined}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, agent });
                      }}
                    />
                  ))
                ) : (
                  <div className="text-xs text-[#8b949e] px-2 py-4 text-center">
                    <Cpu className="w-8 h-8 mx-auto mb-2 text-[#30363d]" />
                    No robot agents in this volume
                    {activeVolume !== 'system' && (
                      <div className="mt-2 text-[10px]">
                        Copy robot agents from the system volume to get started
                      </div>
                    )}
                  </div>
                )}

                {/* Standard Maps (only for system volume) */}
                {activeVolume === 'system' && (
                  <>
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
                  </>
                )}
              </div>
            )}

            {/* FILES VIEW */}
            {viewMode === 'files' && (
              <div className="space-y-1">
                {isLoadingFiles ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#58a6ff]"></div>
                  </div>
                ) : getFilteredFileTree().length > 0 ? (
                  <>
                    <div className="text-[10px] uppercase tracking-wider text-[#6e7681] px-2 py-1">
                      {currentPath ? currentPath.split('/').pop() : activeVolume + ' Volume'}
                    </div>
                    {getFilteredFileTree().map((entry: any, index: number) => (
                      <TreeNode
                        key={index}
                        node={entry}
                        volume={activeVolume}
                        depth={0}
                        expandedFolders={expandedFolders}
                        loadingFolders={loadingFolders}
                        onToggleFolder={(path, vol) => {
                          // Navigate into the folder
                          navigateToPath(path);
                        }}
                        onFileClick={(path, vol, artifactId) => {
                          // Adjust path based on current navigation
                          loadFileContent(path, vol, artifactId);
                        }}
                      />
                    ))}
                  </>
                ) : (
                  <div className="text-xs text-[#8b949e] px-2 py-4 text-center">
                    {currentPath ? 'This folder is empty' : 'No files in this volume'}
                    {currentPath && (
                      <div className="mt-2">
                        <button
                          onClick={navigateUp}
                          className="text-[10px] text-[#58a6ff] hover:underline"
                        >
                          Go back
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* File Content Modal with Edit Support */}
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
                {selectedFile.isEditing && (
                  <span className="text-xs text-[#f0883e] px-2 py-0.5 rounded bg-[#f0883e]/20">
                    Editing
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Edit/View Toggle (only for user/team volumes with artifactId) */}
                {selectedFile.artifactId && selectedFile.volume !== 'system' && (
                  <button
                    onClick={() => {
                      if (selectedFile.isEditing) {
                        // Cancel editing
                        setEditContent(selectedFile.content);
                      }
                      setSelectedFile({ ...selectedFile, isEditing: !selectedFile.isEditing });
                    }}
                    className="w-6 h-6 rounded hover:bg-[#21262d] flex items-center justify-center transition-colors"
                    title={selectedFile.isEditing ? 'Cancel editing' : 'Edit file'}
                  >
                    <Edit3 className={`w-4 h-4 ${selectedFile.isEditing ? 'text-[#f0883e]' : 'text-[#8b949e]'}`} />
                  </button>
                )}
                <button
                  onClick={() => setSelectedFile(null)}
                  className="w-6 h-6 rounded hover:bg-[#21262d] flex items-center justify-center transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4 text-[#8b949e]" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4 bg-[#0d1117]">
              {selectedFile.isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[400px] text-xs text-[#e6edf3] font-mono bg-[#161b22] border border-[#30363d] rounded p-3 focus:outline-none focus:border-[#58a6ff] resize-none"
                  spellCheck={false}
                />
              ) : (
                <pre className="text-xs text-[#e6edf3] font-mono whitespace-pre-wrap break-words">
                  {selectedFile.content}
                </pre>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 border-t border-[#30363d] bg-[#161b22] flex justify-between gap-2 rounded-b-lg">
              {/* Copy to volume buttons (for system agents) */}
              {selectedFile.artifactId && selectedFile.volume === 'system' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const agent = agents.find(a => a.id === selectedFile.artifactId);
                      if (agent) copyAgentToVolume(agent, 'user');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-[#e6edf3] bg-[#238636] hover:bg-[#2ea043] rounded transition-colors flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    Copy to User
                  </button>
                  <button
                    onClick={() => {
                      const agent = agents.find(a => a.id === selectedFile.artifactId);
                      if (agent) copyAgentToVolume(agent, 'team');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-[#e6edf3] bg-[#1f6feb] hover:bg-[#388bfd] rounded transition-colors flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    Copy to Team
                  </button>
                </div>
              )}

              {/* Copy between user/team */}
              {selectedFile.artifactId && (selectedFile.volume === 'user' || selectedFile.volume === 'team') && !selectedFile.isEditing && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const agent = agents.find(a => a.id === selectedFile.artifactId);
                      if (agent) copyAgentToVolume(agent, selectedFile.volume === 'user' ? 'team' : 'user');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-[#e6edf3] bg-[#21262d] hover:bg-[#30363d] rounded transition-colors flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    Copy to {selectedFile.volume === 'user' ? 'Team' : 'User'}
                  </button>
                </div>
              )}

              <div className="flex gap-2 ml-auto">
                {selectedFile.isEditing && (
                  <button
                    onClick={saveAgentContent}
                    className="px-3 py-1.5 text-xs font-medium text-[#e6edf3] bg-[#238636] hover:bg-[#2ea043] rounded transition-colors flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" />
                    Save
                  </button>
                )}
                <button
                  onClick={() => setSelectedFile(null)}
                  className="px-3 py-1.5 text-xs font-medium text-[#e6edf3] bg-[#21262d] hover:bg-[#30363d] rounded transition-colors"
                >
                  {selectedFile.isEditing ? 'Cancel' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu for Agents */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              openAgentFile(contextMenu.agent);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-xs text-[#e6edf3] hover:bg-[#21262d] flex items-center gap-2 text-left"
          >
            <FileText className="w-3.5 h-3.5" />
            View / Edit
          </button>
          {contextMenu.agent.volume === 'system' && (
            <>
              <button
                onClick={() => copyAgentToVolume(contextMenu.agent, 'user')}
                className="w-full px-3 py-2 text-xs text-[#e6edf3] hover:bg-[#21262d] flex items-center gap-2 text-left"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy to User
              </button>
              <button
                onClick={() => copyAgentToVolume(contextMenu.agent, 'team')}
                className="w-full px-3 py-2 text-xs text-[#e6edf3] hover:bg-[#21262d] flex items-center gap-2 text-left"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy to Team
              </button>
            </>
          )}
          {contextMenu.agent.volume === 'user' && (
            <button
              onClick={() => copyAgentToVolume(contextMenu.agent, 'team')}
              className="w-full px-3 py-2 text-xs text-[#e6edf3] hover:bg-[#21262d] flex items-center gap-2 text-left"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy to Team
            </button>
          )}
          {contextMenu.agent.volume === 'team' && (
            <button
              onClick={() => copyAgentToVolume(contextMenu.agent, 'user')}
              className="w-full px-3 py-2 text-xs text-[#e6edf3] hover:bg-[#21262d] flex items-center gap-2 text-left"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy to User
            </button>
          )}
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
          deviceId={activeDeviceId}
          onRobotClick={handleRobotClick}
          onArenaClick={handleArenaClick}
          agentActivity={agentActivity}
          robotAgentName={selectedRobotAgent?.name}
          worldModel={worldModel}
        />
      </div>

      {/* Right Sidebar: Chat / Robot Agent Panel */}
      {showChat && (
        <div className="w-96 flex flex-col border-l border-[#30363d] bg-[#0d1117] flex-shrink-0">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
            <div className="flex items-center gap-2">
              {rightPanelMode === 'chat' ? (
                <FileCode className="w-4 h-4 text-[#3fb950]" />
              ) : (
                <Cpu className="w-4 h-4 text-[#58a6ff]" />
              )}
              <span className="text-xs font-semibold text-[#e6edf3]">
                {rightPanelMode === 'chat' ? 'AI Agent Creator' : (selectedRobotAgent?.name || 'Robot AI Agent')}
              </span>
              {rightPanelMode === 'agent' && selectedRobotAgent && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/30">
                  Selected
                </span>
              )}
            </div>
            <button
              onClick={toggleChat}
              className="w-6 h-6 rounded hover:bg-[#21262d] flex items-center justify-center transition-colors"
              title="Collapse panel"
            >
              <ChevronRight className="w-3.5 h-3.5 text-[#8b949e]" />
            </button>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex border-b border-[#30363d] bg-[#0d1117]">
            <button
              onClick={() => setRightPanelMode('agent')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                rightPanelMode === 'agent'
                  ? 'text-[#58a6ff] border-b-2 border-[#58a6ff] bg-[#161b22]'
                  : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Run Robot
            </button>
            <button
              onClick={() => setRightPanelMode('chat')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                rightPanelMode === 'chat'
                  ? 'text-[#3fb950] border-b-2 border-[#3fb950] bg-[#161b22]'
                  : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Create Agent
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-hidden">
            {rightPanelMode === 'chat' ? (
              <ChatPanel activeVolume={activeVolume} />
            ) : (
              <RobotAgentPanel
                deviceId={activeDeviceId || undefined}
                onDeviceCreated={(deviceId) => setActiveDeviceId(deviceId)}
              />
            )}
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

// AI Agent tree item component with actions (for artifact-based agents)
interface AgentTreeItemWithActionsProps {
  agent: Artifact;
  activeVolume: ArtifactVolume;
  onView: () => void;
  onCopy: (targetVolume: ArtifactVolume) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function AgentTreeItemWithActions({ agent, activeVolume, onView, onCopy, onContextMenu }: AgentTreeItemWithActionsProps) {
  // Generate unique robot icon based on agent ID
  const robotConfig = generateRobotConfig(agent.id);
  const iconDataUrl = robotIconToDataURL(robotConfig, 24);

  // Extract tags for capabilities display
  const capabilities = agent.tags || [];

  return (
    <div
      className="w-full text-left px-2 py-2 rounded-md text-xs flex flex-col gap-1 transition-colors bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff]/50 hover:bg-[#21262d] cursor-pointer group"
      onClick={onView}
      onContextMenu={onContextMenu}
    >
      <div className="flex items-center gap-2">
        <img
          src={iconDataUrl}
          alt={agent.name}
          className="w-5 h-5 flex-shrink-0"
          style={{ imageRendering: 'pixelated' }}
        />
        <span className="font-medium flex-1 text-[#e6edf3] truncate">{agent.name}</span>
        <span className="text-[10px] text-[#8b949e] px-1.5 py-0.5 rounded bg-[#21262d]">AI</span>
        {/* Quick action buttons on hover */}
        <div className="hidden group-hover:flex items-center gap-1">
          {activeVolume === 'system' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy('user');
              }}
              className="w-5 h-5 rounded hover:bg-[#238636]/30 flex items-center justify-center"
              title="Copy to User"
            >
              <Copy className="w-3 h-3 text-[#3fb950]" />
            </button>
          )}
          {activeVolume === 'user' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy('team');
              }}
              className="w-5 h-5 rounded hover:bg-[#1f6feb]/30 flex items-center justify-center"
              title="Copy to Team"
            >
              <Copy className="w-3 h-3 text-[#58a6ff]" />
            </button>
          )}
          {activeVolume === 'team' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy('user');
              }}
              className="w-5 h-5 rounded hover:bg-[#238636]/30 flex items-center justify-center"
              title="Copy to User"
            >
              <Copy className="w-3 h-3 text-[#3fb950]" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(e);
            }}
            className="w-5 h-5 rounded hover:bg-[#21262d] flex items-center justify-center"
            title="More options"
          >
            <MoreVertical className="w-3 h-3 text-[#8b949e]" />
          </button>
        </div>
      </div>
      {agent.description && (
        <p className="text-[10px] text-[#8b949e] pl-7 truncate">{agent.description}</p>
      )}
      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-7">
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
      )}
    </div>
  );
}

// Robot Agent tree item component with simulate action
interface RobotAgentTreeItemProps {
  agent: Artifact;
  activeVolume: ArtifactVolume;
  isSelected?: boolean;
  onSelect: () => void;
  onView: () => void;
  onCopy: (targetVolume: ArtifactVolume) => void;
  onDelete?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function RobotAgentTreeItem({ agent, activeVolume, isSelected, onSelect, onView, onCopy, onDelete, onContextMenu }: RobotAgentTreeItemProps) {
  // Generate unique robot icon based on agent ID
  const robotConfig = generateRobotConfig(agent.id);
  const iconDataUrl = robotIconToDataURL(robotConfig, 24);

  // Extract tags for capabilities display
  const capabilities = agent.tags || [];

  // Unified robot agent color
  const robotColor = '#58a6ff';

  return (
    <div
      className={`w-full text-left px-2 py-2 rounded-md text-xs flex flex-col gap-1.5 transition-all duration-200 cursor-pointer group ${
        isSelected
          ? 'bg-[#58a6ff]/20 border-2 border-[#58a6ff] shadow-lg shadow-[#58a6ff]/20'
          : 'bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff]/50 hover:bg-[#21262d]'
      }`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <div className="flex items-center gap-2">
        <div className={`relative ${isSelected ? 'animate-pulse' : ''}`}>
          <img
            src={iconDataUrl}
            alt={agent.name}
            className="w-6 h-6 flex-shrink-0"
            style={{ imageRendering: 'pixelated' }}
          />
          {isSelected && (
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#3fb950] rounded-full border border-[#0d1117]" />
          )}
        </div>
        <span className={`font-medium flex-1 truncate ${isSelected ? 'text-[#58a6ff]' : 'text-[#e6edf3]'}`}>
          {agent.name}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1"
          style={{
            backgroundColor: `${robotColor}20`,
            borderColor: `${robotColor}50`,
            color: robotColor
          }}
        >
          <Cpu className="w-2.5 h-2.5" />
          Robot
        </span>
      </div>

      {agent.description && (
        <p className="text-[10px] text-[#8b949e] pl-8 truncate">{agent.description}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 pl-8 mt-0.5">
        {/* Simulate button - always visible for robot agents */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
            isSelected
              ? 'bg-[#3fb950] text-white'
              : 'bg-[#238636]/20 text-[#3fb950] border border-[#238636]/30 hover:bg-[#238636]/40'
          }`}
          title="Select & Simulate"
        >
          <Play className="w-3 h-3" />
          {isSelected ? 'Selected' : 'Simulate'}
        </button>

        {/* View/Edit button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#21262d] text-[#8b949e] border border-[#30363d] hover:text-[#e6edf3] hover:bg-[#30363d] transition-colors"
          title="View/Edit"
        >
          <Edit3 className="w-3 h-3" />
          View
        </button>

        {/* Delete button - only for user volume */}
        {activeVolume === 'user' && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete robot "${agent.name}"? This cannot be undone.`)) {
                onDelete();
              }
            }}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#da3633]/20 text-[#f85149] border border-[#da3633]/30 hover:bg-[#da3633]/40 transition-colors"
            title="Delete Robot"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        )}

        {/* Copy button (on hover) */}
        <div className="hidden group-hover:flex items-center gap-1">
          {activeVolume === 'system' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy('user');
              }}
              className="w-5 h-5 rounded hover:bg-[#238636]/30 flex items-center justify-center"
              title="Copy to User"
            >
              <Copy className="w-3 h-3 text-[#3fb950]" />
            </button>
          )}
          {activeVolume === 'user' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy('team');
              }}
              className="w-5 h-5 rounded hover:bg-[#1f6feb]/30 flex items-center justify-center"
              title="Copy to Team"
            >
              <Copy className="w-3 h-3 text-[#58a6ff]" />
            </button>
          )}
          {activeVolume === 'team' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy('user');
              }}
              className="w-5 h-5 rounded hover:bg-[#238636]/30 flex items-center justify-center"
              title="Copy to User"
            >
              <Copy className="w-3 h-3 text-[#3fb950]" />
            </button>
          )}
        </div>
      </div>

      {/* Capabilities tags */}
      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-8">
          {capabilities.slice(0, 3).map((cap) => (
            <span
              key={cap}
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: `${robotColor}15`,
                color: robotColor,
                border: `1px solid ${robotColor}30`
              }}
            >
              {cap}
            </span>
          ))}
          {capabilities.length > 3 && (
            <span className="text-[9px] px-1 py-0.5 text-[#8b949e]">+{capabilities.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Legacy AI Agent tree item component (kept for compatibility)
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
  onFileClick: (path: string, volume: 'user' | 'team' | 'system', artifactId?: string) => void;
}

function TreeNode({ node, volume, depth, expandedFolders, loadingFolders, onToggleFolder, onFileClick }: TreeNodeProps) {
  const isExpanded = expandedFolders.has(node.path);
  const isLoading = loadingFolders.has(node.path);
  const handleClick = () => {
    if (node.type === 'directory') {
      onToggleFolder(node.path, volume);
    } else {
      onFileClick(node.path, volume, node.artifactId);
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
