'use client';

/**
 * AppletGrid - Desktop-style applet display
 *
 * Shows applets as:
 * - Icon cards in a grid (like macOS Launchpad or Windows Start)
 * - Click to open/expand an applet
 * - Full view mode for running applets
 * - JARVIS avatar when empty
 */

import React, { useState } from 'react';
import { useApplets } from '@/contexts/AppletContext';
import { AppletViewer } from './AppletViewer';
import { ActiveApplet } from '@/lib/applets/applet-store';
import {
  Code2, Play, X, Sparkles, Grid3X3, Maximize2, Minimize2,
  Calculator, FileText, Clock, Palette, Zap, Box
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Lazy load 3D avatar to avoid SSR issues
const JarvisAvatar = dynamic(
  () => import('@/components/system/JarvisAvatar'),
  { ssr: false }
);

// ============================================================================
// APPLET ICON CARD - Desktop icon style
// ============================================================================

interface AppletIconCardProps {
  applet: ActiveApplet;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  isActive: boolean;
}

function AppletIconCard({ applet, onClick, onClose, isActive }: AppletIconCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Get icon based on applet name/type
  const getAppletIcon = () => {
    const name = applet.metadata.name.toLowerCase();
    if (name.includes('calc')) return <Calculator className="w-8 h-8" />;
    if (name.includes('timer') || name.includes('clock')) return <Clock className="w-8 h-8" />;
    if (name.includes('color') || name.includes('palette')) return <Palette className="w-8 h-8" />;
    if (name.includes('note') || name.includes('text') || name.includes('doc')) return <FileText className="w-8 h-8" />;
    if (name.includes('quantum') || name.includes('circuit')) return <Zap className="w-8 h-8" />;
    if (name.includes('3d') || name.includes('cube')) return <Box className="w-8 h-8" />;
    return <Sparkles className="w-8 h-8" />;
  };

  return (
    <div
      className={`relative group cursor-pointer transition-all duration-200
                 ${isActive ? 'scale-105' : 'hover:scale-105'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {/* Icon Container */}
      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center
                      transition-all duration-200
                      ${isActive
                        ? 'bg-accent-primary/30 ring-2 ring-accent-primary shadow-lg shadow-accent-primary/20'
                        : 'bg-white/10 hover:bg-white/20 border border-white/10'
                      }`}>
        <div className={`${isActive ? 'text-accent-primary' : 'text-fg-secondary group-hover:text-fg-primary'}`}>
          {getAppletIcon()}
        </div>
      </div>

      {/* Close button on hover */}
      {isHovered && (
        <button
          onClick={onClose}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full
                   bg-red-500/80 hover:bg-red-500
                   flex items-center justify-center
                   text-white shadow-lg
                   transition-all duration-150
                   animate-scale-in"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Label */}
      <p className="mt-2 text-[10px] text-center text-fg-secondary
                   truncate w-20 group-hover:text-fg-primary">
        {applet.metadata.name}
      </p>

      {/* Running indicator */}
      {isActive && (
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2
                       w-1.5 h-1.5 rounded-full bg-accent-success animate-pulse" />
      )}
    </div>
  );
}

// ============================================================================
// FULL APPLET VIEW - Expanded applet with flip card
// ============================================================================

interface FullAppletViewProps {
  applet: ActiveApplet;
  onClose: () => void;
  onMinimize: () => void;
  onSubmit: (data: unknown) => void;
  onSave: (state: Record<string, unknown>) => void;
}

function FullAppletView({ applet, onClose, onMinimize, onSubmit, onSave }: FullAppletViewProps) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3
                     border-b border-white/10 bg-bg-secondary/50">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
          <span className="font-medium text-fg-primary">
            {applet.metadata.name}
          </span>
          {applet.metadata.version && (
            <span className="text-[10px] text-fg-muted px-1.5 py-0.5 rounded bg-white/5">
              v{applet.metadata.version}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCode(!showCode)}
            className={`p-1.5 rounded-lg transition-colors ${
              showCode
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'text-fg-muted hover:text-fg-primary hover:bg-white/10'
            }`}
            title={showCode ? 'View UI' : 'View Code'}
          >
            {showCode ? <Play className="w-4 h-4" /> : <Code2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onMinimize}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg-primary
                      hover:bg-white/10 transition-colors"
            title="Back to Grid"
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-muted hover:text-red-400
                      hover:bg-red-500/10 transition-colors"
            title="Close Applet"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {showCode ? (
          <div className="h-full overflow-auto p-4 bg-bg-primary/50">
            <pre className="text-xs font-mono text-fg-secondary whitespace-pre-wrap">
              <code>{applet.code}</code>
            </pre>
          </div>
        ) : (
          <AppletViewer
            code={applet.code}
            metadata={applet.metadata}
            initialState={applet.state}
            onSubmit={onSubmit}
            onClose={onClose}
            onSave={onSave}
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// EMPTY STATE - Desktop with JARVIS
// ============================================================================

interface EmptyDesktopProps {
  customMessage?: string;
}

function EmptyDesktop({ customMessage }: EmptyDesktopProps) {
  const suggestions = [
    { icon: <Calculator className="w-5 h-5" />, label: 'Calculator' },
    { icon: <Clock className="w-5 h-5" />, label: 'Timer' },
    { icon: <Palette className="w-5 h-5" />, label: 'Color Picker' },
    { icon: <FileText className="w-5 h-5" />, label: 'Notes' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* JARVIS Avatar - Main presence */}
      <div className="flex-1 min-h-[250px] relative">
        <JarvisAvatar showLabel={false} />

        {/* Floating suggestion bubble */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2
                       px-4 py-2 rounded-xl
                       bg-bg-elevated/80 backdrop-blur-xl
                       border border-white/10 shadow-lg">
          <p className="text-sm text-fg-secondary text-center">
            {customMessage || 'Ask me to build something!'}
          </p>
        </div>
      </div>

      {/* Quick Launch Grid */}
      <div className="p-6 bg-gradient-to-t from-bg-primary via-bg-primary/80 to-transparent">
        <p className="text-[10px] text-fg-muted uppercase tracking-wider mb-4 text-center">
          Quick Create
        </p>
        <div className="flex justify-center gap-4">
          {suggestions.map((item) => (
            <button
              key={item.label}
              className="flex flex-col items-center gap-2 p-3 rounded-xl
                        bg-white/5 border border-white/10
                        hover:bg-white/10 hover:border-accent-primary/30
                        transition-all duration-200 group"
            >
              <div className="text-fg-muted group-hover:text-accent-primary transition-colors">
                {item.icon}
              </div>
              <span className="text-[10px] text-fg-tertiary group-hover:text-fg-secondary">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DESKTOP GRID VIEW - Multiple applet icons
// ============================================================================

interface DesktopGridProps {
  applets: ActiveApplet[];
  currentAppletId: string | null;
  onAppletClick: (id: string) => void;
  onAppletClose: (id: string) => void;
}

function DesktopGrid({ applets, currentAppletId, onAppletClick, onAppletClose }: DesktopGridProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Grid Header */}
      <div className="px-4 py-3 border-b border-white/10 bg-bg-secondary/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-4 h-4 text-fg-muted" />
            <span className="text-xs font-medium text-fg-secondary">
              Active Applets
            </span>
            <span className="px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary text-[10px]">
              {applets.length}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of applet icons */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-3 gap-6 justify-items-center">
          {applets.map((applet) => (
            <AppletIconCard
              key={applet.id}
              applet={applet}
              isActive={applet.id === currentAppletId}
              onClick={() => onAppletClick(applet.id)}
              onClose={(e) => {
                e.stopPropagation();
                onAppletClose(applet.id);
              }}
            />
          ))}
        </div>
      </div>

      {/* Hint */}
      <div className="p-4 border-t border-white/10 bg-bg-secondary/30">
        <p className="text-[10px] text-fg-muted text-center">
          Click an applet to open • Ask JARVIS to create more
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APPLET GRID COMPONENT
// ============================================================================

type ViewMode = 'grid' | 'full';

interface AppletGridProps {
  className?: string;
  showEmptyState?: boolean;
  emptyMessage?: string;
}

export default function AppletGrid({ className = '', showEmptyState = false, emptyMessage }: AppletGridProps) {
  const {
    activeApplets,
    currentApplet,
    closeApplet,
    focusApplet,
    handleAppletSubmit,
    updateAppletState,
    closeAllApplets,
  } = useApplets();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedAppletId, setSelectedAppletId] = useState<string | null>(null);

  // Get the applet to display in full view
  const fullViewApplet = selectedAppletId
    ? activeApplets.find(a => a.id === selectedAppletId)
    : currentApplet;

  const handleAppletClick = (id: string) => {
    focusApplet(id);
    setSelectedAppletId(id);
    setViewMode('full');
  };

  const handleMinimize = () => {
    setViewMode('grid');
    setSelectedAppletId(null);
  };

  const handleSubmit = (appletId: string) => (data: unknown) => {
    handleAppletSubmit(appletId, data);
  };

  const handleSave = (appletId: string) => (state: Record<string, unknown>) => {
    updateAppletState(appletId, state);
  };

  const handleClose = (appletId: string) => {
    closeApplet(appletId);
    if (selectedAppletId === appletId) {
      setSelectedAppletId(null);
      if (activeApplets.length <= 1) {
        setViewMode('grid');
      }
    }
  };

  // No applets - show empty desktop with JARVIS
  if (activeApplets.length === 0 || showEmptyState) {
    return (
      <div className={`h-full ${className}`}>
        <EmptyDesktop customMessage={emptyMessage} />
      </div>
    );
  }

  // Full view mode - show single applet expanded
  if (viewMode === 'full' && fullViewApplet) {
    return (
      <div className={`h-full ${className}`}>
        <FullAppletView
          applet={fullViewApplet}
          onClose={() => handleClose(fullViewApplet.id)}
          onMinimize={handleMinimize}
          onSubmit={handleSubmit(fullViewApplet.id)}
          onSave={handleSave(fullViewApplet.id)}
        />
      </div>
    );
  }

  // Grid view - show all applets as icons
  return (
    <div className={`h-full ${className}`}>
      <DesktopGrid
        applets={activeApplets}
        currentAppletId={currentApplet?.id || null}
        onAppletClick={handleAppletClick}
        onAppletClose={handleClose}
      />
    </div>
  );
}

// Animation styles
const styles = `
  @keyframes scale-in {
    from {
      transform: scale(0);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .animate-scale-in {
    animation: scale-in 0.15s ease-out;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
