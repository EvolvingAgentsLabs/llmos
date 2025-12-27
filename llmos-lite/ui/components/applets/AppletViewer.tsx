'use client';

/**
 * AppletViewer - The Infinite App Store UI Component
 *
 * This component renders dynamically compiled React applets.
 * It provides a window-like frame with controls for:
 * - Running/stopping the applet
 * - Saving applet state
 * - Viewing applet code
 * - Closing/minimizing
 */

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import {
  AppletRuntime,
  AppletMetadata,
  AppletState,
  AppletExports,
  AppletProps,
} from '@/lib/runtime/applet-runtime';
import {
  X,
  Minimize2,
  Maximize2,
  Code,
  Play,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Loader2,
  FileCode,
  Sparkles,
} from 'lucide-react';

interface AppletViewerProps {
  code: string;
  metadata?: Partial<AppletMetadata>;
  initialState?: AppletState;
  onSubmit?: (data: unknown) => void;
  onClose?: () => void;
  onSave?: (state: AppletState) => void;
  onCodeView?: () => void;
  className?: string;
  showControls?: boolean;
  autoCompile?: boolean;
}

type ViewerStatus = 'idle' | 'compiling' | 'running' | 'error';

export function AppletViewer({
  code,
  metadata: initialMetadata,
  initialState,
  onSubmit,
  onClose,
  onSave,
  onCodeView,
  className = '',
  showControls = true,
  autoCompile = true,
}: AppletViewerProps) {
  const [status, setStatus] = useState<ViewerStatus>('idle');
  const [exports, setExports] = useState<AppletExports | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [appletState, setAppletState] = useState<AppletState>(initialState || {});
  const [isMaximized, setIsMaximized] = useState(false);
  const [showCode, setShowCode] = useState(false);

  // Compile the applet
  const compile = useCallback(async () => {
    setStatus('compiling');
    setError(null);
    setWarnings([]);

    try {
      const result = await AppletRuntime.compile(code);

      if (result.success && result.exports) {
        setExports(result.exports);
        setWarnings(result.warnings || []);
        setStatus('running');
      } else {
        setError(result.error || 'Unknown compilation error');
        setStatus('error');
      }
    } catch (err: any) {
      setError(err.message || 'Compilation failed');
      setStatus('error');
    }
  }, [code]);

  // Auto-compile on mount or code change
  useEffect(() => {
    if (autoCompile) {
      compile();
    }
  }, [autoCompile, compile]);

  // Handle applet submission
  const handleSubmit = useCallback(
    (data: unknown) => {
      if (onSubmit) {
        onSubmit(data);
      }
    },
    [onSubmit]
  );

  // Handle state save
  const handleSave = useCallback(
    (state: AppletState) => {
      setAppletState(state);
      if (onSave) {
        onSave(state);
      }
    },
    [onSave]
  );

  const metadata = exports?.metadata || initialMetadata;

  // Render the compiled component
  const renderApplet = () => {
    if (!exports?.Component) return null;

    const AppletComponent = exports.Component;
    const appletProps: AppletProps = {
      onSubmit: handleSubmit,
      onClose,
      onSave: handleSave,
      initialState: appletState,
      metadata: metadata as AppletMetadata,
    };

    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-400">Loading applet...</span>
          </div>
        }
      >
        <AppletComponent {...appletProps} />
      </Suspense>
    );
  };

  return (
    <div
      className={`
        flex flex-col bg-gray-900 border border-gray-700 rounded-lg overflow-hidden
        shadow-xl transition-all duration-200
        ${isMaximized ? 'fixed inset-4 z-50' : ''}
        ${className}
      `}
    >
      {/* Window Title Bar */}
      {showControls && (
        <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-200">
              {metadata?.name || 'Untitled Applet'}
            </span>
            {status === 'running' && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle className="w-3 h-3" />
                Running
              </span>
            )}
            {status === 'compiling' && (
              <span className="flex items-center gap-1 text-xs text-blue-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Compiling
              </span>
            )}
            {status === 'error' && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="w-3 h-3" />
                Error
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Recompile button */}
            <button
              onClick={compile}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              title="Recompile"
            >
              <RefreshCw className="w-4 h-4 text-gray-400 hover:text-white" />
            </button>

            {/* View code button */}
            {onCodeView && (
              <button
                onClick={onCodeView}
                className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                title="View Code"
              >
                <Code className="w-4 h-4 text-gray-400 hover:text-white" />
              </button>
            )}

            {/* Save button */}
            {onSave && (
              <button
                onClick={() => handleSave(appletState)}
                className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                title="Save State"
              >
                <Save className="w-4 h-4 text-gray-400 hover:text-white" />
              </button>
            )}

            {/* Maximize/Minimize */}
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              title={isMaximized ? 'Minimize' : 'Maximize'}
            >
              {isMaximized ? (
                <Minimize2 className="w-4 h-4 text-gray-400 hover:text-white" />
              ) : (
                <Maximize2 className="w-4 h-4 text-gray-400 hover:text-white" />
              )}
            </button>

            {/* Close button */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                title="Close"
              >
                <X className="w-4 h-4 text-gray-400 hover:text-red-400" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Warnings bar */}
      {warnings.length > 0 && (
        <div className="px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20">
          {warnings.map((warning, index) => (
            <div key={index} className="flex items-center gap-2 text-xs text-yellow-400">
              <AlertCircle className="w-3 h-3" />
              {warning}
            </div>
          ))}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-auto p-4">
        {status === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Play className="w-12 h-12 mb-4" />
            <p>Click to compile and run applet</p>
            <button
              onClick={compile}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Run Applet
            </button>
          </div>
        )}

        {status === 'compiling' && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Loader2 className="w-12 h-12 mb-4 animate-spin text-blue-500" />
            <p>Compiling applet...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center h-full">
            <AlertCircle className="w-12 h-12 mb-4 text-red-500" />
            <p className="text-red-400 mb-2">Compilation Error</p>
            <div className="max-w-md p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono">{error}</pre>
            </div>
            <button
              onClick={compile}
              className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {status === 'running' && renderApplet()}
      </div>

      {/* Footer with metadata */}
      {showControls && metadata && (
        <div className="px-3 py-1.5 bg-gray-800/50 border-t border-gray-700 text-xs text-gray-500">
          <div className="flex items-center justify-between">
            <span>v{metadata.version || '1.0.0'}</span>
            {metadata.updatedAt && (
              <span>Updated: {new Date(metadata.updatedAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * AppletCard - A compact card view for applet selection
 */
interface AppletCardProps {
  metadata: AppletMetadata;
  onClick?: () => void;
  onDelete?: () => void;
}

export function AppletCard({ metadata, onClick, onDelete }: AppletCardProps) {
  return (
    <div
      onClick={onClick}
      className="p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg cursor-pointer transition-all hover:border-purple-500/50 group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <FileCode className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-medium text-gray-200">{metadata.name}</h3>
            <p className="text-xs text-gray-500">v{metadata.version}</p>
          </div>
        </div>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
          >
            <X className="w-4 h-4 text-gray-400 hover:text-red-400" />
          </button>
        )}
      </div>
      <p className="text-sm text-gray-400 line-clamp-2">{metadata.description}</p>
      {metadata.tags && metadata.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {metadata.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-xs bg-gray-700 text-gray-400 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default AppletViewer;
