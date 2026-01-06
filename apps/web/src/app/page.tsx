"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton, ChainSelector, StuckAssetCard, LiFiBridgeWidget } from "@/components";
import { useScan } from "@/hooks/useRecovery";
import { getSourceChainIds } from "@dustless/shared";
import { Search, Loader2, Sparkles, Shield, Zap, ArrowLeftRight, Wifi, WifiOff } from "lucide-react";
import { useSocket } from "@/components/socket-provider";

type TabType = "scan" | "bridge";

export default function HomePage() {
  const { address, isConnected } = useAccount();
  const { isConnected: socketConnected } = useSocket();
  const [activeTab, setActiveTab] = useState<TabType>("scan");
  const [targetChainId, setTargetChainId] = useState(8453); // Base
  const { mutate: scan, data: scanResult, isPending: isScanning, reset } = useScan();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleScan = () => {
    scan(getSourceChainIds());
  };

  // Prevent hydration mismatch - render loading state on server
  if (!mounted) {
    return (
      <main className="min-h-screen">
        <header className="border-b border-zinc-900">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-brand-500" />
              <span className="text-xl font-semibold">Dustless</span>
            </div>
          </div>
        </header>
        <section className="max-w-5xl mx-auto px-6 py-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500" />
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
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

      {/* Tab Navigation */}
      <div className="border-b border-zinc-900">
        <div className="max-w-5xl mx-auto px-6">
          <nav className="flex gap-1">
            <TabButton
              active={activeTab === "scan"}
              onClick={() => setActiveTab("scan")}
              icon={<Search className="w-4 h-4" />}
              label="Scan & Recover"
            />
            <TabButton
              active={activeTab === "bridge"}
              onClick={() => setActiveTab("bridge")}
              icon={<ArrowLeftRight className="w-4 h-4" />}
              label="Direct Bridge"
            />
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "scan" ? (
        <>
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
                  onChange={setTargetChainId}
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
                      <StuckAssetCard
                        key={`${asset.chainId}-${i}`}
                        asset={asset}
                        targetChainId={targetChainId}
                      />
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
        </>
      ) : (
        /* Bridge Tab */
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
              <LiFiBridgeWidget
                toChainId={targetChainId}
                variant="compact"
                className="w-full max-w-md"
              />
            </div>
          )}
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8 mt-auto">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-sm text-zinc-500">
          <div>© 2024 Dustless</div>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-white">Docs</a>
            <a href="#" className="hover:text-white">GitHub</a>
            <a href="#" className="hover:text-white">Twitter</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
        ${active 
          ? "border-brand-500 text-white" 
          : "border-transparent text-zinc-400 hover:text-white hover:border-zinc-700"
        }
      `}
    >
      {icon}
      {label}
    </button>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
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
