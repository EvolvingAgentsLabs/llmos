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

export default ErrorBoundary;
