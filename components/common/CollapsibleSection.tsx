'use client';

/**
 * CollapsibleSection - Reusable collapsible panel
 */

import React, { useState, ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  icon?: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  badge?: string | number;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  icon,
  className = '',
  headerClassName = '',
  contentClassName = '',
  badge,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center gap-2 px-3 py-2
          text-xs font-medium text-fg-secondary
          hover:text-fg-primary hover:bg-white/5
          transition-colors rounded-lg
          ${headerClassName}
        `}
      >
        {isOpen ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {icon && <span className="text-fg-muted">{icon}</span>}
        <span className="flex-1 text-left uppercase tracking-wider">{title}</span>
        {badge !== undefined && (
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-fg-muted">
            {badge}
          </span>
        )}
      </button>
      {isOpen && (
        <div className={`mt-1 ${contentClassName}`}>
          {children}
        </div>
      )}
    </div>
  );
}

export default CollapsibleSection;
