'use client';

/**
 * AppletGrid - Desktop-style applet display
 *
 * Shows applets as:
 * - Icon cards in a grid (like macOS Launchpad or Windows Start)
 * - Click to open/expand an applet
 * - Full view mode for running applets
 * - Organized desktop with regions when empty
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useApplets } from '@/contexts/AppletContext';
import { ActiveApplet } from '@/lib/applets/applet-store';
import {
  DesktopAppletManager,
  DesktopApplet,
} from '@/lib/applets/desktop-applet-manager';
import {
  Grid3X3, Sparkles,
  Calculator, FileText, Clock, Palette,
  Atom, Workflow, Boxes, Box, CircuitBoard
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Import extracted components
import { AppletIconCard } from './AppletIconCard';
import { FullAppletView } from './FullAppletView';
import { SYSTEM_APPLETS, SystemAppletType } from './system-applets';
import OrganizedDesktop from './OrganizedDesktop';

// Lazy load 3D avatar to avoid SSR issues
const JarvisAvatar = dynamic(
  () => import('@/components/system/JarvisAvatar'),
  { ssr: false }
);

// ============================================================================
// EMPTY STATE - Desktop with JARVIS
// ============================================================================

interface EmptyDesktopProps {
  customMessage?: string;
  onLaunchApplet?: (type: SystemAppletType) => void;
  recentApplets?: { id: string; name: string; description?: string }[];
  onOpenRecent?: (id: string) => void;
}

interface AppletItem {
  icon: React.ReactNode;
  label: string;
  type: SystemAppletType;
}

interface AppletCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  applets: AppletItem[];
}

function EmptyDesktop({ customMessage, onLaunchApplet, recentApplets = [], onOpenRecent }: EmptyDesktopProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const appletCategories: AppletCategory[] = [
    {
      id: 'utilities',
      label: 'Utilities',
      icon: <Calculator className="w-4 h-4" />,
      color: 'from-blue-500 to-cyan-500',
      applets: [
        { icon: <Calculator className="w-5 h-5" />, label: 'Calculator', type: 'calculator' },
        { icon: <Clock className="w-5 h-5" />, label: 'Timer', type: 'timer' },
        { icon: <Palette className="w-5 h-5" />, label: 'Color Picker', type: 'colorPicker' },
        { icon: <FileText className="w-5 h-5" />, label: 'Notes', type: 'notes' },
      ],
    },
    {
      id: 'quantum',
      label: 'Quantum',
      icon: <Atom className="w-4 h-4" />,
      color: 'from-purple-500 to-pink-500',
      applets: [
        { icon: <CircuitBoard className="w-5 h-5" />, label: 'Quantum Circuit', type: 'quantumCircuit' },
      ],
    },
    {
      id: 'visualization',
      label: '3D & Visual',
      icon: <Boxes className="w-4 h-4" />,
      color: 'from-green-500 to-emerald-500',
      applets: [
        { icon: <Box className="w-5 h-5" />, label: '3D Scene', type: 'scene3D' },
      ],
    },
    {
      id: 'automation',
      label: 'Automation',
      icon: <Workflow className="w-4 h-4" />,
      color: 'from-orange-500 to-amber-500',
      applets: [
        { icon: <Workflow className="w-5 h-5" />, label: 'Workflow', type: 'workflowBuilder' },
      ],
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* JARVIS Avatar - Main presence */}
      <div className="flex-1 min-h-[180px] relative">
        <JarvisAvatar showLabel={false} />

        {/* Floating suggestion bubble */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2
                       px-4 py-2 rounded-xl
                       bg-bg-elevated/80 backdrop-blur-xl
                       border border-white/10 shadow-lg">
          <p className="text-sm text-fg-secondary text-center">
            {customMessage || 'Ask me to build anything - or launch a system app below!'}
          </p>
        </div>
      </div>

      {/* Bottom Section - System Apps & Recent */}
      <div className="flex-shrink-0 bg-gradient-to-t from-bg-primary via-bg-primary/80 to-transparent pb-4">
        {/* Category Pills */}
        <div className="px-6 pt-4 pb-3">
          <div className="flex justify-center gap-2 flex-wrap">
            {appletCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium
                           transition-all duration-200 ${
                  activeCategory === cat.id
                    ? `bg-gradient-to-r ${cat.color} text-white shadow-lg`
                    : 'bg-white/5 text-fg-secondary hover:bg-white/10 border border-white/10'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Applet Grid - Show active category or all */}
        <div className="px-6 pb-2">
          <div className="flex justify-center gap-3 flex-wrap">
            {(activeCategory
              ? appletCategories.find(c => c.id === activeCategory)?.applets || []
              : appletCategories.flatMap(c => c.applets.slice(0, 1))
            ).map((item) => (
              <button
                key={item.label}
                onClick={() => onLaunchApplet?.(item.type)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl
                          bg-white/5 border border-white/10
                          hover:bg-white/10 hover:border-accent-primary/30
                          transition-all duration-200 group
                          hover:scale-105 active:scale-95 min-w-[70px]"
              >
                <div className="text-fg-muted group-hover:text-accent-primary transition-colors">
                  {item.icon}
                </div>
                <span className="text-[10px] text-fg-tertiary group-hover:text-fg-secondary text-center">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent User/Team Applets */}
        {recentApplets.length > 0 && (
          <div className="px-6 pb-4 pt-2 border-t border-white/5 mt-2">
            <p className="text-[10px] text-fg-muted uppercase tracking-wider mb-3 text-center">
              Recent Applets
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {recentApplets.slice(0, 6).map((applet) => (
                <button
                  key={applet.id}
                  onClick={() => onOpenRecent?.(applet.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg
                            bg-white/5 border border-white/10
                            hover:bg-accent-primary/10 hover:border-accent-primary/30
                            transition-all duration-200 group"
                >
                  <Sparkles className="w-4 h-4 text-accent-primary" />
                  <span className="text-xs text-fg-secondary group-hover:text-fg-primary truncate max-w-[120px]">
                    {applet.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
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
          Click an applet to open - Ask JARVIS to create more
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
    updateAppletCode,
    createApplet,
    recentApplets,
  } = useApplets();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedAppletId, setSelectedAppletId] = useState<string | null>(null);

  const fullViewApplet = selectedAppletId
    ? activeApplets.find(a => a.id === selectedAppletId)
    : currentApplet;

  const handleLaunchSystemApplet = (type: SystemAppletType) => {
    const appletDef = SYSTEM_APPLETS[type];
    if (!appletDef) return;

    const applet = createApplet({
      code: appletDef.code,
      metadata: {
        id: `system-${type}-${Date.now()}`,
        name: appletDef.name,
        description: appletDef.description,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: ['system', type],
      },
      volume: 'system',
    });

    setSelectedAppletId(applet.id);
    setViewMode('full');
  };

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

  const handleCodeUpdate = (appletId: string) => (code: string) => {
    updateAppletCode(appletId, code);
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

  const handleOpenRecentApplet = (appletId: string) => {
    const existingApplet = activeApplets.find(a => a.metadata.id === appletId);
    if (existingApplet) {
      focusApplet(existingApplet.id);
      setSelectedAppletId(existingApplet.id);
      setViewMode('full');
    }
  };

  // Handle opening applet from organized desktop
  const handleOpenDesktopApplet = useCallback(async (desktopApplet: DesktopApplet) => {
    console.log('[AppletGrid] Opening desktop applet:', desktopApplet.id, desktopApplet.filePath);
    console.log('[AppletGrid] Active applets:', activeApplets.map(a => ({ id: a.id, metaId: a.metadata.id, filePath: a.filePath })));

    // Check if already active - match by filePath, metadata.id, or top-level id
    const existingApplet = activeApplets.find(
      a => a.filePath === desktopApplet.filePath ||
           a.metadata.id === desktopApplet.id ||
           a.id === desktopApplet.id
    );

    if (existingApplet) {
      console.log('[AppletGrid] Found existing applet, opening:', existingApplet.id);
      focusApplet(existingApplet.id);
      setSelectedAppletId(existingApplet.id);
      setViewMode('full');
      return;
    }

    console.log('[AppletGrid] Applet not in active list, loading from VFS:', desktopApplet.filePath);

    // Load applet code from VFS
    try {
      const { getVFS } = await import('@/lib/virtual-fs');
      const vfs = getVFS();
      const file = vfs.readFile(desktopApplet.filePath);

      if (!file || !file.content) {
        console.error('Failed to load applet code from:', desktopApplet.filePath);
        return;
      }

      const applet = createApplet({
        code: file.content,
        metadata: {
          id: desktopApplet.id,
          name: desktopApplet.name,
          description: desktopApplet.description || '',
          version: '1.0.0',
          createdAt: desktopApplet.createdAt,
          updatedAt: new Date().toISOString(),
          tags: [desktopApplet.volume],
        },
        filePath: desktopApplet.filePath,
        volume: desktopApplet.volume,
      });

      setSelectedAppletId(applet.id);
      setViewMode('full');
    } catch (error) {
      console.error('Failed to open desktop applet:', error);
    }
  }, [activeApplets, createApplet, focusApplet]);

  // No applets - show organized desktop with regions
  if (activeApplets.length === 0 || showEmptyState) {
    return (
      <div className={`h-full ${className}`}>
        <OrganizedDesktop
          onLaunchApplet={handleLaunchSystemApplet}
          onOpenApplet={handleOpenDesktopApplet}
        />
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
          onCodeUpdate={handleCodeUpdate(fullViewApplet.id)}
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
    from { transform: scale(0); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .animate-scale-in { animation: scale-in 0.15s ease-out; }
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
