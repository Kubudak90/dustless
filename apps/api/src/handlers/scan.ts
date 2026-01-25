import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import { scanBalances, identifyStuckAssets } from "../services/balances.js";
import { getSourceChainIds } from "@dustless/shared";
import type { ScanResponse } from "@dustless/shared";
import { priceOracle } from "../services/priceOracle.js";
import { deduplicateRequest, createDeduplicationKey } from "../services/deduplication.js";
import { metrics, MetricNames } from "../services/metrics.js";
import { loggers } from "../config/logger.js";

const log = loggers.scan;

const ScanRequestSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  chainIds: z.array(z.number().int().positive()).min(1).optional(),
});

/**
 * POST /scan
 *
 * Scans chains for native ETH + ERC-20 token balances and identifies "stuck" assets
 * that could be recovered (swapped + bridged) to a target chain.
 */
export async function scanHandler(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<ScanResponse> {
  const body = ScanRequestSchema.parse(req.body);
  const startTime = Date.now();

  // Track request
  metrics.incrementCounter(MetricNames.REQUESTS_TOTAL);
  metrics.incrementCounter(MetricNames.REQUESTS_SCAN);

  // Default to all source chains if not specified
  const chainIds = body.chainIds ?? getSourceChainIds();

  // Create deduplication key
  const dedupKey = createDeduplicationKey("scan", {
    address: body.address,
    chainIds: chainIds.sort(),
  });

  // Deduplicate the request
  const result = await deduplicateRequest(dedupKey, async () => {
    // Scan all chains in parallel for native + ERC-20 balances
    const balances = await scanBalances(body.address, chainIds);

    // Calculate USD values for all balances
    const usdValuesMap = new Map<string, number>();
    await Promise.all(
      balances.map(async (balance) => {
        if (!balance.ok) return;

        const balanceKey = `${balance.chainId}:${balance.tokenAddress}`;
        try {
          const usdValue = await priceOracle.calculateTokenUSDValue(
            balance.balance,
            balance.decimals,
            balance.symbol,
            balance.symbol.includes("USD") // Simple check for stablecoins
          );
          usdValuesMap.set(balanceKey, usdValue);
        } catch (err) {
          log.error({ err, symbol: balance.symbol }, 'Failed to calculate USD');
        }
      })
    );

    // Identify stuck assets (non-target chains with balance > dust threshold)
    // Calculate bridgeable amounts using gas manager
    const stuck = await identifyStuckAssets(balances, usdValuesMap);

    // Calculate total stuck USD value
    const totalStuckUsd = stuck.reduce(
      (sum, asset) => sum + (asset.usdValue || 0),
      0
    );

    return {
      balances,
      stuck,
      totalStuckUsd,
    };
  });

  // Track duration
  const duration = Date.now() - startTime;
  metrics.recordHistogram(MetricNames.SCAN_DURATION_MS, duration);

  return reply.send(result);
}
