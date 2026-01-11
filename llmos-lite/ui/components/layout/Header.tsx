'use client';

import { useEffect, useState } from 'react';
import { UserStorage } from '@/lib/user-storage';
import { useWorkspace, useWorkspaceLayout } from '@/contexts/WorkspaceContext';
import dynamic from 'next/dynamic';
import { Sparkles, Zap, LayoutGrid } from 'lucide-react';
import AgentCortexHeader from '@/components/workspace/AgentCortexHeader';

const ProfileSettings = dynamic(() => import('@/components/settings/ProfileSettings'), {
  ssr: false,
});

const SystemEvolutionModal = dynamic(() => import('@/components/evolution/SystemEvolutionModal'), {
  ssr: false,
});

export default function Header() {
  const [userDisplay, setUserDisplay] = useState('loading...');
  const [showSettings, setShowSettings] = useState(false);
  const [showEvolution, setShowEvolution] = useState(false);
  const { setContextViewMode, updatePreferences, state } = useWorkspace();
  const layout = useWorkspaceLayout();

  useEffect(() => {
    setUserDisplay(UserStorage.getUserDisplay());
  }, []);

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
          {/* Start/Desktop Button - Like Windows Start */}
          <button
            onClick={handleStartClick}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-primary via-accent-primary to-accent-secondary
                      flex items-center justify-center shadow-lg shadow-accent-primary/30
                      hover:shadow-accent-primary/50 hover:scale-105
                      active:scale-95 transition-all duration-200
                      ring-2 ring-white/20"
            title="Open Desktop"
          >
            <LayoutGrid className="w-5 h-5 text-white" />
          </button>

          <div className="flex items-center gap-2">
            {/* Logo icon */}
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-glow">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            {/* Brand name */}
            <div className="hidden sm:block">
              <h1 className="text-gradient font-semibold text-lg md:text-xl tracking-tight">
                LLMos
              </h1>
            </div>
          </div>
        </div>

        {/* Center: Agent Status Indicator with Pause Button and Model Selector */}
        <div className="flex items-center">
          <AgentCortexHeader />
        </div>

        {/* Right side: Quick actions */}
        <div className="flex items-center gap-2">
          {/* System Evolution button - compact */}
          <button
            onClick={() => setShowEvolution(true)}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200
                       bg-accent-primary/10 hover:bg-accent-primary/20
                       border border-accent-primary/30 hover:border-accent-primary/50"
            title="Run System Evolution analysis"
          >
            <Zap className="w-4 h-4 text-accent-primary" />
          </button>

          {/* User profile button - compact */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 hover:bg-bg-tertiary"
            title="Open profile settings"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-white text-xs font-semibold shadow-sm">
              {userDisplay.charAt(0).toUpperCase()}
            </div>
          </button>
        </div>
      </header>

      {/* Settings modal */}
      {showSettings && (
        <ProfileSettings onClose={() => setShowSettings(false)} />
      )}

      {/* System Evolution modal */}
      {showEvolution && (
        <SystemEvolutionModal onClose={() => setShowEvolution(false)} />
      )}
    </>
  );
}
