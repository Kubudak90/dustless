"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component for catching and handling React errors gracefully.
 * Prevents the entire app from crashing when a component throws an error.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error to console in development
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Call optional error handler (e.g., for Sentry reporting)
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Render custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-zinc-400 mb-4 max-w-md">
            An unexpected error occurred. Please try again or refresh the page.
          </p>
          {this.state.error && (
            <p className="text-xs text-zinc-500 mb-4 font-mono max-w-md truncate">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Error fallback component for asset-related errors
 */
export function AssetErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="bg-zinc-900/50 border border-red-900/50 rounded-2xl p-5">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-red-500 mb-1">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">Failed to load asset</span>
          </div>
          <p className="text-sm text-zinc-400">
            There was a problem loading this asset. Please try again.
          </p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 text-sm border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Error fallback for the scan section
 */
export function ScanErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-4">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
      <h3 className="text-lg font-medium mb-2">Scan failed</h3>
      <p className="text-zinc-400 mb-4 max-w-md">
        We couldn&apos;t scan your wallet. This might be due to network issues or RPC problems.
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-black font-medium rounded-xl transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Error fallback for bridge/quote errors
 */
export function QuoteErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="border-t border-zinc-800 pt-4">
      <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-900/50 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-red-400">Failed to fetch quotes</p>
          <p className="text-xs text-zinc-500 mt-1">
            Bridge providers may be temporarily unavailable.
          </p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
