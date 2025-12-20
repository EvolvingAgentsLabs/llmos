'use client';

import { useEffect, useState } from 'react';
import { UserStorage } from '@/lib/user-storage';
import dynamic from 'next/dynamic';
import { Sparkles } from 'lucide-react';

const ProfileSettings = dynamic(() => import('@/components/settings/ProfileSettings'), {
  ssr: false,
});

export default function Header() {
  const [userDisplay, setUserDisplay] = useState('loading...');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setUserDisplay(UserStorage.getUserDisplay());
  }, []);

  return (
    <>
      <header className="h-14 md:h-16 bg-bg-secondary/50 backdrop-blur-xl border-b border-border-primary/50 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
        {/* Logo and branding */}
        <div className="flex items-center gap-3 md:gap-4">
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
        </div>

        {/* Right side: User info and status */}
        <div className="flex items-center gap-3 md:gap-4">
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
    </>
  );
}
