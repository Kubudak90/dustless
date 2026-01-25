import { CHAINS, type ChainConfig } from "@dustless/shared";
import { env } from "./env.js";

/**
 * Environment-aware chain config
 * Overrides default RPC URLs with validated environment variables
 */

const RPC_ENV_MAP: Record<number, keyof typeof env> = {
  1: "RPC_ETHEREUM",
  8453: "RPC_BASE",
  42161: "RPC_ARBITRUM",
  81457: "RPC_BLAST",
  34443: "RPC_MODE",
  7777777: "RPC_ZORA",
  59144: "RPC_LINEA",
  10: "RPC_OPTIMISM",
  324: "RPC_ZKSYNC",
  534352: "RPC_SCROLL",
  137: "RPC_POLYGON",
  43114: "RPC_AVALANCHE",
  56: "RPC_BNB",
  5000: "RPC_MANTLE",
  100: "RPC_GNOSIS",
  1101: "RPC_POLYGON_ZKEVM",
  42220: "RPC_CELO",
};

export function getChainConfig(chainId: number): ChainConfig {
  const chain = CHAINS[chainId];
  if (!chain) {
    throw new Error(`Unknown chainId: ${chainId}`);
  }

  // Check for validated env override
  const envKey = RPC_ENV_MAP[chainId];
  const envRpc = envKey ? env[envKey] as string | undefined : undefined;

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
