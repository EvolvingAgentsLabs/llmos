'use client';

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors in child component tree and displays fallback UI.
 * Prevents entire app from crashing due to component-level errors.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  name?: string; // For logging which boundary caught the error
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError, name } = this.props;

    // Log error with boundary name for debugging
    console.error(`[ErrorBoundary${name ? `: ${name}` : ''}]`, error, errorInfo);

    // Call custom error handler if provided
    if (onError) {
      onError(error, errorInfo);
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (typeof fallback === 'function') {
        return fallback(error, this.reset);
      }
      if (fallback) {
        return fallback;
      }

      // Default fallback UI
      return <DefaultErrorFallback error={error} reset={this.reset} />;
    }

    return children;
  }
}

// ============================================================================
// DEFAULT ERROR FALLBACK UI
// ============================================================================

interface ErrorFallbackProps {
  error: Error;
  reset: () => void;
}

function DefaultErrorFallback({ error, reset }: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 bg-[#1e1e1e] text-[#cccccc] border border-[#3c3c3c] rounded-lg">
      <div className="text-red-400 mb-4">
        <svg
          className="w-12 h-12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
      <p className="text-sm text-[#808080] mb-4 text-center max-w-md">
        {error.message || 'An unexpected error occurred'}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-[#0e639c] hover:bg-[#1177bb] text-white rounded text-sm transition-colors"
      >
        Try Again
      </button>
      <details className="mt-4 text-xs text-[#6e6e6e] max-w-full">
        <summary className="cursor-pointer hover:text-[#808080]">
          Error Details
        </summary>
        <pre className="mt-2 p-2 bg-[#252526] rounded overflow-x-auto max-w-md">
          {error.stack}
        </pre>
      </details>
    </div>
  );
}

// ============================================================================
// PANEL-SPECIFIC ERROR BOUNDARIES
// ============================================================================

interface PanelErrorBoundaryProps {
  children: ReactNode;
  panelName: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

/**
 * Specialized error boundary for panel components.
 * Provides a more compact fallback UI suitable for panels.
 */
export function PanelErrorBoundary({ children, panelName, onError }: PanelErrorBoundaryProps) {
  return (
    <ErrorBoundary
      name={panelName}
      onError={onError}
      fallback={(error, reset) => (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
          <div className="text-red-400 text-sm mb-2">
            {panelName} encountered an error
          </div>
          <p className="text-xs text-[#6e6e6e] mb-3 max-w-xs">
            {error.message}
          </p>
          <button
            onClick={reset}
            className="px-3 py-1 text-xs bg-[#3c3c3c] hover:bg-[#4c4c4c] rounded transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

// ============================================================================
// WITHBOUNDARY HOC
// ============================================================================

/**
 * Higher-order component that wraps a component with an error boundary.
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  boundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary name={displayName} {...boundaryProps}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  }

  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;
  return WithErrorBoundary;
}

// ============================================================================
// APPLET-SPECIFIC ERROR BOUNDARY (Aggressive Isolation)
// ============================================================================

interface AppletErrorBoundaryProps {
  children: ReactNode;
  appletName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRetry?: () => void;
  onAIFix?: (error: Error) => void;
  onClose?: () => void;
}

interface AppletErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  crashCount: number;
  lastCrashTime: number;
}

/**
 * Specialized Error Boundary for Applets
 *
 * This is an AGGRESSIVE error boundary designed to:
 * 1. Completely isolate applet crashes from the rest of the OS
 * 2. Track crash frequency to detect infinite loop patterns
 * 3. Provide AI fix, retry, and close options
 * 4. Prevent memory leaks by not re-mounting after repeated crashes
 *
 * CRITICAL: This boundary ensures that VirtualFS, ChatPanel, and other
 * core OS components survive when an applet crashes.
 */
export class AppletErrorBoundary extends Component<AppletErrorBoundaryProps, AppletErrorBoundaryState> {
  private crashThreshold = 3; // Max crashes before blocking re-render
  private crashWindowMs = 10000; // Time window for crash counting (10 seconds)

  constructor(props: AppletErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      crashCount: 0,
      lastCrashTime: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AppletErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError, appletName } = this.props;
    const now = Date.now();

    // Calculate if we're in a crash loop
    const timeSinceLastCrash = now - this.state.lastCrashTime;
    const isRecentCrash = timeSinceLastCrash < this.crashWindowMs;
    const newCrashCount = isRecentCrash ? this.state.crashCount + 1 : 1;

    this.setState({
      errorInfo,
      crashCount: newCrashCount,
      lastCrashTime: now,
    });

    // Log with context
    console.error(
      `[AppletErrorBoundary: ${appletName || 'Unknown'}] Crash #${newCrashCount}`,
      {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        isRecentCrash,
        timeSinceLastCrash,
      }
    );

    // Warn if approaching crash loop threshold
    if (newCrashCount >= this.crashThreshold) {
      console.warn(
        `[AppletErrorBoundary] Applet "${appletName}" has crashed ${newCrashCount} times in ${this.crashWindowMs}ms. ` +
        'Blocking re-render to prevent infinite loop.'
      );
    }

    // Call custom error handler
    if (onError) {
      onError(error, errorInfo);
    }
  }

  handleRetry = (): void => {
    // Check if we're in a crash loop
    if (this.state.crashCount >= this.crashThreshold) {
      const timeSinceLastCrash = Date.now() - this.state.lastCrashTime;
      if (timeSinceLastCrash < this.crashWindowMs) {
        console.warn('[AppletErrorBoundary] Blocking retry due to crash loop detection');
        return;
      }
    }

    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Call custom retry handler
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  handleAIFix = (): void => {
    if (this.state.error && this.props.onAIFix) {
      this.props.onAIFix(this.state.error);
    }
  };

  handleClose = (): void => {
    if (this.props.onClose) {
      this.props.onClose();
    }
  };

  render(): ReactNode {
    const { hasError, error, crashCount } = this.state;
    const { children, appletName, onAIFix, onClose } = this.props;

    if (hasError && error) {
      const isCrashLoop = crashCount >= this.crashThreshold;
      const timeSinceLastCrash = Date.now() - this.state.lastCrashTime;
      const canRetry = !isCrashLoop || timeSinceLastCrash >= this.crashWindowMs;

      return (
        <div className="flex flex-col items-center justify-center h-full p-6 bg-[#1a1a1a] text-[#cccccc] rounded-lg">
          {/* Error Icon */}
          <div className="relative mb-4">
            <div className="text-red-400">
              <svg
                className="w-16 h-16"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            {isCrashLoop && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-black">{crashCount}</span>
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold mb-2 text-red-300">
            {isCrashLoop ? 'Applet Crash Loop Detected' : 'Applet Crashed'}
          </h3>

          {/* Applet Name */}
          {appletName && (
            <p className="text-sm text-purple-400 mb-2 font-mono">
              {appletName}
            </p>
          )}

          {/* Error Message */}
          <div className="max-w-md p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
            <p className="text-sm text-red-300 text-center">
              {error.message || 'An unexpected error occurred'}
            </p>
          </div>

          {/* Crash Loop Warning */}
          {isCrashLoop && (
            <div className="max-w-md p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-4">
              <p className="text-xs text-amber-300 text-center">
                This applet has crashed {crashCount} times recently.
                {canRetry
                  ? ' You can try again now.'
                  : ' Please wait a moment before retrying or use AI to fix the issue.'}
              </p>
            </div>
          )}

          {/* Info Message */}
          <p className="text-xs text-[#808080] mb-4 text-center max-w-sm">
            The OS is protected. Only this applet is affected.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 justify-center">
            {/* Retry Button */}
            <button
              onClick={this.handleRetry}
              disabled={!canRetry}
              className={`px-4 py-2 rounded text-sm transition-colors ${
                canRetry
                  ? 'bg-[#3c3c3c] hover:bg-[#4c4c4c] text-white'
                  : 'bg-[#2c2c2c] text-[#666] cursor-not-allowed'
              }`}
            >
              Try Again
            </button>

            {/* AI Fix Button */}
            {onAIFix && (
              <button
                onClick={this.handleAIFix}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Fix with AI
              </button>
            )}

            {/* Close Button */}
            {onClose && (
              <button
                onClick={this.handleClose}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded text-sm transition-colors"
              >
                Close Applet
              </button>
            )}
          </div>

          {/* Error Details */}
          <details className="mt-4 text-xs text-[#6e6e6e] max-w-full w-full">
            <summary className="cursor-pointer hover:text-[#808080] text-center">
              Technical Details
            </summary>
            <div className="mt-2 p-2 bg-[#252526] rounded overflow-x-auto max-h-40 overflow-y-auto">
              <pre className="text-left whitespace-pre-wrap break-words">
                {error.stack}
              </pre>
            </div>
          </details>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
