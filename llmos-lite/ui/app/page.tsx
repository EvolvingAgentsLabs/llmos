'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { LLMStorage } from '@/lib/llm-client';
import { UserStorage } from '@/lib/user-storage';
import { SessionProvider } from '@/contexts/SessionContext';
import { bootKernel, BootProgress } from '@/lib/kernel/boot';
import BootScreen from '@/components/kernel/BootScreen';

// Dynamically import components with no SSR
const SimpleLayout = dynamic(() => import('@/components/layout/SimpleLayout'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-accent-primary animate-pulse">
        Loading...
      </div>
    </div>
  ),
});

const APIKeySetup = dynamic(() => import('@/components/setup/APIKeySetup'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-accent-primary animate-pulse">
        Loading Setup...
      </div>
    </div>
  ),
});

export default function Home() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [bootProgress, setBootProgress] = useState<BootProgress>({
    stage: {
      name: 'init',
      description: 'Initializing system',
      duration: 500,
      critical: true,
    },
    percent: 0,
    message: 'Starting boot sequence...',
  });

  useEffect(() => {
    setIsMounted(true);

    // Check configuration
    const configured = LLMStorage.isConfigured() && UserStorage.isUserConfigured();
    setIsConfigured(configured);

    // Start kernel boot sequence
    const startBoot = async () => {
      try {
        await bootKernel(
          (progress) => {
            setBootProgress(progress);
          },
          {
            enableWASM: true,
            enablePython: true,
            loadStdLib: true,
          }
        );

        // Boot complete, hide boot screen
        setTimeout(() => {
          setIsBooting(false);
        }, 500);
      } catch (error) {
        console.error('[App] Kernel boot failed:', error);
        // Continue to app even if boot fails
        setIsBooting(false);
      }
    };

    startBoot();
  }, []);

  // Show boot screen while booting
  if (!isMounted || isBooting) {
    return <BootScreen progress={bootProgress} onComplete={() => setIsBooting(false)} />;
  }

  // Loading state
  if (isConfigured === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-accent-primary animate-pulse">
          Checking configuration...
        </div>
      </div>
    );
  }

  // Show setup if not configured
  if (!isConfigured) {
    return <APIKeySetup onComplete={() => setIsConfigured(true)} />;
  }

  // Show simple 2-panel interface
  return (
    <SessionProvider>
      <SimpleLayout />
    </SessionProvider>
  );
}
