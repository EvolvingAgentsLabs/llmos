'use client';

import { useWorkspace, useWorkspaceLayout } from '@/contexts/WorkspaceContext';
import { Sparkles, LayoutGrid, X } from 'lucide-react';
import AgentCortexHeader from '@/components/workspace/AgentCortexHeader';

export default function Header() {
  const { setContextViewMode, updatePreferences, state } = useWorkspace();
  const layout = useWorkspaceLayout();

  // Handle Start/Desktop button click - opens applet grid
  const handleStartClick = () => {
    setContextViewMode('applets');
    if (layout.isContextCollapsed) {
      updatePreferences({
        collapsedPanels: { ...state.preferences.collapsedPanels, context: false }
      });
    }
  };

  return (
    <>
      <header className="relative z-20 h-14 md:h-16 bg-bg-secondary/30 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
        {/* Logo and branding */}
        <div className="flex items-center gap-3 md:gap-4">
          {/* Logo icon */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-glow">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          {/* Brand name */}
          <div className="hidden sm:block">
            <h1 className="text-gradient font-semibold text-lg md:text-xl tracking-tight">
              LLMos Robot IDE
            </h1>
          </div>
        </div>

        {/* Center: Agent Status Indicator with Pause Button and Model Selector */}
        <div className="flex items-center">
          <AgentCortexHeader />
        </div>

        {/* Right side: Close Session */}
        <div className="flex items-center">
          <button
            onClick={() => {
              // Clear session and reload
              if (typeof window !== 'undefined') {
                if (confirm('Close this session? This will clear your current chat history.')) {
                  localStorage.removeItem('llmos-workspace');
                  localStorage.removeItem('llmos-chat-messages');
                  window.location.reload();
                }
              }
            }}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200
                       bg-red-500/10 hover:bg-red-500/20
                       border border-red-500/30 hover:border-red-500/50"
            title="Close Session"
          >
            <X className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </header>
    </>
  );
}
