'use client';

import { useState, useRef, useCallback, useEffect, ReactNode } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface ResizablePanelProps {
  children: ReactNode;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  side: 'left' | 'right';
  isCollapsed?: boolean;
  onResize?: (width: number) => void;
  onCollapse?: () => void;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ResizablePanel({
  children,
  width,
  minWidth = 200,
  maxWidth = 600,
  side,
  isCollapsed = false,
  onResize,
  onCollapse,
  className = '',
}: ResizablePanelProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  // Handle mouse down on resize handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  }, [width]);

  // Handle mouse move during resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = side === 'left'
        ? e.clientX - startXRef.current
        : startXRef.current - e.clientX;

      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + deltaX));
      onResize?.(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, side, minWidth, maxWidth, onResize]);

  // Collapsed state
  if (isCollapsed) {
    return (
      <div
        className={`flex-shrink-0 transition-all duration-300 ease-out ${className}`}
        style={{ width: 0 }}
      >
        {/* Expand button */}
        <button
          onClick={onCollapse}
          className={`absolute ${side === 'left' ? 'left-0' : 'right-0'} top-1/2 -translate-y-1/2 z-10 p-1.5 bg-bg-secondary border border-border-primary rounded-full shadow-lg hover:bg-bg-tertiary transition-colors`}
          style={{
            transform: `translateY(-50%) translateX(${side === 'left' ? '50%' : '-50%'})`,
          }}
        >
          <svg
            className={`w-4 h-4 text-fg-secondary ${side === 'left' ? '' : 'rotate-180'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={`relative flex-shrink-0 transition-all duration-200 ease-out ${className} ${isResizing ? 'select-none' : ''}`}
      style={{ width }}
    >
      {/* Panel content */}
      <div className="h-full overflow-hidden">
        {children}
      </div>

      {/* Resize handle */}
      <div
        className={`absolute top-0 ${side === 'left' ? 'right-0' : 'left-0'} w-1 h-full cursor-col-resize group z-20`}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Visual handle */}
        <div
          className={`absolute inset-0 transition-all duration-200 ${
            isResizing || isHovering
              ? 'bg-accent-primary w-1'
              : 'bg-border-primary w-px'
          }`}
          style={{
            [side === 'left' ? 'right' : 'left']: 0,
          }}
        />

        {/* Drag indicator dots */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? '-right-1.5' : '-left-1.5'} flex flex-col gap-1 transition-opacity duration-200 ${
            isResizing || isHovering ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-accent-primary" />
          ))}
        </div>
      </div>

      {/* Collapse button */}
      {onCollapse && (
        <button
          onClick={onCollapse}
          className={`absolute ${side === 'left' ? 'right-2' : 'left-2'} top-2 p-1 text-fg-muted hover:text-fg-primary hover:bg-bg-tertiary rounded transition-colors opacity-0 group-hover:opacity-100`}
          title={`Collapse ${side} panel`}
        >
          <svg
            className={`w-4 h-4 ${side === 'left' ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ============================================================================
// PANEL DIVIDER (for non-resizable splits)
// ============================================================================

export function PanelDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`w-px h-full bg-border-primary/50 ${className}`} />
  );
}
