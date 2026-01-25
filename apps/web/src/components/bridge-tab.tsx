"use client";

import { useAccount } from "wagmi";
import { ConnectButton } from "./connect-button";
import { LiFiBridgeWidget } from "./lifi-widget";
import { ErrorBoundary } from "./error-boundary";

interface BridgeTabProps {
  targetChainId: number;
}

/**
 * Bridge tab content - direct bridging via LI.FI widget
 */
export function BridgeTab({ targetChainId }: BridgeTabProps) {
  const { isConnected } = useAccount();

  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          Direct Bridge
        </h1>
        <p className="text-lg text-zinc-400 max-w-xl mx-auto">
          Bridge any token between chains using LI.FI aggregator.
          Best rates from 20+ bridges.
        </p>
      </div>

      {!isConnected ? (
        <div className="flex flex-col items-center gap-4 py-12">
          <ConnectButton />
          <span className="text-sm text-zinc-500">
            Connect wallet to start bridging
          </span>
        </div>
      ) : (
        <div className="flex justify-center">
          <ErrorBoundary>
            <LiFiBridgeWidget
              toChainId={targetChainId}
              variant="compact"
              className="w-full max-w-md"
            />
          </ErrorBoundary>
        </div>
      )}
    </section>
  );
}
