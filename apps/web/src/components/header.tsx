"use client";

import { Sparkles, Wifi, WifiOff } from "lucide-react";
import { ConnectButton } from "./connect-button";
import { useSocket } from "./socket-provider";

/**
 * App header with logo, connection status, and wallet connect button
 */
export function Header() {
  const { isConnected: socketConnected } = useSocket();

  return (
    <header className="border-b border-zinc-900">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-brand-500" />
          <span className="text-xl font-semibold">Dustless</span>
          {/* Socket connection indicator */}
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-zinc-900 border border-zinc-800">
            {socketConnected ? (
              <>
                <Wifi className="w-3 h-3 text-green-500" />
                <span className="text-xs text-zinc-400">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-zinc-500" />
                <span className="text-xs text-zinc-500">Offline</span>
              </>
            )}
          </span>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
