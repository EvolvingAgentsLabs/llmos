'use client';

import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { useSessionContext, SessionType, Session } from '@/contexts/SessionContext';
import { useWorkspace, useWorkspaceLayout } from '@/contexts/WorkspaceContext';
import VSCodeFileTree from '../panels/volumes/VSCodeFileTree';
import ActivitySection from './ActivitySection';
import NewSessionDialog from '../session/NewSessionDialog';
import ConfirmDialog from '../common/ConfirmDialog';
import { Plus, MessageSquarePlus, ChevronDown, ChevronRight, Users, User, FolderTree, MessageSquare, Activity, Bot } from 'lucide-react';

// Lazy load ChatPanel
const ChatPanel = lazy(() => import('../chat/ChatPanel'));

// Accordion section type
type AccordionSection = 'files' | 'sessions' | 'activity' | 'chat';

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
  const { sessions, activeSessions, addSession, deleteSession, cronJobs } = useSessionContext();
  const { setContextViewMode, setActiveFile, updatePreferences, state } = useWorkspace();
  const layout = useWorkspaceLayout();

  // Accordion state - which section is expanded (default to chat)
  const [expandedSection, setExpandedSection] = useState<AccordionSection>('chat');

  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const [showAllSessions, setShowAllSessions] = useState(true);
  const [showNewSessionDropdown, setShowNewSessionDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const dropdownButtonRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Activity stats for collapsed header
  const completedCrons = cronJobs.filter((c) => c.status === 'completed').length;
  const runningCrons = cronJobs.filter((c) => c.status === 'running').length;

  // Handle dropdown toggle with position calculation
  const handleDropdownToggle = useCallback(() => {
    if (!showNewSessionDropdown && dropdownButtonRef.current) {
      const rect = dropdownButtonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.right - 192, // 192px = w-48 dropdown width
      });
    }
    setShowNewSessionDropdown(!showNewSessionDropdown);
  }, [showNewSessionDropdown]);

  // Handle accordion section toggle
  const handleSectionToggle = (section: AccordionSection) => {
    setExpandedSection(section);
  };

  // Get sessions to display - either all or filtered by volume
  const displaySessions = showAllSessions
    ? sessions
    : activeSessions[activeVolume];

  // Sort sessions by most recent first (based on timeAgo or id which has timestamp)
  const sortedSessions = [...displaySessions].sort((a, b) => {
    // Active session always first
    if (a.id === activeSession) return -1;
    if (b.id === activeSession) return 1;
    // Then sort by id (which contains timestamp) - newer first
    return b.id.localeCompare(a.id);
  });

  const handleNewSession = () => {
    setShowNewSessionDialog(true);
    setShowNewSessionDropdown(false);
  };

  // Quick create session with default name
  const handleQuickCreateSession = (type: SessionType) => {
    const defaultName = type === 'user' ? 'Personal Session' : 'Team Collaboration';
    const newSession = addSession({
      name: defaultName,
      type: type,
      status: 'temporal',
      volume: activeVolume,
    });
    onSessionChange(newSession.id);
    setShowNewSessionDropdown(false);
  };

  const handleCreateSession = (data: {
    name: string;
    type: SessionType;
    goal?: string;
  }) => {
    const newSession = addSession({
      name: data.name,
      type: data.type,
      status: 'temporal',
      volume: activeVolume,
      goal: data.goal,
    });
    onSessionChange(newSession.id);
  };

  const handleDeleteSession = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete(session);
  };

  const confirmDelete = () => {
    if (sessionToDelete) {
      deleteSession(sessionToDelete.id);
      setSessionToDelete(null);
    }
  };

  const handleResumeSession = (sessionId: string) => {
    onSessionChange(sessionId);
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

  const isImageFile = (name: string): boolean => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
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

      {/* ========== SESSIONS SECTION ========== */}
      <div className={`flex flex-col overflow-hidden transition-all duration-200 ${
        expandedSection === 'sessions' ? 'flex-1' : 'flex-shrink-0'
      }`}>
        {/* Sessions Header */}
        <div
          className={`px-3 py-2.5 flex items-center justify-between transition-colors cursor-pointer ${
            expandedSection === 'sessions'
              ? 'bg-bg-elevated border-l-2 border-l-accent-primary shadow-sm'
              : 'bg-bg-tertiary/60 border-l-2 border-l-transparent hover:bg-bg-tertiary'
          } border-b border-border-primary/50`}
          onClick={() => handleSectionToggle('sessions')}
        >
          <div className="flex items-center gap-2">
            {expandedSection === 'sessions' ? (
              <ChevronDown className="w-4 h-4 text-accent-primary" />
            ) : (
              <ChevronRight className="w-4 h-4 text-fg-tertiary" />
            )}
            <MessageSquare className={`w-4 h-4 ${expandedSection === 'sessions' ? 'text-accent-primary' : 'text-fg-secondary'}`} />
            <span className={`text-xs font-semibold uppercase tracking-wide ${
              expandedSection === 'sessions' ? 'text-accent-primary' : 'text-fg-secondary'
            }`}>
              Sessions
            </span>
            <span className="px-2 py-0.5 rounded-full bg-bg-primary text-fg-tertiary text-[10px] font-medium">
              {sortedSessions.length}
            </span>
          </div>
          {expandedSection === 'sessions' && (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {/* Toggle All/Current Volume - Standard Toggle Button */}
              <div className="flex items-center bg-bg-primary rounded-md border border-border-primary/50 overflow-hidden">
                <button
                  onClick={() => setShowAllSessions(true)}
                  className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                    showAllSessions
                      ? 'bg-accent-primary/20 text-accent-primary'
                      : 'text-fg-tertiary hover:text-fg-secondary hover:bg-bg-tertiary/50'
                  }`}
                  title="Show all sessions"
                >
                  All
                </button>
                <button
                  onClick={() => setShowAllSessions(false)}
                  className={`px-2 py-1 text-[10px] font-medium transition-colors capitalize border-l border-border-primary/50 ${
                    !showAllSessions
                      ? 'bg-accent-primary/20 text-accent-primary'
                      : 'text-fg-tertiary hover:text-fg-secondary hover:bg-bg-tertiary/50'
                  }`}
                  title={`Show ${activeVolume} sessions only`}
                >
                  {activeVolume}
                </button>
              </div>
              {/* New Session Button with Dropdown */}
              <div className="relative" ref={dropdownButtonRef}>
                <button
                  onClick={handleDropdownToggle}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors border ${
                    showNewSessionDropdown
                      ? 'bg-accent-primary text-white border-accent-primary'
                      : 'bg-bg-primary border-border-primary/50 text-fg-secondary hover:border-accent-primary/50 hover:text-accent-primary'
                  }`}
                  title="New Session"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>

                {/* Dropdown Menu - Fixed positioning to escape overflow:hidden */}
                {showNewSessionDropdown && (
                  <>
                    {/* Backdrop to close dropdown */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowNewSessionDropdown(false)}
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
                      {/* User Session */}
                      <button
                        onClick={() => handleQuickCreateSession('user')}
                        className="w-full flex items-center gap-3 px-3 py-2.5
                                 hover:bg-accent-primary/10 transition-colors text-left"
                      >
                        <div className="w-6 h-6 rounded-md bg-green-500/20 flex items-center justify-center flex-shrink-0">
                          <User className="w-3 h-3 text-green-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-fg-primary">User Session</p>
                          <p className="text-[9px] text-fg-tertiary">Personal</p>
                        </div>
                      </button>

                      {/* Team Session */}
                      <button
                        onClick={() => handleQuickCreateSession('team')}
                        className="w-full flex items-center gap-3 px-3 py-2.5
                                 hover:bg-accent-primary/10 transition-colors text-left
                                 border-t border-border-primary/50"
                      >
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                          <Users className="w-3 h-3 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-fg-primary">Team Session</p>
                          <p className="text-[9px] text-fg-tertiary">Collaborative</p>
                        </div>
                      </button>

                      {/* Advanced - Opens dialog */}
                      <button
                        onClick={handleNewSession}
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

        {/* Sessions Content */}
        {expandedSection === 'sessions' && (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {sortedSessions.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-tertiary flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-fg-muted" />
                </div>
                <p className="text-sm text-fg-secondary mb-1">No sessions yet</p>
                <p className="text-xs text-fg-tertiary mb-3">Start a conversation to create your first session</p>
                <button
                  onClick={handleNewSession}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Session
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border-primary/30">
                {sortedSessions.map((session) => {
                  const isActive = activeSession === session.id;
                  return (
                    <div
                      key={session.id}
                      onClick={() => handleResumeSession(session.id)}
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
                          {/* Session type icon with background */}
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                            session.type === 'user'
                              ? 'bg-green-500/15'
                              : 'bg-blue-500/15'
                          }`}>
                            {session.type === 'user' ? (
                              <User className={`w-4 h-4 ${isActive ? 'text-green-400' : 'text-green-500/70'}`} />
                            ) : (
                              <Users className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-blue-500/70'}`} />
                            )}
                          </div>

                          {/* Session name and type label */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs truncate ${
                                isActive ? 'text-fg-primary font-medium' : 'text-fg-secondary'
                              }`}>
                                {session.name}
                              </span>
                              {isActive && (
                                <span className="w-1.5 h-1.5 rounded-full bg-accent-success animate-pulse flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-fg-tertiary">
                                {session.type === 'user' ? 'Personal' : 'Team'}
                              </span>
                              {showAllSessions && (
                                <>
                                  <span className="text-fg-quaternary">•</span>
                                  <span className={`text-[10px] capitalize ${
                                    session.volume === 'user' ? 'text-green-400/80' :
                                    session.volume === 'team' ? 'text-blue-400/80' : 'text-gray-400/80'
                                  }`}>
                                    {session.volume}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Status badges */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {session.status === 'temporal' && (
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
                            {session.messages?.length || 0} messages
                          </span>
                          <span className="text-fg-quaternary">•</span>
                          <span>{session.timeAgo}</span>
                          {session.goal && (
                            <>
                              <span className="text-fg-quaternary">•</span>
                              <span className="truncate max-w-[100px]" title={session.goal}>
                                {session.goal}
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
                          onClick={(e) => handleDeleteSession(session, e)}
                          className="p-1.5 rounded-md hover:bg-red-500/15 text-fg-tertiary hover:text-red-400 transition-colors"
                          title="Delete session"
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

      {/* ========== ACTIVITY SECTION ========== */}
      <div className={`flex flex-col overflow-hidden transition-all duration-200 ${
        expandedSection === 'activity' ? 'flex-1' : 'flex-shrink-0'
      }`}>
        {/* Activity Header */}
        <button
          onClick={() => handleSectionToggle('activity')}
          className={`w-full px-3 py-2.5 flex items-center justify-between transition-colors ${
            expandedSection === 'activity'
              ? 'bg-bg-elevated border-l-2 border-l-accent-primary shadow-sm'
              : 'bg-bg-tertiary/60 border-l-2 border-l-transparent hover:bg-bg-tertiary'
          } border-b border-border-primary/50`}
        >
          <div className="flex items-center gap-2">
            {expandedSection === 'activity' ? (
              <ChevronDown className="w-4 h-4 text-accent-primary" />
            ) : (
              <ChevronRight className="w-4 h-4 text-fg-tertiary" />
            )}
            <Activity className={`w-4 h-4 ${expandedSection === 'activity' ? 'text-accent-primary' : 'text-fg-secondary'}`} />
            <span className={`text-xs font-semibold uppercase tracking-wide ${
              expandedSection === 'activity' ? 'text-accent-primary' : 'text-fg-secondary'
            }`}>
              Activity
            </span>
          </div>
          {expandedSection !== 'activity' && (
            <div className="flex items-center gap-2">
              {runningCrons > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400">
                  {runningCrons} running
                </span>
              )}
              {completedCrons > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/15 text-green-400">
                  {completedCrons} done
                </span>
              )}
            </div>
          )}
        </button>

        {/* Activity Content */}
        {expandedSection === 'activity' && (
          <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin">
            <div className="space-y-2">
              {cronJobs.length === 0 ? (
                <div className="py-6 text-center">
                  <Activity className="w-10 h-10 mx-auto mb-2 text-fg-muted opacity-40" />
                  <p className="text-xs text-fg-tertiary">No activity yet</p>
                </div>
              ) : (
                cronJobs.map((cron) => (
                  <div
                    key={cron.id}
                    className="p-2 rounded bg-bg-primary border border-border-primary/50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={
                          cron.status === 'completed'
                            ? 'text-accent-success'
                            : cron.status === 'running'
                            ? 'text-accent-warning'
                            : 'text-fg-tertiary'
                        }
                      >
                        {cron.status === 'completed' && '✓'}
                        {cron.status === 'running' && '⟳'}
                        {cron.status === 'scheduled' && '⏸'}
                      </span>
                      <span className="text-xs font-medium text-fg-primary">{cron.name}</span>
                    </div>
                    <div className="ml-5 text-xs text-fg-secondary space-y-0.5">
                      <div>Last: {cron.lastRun}</div>
                      {cron.status === 'completed' && (
                        <div className="text-accent-success">
                          {cron.skillsGenerated} skills from {cron.patterns} patterns
                        </div>
                      )}
                      <div>Next: {cron.nextRun}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Git Status - Minimal */}
            <div className="mt-3 pt-3 border-t border-border-primary/50">
              <div className="text-xs text-fg-tertiary">
                <div className="flex items-center gap-2">
                  <span>Git:</span>
                  <span className="text-accent-success">Clean</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========== CHAT SECTION (JARVIS) ========== */}
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
                {sessions.find(s => s.id === activeSession)?.messages?.length || 0} msg
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

      {/* New Session Dialog */}
      <NewSessionDialog
        isOpen={showNewSessionDialog}
        onClose={() => setShowNewSessionDialog(false)}
        onCreate={handleCreateSession}
        defaultVolume={activeVolume}
      />

      {/* Delete Session Confirmation */}
      <ConfirmDialog
        isOpen={!!sessionToDelete}
        title="Delete Session"
        message={`Are you sure you want to delete "${sessionToDelete?.name}"? This will permanently remove all ${sessionToDelete?.messages?.length || 0} messages in this session.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setSessionToDelete(null)}
        danger
      />
    </div>
  );
}
