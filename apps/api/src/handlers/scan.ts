import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import { scanBalances, identifyStuckAssets } from "../services/balances.js";
import { getSourceChainIds } from "@dustless/shared";
import type { ScanResponse } from "@dustless/shared";
import { priceOracle } from "../services/priceOracle.js";
import { deduplicateRequest, createDeduplicationKey } from "../services/deduplication.js";
import { metrics, MetricNames } from "../services/metrics.js";

const ScanRequestSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  chainIds: z.array(z.number().int().positive()).min(1).optional(),
});

/**
 * POST /scan
 * 
 * Scans chains for native ETH balances and identifies "stuck" assets
 * that could be recovered (bridged) to a target chain.
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
    // Scan all chains in parallel
    const balances = await scanBalances(body.address, chainIds);

    // Identify stuck assets (non-target chains with balance > dust)
    const stuck = identifyStuckAssets(balances);

    // Calculate USD values for stuck assets
    const stuckWithPrices = await Promise.all(
      stuck.map(async (asset) => {
        const usdValue = await priceOracle.calculateUSDValue(asset.wei);
        return {
          ...asset,
          usdValue,
        };
      })
    );

    // Calculate total stuck USD value
    const totalStuckUsd = stuckWithPrices.reduce(
      (sum, asset) => sum + (asset.usdValue || 0),
      0
    );

    return {
      balances,
      stuck: stuckWithPrices,
      totalStuckUsd,
    };
  });

  // Track duration
  const duration = Date.now() - startTime;
  metrics.recordHistogram(MetricNames.SCAN_DURATION_MS, duration);

  return reply.send(result);
}
