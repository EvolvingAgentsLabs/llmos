'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

/**
 * ConfirmDialog - Material Design inspired confirmation dialog
 * Features smooth animations, proper elevation, and consistent button styling
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Handle animation on open/close
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  // Focus trap
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onCancel}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Dialog - Material Design inspired */}
      <div
        ref={dialogRef}
        className={`relative bg-bg-primary border rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden transition-all duration-200 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-2'
        } ${danger ? 'border-red-500/30' : 'border-white/10'}`}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Header */}
        <div className={`relative px-5 py-4 border-b ${
          danger
            ? 'bg-gradient-to-r from-red-500/15 to-red-500/5 border-red-500/20'
            : 'bg-gradient-to-r from-purple-500/10 to-transparent border-border-primary'
        }`}>
          {/* Close button */}
          <button
            onClick={onCancel}
            className="absolute right-3 top-3 w-7 h-7 rounded-full flex items-center justify-center text-fg-tertiary hover:text-fg-primary hover:bg-white/10 transition-all duration-200"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            {/* Icon container with glow effect */}
            <div className="relative">
              {danger && (
                <div className="absolute inset-0 bg-red-500/30 rounded-lg blur-md" />
              )}
              <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${
                danger
                  ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/30'
                  : 'bg-gradient-to-br from-purple-500 to-violet-600 shadow-purple-500/30'
              }`}>
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
            </div>
            <h3 className={`font-semibold text-lg ${danger ? 'text-red-400' : 'text-fg-primary'}`}>
              {title}
            </h3>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-5">
          <p className="text-fg-secondary text-sm leading-relaxed">{message}</p>
        </div>

        {/* Actions - Material Design button styling */}
        <div className="px-5 py-4 border-t border-border-primary bg-bg-secondary/50 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-medium rounded-xl text-fg-secondary bg-transparent border border-border-primary hover:bg-bg-tertiary hover:border-border-secondary active:scale-[0.98] transition-all duration-200"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2.5 text-sm font-medium rounded-xl active:scale-[0.98] transition-all duration-200 ${
              danger
                ? 'text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-lg shadow-red-500/25 hover:shadow-red-500/40'
                : 'text-white bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
