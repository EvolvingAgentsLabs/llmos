'use client';

import { useState } from 'react';
import { useSessionContext, SessionType, Session } from '@/contexts/SessionContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import VSCodeFileTree from '../panel1-volumes/VSCodeFileTree';
import ActivitySection from './ActivitySection';
import NewSessionDialog from '../session/NewSessionDialog';
import ConfirmDialog from '../common/ConfirmDialog';
import { Plus, MessageSquarePlus } from 'lucide-react';

interface SidebarPanelProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange: (volume: 'system' | 'team' | 'user') => void;
  activeSession: string | null;
  onSessionChange: (sessionId: string | null) => void;
}

export default function SidebarPanel({
  activeVolume,
  onVolumeChange,
  activeSession,
  onSessionChange,
}: SidebarPanelProps) {
  const { sessions, activeSessions, addSession, deleteSession } = useSessionContext();
  const { setContextViewMode, setActiveFile } = useWorkspace();
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const [showAllSessions, setShowAllSessions] = useState(true);

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

  // Handle Desktop selection - switch to applets view
  const handleDesktopSelect = () => {
    setContextViewMode('applets');
  };

  // Handle code file selection - open in split view
  const handleCodeFileSelect = (path: string) => {
    setActiveFile(path);
    setContextViewMode('split-view');
  };

  // Handle any file selection - display in main panel based on type
  const handleFileSelect = (node: any) => {
    console.log('[SidebarPanel] File selected:', node);

    // Check file extension to determine view mode
    const ext = node.name?.split('.').pop()?.toLowerCase() || '';
    const codeExtensions = ['py', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'css', 'html'];

    if (codeExtensions.includes(ext)) {
      // Code files - open in split view for editing/running
      setActiveFile(node.path);
      setContextViewMode('split-view');
    } else {
      // Other files (markdown, etc.) - open in artifacts view
      setActiveFile(node.path);
      setContextViewMode('artifacts');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg-secondary">
      {/* Prominent New Session Button */}
      <div className="px-3 py-3 border-b border-border-primary/50 bg-gradient-to-r from-accent-primary/10 to-transparent">
        <button
          onClick={handleNewSession}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                   bg-accent-primary hover:bg-accent-primary/90
                   text-white font-medium text-sm rounded-lg
                   shadow-lg shadow-accent-primary/25
                   transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>New Session</span>
        </button>
      </div>

      {/* VSCode File Tree - Takes significant space with minimum height */}
      <div className="flex-1 min-h-[200px] border-b border-border-primary/50 overflow-hidden">
        <VSCodeFileTree
          activeVolume={activeVolume}
          onVolumeChange={onVolumeChange}
          onFileSelect={handleFileSelect}
          onDesktopSelect={handleDesktopSelect}
          onCodeFileSelect={handleCodeFileSelect}
          selectedFile={null}
        />
      </div>

      {/* Sessions List - Expanded with better management */}
      <div className="flex flex-col overflow-hidden border-b border-border-primary/50 max-h-64 flex-shrink-0">
        {/* Header with filters */}
        <div className="px-3 py-2 flex items-center justify-between bg-bg-secondary/50 border-b border-border-primary/30">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wider">
              Sessions
            </span>
            <span className="px-1.5 py-0.5 rounded bg-bg-elevated text-fg-tertiary text-[9px]">
              {sortedSessions.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Toggle All/Current Volume */}
            <button
              onClick={() => setShowAllSessions(!showAllSessions)}
              className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                showAllSessions
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'bg-bg-tertiary text-fg-tertiary hover:text-fg-secondary'
              }`}
              title={showAllSessions ? 'Showing all sessions' : `Showing ${activeVolume} sessions`}
            >
              {showAllSessions ? 'All' : activeVolume}
            </button>
            {/* New Session Button */}
            <button
              onClick={handleNewSession}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-bg-tertiary transition-colors"
              title="New Session"
            >
              <svg className="w-3 h-3 text-fg-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 py-1 scrollbar-thin">
          {sortedSessions.length === 0 ? (
            <div className="py-6 px-2 text-center">
              <svg className="w-10 h-10 mx-auto mb-2 text-fg-muted opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <p className="text-xs text-fg-tertiary mb-2">No sessions yet</p>
              <button
                onClick={handleNewSession}
                className="text-[10px] text-accent-primary hover:underline"
              >
                Start a new session
              </button>
            </div>
          ) : (
            <div className="space-y-1 py-1">
              {sortedSessions.map((session) => {
                const isActive = activeSession === session.id;
                return (
                  <div
                    key={session.id}
                    className={`
                      group relative rounded-lg transition-all duration-150 cursor-pointer
                      ${isActive
                        ? 'bg-accent-primary/15 ring-1 ring-accent-primary/30'
                        : 'hover:bg-bg-tertiary/80'
                      }
                    `}
                  >
                    {/* Main clickable area */}
                    <div
                      onClick={() => handleResumeSession(session.id)}
                      className="px-2.5 py-2"
                    >
                      {/* Top row: icon, name, badges */}
                      <div className="flex items-center gap-2 mb-1">
                        {/* Active indicator */}
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-success animate-pulse flex-shrink-0" />
                        )}

                        {/* Session type icon */}
                        <span className="text-sm flex-shrink-0">
                          {session.type === 'user' ? '💬' : '👥'}
                        </span>

                        {/* Session name */}
                        <span className={`text-xs truncate flex-1 ${
                          isActive ? 'text-fg-primary font-medium' : 'text-fg-secondary'
                        }`}>
                          {session.name}
                        </span>

                        {/* Volume badge (when showing all) */}
                        {showAllSessions && (
                          <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-medium ${volumeColors[session.volume]}`}>
                            {session.volume.charAt(0)}
                          </span>
                        )}

                        {/* Unsaved indicator */}
                        {session.status === 'temporal' && (
                          <span
                            className="w-2 h-2 rounded-full bg-accent-warning flex-shrink-0"
                            title="Unsaved session"
                          />
                        )}
                      </div>

                      {/* Bottom row: metadata */}
                      <div className="flex items-center gap-2 text-[10px] text-fg-tertiary ml-0">
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                          {session.messages?.length || 0}
                        </span>
                        <span>·</span>
                        <span>{session.timeAgo}</span>
                        {session.goal && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[80px]" title={session.goal}>
                              {session.goal}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action buttons - visible on hover */}
                    <div className={`
                      absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5
                      ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                      transition-opacity duration-150
                    `}>
                      {/* Resume button (only for non-active) */}
                      {!isActive && (
                        <button
                          onClick={() => handleResumeSession(session.id)}
                          className="p-1 rounded hover:bg-accent-primary/20 text-fg-tertiary hover:text-accent-primary transition-colors"
                          title="Resume session"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      )}

                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDeleteSession(session, e)}
                        className="p-1 rounded hover:bg-red-500/20 text-fg-tertiary hover:text-red-400 transition-colors"
                        title="Delete session"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      </div>

      {/* Activity Section - Collapsible */}
      <ActivitySection
        expanded={activityExpanded}
        onToggle={() => setActivityExpanded(!activityExpanded)}
      />

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
