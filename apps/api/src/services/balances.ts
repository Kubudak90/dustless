import { isAddress, formatUnits } from "viem";
import { getChainConfig } from "../config/chains.js";
import type { BalanceResult, BalanceError, StuckAsset } from "@dustless/shared";
import { getPopularTokens } from "@dustless/shared";
import { scanTokenBalances, isBalanceStuck } from "./tokenBalances.js";

/**
 * Scan multiple chains for native + ERC-20 token balances
 * Returns all balances (ETH + popular tokens) for each chain
 */
export async function scanBalances(
  address: string,
  chainIds: number[]
): Promise<Array<BalanceResult | BalanceError>> {
  if (!isAddress(address)) {
    throw new Error("Invalid address format");
  }

  // Scan all chains in parallel
  const results = await Promise.allSettled(
    chainIds.map(async (chainId) => {
      try {
        const popularTokens = getPopularTokens(chainId);
        const balances = await scanTokenBalances(chainId, address, popularTokens);
        return balances;
      } catch (error) {
        const err: BalanceError = {
          chainId,
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return [err];
      }
    })
  );

  // Flatten results
  const allBalances: Array<BalanceResult | BalanceError> = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      allBalances.push(...result.value);
    } else {
      allBalances.push({
        chainId: chainIds[i],
        ok: false,
        error: result.reason?.message ?? "Unknown error",
      });
    }
  });

  return allBalances;
}

/**
 * Identify "stuck" assets based on heuristics:
 * - Balance > minimum threshold
 * - Chain has "abandoned" tag OR is not a target chain
 * - Worth rescuing (> $1 USD or > 0.001 tokens)
 */
export function identifyStuckAssets(
  balances: Array<BalanceResult | BalanceError>,
  usdValues?: Map<string, number>
): StuckAsset[] {
  const stuck: StuckAsset[] = [];

  for (const balance of balances) {
    if (!balance.ok) continue;

    const balanceKey = `${balance.chainId}:${balance.tokenAddress}`;
    const usdValue = usdValues?.get(balanceKey);

    // Check if balance is worth rescuing
    if (!isBalanceStuck(balance.balance, balance.decimals, usdValue)) {
      continue;
    }

    const chain = getChainConfig(balance.chainId);

    // Identify abandoned or non-target chains
    const isAbandoned = chain.tags.includes("abandoned");
    const isNonTarget = !chain.tags.includes("target");

    // Only include balances on chains that are worth consolidating from
    if (isAbandoned || isNonTarget) {
      stuck.push({
        chainId: balance.chainId,
        chainName: chain.name,
        tokenAddress: balance.tokenAddress,
        symbol: balance.symbol,
        name: balance.name,
        decimals: balance.decimals,
        balance: balance.balance,
        usdValue,
      });
    }
  }

  return stuck;
}

/**
 * Format balance for display
 */
export function formatBalance(balance: string, decimals: number): string {
  const value = BigInt(balance);
  const formatted = formatUnits(value, decimals);

  // Smart formatting
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  if (num < 1) return num.toFixed(4);
  if (num < 100) return num.toFixed(3);
  return num.toFixed(2);
}
