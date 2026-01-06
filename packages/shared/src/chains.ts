/**
 * Chain Configuration Registry
 * 
 * Tags:
 * - "target": Chains users can bridge TO (consolidation destinations)
 * - "source": Chains we scan for stuck assets
 * - "abandoned": Low-activity or deprecated chains likely to have dust
 */

export type ChainTag = "target" | "source" | "abandoned";

export interface ChainConfig {
  id: number;
  name: string;
  shortName: string;
  nativeSymbol: "ETH";
  decimals: 18;
  rpcUrls: string[];
  explorerUrl: string;
  explorerApiUrl?: string;
  tags: ChainTag[];
  iconUrl?: string;
  color?: string;
}

// Native ETH placeholder address used by bridge aggregators
export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

export const CHAINS: Record<number, ChainConfig> = {
  // === Target Chains (consolidation destinations) ===
  8453: {
    id: 8453,
    name: "Base",
    shortName: "base",
    nativeSymbol: "ETH",
    decimals: 18,
    rpcUrls: [
      "https://mainnet.base.org",
      "https://base.llamarpc.com",
    ],
    explorerUrl: "https://basescan.org",
    explorerApiUrl: "https://api.basescan.org/api",
    tags: ["target", "source"],
    color: "#0052FF",
  },
  42161: {
    id: 42161,
    name: "Arbitrum One",
    shortName: "arb",
    nativeSymbol: "ETH",
    decimals: 18,
    rpcUrls: [
      "https://arb1.arbitrum.io/rpc",
      "https://arbitrum.llamarpc.com",
    ],
    explorerUrl: "https://arbiscan.io",
    explorerApiUrl: "https://api.arbiscan.io/api",
    tags: ["target", "source"],
    color: "#28A0F0",
  },

  // === Source/Abandoned Chains ===
  81457: {
    id: 81457,
    name: "Blast",
    shortName: "blast",
    nativeSymbol: "ETH",
    decimals: 18,
    rpcUrls: [
      "https://rpc.blast.io",
      "https://blast.din.dev/rpc",
    ],
    explorerUrl: "https://blastscan.io",
    tags: ["source", "abandoned"],
    color: "#FCFC03",
  },
  34443: {
    id: 34443,
    name: "Mode",
    shortName: "mode",
    nativeSymbol: "ETH",
    decimals: 18,
    rpcUrls: [
      "https://mainnet.mode.network",
    ],
    explorerUrl: "https://modescan.io",
    tags: ["source", "abandoned"],
    color: "#DFFE00",
  },
  7777777: {
    id: 7777777,
    name: "Zora",
    shortName: "zora",
    nativeSymbol: "ETH",
    decimals: 18,
    rpcUrls: [
      "https://rpc.zora.energy",
    ],
    explorerUrl: "https://explorer.zora.energy",
    tags: ["source", "abandoned"],
    color: "#000000",
  },
  59144: {
    id: 59144,
    name: "Linea",
    shortName: "linea",
    nativeSymbol: "ETH",
    decimals: 18,
    rpcUrls: [
      "https://rpc.linea.build",
    ],
    explorerUrl: "https://lineascan.build",
    tags: ["source"],
    color: "#121212",
  },
  10: {
    id: 10,
    name: "Optimism",
    shortName: "op",
    nativeSymbol: "ETH",
    decimals: 18,
    rpcUrls: [
      "https://mainnet.optimism.io",
      "https://optimism.llamarpc.com",
    ],
    explorerUrl: "https://optimistic.etherscan.io",
    tags: ["target", "source"],
    color: "#FF0420",
  },
  324: {
    id: 324,
    name: "zkSync Era",
    shortName: "zksync",
    nativeSymbol: "ETH",
    decimals: 18,
    rpcUrls: [
      "https://mainnet.era.zksync.io",
    ],
    explorerUrl: "https://explorer.zksync.io",
    tags: ["source"],
    color: "#8C8DFC",
  },
  534352: {
    id: 534352,
    name: "Scroll",
    shortName: "scroll",
    nativeSymbol: "ETH",
    decimals: 18,
    rpcUrls: [
      "https://rpc.scroll.io",
    ],
    explorerUrl: "https://scrollscan.com",
    tags: ["source"],
    color: "#FFEEDA",
  },
};

// Helper functions
export function getChain(chainId: number): ChainConfig | undefined {
  return CHAINS[chainId];
}

export function getTargetChains(): ChainConfig[] {
  return Object.values(CHAINS).filter((c) => c.tags.includes("target"));
}

export function getSourceChains(): ChainConfig[] {
  return Object.values(CHAINS).filter((c) => c.tags.includes("source"));
}

export function getAbandonedChains(): ChainConfig[] {
  return Object.values(CHAINS).filter((c) => c.tags.includes("abandoned"));
}

export function getAllChainIds(): number[] {
  return Object.keys(CHAINS).map(Number);
}

export function getSourceChainIds(): number[] {
  return getSourceChains().map((c) => c.id);
}
