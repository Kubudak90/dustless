/**
 * Transaction Simulation Service
 *
 * Simulates transactions before execution to:
 * - Verify transactions will succeed
 * - Estimate accurate gas costs
 * - Catch revert reasons before user signs
 */

import { createPublicClient, http, type Hex } from "viem";
import * as viemChains from "viem/chains";
import { getChainConfig } from "../config/chains.js";
import type { TxStep } from "@dustless/shared";
import { loggers } from "../config/logger.js";

const log = loggers.providers;

// ============ Types ============

export interface SimulationResult {
  success: boolean;
  gasUsed: string;
  revertReason?: string;
  warnings: string[];
}

export interface MultiSimulationResult {
  success: boolean;
  totalGasUsed: string;
  stepResults: StepSimulationResult[];
  warnings: string[];
}

export interface StepSimulationResult {
  stepIndex: number;
  success: boolean;
  gasUsed: string;
  revertReason?: string;
}

// ============ Chain Mapping ============

const VIEM_CHAINS: Record<number, viemChains.Chain> = {
  1: viemChains.mainnet,
  8453: viemChains.base,
  42161: viemChains.arbitrum,
  81457: viemChains.blast,
  34443: viemChains.mode,
  7777777: viemChains.zora,
  59144: viemChains.linea,
  10: viemChains.optimism,
  324: viemChains.zkSync,
  534352: viemChains.scroll,
  137: viemChains.polygon,
  43114: viemChains.avalanche,
  56: viemChains.bsc,
  5000: viemChains.mantle,
  100: viemChains.gnosis,
  1101: viemChains.polygonZkEvm,
  42220: viemChains.celo,
};

// ============ Client Factory ============

function getClient(chainId: number) {
  const config = getChainConfig(chainId);
  const chain = VIEM_CHAINS[chainId];

  if (!chain) {
    throw new Error(`Unsupported chain for simulation: ${chainId}`);
  }

  return createPublicClient({
    chain,
    transport: http(config.rpcUrls[0]),
  });
}

// ============ Simulation Functions ============

/**
 * Simulate a single transaction
 */
export async function simulateTransaction(
  tx: TxStep,
  userAddress: string
): Promise<SimulationResult> {
  const warnings: string[] = [];

  try {
    const client = getClient(tx.chainId);

    // Try to estimate gas - this will fail if transaction would revert
    const gasEstimate = await client.estimateGas({
      account: userAddress as Hex,
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
    });

    // Add warnings for high gas usage
    if (gasEstimate > 500000n) {
      warnings.push(`High gas usage: ${gasEstimate.toString()} units`);
    }

    // Try call to catch any other issues
    await client.call({
      account: userAddress as Hex,
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
    });

    return {
      success: true,
      gasUsed: gasEstimate.toString(),
      warnings,
    };
  } catch (error) {
    const revertReason = extractRevertReason(error);

    return {
      success: false,
      gasUsed: "0",
      revertReason,
      warnings,
    };
  }
}

/**
 * Simulate multiple transactions in sequence
 * Note: This simulates each transaction independently - state changes
 * from earlier transactions won't affect later ones in simulation.
 */
export async function simulateMultipleTransactions(
  steps: TxStep[],
  userAddress: string
): Promise<MultiSimulationResult> {
  const stepResults: StepSimulationResult[] = [];
  const warnings: string[] = [];
  let totalGasUsed = 0n;
  let allSuccess = true;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const result = await simulateTransaction(step, userAddress);

    stepResults.push({
      stepIndex: i,
      success: result.success,
      gasUsed: result.gasUsed,
      revertReason: result.revertReason,
    });

    if (result.success) {
      totalGasUsed += BigInt(result.gasUsed);
    } else {
      allSuccess = false;
      warnings.push(`Step ${i + 1} failed: ${result.revertReason || "Unknown error"}`);
      // Stop simulating further steps if one fails
      break;
    }

    // Collect step-level warnings
    warnings.push(...result.warnings.map((w) => `Step ${i + 1}: ${w}`));
  }

  // Add multi-step warning
  if (steps.length > 1 && allSuccess) {
    warnings.push(
      "Multi-step transaction: Simulation runs each step independently. " +
      "Actual execution may differ if blockchain state changes between steps."
    );
  }

  return {
    success: allSuccess,
    totalGasUsed: totalGasUsed.toString(),
    stepResults,
    warnings,
  };
}

// ============ Helpers ============

/**
 * Extract human-readable revert reason from error
 */
function extractRevertReason(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Common revert patterns
    if (message.includes("insufficient funds")) {
      return "Insufficient balance for transaction";
    }
    if (message.includes("exceeds allowance")) {
      return "Token approval required";
    }
    if (message.includes("transfer amount exceeds balance")) {
      return "Insufficient token balance";
    }
    if (message.includes("slippage")) {
      return "Price slippage too high";
    }
    if (message.includes("deadline")) {
      return "Transaction deadline expired";
    }
    if (message.includes("paused")) {
      return "Contract is paused";
    }

    // Try to extract revert reason from message
    const revertMatch = error.message.match(/reverted with reason string '([^']+)'/);
    if (revertMatch) {
      return revertMatch[1];
    }

    // Try to extract custom error
    const customMatch = error.message.match(/reverted with custom error '([^']+)'/);
    if (customMatch) {
      return `Contract error: ${customMatch[1]}`;
    }

    // Return first line of error message
    return error.message.split("\n")[0].slice(0, 200);
  }

  return "Transaction would fail";
}

/**
 * Check if user has sufficient balance for transaction
 */
export async function checkBalance(
  chainId: number,
  userAddress: string,
  requiredWei: string
): Promise<{ sufficient: boolean; balance: string }> {
  try {
    const client = getClient(chainId);
    const balance = await client.getBalance({
      address: userAddress as Hex,
    });

    return {
      sufficient: balance >= BigInt(requiredWei),
      balance: balance.toString(),
    };
  } catch (error) {
    log.error({ error, chainId, userAddress }, "Failed to check balance");
    return {
      sufficient: false,
      balance: "0",
    };
  }
}
