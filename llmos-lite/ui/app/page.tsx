'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { LLMStorage } from '@/lib/llm-client';
import { UserStorage } from '@/lib/user-storage';

// Dynamically import components with no SSR
const TerminalLayout = dynamic(() => import('@/components/layout/TerminalLayout'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-terminal-bg-primary">
      <div className="text-terminal-accent-green animate-pulse">
        Loading Terminal...
      </div>
    </div>
  ),
});

const APIKeySetup = dynamic(() => import('@/components/setup/APIKeySetup'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-terminal-bg-primary">
      <div className="text-terminal-accent-green animate-pulse">
        Loading Setup...
      </div>
    </div>
  ),
});

export default function Home() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Check if both LLM config AND user/team are configured
    const configured = LLMStorage.isConfigured() && UserStorage.isUserConfigured();
    setIsConfigured(configured);
  }, []);

  // Don't render anything until mounted (client-side only)
  if (!isMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-terminal-bg-primary">
        <div className="text-terminal-accent-green animate-pulse">
          Initializing LLMos-Lite...
        </div>
      </div>
    );
  }

  // Loading state
  if (isConfigured === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-terminal-bg-primary">
        <div className="text-terminal-accent-green animate-pulse">
          Checking configuration...
        </div>
      </div>
    );
  }

  // Show setup if not configured
  if (!isConfigured) {
    return <APIKeySetup onComplete={() => setIsConfigured(true)} />;
  }

  // Show main terminal interface
  return <TerminalLayout />;
}
