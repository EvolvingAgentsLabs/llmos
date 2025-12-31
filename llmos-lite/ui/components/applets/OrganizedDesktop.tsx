'use client';

/**
 * OrganizedDesktop - Desktop with regions for System, Team, and Personal applets
 *
 * Displays applets organized by their origin:
 * - System: Built-in system applets
 * - Team: Shared team applets
 * - Personal: User's personal applets from projects
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  DesktopAppletManager,
  DesktopApplet,
  DesktopRegions,
} from '@/lib/applets/desktop-applet-manager';
import { useApplets } from '@/contexts/AppletContext';
import { SYSTEM_APPLETS, SystemAppletType } from './system-applets';
import {
  Grid3X3,
  Sparkles,
  Server,
  Users,
  User,
  Play,
  X,
  Cpu,
  Calculator,
  Clock,
  Palette,
  FileText,
  Atom,
  Workflow,
  Box,
  CircuitBoard,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Lazy load 3D avatar to avoid SSR issues
const JarvisAvatar = dynamic(
  () => import('@/components/system/JarvisAvatar'),
  { ssr: false }
);

// Icon mapping for applets
const APPLET_ICONS: Record<string, React.ReactNode> = {
  calculator: <Calculator className="w-5 h-5" />,
  timer: <Clock className="w-5 h-5" />,
  colorPicker: <Palette className="w-5 h-5" />,
  notes: <FileText className="w-5 h-5" />,
  quantumCircuit: <Atom className="w-5 h-5" />,
  scene3D: <Box className="w-5 h-5" />,
  workflowBuilder: <Workflow className="w-5 h-5" />,
  default: <Cpu className="w-5 h-5" />,
};

interface RegionProps {
  title: string;
  icon: React.ReactNode;
  applets: DesktopApplet[];
  color: string;
  isExpanded: boolean;
  onToggle: () => void;
  onAppletClick: (applet: DesktopApplet) => void;
  onAppletRemove: (applet: DesktopApplet) => void;
  emptyMessage: string;
}

function DesktopRegion({
  title,
  icon,
  applets,
  color,
  isExpanded,
  onToggle,
  onAppletClick,
  onAppletRemove,
  emptyMessage,
}: RegionProps) {
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden bg-bg-secondary/30">
      {/* Region Header */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors ${color}`}
      >
        <div className="flex items-center gap-2 flex-1">
          {icon}
          <span className="text-xs font-semibold text-fg-secondary">{title}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-fg-tertiary">
            {applets.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-fg-tertiary" />
        ) : (
          <ChevronRight className="w-4 h-4 text-fg-tertiary" />
        )}
      </button>

      {/* Region Content */}
      {isExpanded && (
        <div className="p-3 border-t border-white/5">
          {applets.length === 0 ? (
            <p className="text-xs text-fg-tertiary text-center py-4">{emptyMessage}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {applets.map((applet) => (
                <div
                  key={applet.id}
                  className="relative group flex flex-col items-center gap-2 p-3 rounded-lg
                            bg-white/5 border border-white/10
                            hover:bg-white/10 hover:border-accent-primary/30
                            transition-all duration-200 cursor-pointer"
                  onClick={() => onAppletClick(applet)}
                >
                  {/* Remove button */}
                  <button
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100
                              w-5 h-5 rounded-full bg-red-500/20 hover:bg-red-500/40
                              flex items-center justify-center transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppletRemove(applet);
                    }}
                    title="Remove from desktop"
                  >
                    <X className="w-3 h-3 text-red-400" />
                  </button>

                  {/* Active indicator */}
                  {applet.isActive && (
                    <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  )}

                  {/* Icon */}
                  <div className="text-fg-muted group-hover:text-accent-primary transition-colors">
                    {APPLET_ICONS[applet.icon || ''] || APPLET_ICONS.default}
                  </div>

                  {/* Name */}
                  <span className="text-[10px] text-fg-tertiary group-hover:text-fg-secondary text-center truncate w-full">
                    {applet.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SystemAppletsProps {
  onLaunchApplet: (type: SystemAppletType) => void;
}

function SystemAppletsPicker({ onLaunchApplet }: SystemAppletsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const systemAppletItems = [
    { type: 'calculator' as SystemAppletType, icon: <Calculator className="w-4 h-4" />, label: 'Calculator' },
    { type: 'timer' as SystemAppletType, icon: <Clock className="w-4 h-4" />, label: 'Timer' },
    { type: 'colorPicker' as SystemAppletType, icon: <Palette className="w-4 h-4" />, label: 'Colors' },
    { type: 'notes' as SystemAppletType, icon: <FileText className="w-4 h-4" />, label: 'Notes' },
    { type: 'quantumCircuit' as SystemAppletType, icon: <CircuitBoard className="w-4 h-4" />, label: 'Quantum' },
    { type: 'scene3D' as SystemAppletType, icon: <Box className="w-4 h-4" />, label: '3D Scene' },
    { type: 'workflowBuilder' as SystemAppletType, icon: <Workflow className="w-4 h-4" />, label: 'Workflow' },
  ];

  return (
    <div className="px-4 pb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-center gap-2 py-2 text-xs text-fg-tertiary hover:text-fg-secondary transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        <span>Launch System Applet</span>
        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {isExpanded && (
        <div className="flex justify-center gap-2 flex-wrap mt-2 animate-fade-in">
          {systemAppletItems.map((item) => (
            <button
              key={item.type}
              onClick={() => onLaunchApplet(item.type)}
              className="flex flex-col items-center gap-1 p-2 rounded-lg
                        bg-white/5 border border-white/10
                        hover:bg-white/10 hover:border-accent-primary/30
                        transition-all duration-200 min-w-[60px]"
              title={item.label}
            >
              <div className="text-fg-muted">{item.icon}</div>
              <span className="text-[9px] text-fg-tertiary">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface OrganizedDesktopProps {
  onLaunchApplet?: (type: SystemAppletType) => void;
  onOpenApplet?: (applet: DesktopApplet) => void;
}

export default function OrganizedDesktop({ onLaunchApplet, onOpenApplet }: OrganizedDesktopProps) {
  const { createApplet, activeApplets } = useApplets();
  const [regions, setRegions] = useState<DesktopRegions>({
    system: [],
    team: [],
    personal: [],
  });
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({
    system: true,
    team: true,
    personal: true,
  });

  // Sync with DesktopAppletManager
  useEffect(() => {
    const updateRegions = () => {
      setRegions(DesktopAppletManager.getAllRegions());
    };

    updateRegions();

    const unsubscribe = DesktopAppletManager.on('regions:changed', updateRegions);
    return () => unsubscribe();
  }, []);

  // Update active status when activeApplets changes
  useEffect(() => {
    activeApplets.forEach((applet) => {
      if (applet.filePath) {
        const desktopApplet = DesktopAppletManager.findAppletByPath(applet.filePath);
        if (desktopApplet) {
          DesktopAppletManager.setAppletActive(desktopApplet.id, true);
        }
      }
    });

    // Mark inactive applets
    const activeFilePaths = new Set(activeApplets.map(a => a.filePath).filter(Boolean));
    const allRegions = DesktopAppletManager.getAllRegions();

    ['system', 'team', 'personal'].forEach((regionKey) => {
      const regionApplets = allRegions[regionKey as keyof DesktopRegions];
      regionApplets.forEach((applet) => {
        if (!activeFilePaths.has(applet.filePath)) {
          DesktopAppletManager.setAppletActive(applet.id, false);
        }
      });
    });
  }, [activeApplets]);

  const handleToggleRegion = (region: string) => {
    setExpandedRegions((prev) => ({
      ...prev,
      [region]: !prev[region],
    }));
  };

  const handleLaunchSystemApplet = useCallback((type: SystemAppletType) => {
    if (onLaunchApplet) {
      onLaunchApplet(type);
    } else {
      const appletDef = SYSTEM_APPLETS[type];
      if (!appletDef) return;

      createApplet({
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
    }
  }, [onLaunchApplet, createApplet]);

  const handleAppletClick = useCallback((applet: DesktopApplet) => {
    if (onOpenApplet) {
      onOpenApplet(applet);
    }
  }, [onOpenApplet]);

  const handleAppletRemove = useCallback((applet: DesktopApplet) => {
    DesktopAppletManager.removeApplet(applet.id, applet.volume);
  }, []);

  const totalApplets = regions.system.length + regions.team.length + regions.personal.length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* JARVIS Avatar - Compact */}
      <div className="flex-shrink-0 h-[140px] relative">
        <JarvisAvatar showLabel={false} />
      </div>

      {/* Desktop Regions */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* System Applets Region */}
        <DesktopRegion
          title="System Applets"
          icon={<Server className="w-4 h-4 text-blue-400" />}
          applets={regions.system}
          color="border-l-2 border-l-blue-500"
          isExpanded={expandedRegions.system}
          onToggle={() => handleToggleRegion('system')}
          onAppletClick={handleAppletClick}
          onAppletRemove={handleAppletRemove}
          emptyMessage="No system applets pinned"
        />

        {/* Team Applets Region */}
        <DesktopRegion
          title="Team Applets"
          icon={<Users className="w-4 h-4 text-purple-400" />}
          applets={regions.team}
          color="border-l-2 border-l-purple-500"
          isExpanded={expandedRegions.team}
          onToggle={() => handleToggleRegion('team')}
          onAppletClick={handleAppletClick}
          onAppletRemove={handleAppletRemove}
          emptyMessage="No team applets shared"
        />

        {/* Personal Applets Region */}
        <DesktopRegion
          title="Personal Applets"
          icon={<User className="w-4 h-4 text-green-400" />}
          applets={regions.personal}
          color="border-l-2 border-l-green-500"
          isExpanded={expandedRegions.personal}
          onToggle={() => handleToggleRegion('personal')}
          onAppletClick={handleAppletClick}
          onAppletRemove={handleAppletRemove}
          emptyMessage="Create applets in your projects - they'll appear here!"
        />
      </div>

      {/* System Applets Launcher */}
      <div className="flex-shrink-0 border-t border-white/5 bg-gradient-to-t from-bg-primary to-transparent">
        <SystemAppletsPicker onLaunchApplet={handleLaunchSystemApplet} />
      </div>

      {/* Footer Stats */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-white/10 bg-bg-secondary/30">
        <div className="flex items-center justify-center gap-4 text-[10px] text-fg-tertiary">
          <span className="flex items-center gap-1">
            <Grid3X3 className="w-3 h-3" />
            {totalApplets} applets
          </span>
          <span>|</span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            {activeApplets.length} active
          </span>
        </div>
      </div>
    </div>
  );
}
