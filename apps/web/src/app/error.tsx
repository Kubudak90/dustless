"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary for the app.
 * This catches errors in the page component tree.
 */
export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("App error:", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/10 mb-6">
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>

        <h1 className="text-2xl font-bold mb-3">Something went wrong</h1>

        <p className="text-zinc-400 mb-6">
          An unexpected error occurred while loading this page.
          Please try again or return to the home page.
        </p>

        {error.message && (
          <div className="mb-6 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
            <p className="text-xs text-zinc-500 font-mono break-all">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-zinc-600 mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-black font-medium rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>

          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
          >
            <Home className="w-4 h-4" />
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}
