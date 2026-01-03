'use client';

import { useState, useRef, useCallback, lazy, Suspense } from 'react';
import { useProjectContext, ProjectType, Project } from '@/contexts/ProjectContext';
import { useWorkspace, useWorkspaceLayout } from '@/contexts/WorkspaceContext';
import VSCodeFileTree from '../panels/volumes/VSCodeFileTree';
import NewProjectDialog from '../project/NewProjectDialog';
import ConfirmDialog from '../common/ConfirmDialog';
import { Plus, MessageSquarePlus, ChevronDown, ChevronRight, Users, User, FolderTree, MessageSquare, Bot, Folder } from 'lucide-react';

// Lazy load ChatPanel
const ChatPanel = lazy(() => import('../chat/ChatPanel'));

// Accordion section type - only Tree (files), Projects, and Chat
type AccordionSection = 'files' | 'projects' | 'chat';

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
  const { projects, activeProjects, addProject, deleteProject } = useProjectContext();
  const { setContextViewMode, setActiveFile, updatePreferences, state } = useWorkspace();
  const layout = useWorkspaceLayout();

  // Accordion state - which section is expanded (default to chat)
  const [expandedSection, setExpandedSection] = useState<AccordionSection>('chat');

  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [showAllProjects, setShowAllProjects] = useState(true);
  const [showNewProjectDropdown, setShowNewProjectDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const dropdownButtonRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle dropdown toggle with position calculation
  const handleDropdownToggle = useCallback(() => {
    if (!showNewProjectDropdown && dropdownButtonRef.current) {
      const rect = dropdownButtonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.right - 192, // 192px = w-48 dropdown width
      });
    }
    setShowNewProjectDropdown(!showNewProjectDropdown);
  }, [showNewProjectDropdown]);

  // Handle accordion section toggle
  const handleSectionToggle = (section: AccordionSection) => {
    setExpandedSection(section);
  };

  // Get projects to display - either all or filtered by volume
  const displayProjects = showAllProjects
    ? projects
    : activeProjects[activeVolume];

  // Sort projects by most recent first (based on timeAgo or id which has timestamp)
  const sortedProjects = [...displayProjects].sort((a, b) => {
    // Active project always first
    if (a.id === activeSession) return -1;
    if (b.id === activeSession) return 1;
    // Then sort by id (which contains timestamp) - newer first
    return b.id.localeCompare(a.id);
  });

  const handleNewProject = () => {
    setShowNewProjectDialog(true);
    setShowNewProjectDropdown(false);
  };

  // Quick create project with default name
  const handleQuickCreateProject = (type: ProjectType) => {
    const defaultName = type === 'user' ? 'Personal Project' : 'Team Project';
    const newProject = addProject({
      name: defaultName,
      type: type,
      status: 'temporal',
      volume: activeVolume,
    });
    onSessionChange(newProject.id);
    setShowNewProjectDropdown(false);
  };

  const handleCreateProject = (data: {
    name: string;
    type: ProjectType;
    goal?: string;
  }) => {
    const newProject = addProject({
      name: data.name,
      type: data.type,
      status: 'temporal',
      volume: activeVolume,
      goal: data.goal,
    });
    onSessionChange(newProject.id);
  };

  const handleDeleteProject = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(project);
  };

  const confirmDelete = () => {
    if (projectToDelete) {
      deleteProject(projectToDelete.id);
      setProjectToDelete(null);
    }
  };

  const handleResumeProject = (projectId: string) => {
    onSessionChange(projectId);
  };

  // Volume badge colors
  const volumeColors = {
    system: 'bg-gray-500/20 text-gray-400',
    team: 'bg-blue-500/20 text-blue-400',
    user: 'bg-green-500/20 text-green-400',
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

  // Handle Desktop selection - switch to applets view
  const handleDesktopSelect = () => {
    setContextViewMode('applets');
    ensureContextPanelOpen();
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
              onDesktopSelect={handleDesktopSelect}
              onCodeFileSelect={handleCodeFileSelect}
              selectedFile={null}
            />
          </div>
        )}
      </div>

      {/* ========== PROJECTS SECTION ========== */}
      <div className={`flex flex-col overflow-hidden transition-all duration-200 ${
        expandedSection === 'projects' ? 'flex-1' : 'flex-shrink-0'
      }`}>
        {/* Projects Header */}
        <div
          className={`px-3 py-2.5 flex items-center justify-between transition-colors cursor-pointer ${
            expandedSection === 'projects'
              ? 'bg-bg-elevated border-l-2 border-l-accent-primary shadow-sm'
              : 'bg-bg-tertiary/60 border-l-2 border-l-transparent hover:bg-bg-tertiary'
          } border-b border-border-primary/50`}
          onClick={() => handleSectionToggle('projects')}
        >
          <div className="flex items-center gap-2">
            {expandedSection === 'projects' ? (
              <ChevronDown className="w-4 h-4 text-accent-primary" />
            ) : (
              <ChevronRight className="w-4 h-4 text-fg-tertiary" />
            )}
            <Folder className={`w-4 h-4 ${expandedSection === 'projects' ? 'text-accent-primary' : 'text-fg-secondary'}`} />
            <span className={`text-xs font-semibold uppercase tracking-wide ${
              expandedSection === 'projects' ? 'text-accent-primary' : 'text-fg-secondary'
            }`}>
              Projects
            </span>
            <span className="px-2 py-0.5 rounded-full bg-bg-primary text-fg-tertiary text-[10px] font-medium">
              {sortedProjects.length}
            </span>
          </div>
          {expandedSection === 'projects' && (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {/* Toggle All/Current Volume - Standard Toggle Button */}
              <div className="flex items-center bg-bg-primary rounded-md border border-border-primary/50 overflow-hidden">
                <button
                  onClick={() => setShowAllProjects(true)}
                  className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                    showAllProjects
                      ? 'bg-accent-primary/20 text-accent-primary'
                      : 'text-fg-tertiary hover:text-fg-secondary hover:bg-bg-tertiary/50'
                  }`}
                  title="Show all projects"
                >
                  All
                </button>
                <button
                  onClick={() => setShowAllProjects(false)}
                  className={`px-2 py-1 text-[10px] font-medium transition-colors capitalize border-l border-border-primary/50 ${
                    !showAllProjects
                      ? 'bg-accent-primary/20 text-accent-primary'
                      : 'text-fg-tertiary hover:text-fg-secondary hover:bg-bg-tertiary/50'
                  }`}
                  title={`Show ${activeVolume} projects only`}
                >
                  {activeVolume}
                </button>
              </div>
              {/* New Project Button with Dropdown */}
              <div className="relative" ref={dropdownButtonRef}>
                <button
                  onClick={handleDropdownToggle}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors border ${
                    showNewProjectDropdown
                      ? 'bg-accent-primary text-white border-accent-primary'
                      : 'bg-bg-primary border-border-primary/50 text-fg-secondary hover:border-accent-primary/50 hover:text-accent-primary'
                  }`}
                  title="New Project"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>

                {/* Dropdown Menu - Fixed positioning to escape overflow:hidden */}
                {showNewProjectDropdown && (
                  <>
                    {/* Backdrop to close dropdown */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowNewProjectDropdown(false)}
                    />
                    <div
                      className="fixed z-50 w-48
                                bg-bg-elevated border border-border-primary rounded-lg shadow-xl
                                overflow-hidden animate-fade-in"
                      style={{
                        top: dropdownPosition.top,
                        left: dropdownPosition.left,
                      }}
                    >
                      {/* User Project */}
                      <button
                        onClick={() => handleQuickCreateProject('user')}
                        className="w-full flex items-center gap-3 px-3 py-2.5
                                 hover:bg-accent-primary/10 transition-colors text-left"
                      >
                        <div className="w-6 h-6 rounded-md bg-green-500/20 flex items-center justify-center flex-shrink-0">
                          <User className="w-3 h-3 text-green-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-fg-primary">User Project</p>
                          <p className="text-[9px] text-fg-tertiary">Personal</p>
                        </div>
                      </button>

                      {/* Team Project */}
                      <button
                        onClick={() => handleQuickCreateProject('team')}
                        className="w-full flex items-center gap-3 px-3 py-2.5
                                 hover:bg-accent-primary/10 transition-colors text-left
                                 border-t border-border-primary/50"
                      >
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                          <Users className="w-3 h-3 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-fg-primary">Team Project</p>
                          <p className="text-[9px] text-fg-tertiary">Collaborative</p>
                        </div>
                      </button>

                      {/* Advanced - Opens dialog */}
                      <button
                        onClick={handleNewProject}
                        className="w-full flex items-center gap-2 px-3 py-2
                                 hover:bg-bg-tertiary transition-colors text-left
                                 border-t border-border-primary/50 bg-bg-secondary/50"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5 text-fg-tertiary" />
                        <span className="text-[10px] text-fg-secondary">Advanced...</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Projects Content */}
        {expandedSection === 'projects' && (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {sortedProjects.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-tertiary flex items-center justify-center">
                  <Folder className="w-6 h-6 text-fg-muted" />
                </div>
                <p className="text-sm text-fg-secondary mb-1">No projects yet</p>
                <p className="text-xs text-fg-tertiary mb-3">Start a new project or continue an existing one</p>
                <button
                  onClick={handleNewProject}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Project
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border-primary/30">
                {sortedProjects.map((project) => {
                  const isActive = activeSession === project.id;
                  return (
                    <div
                      key={project.id}
                      onClick={() => handleResumeProject(project.id)}
                      className={`
                        group relative transition-all duration-150 cursor-pointer
                        ${isActive
                          ? 'bg-accent-primary/10 border-l-2 border-l-accent-primary'
                          : 'hover:bg-bg-tertiary/50 border-l-2 border-l-transparent'
                        }
                      `}
                    >
                      {/* Main content */}
                      <div className="px-3 py-2.5">
                        {/* Header row: type icon + name + status */}
                        <div className="flex items-center gap-2 mb-1.5">
                          {/* Project type icon with background */}
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                            project.type === 'user'
                              ? 'bg-green-500/15'
                              : 'bg-blue-500/15'
                          }`}>
                            {project.type === 'user' ? (
                              <User className={`w-4 h-4 ${isActive ? 'text-green-400' : 'text-green-500/70'}`} />
                            ) : (
                              <Users className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-blue-500/70'}`} />
                            )}
                          </div>

                          {/* Project name and type label */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs truncate ${
                                isActive ? 'text-fg-primary font-medium' : 'text-fg-secondary'
                              }`}>
                                {project.name}
                              </span>
                              {isActive && (
                                <span className="w-1.5 h-1.5 rounded-full bg-accent-success animate-pulse flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-fg-tertiary">
                                {project.type === 'user' ? 'Personal' : 'Team'}
                              </span>
                              {showAllProjects && (
                                <>
                                  <span className="text-fg-quaternary">•</span>
                                  <span className={`text-[10px] capitalize ${
                                    project.volume === 'user' ? 'text-green-400/80' :
                                    project.volume === 'team' ? 'text-blue-400/80' : 'text-gray-400/80'
                                  }`}>
                                    {project.volume}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Status badges */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {project.status === 'temporal' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                Unsaved
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Metadata row */}
                        <div className="flex items-center gap-3 text-[10px] text-fg-tertiary ml-9">
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {project.messages?.length || 0} messages
                          </span>
                          <span className="text-fg-quaternary">•</span>
                          <span>{project.timeAgo}</span>
                          {project.goal && (
                            <>
                              <span className="text-fg-quaternary">•</span>
                              <span className="truncate max-w-[100px]" title={project.goal}>
                                {project.goal}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action buttons - always visible on right side */}
                      <div className={`
                        absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1
                        ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                        transition-opacity duration-150 bg-inherit
                      `}>
                        {/* Delete button */}
                        <button
                          onClick={(e) => handleDeleteProject(project, e)}
                          className="p-1.5 rounded-md hover:bg-red-500/15 text-fg-tertiary hover:text-red-400 transition-colors"
                          title="Delete project"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

      {/* New Project Dialog */}
      <NewProjectDialog
        isOpen={showNewProjectDialog}
        onClose={() => setShowNewProjectDialog(false)}
        onCreate={handleCreateProject}
        defaultVolume={activeVolume}
      />

      {/* Delete Project Confirmation */}
      <ConfirmDialog
        isOpen={!!projectToDelete}
        title="Delete Project"
        message={`Are you sure you want to delete "${projectToDelete?.name}"? This will permanently remove all ${projectToDelete?.messages?.length || 0} messages and artifacts in this project.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setProjectToDelete(null)}
        danger
      />
    </div>
  );
}
