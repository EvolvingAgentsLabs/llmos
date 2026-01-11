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
    <div ref={containerRef} className="h-full flex flex-col overflow-hidden bg-[#161b22]">
      {/* ========== FILES SECTION ========== */}
      <div className={`flex flex-col overflow-hidden transition-all duration-200 ${
        expandedSection === 'files' ? 'flex-1' : 'flex-shrink-0'
      }`}>
        {/* Files Header */}
        <button
          onClick={() => handleSectionToggle('files')}
          className={`w-full px-3 py-2.5 flex items-center justify-between transition-colors ${
            expandedSection === 'files'
              ? 'bg-[#21262d] border-l-2 border-l-[#58a6ff] shadow-sm'
              : 'bg-[#30363d]/60 border-l-2 border-l-transparent hover:bg-[#30363d]'
          } border-b border-[#30363d]/50`}
        >
          <div className="flex items-center gap-2">
            {expandedSection === 'files' ? (
              <ChevronDown className="w-4 h-4 text-[#58a6ff]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#8b949e]" />
            )}
            <FolderTree className={`w-4 h-4 ${expandedSection === 'files' ? 'text-[#58a6ff]' : 'text-[#c9d1d9]'}`} />
            <span className={`text-xs font-semibold uppercase tracking-wide ${
              expandedSection === 'files' ? 'text-[#58a6ff]' : 'text-[#c9d1d9]'
            }`}>
              Files
            </span>
          </div>
          {expandedSection !== 'files' && (
            <span className="px-2 py-0.5 rounded-full bg-[#21262d] text-[#8b949e] text-[10px] font-medium capitalize">
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
            ? 'bg-[#21262d] border-l-2 border-l-[#58a6ff] shadow-sm'
            : 'bg-[#30363d]/60 border-l-2 border-l-transparent hover:bg-[#30363d]'
        } border-b border-[#30363d]/50`}>
          <button
            onClick={() => handleSectionToggle('chat')}
            className="flex-1 px-3 py-2.5 flex items-center gap-2"
          >
            {expandedSection === 'chat' ? (
              <ChevronDown className="w-4 h-4 text-[#58a6ff]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#8b949e]" />
            )}
            <Bot className={`w-4 h-4 ${expandedSection === 'chat' ? 'text-[#58a6ff]' : 'text-[#c9d1d9]'}`} />
            <span className={`text-xs font-semibold uppercase tracking-wide ${
              expandedSection === 'chat' ? 'text-[#58a6ff]' : 'text-[#c9d1d9]'
            }`}>
              Chat
            </span>
            {messageCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#0d1117] text-[#8b949e] text-[10px] font-medium">
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
                className="p-1.5 rounded hover:bg-red-500/20 text-[#8b949e] hover:text-red-400 transition-colors"
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
                  <div className="w-8 h-8 border-2 border-[#58a6ff]/20 border-t-[#58a6ff] rounded-full animate-spin" />
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
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl p-4 max-w-sm mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#e6edf3]">Clear Chat History?</h3>
                <p className="text-xs text-[#8b949e]">This will remove {messageCount} message(s)</p>
              </div>
            </div>
            <p className="text-xs text-[#c9d1d9] mb-4">
              This action cannot be undone. All chat history for the {activeVolume} workspace will be cleared.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 text-xs rounded bg-[#30363d] text-[#c9d1d9] hover:bg-[#21262d] transition-colors"
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
