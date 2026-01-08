'use client';

import { useEffect, useState } from 'react';
import { UserStorage } from '@/lib/user-storage';
import { useWorkspace, useWorkspaceLayout } from '@/contexts/WorkspaceContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import dynamic from 'next/dynamic';
import { Sparkles, Zap, LayoutGrid, HardDrive, Users, User } from 'lucide-react';
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
  const { activeVolume, currentWorkspace } = useProjectContext();

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
            <div>
              <h1 className="text-gradient font-semibold text-lg md:text-xl tracking-tight">
                LLMos-Lite
              </h1>
              <p className="hidden md:block text-fg-tertiary text-xs -mt-0.5">
                AI Operating System
              </p>
            </div>
          </div>

          {/* Agent Status Indicator - The "Cortex" */}
          <div className="hidden md:block ml-4 pl-4 border-l border-border-primary/50">
            <AgentCortexHeader />
          </div>

          {/* Active Workspace Indicator */}
          <div className="hidden md:flex items-center gap-3 ml-4 pl-4 border-l border-border-primary/50">
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600/15 via-cyan-500/15 to-blue-600/15 border border-blue-500/40 shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 hover:border-blue-400/50 transition-all duration-200 cursor-default">
              {/* Workspace icon with glow */}
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/30 rounded-lg blur-md" />
                <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-md">
                  <HardDrive className="w-4 h-4 text-white" />
                </div>
              </div>

              {/* Workspace info */}
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white capitalize">
                    {activeVolume} Workspace
                  </span>
                </div>
                {/* Volume indicator */}
                <div className="flex items-center gap-1.5 mt-0.5">
                  {activeVolume === 'team' ? (
                    <Users className="w-3 h-3 text-blue-400" />
                  ) : activeVolume === 'system' ? (
                    <HardDrive className="w-3 h-3 text-gray-400" />
                  ) : (
                    <User className="w-3 h-3 text-cyan-400" />
                  )}
                  <span className="text-[11px] text-fg-tertiary">
                    {currentWorkspace?.messages?.length || 0} messages
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right side: User info and status */}
        <div className="flex items-center gap-3 md:gap-4">
          {/* System Evolution button */}
          <button
            onClick={() => setShowEvolution(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200
                       bg-gradient-to-r from-accent-primary/10 to-accent-secondary/10
                       hover:from-accent-primary/20 hover:to-accent-secondary/20
                       border border-accent-primary/30 hover:border-accent-primary/50"
            title="Run System Evolution analysis"
          >
            <Zap className="w-4 h-4 text-accent-primary" />
            <span className="hidden md:inline text-sm font-medium text-accent-primary">
              Evolve
            </span>
          </button>

          {/* User profile button */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 hover:bg-bg-tertiary group"
            title="Open profile settings"
          >
            {/* User avatar */}
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-white text-xs font-semibold shadow-sm">
              {userDisplay.charAt(0).toUpperCase()}
            </div>
            {/* User name - hidden on mobile */}
            <span className="hidden md:inline text-sm font-medium text-fg-primary group-hover:text-accent-primary transition-colors">
              {userDisplay}
            </span>
            {/* Settings icon - visible on mobile */}
            <svg className="w-4 h-4 text-fg-secondary group-hover:text-accent-primary transition-colors md:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Status indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-success/10 border border-accent-success/30">
            <div className="status-active" />
            <span className="hidden md:inline text-xs font-medium text-accent-success">
              Online
            </span>
          </div>
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
