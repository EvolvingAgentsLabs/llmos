'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { LLMStorage } from '@/lib/llm-client';
import { UserStorage } from '@/lib/user-storage';
import { ProjectProvider } from '@/contexts/ProjectContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { AppletProvider } from '@/contexts/AppletContext';
import { bootKernel, BootProgress } from '@/lib/kernel/boot';
import BootScreen from '@/components/kernel/BootScreen';
import PlanExecutionLog from '@/components/debug/PlanExecutionLog';

// Layout mode storage key
const LAYOUT_MODE_KEY = 'llmos_layout_mode';

// Dynamically import layouts with no SSR
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

// New Fluid Desktop Layout (J.A.R.V.I.S. style)
const FluidLayout = dynamic(() => import('@/components/workspace/FluidLayout'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-accent-primary animate-pulse">
        Initializing Holodeck...
      </div>
    </div>
  ),
});

// Legacy Adaptive Layout
const AdaptiveLayout = dynamic(() => import('@/components/workspace/AdaptiveLayout'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-accent-primary animate-pulse">
        Loading Adaptive UI...
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

type LayoutMode = 'simple' | 'adaptive' | 'fluid';

export default function Home() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('fluid'); // Default to J.A.R.V.I.S. Fluid layout
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

    // Load layout preference
    const savedLayout = localStorage.getItem(LAYOUT_MODE_KEY) as LayoutMode | null;
    if (savedLayout && (savedLayout === 'simple' || savedLayout === 'adaptive' || savedLayout === 'fluid')) {
      setLayoutMode(savedLayout);
    }

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

  // Toggle layout mode with Ctrl+Shift+L (cycles: fluid -> adaptive -> simple)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setLayoutMode(prev => {
          const modes: LayoutMode[] = ['fluid', 'adaptive', 'simple'];
          const currentIndex = modes.indexOf(prev);
          const newMode = modes[(currentIndex + 1) % modes.length];
          localStorage.setItem(LAYOUT_MODE_KEY, newMode);
          return newMode;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

  // Render based on layout mode
  // Use Ctrl+Shift+L to toggle between layouts (fluid -> adaptive -> simple)
  const renderLayout = () => {
    switch (layoutMode) {
      case 'fluid':
        return <FluidLayout />;
      case 'adaptive':
        return <AdaptiveLayout />;
      case 'simple':
      default:
        return <SimpleLayout />;
    }
  };

  return (
    <ProjectProvider>
      <AppletProvider>
        <WorkspaceProvider>
          {renderLayout()}
          <PlanExecutionLog />
        </WorkspaceProvider>
      </AppletProvider>
    </ProjectProvider>
  );
}
