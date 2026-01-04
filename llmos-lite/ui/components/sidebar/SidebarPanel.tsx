'use client';

import { useState, useRef, lazy, Suspense, useCallback } from 'react';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useWorkspace, useWorkspaceLayout } from '@/contexts/WorkspaceContext';
import VSCodeFileTree from '../panels/volumes/VSCodeFileTree';
import { ChevronDown, ChevronRight, FolderTree, Bot } from 'lucide-react';
import { getVFS } from '@/lib/virtual-fs';

// Lazy load ChatPanel
const ChatPanel = lazy(() => import('../chat/ChatPanel'));

// Accordion section type - only Tree (files) and Chat
type AccordionSection = 'files' | 'chat';

interface SidebarPanelProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange: (volume: 'system' | 'team' | 'user') => void;
  activeSession: string | null;
  onSessionChange: (sessionId: string | null) => void;
  // Chat props
  onSessionCreated?: (sessionId: string) => void;
  pendingPrompt?: string | null;
  onPromptProcessed?: () => void;
}

export default function SidebarPanel({
  activeVolume,
  onVolumeChange,
  activeSession,
  onSessionChange,
  onSessionCreated,
  pendingPrompt,
  onPromptProcessed,
}: SidebarPanelProps) {
  const { projects, setActiveProject, addProject } = useProjectContext();
  const { setContextViewMode, setActiveFile, updatePreferences, state } = useWorkspace();
  const layout = useWorkspaceLayout();

  // Accordion state - which section is expanded (default to chat)
  const [expandedSection, setExpandedSection] = useState<AccordionSection>('chat');
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle accordion section toggle
  const handleSectionToggle = (section: AccordionSection) => {
    setExpandedSection(section);
  };

  // Helper to open the context panel if collapsed
  const ensureContextPanelOpen = () => {
    if (layout.isContextCollapsed) {
      updatePreferences({
        collapsedPanels: { ...state.preferences.collapsedPanels, context: false }
      });
    }
  };

  // Helper functions to detect file types
  const isAppletFile = (path: string, name: string): boolean => {
    // Check if file is in an applets directory or is a .app.tsx file
    const isInAppletsDir = path.includes('/applets/') || path.includes('/applet/');
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const isAppExtension = name.endsWith('.app.tsx') || name.endsWith('.applet.tsx');
    // TSX/JSX files in applets folders or with .app extension are applets
    return isAppExtension || (isInAppletsDir && ['tsx', 'jsx'].includes(ext));
  };

  // Handle code file selection - open in split view
  const handleCodeFileSelect = (path: string) => {
    setActiveFile(path);
    setContextViewMode('split-view');
    ensureContextPanelOpen();
  };

  // Handle any file selection - display in main panel based on type
  const handleFileSelect = (node: any) => {
    console.log('[SidebarPanel] File selected:', node);

    // Check file extension to determine view mode
    const ext = node.name?.split('.').pop()?.toLowerCase() || '';
    const codeExtensions = ['py', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'css', 'html', 'md'];
    const mediaExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'mp4', 'webm', 'ogg', 'mov'];

    setActiveFile(node.path);

    // Check if it's an applet file - should open in applets mode (execution)
    if (isAppletFile(node.path, node.name)) {
      console.log('[SidebarPanel] Applet file detected, opening in applets mode:', node.path);
      setContextViewMode('applets');
    } else if (mediaExtensions.includes(ext)) {
      // Media files - open in media viewer
      setContextViewMode('media');
    } else if (codeExtensions.includes(ext)) {
      // Code files - open in split view for editing/running
      setContextViewMode('split-view');
    } else {
      // Other files - open in split view as fallback (can show raw content)
      setContextViewMode('split-view');
    }

    // Always open the context panel to show the file
    ensureContextPanelOpen();
  };

  // Handle project selection from tree
  const handleProjectSelect = useCallback((projectName: string, volume: 'team' | 'user') => {
    console.log('[SidebarPanel] Project selected:', projectName, 'in volume:', volume);

    // Find or create the project in context
    let project = projects.find(
      p => p.name === projectName && p.volume === volume
    );

    if (!project) {
      // Create a new project entry for this folder
      console.log('[SidebarPanel] Creating project context for:', projectName);
      project = addProject({
        name: projectName,
        type: volume === 'team' ? 'team' : 'user',
        status: 'temporal',
        volume,
      });
    }

    // Set as active project
    setActiveProject(project.id);
    onSessionChange(project.id);

    // NOTE: We no longer auto-switch to chat section
    // This allows users to continue exploring the project folder contents

    // Log memory file status for the project
    try {
      const vfs = getVFS();
      const memoryPath = `projects/${projectName}/memory.md`;
      const contextPath = `projects/${projectName}/context.md`;

      const hasMemory = vfs.exists(memoryPath);
      const hasContext = vfs.exists(contextPath);

      console.log('[SidebarPanel] Project memory files:', {
        memoryPath,
        hasMemory,
        contextPath,
        hasContext,
      });
    } catch (error) {
      console.log('[SidebarPanel] Could not check memory files:', error);
    }
  }, [projects, addProject, setActiveProject, onSessionChange]);

  return (
    <div ref={containerRef} className="h-full flex flex-col overflow-hidden bg-bg-secondary">
      {/* ========== FILES SECTION ========== */}
      <div className={`flex flex-col overflow-hidden transition-all duration-200 ${
        expandedSection === 'files' ? 'flex-1' : 'flex-shrink-0'
      }`}>
        {/* Files Header */}
        <button
          onClick={() => handleSectionToggle('files')}
          className={`w-full px-3 py-2.5 flex items-center justify-between transition-colors ${
            expandedSection === 'files'
              ? 'bg-bg-elevated border-l-2 border-l-accent-primary shadow-sm'
              : 'bg-bg-tertiary/60 border-l-2 border-l-transparent hover:bg-bg-tertiary'
          } border-b border-border-primary/50`}
        >
          <div className="flex items-center gap-2">
            {expandedSection === 'files' ? (
              <ChevronDown className="w-4 h-4 text-accent-primary" />
            ) : (
              <ChevronRight className="w-4 h-4 text-fg-tertiary" />
            )}
            <FolderTree className={`w-4 h-4 ${expandedSection === 'files' ? 'text-accent-primary' : 'text-fg-secondary'}`} />
            <span className={`text-xs font-semibold uppercase tracking-wide ${
              expandedSection === 'files' ? 'text-accent-primary' : 'text-fg-secondary'
            }`}>
              Files
            </span>
          </div>
          {expandedSection !== 'files' && (
            <span className="px-2 py-0.5 rounded-full bg-bg-elevated text-fg-tertiary text-[10px] font-medium capitalize">
              {activeVolume}
            </span>
          )}
        </button>

        {/* Files Content */}
        {expandedSection === 'files' && (
          <div className="flex-1 overflow-hidden">
            <VSCodeFileTree
              activeVolume={activeVolume}
              onVolumeChange={onVolumeChange}
              onFileSelect={handleFileSelect}
              onCodeFileSelect={handleCodeFileSelect}
              onProjectSelect={handleProjectSelect}
              selectedFile={null}
            />
          </div>
        )}
      </div>

      {/* ========== CHAT SECTION ========== */}
      <div className={`flex flex-col overflow-hidden transition-all duration-200 ${
        expandedSection === 'chat' ? 'flex-1' : 'flex-shrink-0'
      }`}>
        {/* Chat Header */}
        <button
          onClick={() => handleSectionToggle('chat')}
          className={`w-full px-3 py-2.5 flex items-center justify-between transition-colors ${
            expandedSection === 'chat'
              ? 'bg-bg-elevated border-l-2 border-l-accent-primary shadow-sm'
              : 'bg-bg-tertiary/60 border-l-2 border-l-transparent hover:bg-bg-tertiary'
          } border-b border-border-primary/50`}
        >
          <div className="flex items-center gap-2">
            {expandedSection === 'chat' ? (
              <ChevronDown className="w-4 h-4 text-accent-primary" />
            ) : (
              <ChevronRight className="w-4 h-4 text-fg-tertiary" />
            )}
            <Bot className={`w-4 h-4 ${expandedSection === 'chat' ? 'text-accent-primary' : 'text-fg-secondary'}`} />
            <span className={`text-xs font-semibold uppercase tracking-wide ${
              expandedSection === 'chat' ? 'text-accent-primary' : 'text-fg-secondary'
            }`}>
              Chat
            </span>
            {activeSession && (
              <span className="px-2 py-0.5 rounded-full bg-bg-primary text-fg-tertiary text-[10px] font-medium">
                {projects.find(p => p.id === activeSession)?.messages?.length || 0} msg
              </span>
            )}
          </div>
          {expandedSection !== 'chat' && activeSession && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/15 text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Active
            </span>
          )}
        </button>

        {/* Chat Content */}
        {expandedSection === 'chat' && (
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-accent-primary/20 border-t-accent-primary rounded-full animate-spin" />
                  <span className="text-xs text-fg-muted">Loading chat...</span>
                </div>
              </div>
            }>
              <ChatPanel
                activeSession={activeSession}
                activeVolume={activeVolume}
                onSessionCreated={onSessionCreated || onSessionChange}
                pendingPrompt={pendingPrompt}
                onPromptProcessed={onPromptProcessed}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
