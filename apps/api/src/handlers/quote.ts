import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import { registry } from "../providers/index.js";
import type { QuoteResponse, Quote, QuoteRequest } from "@dustless/shared";
import { NoRoutesFoundError } from "@dustless/shared";
import { deduplicateRequest, createDeduplicationKey } from "../services/deduplication.js";
import { calculateRecoveryFee, isRecoveryWorthwhile } from "../services/feeCalculator.js";
import { cache, CacheKeys, CacheTTL } from "../services/cache.js";
import { loggers } from "../config/logger.js";

const log = loggers.quote;

const QuoteRequestSchema = z.object({
  fromChainId: z.number().int().positive(),
  toChainId: z.number().int().positive(),
  tokenSymbol: z.enum(["ETH", "BNB", "AVAX", "MATIC", "xDAI", "CELO", "MNT"]).default("ETH"),
  amountWei: z.string().regex(/^\d+$/, "Amount must be a positive integer string"),
  fromAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
});

/**
 * POST /quote
 * 
 * Gets bridge quotes from all registered providers.
 * Returns quotes sorted by estimated received amount (best first).
 */
export async function quoteHandler(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<QuoteResponse> {
  const body = QuoteRequestSchema.parse(req.body) as QuoteRequest;

  // Check cache first
  if (cache.isEnabled()) {
    const cacheKey = CacheKeys.quote({
      fromChainId: body.fromChainId,
      toChainId: body.toChainId,
      tokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Native ETH
      amountWei: body.amountWei,
    });

    const cachedQuotes = await cache.get<QuoteResponse>(cacheKey);
    if (cachedQuotes) {
      log.debug({ fromChainId: body.fromChainId, toChainId: body.toChainId }, 'Returning cached quotes');
      return cachedQuotes;
    }
  }

  // Create deduplication key
  const dedupKey = createDeduplicationKey("quote", {
    fromChainId: body.fromChainId,
    toChainId: body.toChainId,
    amountWei: body.amountWei,
    fromAddress: body.fromAddress,
  });

  // Deduplicate the request
  const result = await deduplicateRequest(dedupKey, async () => {
    // Get all registered providers (includes LI.FI, Socket, Across)
    const providers = registry.all();

    if (providers.length === 0) {
      throw new Error("No bridge providers configured");
    }

    // Log which providers are being queried
    log.info({ providers: providers.map(p => p.name), count: providers.length }, 'Fetching quotes from providers');

    // Query all providers in parallel (LI.FI, Socket, Across)
    const results = await Promise.allSettled(
      providers.map((p) => p.quote(body))
    );

    // Flatten and filter successful quotes
    const quotes: Quote[] = results.flatMap((result, i) => {
      if (result.status === "fulfilled") {
        const providerQuotes = result.value;
        if (providerQuotes.length > 0) {
          log.debug({ provider: providers[i].name, count: providerQuotes.length }, 'Provider returned quotes');
        }
        return providerQuotes;
      }
      log.warn({ provider: providers[i].name, err: result.reason }, 'Provider failed');
      return [];
    });

    if (quotes.length === 0) {
      throw new NoRoutesFoundError(body.fromChainId, body.toChainId);
    }

    // Calculate recovery fees for each quote
    const quotesWithFees: Quote[] = await Promise.all(
      quotes.map(async (quote) => {
        // Get gas + bridge costs (from provider)
        const gasAndBridgeCostUsd = quote.estimatedTotalFeeUsd || 0;

        // Use estimated USD value if available, otherwise will calculate from wei
        const grossAmountUsd = quote.estimatedReceivedUsd;

        // Calculate recovery fee
        const feeCalculation = await calculateRecoveryFee(
          quote.estimatedReceivedWei,
          gasAndBridgeCostUsd,
          grossAmountUsd
        );

        // Check if recovery is worthwhile
        if (!isRecoveryWorthwhile(feeCalculation)) {
          // Return quote with zero final amount (will be filtered)
          return {
            ...quote,
            recoveryFeeWei: feeCalculation.feeWei,
            recoveryFeeUsd: feeCalculation.feeUsd,
            recoveryFeePercentage: feeCalculation.feePercentage,
            finalAmountWei: "0",
            finalAmountUsd: 0,
            shouldBatch: feeCalculation.shouldBatch,
          };
        }

        return {
          ...quote,
          recoveryFeeWei: feeCalculation.feeWei,
          recoveryFeeUsd: feeCalculation.feeUsd,
          recoveryFeePercentage: feeCalculation.feePercentage,
          finalAmountWei: feeCalculation.finalAmountWei,
          finalAmountUsd: feeCalculation.finalAmountUsd,
          shouldBatch: feeCalculation.shouldBatch,
        };
      })
    );

    // Filter out quotes where user would receive nothing or negative amount
    const worthwhileQuotes = quotesWithFees.filter(
      (q) => BigInt(q.finalAmountWei || "0") > 0n
    );

    if (worthwhileQuotes.length === 0) {
      throw new NoRoutesFoundError(body.fromChainId, body.toChainId);
    }

    // Sort by best final amount (highest amount user will receive)
    worthwhileQuotes.sort((a, b) => {
      const aValue = BigInt(a.finalAmountWei || "0");
      const bValue = BigInt(b.finalAmountWei || "0");
      if (bValue > aValue) return 1;
      if (bValue < aValue) return -1;
      return 0;
    });

    const response: QuoteResponse = { quotes: worthwhileQuotes };

    // Cache the response
    if (cache.isEnabled()) {
      const cacheKey = CacheKeys.quote({
        fromChainId: body.fromChainId,
        toChainId: body.toChainId,
        tokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Native ETH
        amountWei: body.amountWei,
      });

      await cache.set(cacheKey, response, CacheTTL.QUOTE);
    }

    return response;
  });

  return reply.send(result);
}
