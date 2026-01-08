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
 * - AI-powered error fixing (uses LLM to analyze and fix code errors)
 */

import React, { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import {
  AppletRuntime,
  AppletMetadata,
  AppletState,
  AppletExports,
  AppletProps,
} from '@/lib/runtime/applet-runtime';
import { fixAppletError, isCodeError } from '@/lib/applets/applet-error-fixer';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { AppletErrorBoundary } from '@/components/shared/ErrorBoundary';
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
  Wand2,
} from 'lucide-react';

interface AppletViewerProps {
  code: string;
  metadata?: Partial<AppletMetadata>;
  initialState?: AppletState;
  onSubmit?: (data: unknown) => void;
  onClose?: () => void;
  onSave?: (state: AppletState) => void;
  onCodeView?: () => void;
  onCodeUpdate?: (code: string) => void;  // Callback when AI fixes the code
  className?: string;
  showControls?: boolean;
  autoCompile?: boolean;
}

type ViewerStatus = 'idle' | 'compiling' | 'running' | 'error' | 'fixing';

export function AppletViewer({
  code,
  metadata: initialMetadata,
  initialState,
  onSubmit,
  onClose,
  onSave,
  onCodeView,
  onCodeUpdate,
  className = '',
  showControls = true,
  autoCompile = true,
}: AppletViewerProps) {
  const { logActivity, setCurrentActivity, setAgentState } = useWorkspace();

  const [status, setStatus] = useState<ViewerStatus>('idle');
  const [exports, setExports] = useState<AppletExports | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [appletState, setAppletState] = useState<AppletState>(initialState || {});
  const [isMaximized, setIsMaximized] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [fixAttempt, setFixAttempt] = useState(0);
  const [currentCode, setCurrentCode] = useState(code);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [runtimeError, setRuntimeError] = useState<Error | null>(null);
  const errorBoundaryRef = useRef<{ reset: () => void } | null>(null);
  const MAX_AUTO_RETRIES = 3;
  const MAX_FIX_ATTEMPTS = 3;

  const appletName = initialMetadata?.name || 'Untitled Applet';

  // Update currentCode when code prop changes
  useEffect(() => {
    setCurrentCode(code);
  }, [code]);

  // AI-powered error fixing
  const attemptAIFix = useCallback(async (errorMsg: string, codeToFix: string) => {
    if (fixAttempt >= MAX_FIX_ATTEMPTS) {
      console.log('[AppletViewer] Max AI fix attempts reached');
      logActivity('info', 'AI fix limit reached', `Max ${MAX_FIX_ATTEMPTS} attempts`);
      return false;
    }

    setStatus('fixing');
    setError(`AI is analyzing and fixing the error... (attempt ${fixAttempt + 1}/${MAX_FIX_ATTEMPTS})`);
    logActivity('action', 'AI fixing code', `Attempt ${fixAttempt + 1}/${MAX_FIX_ATTEMPTS}`);
    setCurrentActivity('AI Fixing', appletName);
    setAgentState('thinking');

    try {
      logActivity('detail', 'Analyzing error', errorMsg.slice(0, 80));
      const result = await fixAppletError(
        codeToFix,
        errorMsg,
        initialMetadata?.name,
        fixAttempt + 1
      );

      if (result.success && result.fixedCode) {
        console.log(`[AppletViewer] AI fix attempt ${fixAttempt + 1} successful`);
        logActivity('success', 'AI generated fix', `${result.fixedCode.length} bytes`);
        setCurrentCode(result.fixedCode);
        setFixAttempt(prev => prev + 1);

        // Notify parent of code update if callback provided
        if (onCodeUpdate) {
          onCodeUpdate(result.fixedCode);
        }

        // Try to compile the fixed code
        setStatus('compiling');
        setError(null);
        logActivity('action', 'Recompiling fixed code', appletName);
        setAgentState('executing');

        const compileResult = await AppletRuntime.compile(result.fixedCode);

        if (compileResult.success && compileResult.exports) {
          setExports(compileResult.exports);
          setWarnings(compileResult.warnings || []);
          setStatus('running');
          setFixAttempt(0);
          logActivity('success', 'Fixed code compiled', appletName);
          setAgentState('success');
          setTimeout(() => {
            setAgentState('idle');
            setCurrentActivity(null, null);
          }, 1500);
          return true;
        } else {
          // Still has errors, try again if attempts remaining
          const newError = compileResult.error || 'Unknown compilation error';
          if (fixAttempt + 1 < MAX_FIX_ATTEMPTS) {
            console.log('[AppletViewer] Fixed code still has errors, retrying...');
            logActivity('info', 'Still has errors', 'Retrying AI fix...');
            return attemptAIFix(newError, result.fixedCode);
          } else {
            logActivity('error', 'AI fix exhausted', newError.slice(0, 100));
            setError(newError);
            setStatus('error');
            setAgentState('error');
            setTimeout(() => {
              setAgentState('idle');
              setCurrentActivity(null, null);
            }, 3000);
            return false;
          }
        }
      } else {
        console.log('[AppletViewer] AI fix failed:', result.error);
        logActivity('error', 'AI fix failed', result.error || 'Unknown error');
        return false;
      }
    } catch (err: any) {
      console.error('[AppletViewer] AI fix error:', err);
      logActivity('error', 'AI fix exception', err.message || 'Unknown error');
      return false;
    }
  }, [fixAttempt, initialMetadata?.name, onCodeUpdate, appletName, logActivity, setCurrentActivity, setAgentState]);

  // Compile the applet with auto-retry for transient errors
  const compile = useCallback(async (isAutoRetry = false, codeToCompile?: string) => {
    const compileCode = codeToCompile || currentCode;
    setStatus('compiling');
    if (!isAutoRetry) {
      setError(null);
      setRetryCount(0);
      setFixAttempt(0);
      logActivity('action', 'Compiling applet', appletName);
      setCurrentActivity('Compiling', appletName);
      setAgentState('executing');
    }
    setWarnings([]);

    logActivity('detail', 'Transpiling TSX code', `${compileCode.length} bytes`);

    try {
      const result = await AppletRuntime.compile(compileCode);

      if (result.success && result.exports) {
        setExports(result.exports);
        setWarnings(result.warnings || []);
        setStatus('running');
        setRetryCount(0);

        logActivity('success', 'Compilation successful', appletName);
        if (result.warnings && result.warnings.length > 0) {
          result.warnings.forEach(w => logActivity('info', 'Warning', w));
        }
        setAgentState('success');
        setTimeout(() => {
          setAgentState('idle');
          setCurrentActivity(null, null);
        }, 1500);
      } else {
        const errorMsg = result.error || 'Unknown compilation error';

        // Check if it's a Babel loading error (infrastructure issue)
        const isBabelError = errorMsg.toLowerCase().includes('babel');
        const currentRetry = isAutoRetry ? retryCount : 0;

        if (isBabelError && currentRetry < MAX_AUTO_RETRIES) {
          console.log(`[AppletViewer] Babel error, auto-retrying (${currentRetry + 1}/${MAX_AUTO_RETRIES})...`);
          logActivity('info', 'Loading compiler', `Attempt ${currentRetry + 1}/${MAX_AUTO_RETRIES}`);
          setRetryCount(currentRetry + 1);
          setError(`Loading compiler... (attempt ${currentRetry + 1}/${MAX_AUTO_RETRIES})`);
          setTimeout(() => compile(true, compileCode), 1500 * (currentRetry + 1));
          return;
        }

        // For code errors, attempt AI fix if auto-fixing is enabled
        if (isAutoFixing && isCodeError(errorMsg) && fixAttempt < MAX_FIX_ATTEMPTS) {
          logActivity('action', 'AI analyzing error', errorMsg.slice(0, 100));
          const fixed = await attemptAIFix(errorMsg, compileCode);
          if (fixed) return;
        }

        logActivity('error', 'Compilation failed', errorMsg.slice(0, 150));
        setError(errorMsg);
        setStatus('error');
        setAgentState('error');
        setTimeout(() => {
          setAgentState('idle');
          setCurrentActivity(null, null);
        }, 3000);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Compilation failed';

      // Check if it's a Babel loading error
      const isBabelError = errorMsg.toLowerCase().includes('babel');
      const currentRetry = isAutoRetry ? retryCount : 0;

      if (isBabelError && currentRetry < MAX_AUTO_RETRIES) {
        console.log(`[AppletViewer] Babel error (exception), auto-retrying (${currentRetry + 1}/${MAX_AUTO_RETRIES})...`);
        logActivity('info', 'Loading compiler', `Retry ${currentRetry + 1}/${MAX_AUTO_RETRIES}`);
        setRetryCount(currentRetry + 1);
        setError(`Loading compiler... (attempt ${currentRetry + 1}/${MAX_AUTO_RETRIES})`);
        setTimeout(() => compile(true, codeToCompile), 1500 * (currentRetry + 1));
        return;
      }

      // For code errors, attempt AI fix if auto-fixing is enabled
      if (isAutoFixing && isCodeError(errorMsg) && fixAttempt < MAX_FIX_ATTEMPTS) {
        logActivity('action', 'AI analyzing error', errorMsg.slice(0, 100));
        const fixed = await attemptAIFix(errorMsg, compileCode);
        if (fixed) return;
      }

      logActivity('error', 'Compilation error', errorMsg.slice(0, 150));
      setError(errorMsg);
      setStatus('error');
      setAgentState('error');
      setTimeout(() => {
        setAgentState('idle');
        setCurrentActivity(null, null);
      }, 3000);
    }
  }, [currentCode, retryCount, isAutoFixing, fixAttempt, attemptAIFix, appletName, logActivity, setCurrentActivity, setAgentState]);

  // Manual AI fix trigger
  const triggerAIFix = useCallback(async () => {
    if (!error) return;
    setFixAttempt(0); // Reset attempts for manual trigger
    setIsAutoFixing(true);
    await attemptAIFix(error, currentCode);
    setIsAutoFixing(false);
  }, [error, currentCode, attemptAIFix]);

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

  // Handle runtime errors from the AppletErrorBoundary
  const handleRuntimeError = useCallback((error: Error) => {
    setRuntimeError(error);
    logActivity('error', 'Applet runtime crash', error.message.slice(0, 100));
    setAgentState('error');
    setTimeout(() => setAgentState('idle'), 3000);
  }, [logActivity, setAgentState]);

  // Handle AI fix for runtime errors
  const handleRuntimeAIFix = useCallback(async (error: Error) => {
    setRuntimeError(null);
    setFixAttempt(0);
    setIsAutoFixing(true);
    const fixed = await attemptAIFix(error.message, currentCode);
    setIsAutoFixing(false);
    if (fixed) {
      // Reset will happen automatically when code updates
      logActivity('success', 'Runtime error fixed by AI', appletName);
    }
  }, [currentCode, attemptAIFix, appletName, logActivity]);

  // Handle retry from error boundary
  const handleBoundaryRetry = useCallback(() => {
    setRuntimeError(null);
    logActivity('action', 'Retrying crashed applet', appletName);
    // Force a recompile
    compile();
  }, [compile, appletName, logActivity]);

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
      <AppletErrorBoundary
        appletName={appletName}
        onError={handleRuntimeError}
        onRetry={handleBoundaryRetry}
        onAIFix={handleRuntimeAIFix}
        onClose={onClose}
      >
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
      </AppletErrorBoundary>
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
            {status === 'fixing' && (
              <span className="flex items-center gap-1 text-xs text-purple-400">
                <Wand2 className="w-3 h-3 animate-pulse" />
                AI Fixing
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Recompile button */}
            <button
              onClick={() => compile()}
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
              onClick={() => compile()}
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

        {status === 'fixing' && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Wand2 className="w-12 h-12 mb-4 animate-pulse text-purple-500" />
            <p className="text-purple-400 mb-2">AI is Fixing the Code</p>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center h-full">
            <AlertCircle className="w-12 h-12 mb-4 text-red-500" />
            <p className="text-red-400 mb-2">Compilation Error</p>
            <div className="max-w-md p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
              <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono">{error}</pre>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => compile()}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Try Again
              </button>
              {isCodeError(error || '') && (
                <button
                  onClick={triggerAIFix}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                  title="Use AI to analyze and fix the error"
                >
                  <Wand2 className="w-4 h-4" />
                  Fix with AI
                </button>
              )}
            </div>
            {fixAttempt > 0 && (
              <p className="mt-3 text-xs text-gray-500">
                AI fix attempts: {fixAttempt}/{MAX_FIX_ATTEMPTS}
              </p>
            )}
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
