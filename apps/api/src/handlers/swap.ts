import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import { swapRegistry } from "../providers/SwapProvider.js";
import type { SwapResponse, SwapQuote, SwapBuildRequest, BuildResponse } from "@dustless/shared";
import { NoRoutesFoundError } from "@dustless/shared";
import { deduplicateRequest, createDeduplicationKey } from "../services/deduplication.js";
import { metrics, MetricNames } from "../services/metrics.js";
import { loggers } from "../config/logger.js";

const log = loggers.swap;

const SwapRequestSchema = z.object({
  chainId: z.number().int().positive(),
  fromToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address"),
  toToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address"),
  amount: z.string().regex(/^\d+$/, "Amount must be a positive integer string"),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  slippage: z.number().min(0).max(50).optional(), // 0-50%
});

const SwapBuildRequestSchema = z.object({
  quote: z.object({
    provider: z.literal("odos"),
    pathId: z.string(),
    fromToken: z.object({
      address: z.string(),
      symbol: z.string(),
      name: z.string(),
      decimals: z.number(),
      chainId: z.number(),
    }),
    toToken: z.object({
      address: z.string(),
      symbol: z.string(),
      name: z.string(),
      decimals: z.number(),
      chainId: z.number(),
    }),
    fromAmount: z.string(),
    toAmount: z.string(),
    estimatedGas: z.string().optional(),
    estimatedGasUsd: z.number().optional(),
    priceImpact: z.number().optional(),
  }),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
});

/**
 * POST /swap
 *
 * Gets swap quotes from DEX aggregators (Odos).
 * Used to convert tokens to ETH on the same chain.
 */
export async function swapHandler(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<SwapResponse> {
  const body = SwapRequestSchema.parse(req.body);
  const startTime = Date.now();

  metrics.incrementCounter(MetricNames.REQUESTS_TOTAL);
  metrics.incrementCounter("requests.swap");

  // Create deduplication key
  const dedupKey = createDeduplicationKey("swap", {
    chainId: body.chainId,
    fromToken: body.fromToken,
    toToken: body.toToken,
    amount: body.amount,
    userAddress: body.userAddress,
  });

  try {
    // Deduplicate the request
    const result = await deduplicateRequest(dedupKey, async () => {
      // Get all registered swap providers
      const providers = swapRegistry.all();

      if (providers.length === 0) {
        throw new Error("No swap providers configured");
      }

      // Query all providers in parallel
      const results = await Promise.allSettled(
        providers.map((p) => p.quote(body))
      );

      // Flatten and filter successful quotes
      const quotes: SwapQuote[] = results.flatMap((result, i) => {
        if (result.status === "fulfilled") {
          return result.value;
        }
        log.warn({ provider: providers[i].name, err: result.reason }, 'Swap provider failed');
        return [];
      });

      if (quotes.length === 0) {
        throw new NoRoutesFoundError(body.chainId, body.chainId, "swap");
      }

      // Sort by best output (highest received amount first)
      quotes.sort((a, b) => {
        const aValue = BigInt(a.toAmount);
        const bValue = BigInt(b.toAmount);
        if (bValue > aValue) return 1;
        if (bValue < aValue) return -1;
        return 0;
      });

      return { quotes };
    });

    metrics.recordHistogram("swap.duration_ms", Date.now() - startTime);
    return reply.send(result);
  } catch (err) {
    metrics.incrementCounter("requests.errors");
    throw err;
  }
}

/**
 * POST /swap/build
 *
 * Builds executable transaction for a swap quote.
 */
export async function swapBuildHandler(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<BuildResponse> {
  const body = SwapBuildRequestSchema.parse(req.body);
  const startTime = Date.now();

  metrics.incrementCounter(MetricNames.REQUESTS_TOTAL);
  metrics.incrementCounter("requests.swap_build");

  try {
    const provider = swapRegistry.get(body.quote.provider);
    if (!provider) {
      throw new Error(`Unknown swap provider: ${body.quote.provider}`);
    }

    const steps = await provider.build(body);

    metrics.recordHistogram("swap_build.duration_ms", Date.now() - startTime);

    return reply.send({
      steps,
      warnings: [
        "Always verify transaction details in your wallet before signing",
        "Ensure you have sufficient gas for the swap",
      ],
    });
  } catch (err) {
    metrics.incrementCounter("requests.errors");
    throw err;
  }
}
