'use client';

import { useEffect, useRef, ReactNode } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * ContextMenu - Right-click context menu component
 */
export default function ContextMenu({
  isOpen,
  position,
  items,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Adjust position to keep menu on screen
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Adjust horizontal position
      if (position.x + rect.width > viewportWidth) {
        menu.style.left = `${viewportWidth - rect.width - 8}px`;
      } else {
        menu.style.left = `${position.x}px`;
      }

      // Adjust vertical position
      if (position.y + rect.height > viewportHeight) {
        menu.style.top = `${viewportHeight - rect.height - 8}px`;
      } else {
        menu.style.top = `${position.y}px`;
      }
    }
  }, [isOpen, position]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] py-1 bg-bg-elevated border border-border-primary rounded-md shadow-xl"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, index) => {
        if (item.divider) {
          return (
            <div
              key={`divider-${index}`}
              className="my-1 border-t border-border-primary"
            />
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => {
              if (!item.disabled) {
                item.action();
                onClose();
              }
            }}
            disabled={item.disabled}
            className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-sm transition-colors ${
              item.disabled
                ? 'text-fg-tertiary cursor-not-allowed'
                : item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-fg-secondary hover:bg-bg-tertiary hover:text-fg-primary'
            }`}
          >
            {item.icon && (
              <span className="w-4 h-4 flex items-center justify-center">
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
