import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import { registry } from "../providers/index.js";
import type { QuoteResponse, Quote } from "@dustless/shared";

const QuoteRequestSchema = z.object({
  fromChainId: z.number().int().positive(),
  toChainId: z.number().int().positive(),
  tokenSymbol: z.literal("ETH").default("ETH"),
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
  const body = QuoteRequestSchema.parse(req.body);

  // Get all registered providers
  const providers = registry.all();

  if (providers.length === 0) {
    return reply.status(500).send({
      error: "No bridge providers configured",
    } as any);
  }

  // Query all providers in parallel
  const results = await Promise.allSettled(
    providers.map((p) => p.quote(body))
  );

  // Flatten and filter successful quotes
  const quotes: Quote[] = results.flatMap((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    console.error(`Provider ${providers[i].name} failed:`, result.reason);
    return [];
  });

  if (quotes.length === 0) {
    return reply.send({
      quotes: [],
      // No routes found - could be due to:
      // - Unsupported chain pair
      // - Amount too small
      // - Insufficient liquidity
    });
  }

  // Sort by best output (highest received amount first)
  quotes.sort((a, b) => {
    const aValue = BigInt(a.estimatedReceivedWei);
    const bValue = BigInt(b.estimatedReceivedWei);
    if (bValue > aValue) return 1;
    if (bValue < aValue) return -1;
    return 0;
  });

  return reply.send({ quotes });
}
