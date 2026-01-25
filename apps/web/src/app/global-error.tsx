"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary that catches errors in the root layout.
 * This is the last resort error handler for the entire app.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-black text-white min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/10 mb-6">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>

          <h1 className="text-2xl font-bold mb-3">Critical Error</h1>

          <p className="text-zinc-400 mb-6">
            A critical error occurred. Please refresh the page to continue.
          </p>

          {error.digest && (
            <p className="text-xs text-zinc-600 mb-6">
              Error ID: {error.digest}
            </p>
          )}

          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-black font-medium rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh page
          </button>
        </div>
      </body>
    </html>
  );
}
