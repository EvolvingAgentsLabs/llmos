/**
 * Canvas Modal - Display interactive canvas in a modal
 *
 * Features:
 * - Full-screen modal with close button
 * - Supports Python (Pyodide) and Three.js canvases
 * - Escape key to close
 */

'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import canvas components to avoid SSR issues
const ThreeJSCanvas = dynamic(() => import('@/components/canvas/ThreeJSCanvas'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full"><span className="text-fg-tertiary">Loading canvas...</span></div>,
});

const SplitViewCanvas = dynamic(() => import('@/components/canvas/SplitViewCanvas'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full"><span className="text-fg-tertiary">Loading canvas...</span></div>,
});

interface CanvasModalProps {
  code: string;
  language: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function CanvasModal({ code, language, isOpen, onClose }: CanvasModalProps) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isThreeJS = language === 'javascript' || language === 'js';
  const isPython = language === 'python' || language === 'py';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-overlay backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-[95vw] h-[90vh] bg-bg-primary rounded-xl shadow-2xl border border-border-primary overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border-primary bg-bg-secondary flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h2 className="text-sm font-semibold text-fg-primary">
              Interactive Canvas
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-accent-primary/20 text-accent-primary">
              {isThreeJS ? 'Three.js' : isPython ? 'Python' : language}
            </span>
          </div>

          <button
            onClick={onClose}
            className="btn-icon"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Canvas Content */}
        <div className="h-[calc(100%-60px)]">
          {isThreeJS && <ThreeJSCanvas initialCode={code} />}
          {isPython && (
            <SplitViewCanvas
              volume="user"
              filePath="temp_canvas.py"
              initialContent={code}
            />
          )}
          {!isThreeJS && !isPython && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-fg-secondary mb-2">Unsupported language: {language}</p>
                <p className="text-xs text-fg-tertiary">Only Python and JavaScript/Three.js are supported</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
