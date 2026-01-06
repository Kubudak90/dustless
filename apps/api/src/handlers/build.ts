import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import { registry } from "../providers/index.js";
import type { BuildResponse, Quote } from "@dustless/shared";

const QuoteSchema: z.ZodType<Quote> = z.object({
  provider: z.enum(["lifi", "socket"]),
  routeId: z.string(),
  steps: z.array(z.object({
    fromChainId: z.number(),
    toChainId: z.number(),
    tool: z.string(),
    estimatedFeeUsd: z.number().optional(),
    estimatedTimeSec: z.number().optional(),
  })),
  estimatedReceivedWei: z.string(),
  estimatedReceivedUsd: z.number().optional(),
  estimatedTotalFeeUsd: z.number().optional(),
  estimatedTotalTimeSec: z.number().optional(),
});

const BuildRequestSchema = z.object({
  quote: QuoteSchema,
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
});

/**
 * POST /build
 * 
 * Builds transaction data for a selected quote.
 * Returns transaction steps to be executed by the user's wallet.
 */
export async function buildHandler(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<BuildResponse> {
  const body = BuildRequestSchema.parse(req.body);

  const provider = registry.get(body.quote.provider);
  if (!provider) {
    return reply.status(400).send({
      error: `Unknown provider: ${body.quote.provider}`,
    } as any);
  }

  try {
    const steps = await provider.build({
      quote: body.quote,
      userAddress: body.userAddress,
    });

    // Add warnings for user safety
    const warnings: string[] = [];

    if (steps.length > 1) {
      warnings.push(`This route requires ${steps.length} transactions.`);
    }

    // Check for large value transfers
    const totalValue = steps.reduce(
      (sum, step) => sum + BigInt(step.value),
      0n
    );
    if (totalValue > BigInt(1e18)) {
      // > 1 ETH
      warnings.push("Large value transfer. Please verify all details carefully.");
    }

    return reply.send({ steps, warnings });
  } catch (err) {
    console.error("Build failed:", err);
    return reply.status(500).send({
      error: "Failed to build transaction",
      details: err instanceof Error ? err.message : "Unknown error",
    } as any);
  }
}
