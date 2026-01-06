import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import { scanBalances, identifyStuckAssets } from "../services/balances.js";
import { getSourceChainIds } from "@dustless/shared";
import type { ScanResponse } from "@dustless/shared";

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

  // Default to all source chains if not specified
  const chainIds = body.chainIds ?? getSourceChainIds();

  // Scan all chains in parallel
  const balances = await scanBalances(body.address, chainIds);

  // Identify stuck assets (non-target chains with balance > dust)
  const stuck = identifyStuckAssets(balances);

  // TODO: Calculate total USD value
  // For MVP, just return the raw data

  return reply.send({
    balances,
    stuck,
    totalStuckUsd: undefined, // TODO: Price oracle integration
  });
}
