'use client';

import { useState, useEffect, Suspense, lazy } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useApplets } from '@/contexts/AppletContext';
import CoreEntity from '@/components/system/CoreEntity';

// Lazy load heavy components
const ArtifactPanel = lazy(() => import('@/components/panel3-artifacts/ArtifactPanel'));
const ThreeJSCanvas = lazy(() => import('@/components/canvas/ThreeJSCanvas'));
const AppletPanel = lazy(() => import('@/components/applets/AppletPanel'));
const SplitViewCanvas = lazy(() => import('@/components/canvas/SplitViewCanvas'));

// ============================================================================
// TYPES
// ============================================================================

type ProjectionType = 'empty' | 'artifact' | 'canvas' | 'applet' | 'split';

interface Projection {
  type: ProjectionType;
  id?: string;
  path?: string;
}

// ============================================================================
// LOADING STATE
// ============================================================================

function ProjectionLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-accent-primary/20 border-t-accent-primary rounded-full animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 bg-accent-primary/20 rounded-full animate-pulse" />
        </div>
      </div>
      <p className="text-sm text-fg-muted animate-pulse">Materializing projection...</p>
    </div>
  );
}

// ============================================================================
// EMPTY STATE - The "Standby" mode with Core Entity
// ============================================================================

function EmptyStage() {
  const { state } = useWorkspace();
  const isActive = state.agentState !== 'idle';

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      {/* Core Entity - the AI's presence */}
      <div className="relative">
        <CoreEntity size="lg" />

        {/* Subtle pulse ring when active */}
        {isActive && (
          <div className="absolute inset-0 -m-4 rounded-full border-2 border-accent-primary/30 animate-ping" />
        )}
      </div>

      {/* Status text */}
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium text-fg-primary">
          {isActive ? 'Processing...' : 'Awaiting Command'}
        </h3>
        <p className="text-sm text-fg-muted max-w-xs">
          {isActive
            ? 'The projection will materialize here when ready.'
            : 'Ask me to create something and it will appear here.'}
        </p>
      </div>

      {/* Suggestion chips */}
      {!isActive && (
        <div className="flex flex-wrap gap-2 justify-center mt-4">
          {['Create a calculator', 'Show me the code', 'Visualize data'].map((suggestion) => (
            <button
              key={suggestion}
              className="px-3 py-1.5 text-xs rounded-full
                         bg-bg-tertiary/50 border border-border-primary/50
                         text-fg-secondary hover:text-fg-primary
                         hover:bg-bg-tertiary hover:border-accent-primary/30
                         transition-all duration-200"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PROJECTION CARD - Flippable card container
// ============================================================================

interface ProjectionCardProps {
  children: React.ReactNode;
  isFlipped?: boolean;
  onFlip?: () => void;
  backContent?: React.ReactNode;
  title?: string;
}

function ProjectionCard({
  children,
  isFlipped = false,
  onFlip,
  backContent,
  title,
}: ProjectionCardProps) {
  return (
    <div className="relative w-full h-full perspective-1000">
      {/* Card container with 3D flip */}
      <div
        className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${
          isFlipped ? 'rotate-y-180' : ''
        }`}
      >
        {/* Front face - The projection */}
        <div className="absolute inset-0 backface-hidden">
          <div className="relative w-full h-full rounded-xl overflow-hidden
                          bg-bg-elevated/80 backdrop-blur-xl
                          border border-border-primary/50
                          shadow-xl shadow-black/20">
            {/* Header bar */}
            {title && (
              <div className="flex items-center justify-between px-4 py-2
                              border-b border-border-primary/50 bg-bg-secondary/50">
                <span className="text-sm font-medium text-fg-primary">{title}</span>
                {onFlip && backContent && (
                  <button
                    onClick={onFlip}
                    className="p-1.5 rounded-md text-fg-muted hover:text-fg-primary
                               hover:bg-bg-tertiary transition-colors"
                    title="View source code"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className="h-full overflow-auto">
              {children}
            </div>
          </div>
        </div>

        {/* Back face - The code/artifact */}
        {backContent && (
          <div className="absolute inset-0 backface-hidden rotate-y-180">
            <div className="relative w-full h-full rounded-xl overflow-hidden
                            bg-bg-elevated/80 backdrop-blur-xl
                            border border-border-primary/50
                            shadow-xl shadow-black/20">
              {/* Header bar */}
              <div className="flex items-center justify-between px-4 py-2
                              border-b border-border-primary/50 bg-bg-secondary/50">
                <span className="text-sm font-medium text-fg-primary">Source Code</span>
                <button
                  onClick={onFlip}
                  className="p-1.5 rounded-md text-fg-muted hover:text-fg-primary
                             hover:bg-bg-tertiary transition-colors"
                  title="View projection"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="h-full overflow-auto">
                {backContent}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inline styles for 3D transforms */}
      <style jsx>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT - ProjectionStage
// ============================================================================

interface ProjectionStageProps {
  activeSession: string | null;
  activeVolume: 'system' | 'team' | 'user';
}

export default function ProjectionStage({
  activeSession,
  activeVolume,
}: ProjectionStageProps) {
  const { state } = useWorkspace();
  const { activeApplets } = useApplets();

  const [isFlipped, setIsFlipped] = useState(false);
  const [projection, setProjection] = useState<Projection>({ type: 'empty' });

  // Determine current projection based on context
  useEffect(() => {
    // Priority: Active applet > Active file > Canvas > Empty
    if (activeApplets.length > 0) {
      setProjection({ type: 'applet', id: activeApplets[0].id });
    } else if (state.activeFilePath) {
      // Check file type
      const ext = state.activeFilePath.split('.').pop()?.toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) {
        setProjection({ type: 'canvas', path: state.activeFilePath });
      } else {
        setProjection({ type: 'split', path: state.activeFilePath });
      }
    } else if (state.contextViewMode === 'canvas') {
      setProjection({ type: 'canvas' });
    } else if (state.contextViewMode === 'artifacts') {
      setProjection({ type: 'artifact' });
    } else {
      setProjection({ type: 'empty' });
    }
  }, [activeApplets, state.activeFilePath, state.contextViewMode]);

  // Reset flip when projection changes
  useEffect(() => {
    setIsFlipped(false);
  }, [projection.type, projection.id, projection.path]);

  // Render projection content
  const renderProjection = () => {
    switch (projection.type) {
      case 'applet':
        return (
          <Suspense fallback={<ProjectionLoader />}>
            <AppletPanel mode="split" />
          </Suspense>
        );

      case 'canvas':
        return (
          <Suspense fallback={<ProjectionLoader />}>
            <ThreeJSCanvas />
          </Suspense>
        );

      case 'split':
        return (
          <Suspense fallback={<ProjectionLoader />}>
            <SplitViewCanvas
              volume={activeVolume}
              filePath={projection.path || ''}
            />
          </Suspense>
        );

      case 'artifact':
        return (
          <Suspense fallback={<ProjectionLoader />}>
            <ArtifactPanel
              activeSession={activeSession}
              activeVolume={activeVolume}
            />
          </Suspense>
        );

      case 'empty':
      default:
        return <EmptyStage />;
    }
  };

  // Get projection title
  const getTitle = () => {
    switch (projection.type) {
      case 'applet':
        return activeApplets.find(a => a.id === projection.id)?.metadata?.name || 'Applet';
      case 'canvas':
        return 'Visual Canvas';
      case 'split':
        return projection.path?.split('/').pop() || 'Code Editor';
      case 'artifact':
        return 'Artifacts';
      default:
        return undefined;
    }
  };

  // For empty state, don't use the card wrapper
  if (projection.type === 'empty') {
    return (
      <div className="h-full w-full flex items-center justify-center
                      bg-gradient-to-br from-bg-primary via-bg-secondary to-bg-primary">
        <EmptyStage />
      </div>
    );
  }

  return (
    <div className="h-full w-full p-4">
      <ProjectionCard
        title={getTitle()}
        isFlipped={isFlipped}
        onFlip={() => setIsFlipped(!isFlipped)}
        backContent={
          projection.type === 'applet' ? (
            <Suspense fallback={<ProjectionLoader />}>
              <ArtifactPanel
                activeSession={activeSession}
                activeVolume={activeVolume}
              />
            </Suspense>
          ) : undefined
        }
      >
        {renderProjection()}
      </ProjectionCard>
    </div>
  );
}
