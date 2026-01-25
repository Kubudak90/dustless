"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Wallet, LogOut, ChevronDown } from "lucide-react";
import { shortenAddress } from "@/lib/utils";
import { useState, useEffect } from "react";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [showMenu, setShowMenu] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render until mounted to prevent hydration issues
  if (!mounted) {
    return (
      <span className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-black font-medium rounded-xl opacity-50">
        <Wallet className="w-4 h-4" />
        Connect Wallet
      </span>
    );
  }

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 rounded-xl border border-zinc-800 transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="font-mono text-sm">{shortenAddress(address)}</span>
          <ChevronDown className="w-4 h-4 opacity-50" />
        </button>

        {showMenu && (
          <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50">
            <button
              onClick={() => {
                disconnect();
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-zinc-800 transition-colors text-left text-sm"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isPending}
        className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-black font-medium rounded-xl transition-colors disabled:opacity-50"
      >
        <Wallet className="w-4 h-4" />
        {isPending ? "Connecting..." : "Connect Wallet"}
      </button>

      {showMenu && !isPending && (
        <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => {
                connect({ connector });
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </span>
              <span className="text-sm">{connector.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
