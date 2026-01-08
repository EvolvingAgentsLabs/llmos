'use client';

import { useState, useRef, lazy, Suspense, useCallback } from 'react';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useWorkspace, useWorkspaceLayout } from '@/contexts/WorkspaceContext';
import VSCodeFileTree from '../panels/volumes/VSCodeFileTree';
import { ChevronDown, ChevronRight, FolderTree, Bot, Trash2 } from 'lucide-react';

// Lazy load ChatPanel
const ChatPanel = lazy(() => import('../chat/ChatPanel'));

// Accordion section type - only Tree (files) and Chat
type AccordionSection = 'files' | 'chat';

interface SidebarPanelProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange: (volume: 'system' | 'team' | 'user') => void;
}

export default function SidebarPanel({
  activeVolume,
  onVolumeChange,
}: SidebarPanelProps) {
  const { currentWorkspace, clearMessages } = useProjectContext();
  const { setContextViewMode, setActiveFile, updatePreferences, state } = useWorkspace();
  const layout = useWorkspaceLayout();

  // Accordion state - which section is expanded (default to chat)
  const [expandedSection, setExpandedSection] = useState<AccordionSection>('chat');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get message count from current workspace
  const messageCount = currentWorkspace?.messages?.length || 0;

  // Handle clear chat messages
  const handleClearChat = () => {
    setShowClearConfirm(true);
  };

  const confirmClearChat = () => {
    clearMessages();
    setShowClearConfirm(false);
  };

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
    const isInAppletsDir = path.includes('/applets/') || path.includes('/applet/');
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const isAppExtension = name.endsWith('.app.tsx') || name.endsWith('.applet.tsx');
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

    const ext = node.name?.split('.').pop()?.toLowerCase() || '';
    const codeExtensions = ['py', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'css', 'html', 'md'];
    const mediaExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'mp4', 'webm', 'ogg', 'mov'];

    setActiveFile(node.path);

    // Check if it's an applet file - should open in applets mode (execution)
    if (isAppletFile(node.path, node.name)) {
      console.log('[SidebarPanel] Applet file detected, opening in applets mode:', node.path);
      setContextViewMode('applets');
    } else if (mediaExtensions.includes(ext)) {
      setContextViewMode('media');
    } else if (codeExtensions.includes(ext)) {
      setContextViewMode('split-view');
    } else {
      setContextViewMode('split-view');
    }

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
              onCodeFileSelect={handleCodeFileSelect}
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
        <div className={`flex items-center justify-between transition-colors ${
          expandedSection === 'chat'
            ? 'bg-bg-elevated border-l-2 border-l-accent-primary shadow-sm'
            : 'bg-bg-tertiary/60 border-l-2 border-l-transparent hover:bg-bg-tertiary'
        } border-b border-border-primary/50`}>
          <button
            onClick={() => handleSectionToggle('chat')}
            className="flex-1 px-3 py-2.5 flex items-center gap-2"
          >
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
            {messageCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-bg-primary text-fg-tertiary text-[10px] font-medium">
                {messageCount} msg
              </span>
            )}
            {expandedSection !== 'chat' && messageCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/15 text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Active
              </span>
            )}
          </button>

          {/* Action buttons - visible when chat expanded */}
          {expandedSection === 'chat' && messageCount > 0 && (
            <div className="flex items-center gap-1 pr-2">
              <button
                onClick={handleClearChat}
                className="p-1.5 rounded hover:bg-red-500/20 text-fg-tertiary hover:text-red-400 transition-colors"
                title="Clear chat history"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

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
                activeVolume={activeVolume}
              />
            </Suspense>
          </div>
        )}
      </div>

      {/* Clear Chat Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-bg-secondary border border-border-primary rounded-lg shadow-xl p-4 max-w-sm mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-fg-primary">Clear Chat History?</h3>
                <p className="text-xs text-fg-tertiary">This will remove {messageCount} message(s)</p>
              </div>
            </div>
            <p className="text-xs text-fg-secondary mb-4">
              This action cannot be undone. All chat history for the {activeVolume} workspace will be cleared.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 text-xs rounded bg-bg-tertiary text-fg-secondary hover:bg-bg-elevated transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearChat}
                className="px-3 py-1.5 text-xs rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Clear Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
