import { CHAINS, type ChainConfig } from "@dustless/shared";

/**
 * Environment-aware chain config
 * Overrides default RPC URLs with environment variables when available
 */

const RPC_ENV_MAP: Record<number, string> = {
  8453: "RPC_BASE",
  42161: "RPC_ARBITRUM",
  81457: "RPC_BLAST",
  34443: "RPC_MODE",
  7777777: "RPC_ZORA",
  59144: "RPC_LINEA",
  10: "RPC_OPTIMISM",
  324: "RPC_ZKSYNC",
  534352: "RPC_SCROLL",
};

export function getChainConfig(chainId: number): ChainConfig {
  const chain = CHAINS[chainId];
  if (!chain) {
    throw new Error(`Unknown chainId: ${chainId}`);
  }

  // Check for env override
  const envKey = RPC_ENV_MAP[chainId];
  const envRpc = envKey ? process.env[envKey] : undefined;

  if (envRpc) {
    return {
      ...chain,
      rpcUrls: [envRpc, ...chain.rpcUrls],
    };
  }

  return chain;
}

export function getAllConfiguredChains(): ChainConfig[] {
  return Object.values(CHAINS).map((chain) => getChainConfig(chain.id));
}

export { CHAINS };
