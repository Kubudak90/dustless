import { createPublicClient, http, type PublicClient } from "viem";
import { getChainConfig } from "../config/chains.js";

// Cache healthy clients per chain
const clientCache = new Map<number, { client: PublicClient; url: string; expiry: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Get a healthy RPC URL for a chain
 * Tries each configured RPC in order until one responds
 */
export async function pickHealthyRpc(chainId: number): Promise<string> {
  const cached = clientCache.get(chainId);
  if (cached && cached.expiry > Date.now()) {
    return cached.url;
  }

  const chain = getChainConfig(chainId);

  for (const url of chain.rpcUrls) {
    try {
      const client = createPublicClient({
        chain: {
          id: chainId,
          name: chain.name,
          nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
          },
          rpcUrls: {
            default: { http: [url] },
          },
        },
        transport: http(url, { timeout: 5_000 }),
      });

      // Quick health check
      await client.getBlockNumber();

      // Cache the healthy client
      clientCache.set(chainId, {
        client,
        url,
        expiry: Date.now() + CACHE_TTL_MS,
      });

      return url;
    } catch (err) {
      // Try next RPC
      console.warn(`RPC ${url} for chain ${chainId} failed:`, err);
    }
  }

  throw new Error(`No healthy RPC available for chain ${chainId} (${chain.name})`);
}

/**
 * Get a cached or fresh public client for a chain
 */
export async function getPublicClient(chainId: number): Promise<PublicClient> {
  const cached = clientCache.get(chainId);
  if (cached && cached.expiry > Date.now()) {
    return cached.client;
  }

  // This will populate the cache
  const url = await pickHealthyRpc(chainId);
  const entry = clientCache.get(chainId);
  if (!entry) {
    throw new Error("Cache should be populated after pickHealthyRpc");
  }
  return entry.client;
}

/**
 * Check health of all configured chains
 */
export async function checkAllChainsHealth(): Promise<
  Array<{ chainId: number; name: string; healthy: boolean; rpc?: string; error?: string }>
> {
  const chains = Object.values(await import("@dustless/shared").then((m) => m.CHAINS));

  const results = await Promise.allSettled(
    chains.map(async (chain) => {
      const url = await pickHealthyRpc(chain.id);
      return { chainId: chain.id, name: chain.name, healthy: true, rpc: url };
    })
  );

  return results.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      chainId: chains[i].id,
      name: chains[i].name,
      healthy: false,
      error: result.reason?.message ?? "Unknown error",
    };
  });
}
