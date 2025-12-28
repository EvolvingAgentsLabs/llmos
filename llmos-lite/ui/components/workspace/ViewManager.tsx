'use client';

import { useMemo, Suspense, lazy } from 'react';
import { useWorkspace, ContextViewMode } from '@/contexts/WorkspaceContext';

// Lazy load view components for code splitting
const ArtifactPanel = lazy(() => import('../panel3-artifacts/ArtifactPanel'));
const AppletPanel = lazy(() => import('../applets/AppletPanel'));
const SplitViewCanvas = lazy(() => import('../canvas/SplitViewCanvas'));
const ThreeJSCanvas = lazy(() => import('../canvas/ThreeJSCanvas'));

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

// Empty state when no content
function EmptyView({ mode }: { mode: ContextViewMode }) {
  const messages: Record<ContextViewMode, { title: string; description: string; icon: React.ReactNode }> = {
    artifacts: {
      title: 'No Artifacts',
      description: 'Artifacts created during your session will appear here',
      icon: (
        <svg className="w-12 h-12 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    canvas: {
      title: 'Canvas Ready',
      description: 'Create 3D visualizations by asking the agent',
      icon: (
        <svg className="w-12 h-12 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    applets: {
      title: 'No Applets',
      description: 'Generated applets will appear here',
      icon: (
        <svg className="w-12 h-12 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    'code-editor': {
      title: 'Code Editor',
      description: 'Select a file to start editing',
      icon: (
        <svg className="w-12 h-12 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
    },
    'split-view': {
      title: 'Split View',
      description: 'Select a file to view code and preview side by side',
      icon: (
        <svg className="w-12 h-12 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      ),
    },
  };

  const { title, description, icon } = messages[mode];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
      {icon}
      <div>
        <h3 className="text-lg font-medium text-fg-primary">{title}</h3>
        <p className="text-sm text-fg-secondary mt-1">{description}</p>
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

  // Tab configuration
  const tabs: { mode: ContextViewMode; label: string; icon: React.ReactNode }[] = useMemo(() => [
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
  ], []);

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
            <AppletPanel mode="split" />
          </Suspense>
        );

      case 'code-editor':
        if (!activeFilePath) {
          return <EmptyView mode="code-editor" />;
        }
        return (
          <Suspense fallback={<ViewLoader />}>
            <SplitViewCanvas />
          </Suspense>
        );

      case 'split-view':
        if (!activeFilePath) {
          return <EmptyView mode="split-view" />;
        }
        return (
          <Suspense fallback={<ViewLoader />}>
            <SplitViewCanvas />
          </Suspense>
        );

      default:
        return <EmptyView mode={contextViewMode} />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-secondary/30">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-primary bg-bg-secondary/50">
        {tabs.map((tab) => (
          <button
            key={tab.mode}
            onClick={() => setContextViewMode(tab.mode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              contextViewMode === tab.mode
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-tertiary'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* View actions */}
        <button
          className="p-1.5 text-fg-muted hover:text-fg-primary hover:bg-bg-tertiary rounded-md transition-colors"
          title="Maximize panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      {/* Active view */}
      <div className="flex-1 overflow-hidden">
        {renderView()}
      </div>
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export { ViewLoader, EmptyView };
