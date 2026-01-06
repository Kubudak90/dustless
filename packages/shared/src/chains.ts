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

/**
 * ERC-20 Token Configuration
 */
export interface TokenConfig {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoUrl?: string;
  isStablecoin?: boolean;
}

/**
 * Popular ERC-20 tokens to scan on each chain
 * Focused on stablecoins and high-value tokens commonly left behind
 */
export const POPULAR_TOKENS: Record<number, TokenConfig[]> = {
  // Base
  8453: [
    {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      chainId: 8453,
      isStablecoin: true,
    },
    {
      address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      chainId: 8453,
      isStablecoin: true,
    },
    {
      address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
      symbol: "USDbC",
      name: "USD Base Coin",
      decimals: 6,
      chainId: 8453,
      isStablecoin: true,
    },
  ],
  // Arbitrum One
  42161: [
    {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      chainId: 42161,
      isStablecoin: true,
    },
    {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      chainId: 42161,
      isStablecoin: true,
    },
    {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      chainId: 42161,
      isStablecoin: true,
    },
  ],
  // Blast
  81457: [
    {
      address: "0x4300000000000000000000000000000000000003",
      symbol: "USDB",
      name: "USDB",
      decimals: 18,
      chainId: 81457,
      isStablecoin: true,
    },
    {
      address: "0x4300000000000000000000000000000000000004",
      symbol: "BLAST",
      name: "Blast",
      decimals: 18,
      chainId: 81457,
    },
  ],
  // Mode
  34443: [
    {
      address: "0xd988097fb8612cc24eeC14542bC03424c656005f",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      chainId: 34443,
      isStablecoin: true,
    },
    {
      address: "0xf0F161fDA2712DB8b566946122a5af183995e2eD",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      chainId: 34443,
      isStablecoin: true,
    },
  ],
  // Optimism
  10: [
    {
      address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      chainId: 10,
      isStablecoin: true,
    },
    {
      address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      chainId: 10,
      isStablecoin: true,
    },
    {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      chainId: 10,
      isStablecoin: true,
    },
  ],
  // Linea
  59144: [
    {
      address: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      chainId: 59144,
      isStablecoin: true,
    },
    {
      address: "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      chainId: 59144,
      isStablecoin: true,
    },
  ],
  // zkSync Era
  324: [
    {
      address: "0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      chainId: 324,
      isStablecoin: true,
    },
    {
      address: "0x493257fD37EDB34451f62EDf8D2a0C418852bA4C",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      chainId: 324,
      isStablecoin: true,
    },
  ],
  // Scroll
  534352: [
    {
      address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      chainId: 534352,
      isStablecoin: true,
    },
    {
      address: "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df",
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      chainId: 534352,
      isStablecoin: true,
    },
  ],
  // Zora (mainly NFT chain, minimal DeFi)
  7777777: [],
};

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

export function getPopularTokens(chainId: number): TokenConfig[] {
  return POPULAR_TOKENS[chainId] ?? [];
}

export function getAllPopularTokens(): TokenConfig[] {
  return Object.values(POPULAR_TOKENS).flat();
}
