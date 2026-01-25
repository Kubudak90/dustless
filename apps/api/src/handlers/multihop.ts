/**
 * Multi-Hop Route Handlers
 *
 * Endpoints for composing and building multi-hop routes
 * (ERC-20 → swap → native → bridge → destination)
 */

import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  type MultiHopQuoteResponse,
  type MultiHopBuildResponse,
  type ComposedRoute,
  NoRoutesFoundError,
} from "@dustless/shared";
import { composeRoutes, buildComposedRoute } from "../services/routeComposer.js";
import { simulateMultipleTransactions } from "../services/simulation.js";
import { deduplicateRequest, createDeduplicationKey } from "../services/deduplication.js";
import { loggers } from "../config/logger.js";

const log = loggers.quote;

// ============ Request Schemas ============

const MultiHopQuoteRequestSchema = z.object({
  fromChainId: z.number().int().positive(),
  toChainId: z.number().int().positive(),
  fromToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address"),
  amount: z.string().regex(/^\d+$/, "Amount must be a positive integer string"),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  slippage: z.number().min(0).max(50).optional(),
});

const RouteStepSchema = z.object({
  type: z.enum(["swap", "bridge"]),
  chainId: z.number(),
  fromToken: z.string(),
  toToken: z.string(),
  tool: z.string(),
  estimatedTimeSec: z.number().optional(),
});

const SwapQuoteSchema = z.object({
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
});

const BridgeQuoteSchema = z.object({
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
  recoveryFeeWei: z.string().optional(),
  recoveryFeeUsd: z.number().optional(),
  recoveryFeePercentage: z.number().optional(),
  finalAmountWei: z.string().optional(),
  finalAmountUsd: z.number().optional(),
  shouldBatch: z.boolean().optional(),
});

const ComposedRouteSchema: z.ZodType<ComposedRoute> = z.object({
  id: z.string(),
  swapQuote: SwapQuoteSchema.optional(),
  bridgeQuote: BridgeQuoteSchema,
  estimatedReceivedWei: z.string(),
  estimatedReceivedUsd: z.number().optional(),
  estimatedTotalTimeSec: z.number(),
  estimatedTotalFeeUsd: z.number().optional(),
  steps: z.array(RouteStepSchema),
});

const MultiHopBuildRequestSchema = z.object({
  route: ComposedRouteSchema,
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
});

// ============ Handlers ============

/**
 * POST /route
 *
 * Gets multi-hop route quotes for ERC-20 → destination chain ETH transfers.
 * Automatically composes swap + bridge when needed.
 */
export async function multihopQuoteHandler(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<MultiHopQuoteResponse> {
  const body = MultiHopQuoteRequestSchema.parse(req.body);

  // Create deduplication key
  const dedupKey = createDeduplicationKey("multihop", {
    fromChainId: body.fromChainId,
    toChainId: body.toChainId,
    fromToken: body.fromToken,
    amount: body.amount,
    userAddress: body.userAddress,
  });

  try {
    const result = await deduplicateRequest(dedupKey, async () => {
      log.info(
        {
          fromChainId: body.fromChainId,
          toChainId: body.toChainId,
          fromToken: body.fromToken,
        },
        "Composing multi-hop routes"
      );

      const routes = await composeRoutes(body);

      if (routes.length === 0) {
        throw new NoRoutesFoundError(body.fromChainId, body.toChainId, "multi-hop");
      }

      log.info({ routeCount: routes.length }, "Multi-hop routes composed");

      return { routes };
    });

    return reply.send(result);
  } catch (err) {
    if (err instanceof NoRoutesFoundError) {
      return reply.status(404).send({
        error: "NO_ROUTES_FOUND",
        message: err.message,
      } as any);
    }
    throw err;
  }
}

/**
 * POST /route/build
 *
 * Builds transaction steps for a selected multi-hop route.
 * Includes transaction simulation for safety.
 */
export async function multihopBuildHandler(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<MultiHopBuildResponse> {
  const body = MultiHopBuildRequestSchema.parse(req.body);

  try {
    log.info({ routeId: body.route.id }, "Building multi-hop route");

    // Build transaction steps
    const steps = await buildComposedRoute(body.route, body.userAddress);

    // Add warnings
    const warnings: string[] = [];

    if (steps.length > 1) {
      warnings.push(`This route requires ${steps.length} transactions.`);
    }

    if (body.route.swapQuote) {
      warnings.push("This route includes a token swap before bridging.");
    }

    // Simulate transactions
    let simulation;
    try {
      const simResult = await simulateMultipleTransactions(steps, body.userAddress);
      simulation = {
        success: simResult.success,
        totalGasUsed: simResult.totalGasUsed,
        stepResults: simResult.stepResults,
        warnings: simResult.warnings,
      };

      if (!simResult.success) {
        const failedStep = simResult.stepResults.find((s) => !s.success);
        return reply.status(400).send({
          error: "SIMULATION_FAILED",
          message: "Transaction simulation failed",
          revertReason: failedStep?.revertReason || "Unknown error",
          simulation,
        } as any);
      }

      warnings.push(...simResult.warnings);
    } catch (simError) {
      log.warn({ err: simError }, "Simulation failed, continuing without simulation");
      warnings.push("Transaction simulation unavailable. Please verify manually.");
    }

    return reply.send({ steps, simulation, warnings });
  } catch (err) {
    log.error({ err, routeId: body.route.id }, "Multi-hop build failed");
    return reply.status(500).send({
      error: "BUILD_FAILED",
      message: err instanceof Error ? err.message : "Unknown error",
    } as any);
  }
}
