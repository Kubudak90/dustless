import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import { registry } from "../providers/index.js";
import type { BuildResponse, Quote, SimulationInfo } from "@dustless/shared";
import { loggers } from "../config/logger.js";
import { simulateMultipleTransactions } from "../services/simulation.js";

const log = loggers.build;

const QuoteSchema: z.ZodType<Quote> = z.object({
  provider: z.enum(["lifi", "socket", "across", "zora"]),
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
  // Recovery fee fields (optional for backward compatibility)
  recoveryFeeWei: z.string().optional(),
  recoveryFeeUsd: z.number().optional(),
  recoveryFeePercentage: z.number().optional(),
  finalAmountWei: z.string().optional(),
  finalAmountUsd: z.number().optional(),
  shouldBatch: z.boolean().optional(),
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

    // Simulate transactions before returning
    let simulation: SimulationInfo | undefined;
    try {
      const simResult = await simulateMultipleTransactions(steps, body.userAddress);
      simulation = {
        success: simResult.success,
        totalGasUsed: simResult.totalGasUsed,
        stepResults: simResult.stepResults,
        warnings: simResult.warnings,
      };

      // If simulation failed, return error with details
      if (!simResult.success) {
        const failedStep = simResult.stepResults.find((s) => !s.success);
        return reply.status(400).send({
          error: "SIMULATION_FAILED",
          message: "Transaction simulation failed",
          revertReason: failedStep?.revertReason || "Unknown error",
          simulation,
        } as any);
      }

      // Add simulation warnings to response warnings
      warnings.push(...simResult.warnings);
    } catch (simError) {
      // Log simulation error but continue - don't block the build
      log.warn({ err: simError }, "Simulation failed, continuing without simulation");
      warnings.push("Transaction simulation unavailable. Please verify manually.");
    }

    // Include fee information if available in quote
    const recoveryFee = body.quote.recoveryFeeUsd !== undefined ? {
      feeUsd: body.quote.recoveryFeeUsd,
      feePercentage: body.quote.recoveryFeePercentage || 0,
      finalAmountUsd: body.quote.finalAmountUsd || 0,
      shouldBatch: body.quote.shouldBatch,
    } : undefined;

    return reply.send({ steps, warnings, simulation, recoveryFee });
  } catch (err) {
    log.error({ err }, 'Build failed');
    return reply.status(500).send({
      error: "Failed to build transaction",
      details: err instanceof Error ? err.message : "Unknown error",
    } as any);
  }
}
