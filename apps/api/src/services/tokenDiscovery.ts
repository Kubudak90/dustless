/**
 * Token Discovery Service
 *
 * Discovers ERC-20 tokens for a user address using:
 * - Tier 1: Popular tokens (hardcoded, always available)
 * - Tier 2: Explorer API (tokentx endpoint, requires API key)
 *
 * Uses tiered approach for reliability and completeness.
 */

import { request } from "undici";
import {
  getExplorerConfig,
  getPopularTokens,
  hasExplorerApi,
  type PopularToken,
} from "../config/tokenLists.js";
import { loggers } from "../config/logger.js";
import { cache, CacheKeys, CacheTTL } from "./cache.js";

const log = loggers.balance;

const REQUEST_TIMEOUT = 15000; // 15 seconds

// ============ Types ============

export interface DiscoveredToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  source: "popular" | "explorer";
}

interface ExplorerTokenTx {
  contractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimal: string;
}

interface ExplorerResponse {
  status: string;
  message: string;
  result: ExplorerTokenTx[] | string;
}

// ============ Discovery Functions ============

/**
 * Discover all tokens for a user address on a specific chain.
 * Uses tiered approach:
 * 1. Start with popular tokens (always available)
 * 2. Add tokens from explorer API if available
 */
export async function discoverTokens(
  chainId: number,
  userAddress: string
): Promise<DiscoveredToken[]> {
  const tokens = new Map<string, DiscoveredToken>();

  // Tier 1: Popular tokens (always included)
  const popularTokens = getPopularTokens(chainId);
  for (const token of popularTokens) {
    tokens.set(token.address.toLowerCase(), {
      ...token,
      source: "popular",
    });
  }

  log.debug({ chainId, popularCount: popularTokens.length }, "Added popular tokens");

  // Tier 2: Explorer API tokens (if available)
  if (hasExplorerApi(chainId)) {
    try {
      const explorerTokens = await discoverFromExplorer(chainId, userAddress);
      for (const token of explorerTokens) {
        const key = token.address.toLowerCase();
        // Only add if not already in popular tokens
        if (!tokens.has(key)) {
          tokens.set(key, token);
        }
      }
      log.debug({ chainId, explorerCount: explorerTokens.length }, "Added explorer tokens");
    } catch (error) {
      log.warn({ err: error, chainId }, "Explorer token discovery failed, using popular tokens only");
    }
  }

  return Array.from(tokens.values());
}

/**
 * Discover tokens from explorer API (tokentx endpoint)
 * Returns unique tokens that the user has interacted with.
 */
async function discoverFromExplorer(
  chainId: number,
  userAddress: string
): Promise<DiscoveredToken[]> {
  const config = getExplorerConfig(chainId);
  if (!config || !config.apiKey) {
    return [];
  }

  // Check cache first
  const cacheKey = CacheKeys.explorerTokens(chainId, userAddress);
  if (cache.isEnabled()) {
    const cached = await cache.get<DiscoveredToken[]>(cacheKey);
    if (cached) {
      log.debug({ chainId, count: cached.length }, "Using cached explorer tokens");
      return cached;
    }
  }

  try {
    const url = new URL(config.apiUrl + config.tokenTxEndpoint);
    url.searchParams.set("address", userAddress);
    url.searchParams.set("startblock", "0");
    url.searchParams.set("endblock", "99999999");
    url.searchParams.set("sort", "desc");
    url.searchParams.set("apikey", config.apiKey);

    const response = await request(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      headersTimeout: REQUEST_TIMEOUT,
      bodyTimeout: REQUEST_TIMEOUT,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (response.statusCode !== 200) {
      log.warn({ chainId, statusCode: response.statusCode }, "Explorer API error");
      return [];
    }

    const data = (await response.body.json()) as ExplorerResponse;

    if (data.status !== "1" || !Array.isArray(data.result)) {
      // Status "0" with "No transactions found" is normal
      if (data.message?.includes("No transactions found")) {
        return [];
      }
      log.warn({ chainId, message: data.message }, "Explorer API returned error");
      return [];
    }

    // Extract unique tokens from transactions
    const tokenMap = new Map<string, DiscoveredToken>();

    for (const tx of data.result) {
      const address = tx.contractAddress?.toLowerCase();
      if (!address || tokenMap.has(address)) {
        continue;
      }

      // Validate token data
      if (!tx.tokenSymbol || !tx.tokenName) {
        continue;
      }

      const decimals = parseInt(tx.tokenDecimal || "18", 10);
      if (isNaN(decimals) || decimals < 0 || decimals > 18) {
        continue;
      }

      tokenMap.set(address, {
        address: tx.contractAddress,
        symbol: tx.tokenSymbol,
        name: tx.tokenName,
        decimals,
        source: "explorer",
      });
    }

    const tokens = Array.from(tokenMap.values());

    // Cache the results
    if (cache.isEnabled() && tokens.length > 0) {
      await cache.set(cacheKey, tokens, CacheTTL.EXPLORER_TOKENS);
    }

    return tokens;
  } catch (error) {
    log.error({ err: error, chainId }, "Failed to fetch from explorer API");
    return [];
  }
}

/**
 * Get token info for a specific token address.
 * Checks popular tokens first, then tries explorer API.
 */
export async function getTokenInfo(
  chainId: number,
  tokenAddress: string,
  userAddress?: string
): Promise<DiscoveredToken | null> {
  const address = tokenAddress.toLowerCase();

  // Check popular tokens first
  const popularTokens = getPopularTokens(chainId);
  const popular = popularTokens.find((t) => t.address.toLowerCase() === address);
  if (popular) {
    return { ...popular, source: "popular" };
  }

  // Try explorer API if user address is provided
  if (userAddress && hasExplorerApi(chainId)) {
    try {
      const explorerTokens = await discoverFromExplorer(chainId, userAddress);
      const found = explorerTokens.find((t) => t.address.toLowerCase() === address);
      if (found) {
        return found;
      }
    } catch {
      // Ignore errors
    }
  }

  return null;
}

/**
 * Convert discovered tokens to TokenConfig format
 */
export function toTokenConfigs(
  tokens: DiscoveredToken[],
  chainId: number
): import("@dustless/shared").TokenConfig[] {
  return tokens.map((token) => ({
    chainId,
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
  }));
}
