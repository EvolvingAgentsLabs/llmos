'use client';

import { useEffect, useState } from 'react';
import { UserStorage } from '@/lib/user-storage';
import dynamic from 'next/dynamic';

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
      <header className="h-12 bg-terminal-bg-secondary border-b border-terminal-border flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="text-terminal-accent-green font-bold text-lg">
            LLMos-Lite
          </div>
          <div className="text-terminal-fg-tertiary text-xs">
            Web Terminal
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSettings(true)}
            className="text-terminal-fg-secondary text-sm hover:text-terminal-accent-green transition-colors cursor-pointer"
            title="Click to open profile settings"
          >
            {userDisplay}
          </button>
          <div className="w-2 h-2 rounded-full bg-terminal-accent-green animate-pulse-slow" />
        </div>
      </header>

      {showSettings && (
        <ProfileSettings onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}
