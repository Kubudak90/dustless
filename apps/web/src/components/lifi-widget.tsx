"use client";

import dynamic from "next/dynamic";
import type { WidgetConfig } from "@lifi/widget";
import { ClientOnly } from "./client-only";
import { Loader2 } from "lucide-react";

// Dynamic import for LiFi Widget to avoid SSR issues
const LiFiWidget = dynamic(
  () => import("@lifi/widget").then((mod) => mod.LiFiWidget),
  {
    ssr: false,
    loading: () => <WidgetSkeleton />,
  }
);

/**
 * Skeleton loader while widget loads
 */
function WidgetSkeleton() {
  return (
    <div className="w-full max-w-md mx-auto bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        <p className="text-sm text-zinc-400">Loading bridge widget...</p>
      </div>
    </div>
  );
}

/**
 * LI.FI Widget configuration
 */
const widgetConfig: WidgetConfig = {
  // Required integrator identifier
  integrator: "dustless",

  // Appearance
  appearance: "dark",
  variant: "compact",

  // Supported chains - matching our target and source chains
  chains: {
    allow: [
      1,       // Ethereum
      8453,    // Base
      42161,   // Arbitrum
      10,      // Optimism
      81457,   // Blast
      34443,   // Mode
      7777777, // Zora
      59144,   // Linea
      324,     // zkSync
      534352,  // Scroll
    ],
  },

  // Default values - Base as destination
  toChain: 8453,
  
  // Theme customization
  theme: {
    palette: {
      primary: { main: "#22c55e" }, // brand-500
      secondary: { main: "#4ade80" }, // brand-400
      background: {
        default: "#09090b",
        paper: "#18181b",
      },
    },
    container: {
      borderRadius: "16px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
    },
    shape: {
      borderRadius: 12,
      borderRadiusSecondary: 8,
    },
  },

  // Hide powered by LI.FI
  hiddenUI: ["poweredBy"],
};

interface LiFiBridgeWidgetProps {
  /** Override from chain */
  fromChainId?: number;
  /** Override to chain */
  toChainId?: number;
  /** Override from token address */
  fromToken?: string;
  /** Override to token address */
  toToken?: string;
  /** Compact or wide variant */
  variant?: "compact" | "wide";
  /** Custom class name */
  className?: string;
}

/**
 * LI.FI Bridge Widget Component
 * Provides cross-chain bridging functionality
 */
export function LiFiBridgeWidget({
  fromChainId,
  toChainId,
  fromToken,
  toToken,
  variant = "compact",
  className,
}: LiFiBridgeWidgetProps) {
  // Merge config with props
  const config: WidgetConfig = {
    ...widgetConfig,
    variant,
    ...(fromChainId && { fromChain: fromChainId }),
    ...(toChainId && { toChain: toChainId }),
    ...(fromToken && { fromToken }),
    ...(toToken && { toToken }),
  };

  return (
    <ClientOnly fallback={<WidgetSkeleton />}>
      <div className={className}>
        <LiFiWidget integrator="dustless" config={config} />
      </div>
    </ClientOnly>
  );
}

/**
 * Quick bridge widget - simplified version for recovery flow
 */
interface QuickBridgeProps {
  fromChainId: number;
  toChainId: number;
  className?: string;
}

export function QuickBridge({ fromChainId, toChainId, className }: QuickBridgeProps) {
  return (
    <LiFiBridgeWidget
      fromChainId={fromChainId}
      toChainId={toChainId}
      variant="compact"
      className={className}
    />
  );
}

