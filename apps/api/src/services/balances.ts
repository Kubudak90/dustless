import { isAddress, formatEther } from "viem";
import { getPublicClient } from "./rpcHealth.js";
import { getChainConfig } from "../config/chains.js";
import type { BalanceResult, BalanceError, StuckAsset } from "@dustless/shared";

/**
 * Get native ETH balance for an address on a specific chain
 */
export async function getNativeBalance(
  chainId: number,
  address: string
): Promise<BalanceResult> {
  if (!isAddress(address)) {
    throw new Error("Invalid address format");
  }

  const client = await getPublicClient(chainId);
  const wei = await client.getBalance({ address: address as `0x${string}` });

  return {
    chainId,
    symbol: "ETH",
    wei: wei.toString(),
    ok: true,
  };
}

/**
 * Scan multiple chains for balances
 */
export async function scanBalances(
  address: string,
  chainIds: number[]
): Promise<Array<BalanceResult | BalanceError>> {
  const results = await Promise.allSettled(
    chainIds.map((chainId) => getNativeBalance(chainId, address))
  );

  return results.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      chainId: chainIds[i],
      ok: false as const,
      error: result.reason?.message ?? "Unknown error",
    };
  });
}

/**
 * Identify "stuck" assets based on heuristics:
 * - Balance > 0
 * - Chain has "abandoned" tag OR low activity
 * 
 * MVP: Just check if balance > dust threshold
 */
const DUST_THRESHOLD_WEI = BigInt(1e14); // 0.0001 ETH

export function identifyStuckAssets(
  balances: Array<BalanceResult | BalanceError>
): StuckAsset[] {
  const stuck: StuckAsset[] = [];

  for (const balance of balances) {
    if (!balance.ok) continue;

    const wei = BigInt(balance.wei);
    if (wei < DUST_THRESHOLD_WEI) continue;

    const chain = getChainConfig(balance.chainId);

    // MVP: Consider everything above dust threshold as "potentially stuck"
    // In production, we'd check chain activity, bridge liquidity, etc.
    const isAbandoned = chain.tags.includes("abandoned");
    
    // For MVP, show all non-target chains as potential recovery candidates
    const isNonTarget = !chain.tags.includes("target");

    if (isAbandoned || isNonTarget) {
      stuck.push({
        chainId: balance.chainId,
        chainName: chain.name,
        symbol: "ETH",
        wei: balance.wei,
        // TODO: Add USD value via price oracle
      });
    }
  }

  return stuck;
}

/**
 * Format balance for display
 */
export function formatBalance(wei: string): string {
  const value = BigInt(wei);
  const eth = formatEther(value);
  
  // Smart formatting
  const num = parseFloat(eth);
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  if (num < 1) return num.toFixed(4);
  if (num < 100) return num.toFixed(3);
  return num.toFixed(2);
}
