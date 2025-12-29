'use client';

import { useMemo, Suspense, lazy, useState } from 'react';
import { useWorkspace, ContextViewMode } from '@/contexts/WorkspaceContext';
import { useApplets } from '@/contexts/AppletContext';
import CoreEntity from '@/components/system/CoreEntity';

// Lazy load view components for code splitting
const ArtifactPanel = lazy(() => import('../panel3-artifacts/ArtifactPanel'));
const AppletGrid = lazy(() => import('../applets/AppletGrid'));
const SplitViewCanvas = lazy(() => import('../canvas/SplitViewCanvas'));
const ThreeJSCanvas = lazy(() => import('../canvas/ThreeJSCanvas'));
const FloatingJarvis = lazy(() => import('@/components/system/FloatingJarvis'));

// ============================================================================
// TYPES
// ============================================================================

interface ViewManagerProps {
  activeSession: string | null;
  activeVolume: 'system' | 'team' | 'user';
  onArtifactSelect?: (artifactId: string) => void;
  onAppletSelect?: (appletId: string) => void;
}

// ============================================================================
// VIEW COMPONENTS
// ============================================================================

function ViewLoader() {
  return (
    <div className="flex items-center justify-center h-full bg-bg-secondary/30">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
        <span className="text-sm text-fg-muted">Loading view...</span>
      </div>
    </div>
  );
}

// Empty state when no content - Shows the CoreEntity as a standby visual
function EmptyView({ mode }: { mode: ContextViewMode }) {
  const messages: Record<ContextViewMode, { title: string; description: string }> = {
    artifacts: {
      title: 'Projection Stage',
      description: 'Ask me to create something and it will materialize here',
    },
    canvas: {
      title: 'Visual Canvas',
      description: 'Create 3D visualizations by asking the agent',
    },
    applets: {
      title: 'Applet Space',
      description: 'Interactive applications will appear here',
    },
    'code-editor': {
      title: 'Code Editor',
      description: 'Select a file to start editing',
    },
    'split-view': {
      title: 'Split View',
      description: 'Select a file to view code and preview',
    },
    media: {
      title: 'Media Viewer',
      description: 'View images and videos',
    },
  };

  const { title, description } = messages[mode];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center
                    bg-gradient-to-br from-bg-primary/50 via-bg-secondary/30 to-bg-primary/50">
      {/* CoreEntity as the focal point */}
      <div className="relative">
        <CoreEntity size="lg" />
        {/* Subtle glow ring */}
        <div className="absolute inset-0 -m-8 rounded-full
                        bg-gradient-to-r from-accent-primary/5 via-accent-secondary/5 to-accent-primary/5
                        blur-xl animate-pulse" />
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-medium text-fg-primary">{title}</h3>
        <p className="text-sm text-fg-muted max-w-xs">{description}</p>
      </div>

      {/* Suggestion hint */}
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <kbd className="px-2 py-0.5 rounded bg-bg-tertiary border border-border-primary">⌘K</kbd>
        <span>for quick actions</span>
      </div>
    </div>
  );
}

// ============================================================================
// VIEW MANAGER COMPONENT
// ============================================================================

export default function ViewManager({
  activeSession,
  activeVolume,
  onArtifactSelect,
  onAppletSelect,
}: ViewManagerProps) {
  const { state, setContextViewMode } = useWorkspace();
  const { contextViewMode, activeFilePath, activeArtifactId, activeAppletId } = state;
  const { activeApplets } = useApplets();
  const hasActiveApplets = activeApplets.length > 0;

  // Tab configuration
  const tabs: { mode: ContextViewMode; label: string; icon: React.ReactNode; badge?: number }[] = useMemo(() => [
    {
      mode: 'artifacts',
      label: 'Artifacts',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      mode: 'canvas',
      label: 'Canvas',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      mode: 'applets',
      label: 'Applets',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
      badge: activeApplets.length > 0 ? activeApplets.length : undefined,
    },
    {
      mode: 'split-view',
      label: 'Split',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
        </svg>
      ),
    },
  ], [activeApplets.length]);

  // Render the active view
  const renderView = () => {
    switch (contextViewMode) {
      case 'artifacts':
        return (
          <Suspense fallback={<ViewLoader />}>
            <ArtifactPanel
              activeSession={activeSession}
              activeVolume={activeVolume}
            />
          </Suspense>
        );

      case 'canvas':
        return (
          <Suspense fallback={<ViewLoader />}>
            <div className="h-full">
              <ThreeJSCanvas />
            </div>
          </Suspense>
        );

      case 'applets':
        return (
          <Suspense fallback={<ViewLoader />}>
            <AppletGrid />
          </Suspense>
        );

      case 'code-editor':
        if (!activeFilePath) {
          return <EmptyView mode="code-editor" />;
        }
        return (
          <Suspense fallback={<ViewLoader />}>
            <SplitViewCanvas
              volume={activeVolume}
              filePath={activeFilePath}
            />
          </Suspense>
        );

      case 'split-view':
        if (!activeFilePath) {
          return <EmptyView mode="split-view" />;
        }
        return (
          <Suspense fallback={<ViewLoader />}>
            <SplitViewCanvas
              volume={activeVolume}
              filePath={activeFilePath}
            />
          </Suspense>
        );

      default:
        return <EmptyView mode={contextViewMode} />;
    }
  };

  const [isTabBarVisible, setIsTabBarVisible] = useState(false);

  return (
    <div
      className="relative flex flex-col h-full bg-bg-secondary/20 backdrop-blur-sm"
      onMouseEnter={() => setIsTabBarVisible(true)}
      onMouseLeave={() => setIsTabBarVisible(false)}
    >
      {/* Minimal floating tab bar - appears on hover */}
      <div
        className={`absolute top-2 left-1/2 -translate-x-1/2 z-20
                    flex items-center gap-1 px-2 py-1 rounded-full
                    bg-bg-elevated/80 backdrop-blur-xl border border-border-primary/50
                    shadow-lg shadow-black/20
                    transition-all duration-300
                    ${isTabBarVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
      >
        {tabs.map((tab) => (
          <button
            key={tab.mode}
            onClick={() => setContextViewMode(tab.mode)}
            className={`relative flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full transition-all ${
              contextViewMode === tab.mode
                ? 'bg-accent-primary text-white'
                : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-tertiary'
            }`}
            title={tab.label}
          >
            {tab.icon}
            {tab.badge && (
              <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center
                             text-[9px] font-bold rounded-full
                             bg-accent-success text-white shadow-sm">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Glassmorphism container for the view */}
      <div className="flex-1 overflow-hidden m-2 rounded-xl
                      bg-bg-elevated/50 backdrop-blur-md
                      border border-border-primary/30
                      shadow-inner">
        {renderView()}
      </div>

      {/* Standby indicator when content is empty */}
      {contextViewMode === 'artifacts' && !activeArtifactId && (
        <div className="absolute bottom-4 right-4 z-10">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full
                          bg-bg-elevated/80 backdrop-blur-xl border border-border-primary/50
                          text-xs text-fg-muted">
            <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
            <span>Ready for projections</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export { ViewLoader, EmptyView };
