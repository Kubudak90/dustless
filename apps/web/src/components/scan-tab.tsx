"use client";

import { Search, Loader2, Sparkles, Shield, Zap } from "lucide-react";
import { useAccount } from "wagmi";
import { ConnectButton } from "./connect-button";
import { ChainSelector } from "./chain-selector";
import { StuckAssetCard } from "./stuck-asset-card";
import { ErrorBoundary, ScanErrorFallback } from "./error-boundary";
import { useScan } from "@/hooks/useRecovery";
import { getSourceChainIds } from "@dustless/shared";
import type { ReactNode } from "react";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/30">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500/10 text-brand-500 mb-4">
        {icon}
      </div>
      <h3 className="font-medium text-lg mb-2">{title}</h3>
      <p className="text-zinc-400 text-sm">{description}</p>
    </div>
  );
}

interface ScanTabProps {
  targetChainId: number;
  onTargetChainChange: (chainId: number) => void;
}

/**
 * Scan tab content - wallet scanning and asset recovery
 */
export function ScanTab({ targetChainId, onTargetChainChange }: ScanTabProps) {
  const { isConnected } = useAccount();
  const { mutate: scan, data: scanResult, isPending: isScanning, reset } = useScan();

  const handleScan = () => {
    scan(getSourceChainIds());
  };

  return (
    <ErrorBoundary fallback={<ScanErrorFallback onRetry={handleScan} />}>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 py-16 text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Recover your stuck crypto
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-8">
          Scan your wallet for assets stranded on abandoned chains.
          One-click bridging to consolidate everything on Base or Arbitrum.
        </p>

        {!isConnected ? (
          <div className="inline-flex flex-col items-center gap-4">
            <ConnectButton />
            <span className="text-sm text-zinc-500">
              Connect wallet to scan for stuck assets
            </span>
          </div>
        ) : !scanResult ? (
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="inline-flex items-center gap-3 px-8 py-4 bg-brand-500 hover:bg-brand-600 text-black font-semibold rounded-2xl text-lg transition-colors disabled:opacity-50"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Scanning chains...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Scan My Wallet
              </>
            )}
          </button>
        ) : null}
      </section>

      {/* Results */}
      {scanResult && (
        <section className="max-w-3xl mx-auto px-6 pb-16">
          {/* Target chain selector */}
          <div className="mb-8 p-5 bg-zinc-900/30 border border-zinc-800 rounded-2xl">
            <ChainSelector
              label="Consolidate to:"
              value={targetChainId}
              onChange={onTargetChainChange}
            />
          </div>

          {/* Stuck assets */}
          {scanResult.stuck.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">
                  Found {scanResult.stuck.length} recoverable asset{scanResult.stuck.length !== 1 ? "s" : ""}
                </h2>
                <button
                  onClick={() => reset()}
                  className="text-sm text-zinc-400 hover:text-white"
                >
                  Scan again
                </button>
              </div>

              <div className="space-y-3">
                {scanResult.stuck.map((asset, i) => (
                  <ErrorBoundary key={`${asset.chainId}-${i}`}>
                    <StuckAssetCard
                      asset={asset}
                      targetChainId={targetChainId}
                    />
                  </ErrorBoundary>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-900 mb-4">
                <Sparkles className="w-8 h-8 text-brand-500" />
              </div>
              <h3 className="text-lg font-medium mb-2">All clear!</h3>
              <p className="text-zinc-400">
                No stuck assets found on scanned chains.
              </p>
              <button
                onClick={() => reset()}
                className="mt-4 text-sm text-brand-500 hover:underline"
              >
                Scan again
              </button>
            </div>
          )}
        </section>
      )}

      {/* Features */}
      {!scanResult && (
        <section className="max-w-5xl mx-auto px-6 py-16 border-t border-zinc-900">
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Search className="w-6 h-6" />}
              title="Multi-chain Scan"
              description="Automatically checks Blast, Mode, Zora, Linea, zkSync, Scroll, and more for leftover ETH."
            />
            <FeatureCard
              icon={<Zap className="w-6 h-6" />}
              title="Best Route Selection"
              description="Compares LI.FI and Socket to find the cheapest, fastest bridge for your recovery."
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6" />}
              title="Non-custodial"
              description="Your keys, your crypto. We never touch private keys. All transactions require your signature."
            />
          </div>
        </section>
      )}
    </ErrorBoundary>
  );
}
