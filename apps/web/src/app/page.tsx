"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  Header,
  Footer,
  TabNavigation,
  ScanTab,
  BridgeTab,
  type TabType,
} from "@/components";

/**
 * Home page - main entry point for the Dustless app
 * Decomposed into smaller, reusable components for better maintainability
 */
export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabType>("scan");
  const [targetChainId, setTargetChainId] = useState(8453); // Base
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

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
      <Header />

      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "scan" ? (
        <ScanTab
          targetChainId={targetChainId}
          onTargetChainChange={setTargetChainId}
        />
      ) : (
        <BridgeTab targetChainId={targetChainId} />
      )}

      <Footer />
    </main>
  );
}
