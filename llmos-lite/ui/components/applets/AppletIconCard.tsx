'use client';

/**
 * AppletIconCard - Desktop icon style for applets
 */

import React, { useState } from 'react';
import { ActiveApplet } from '@/lib/applets/applet-store';
import {
  Calculator, FileText, Clock, Palette, Zap, Box, Sparkles, X
} from 'lucide-react';

interface AppletIconCardProps {
  applet: ActiveApplet;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  isActive: boolean;
}

export function AppletIconCard({ applet, onClick, onClose, isActive }: AppletIconCardProps) {
  const [isHovered, setIsHovered] = useState(false);

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
