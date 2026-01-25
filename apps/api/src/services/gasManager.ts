import { createPublicClient, http, formatEther, parseEther } from "viem";
import { getChainConfig } from "../config/chains.js";
import { priceOracle } from "./priceOracle.js";
import { loggers } from "../config/logger.js";

const log = loggers.gas;

/**
 * Gas Manager Service
 * 
 * Calculates precise gas amounts to minimize dust left on chains.
 * Uses preset gas values, gas price caps, and fixed buffers.
 * 
 * Strategy:
 * 1. Preset gas values (deterministic, not dynamic)
 * 2. Gas price capping (prevent spikes)
 * 3. Fixed buffer (not percentage-based)
 * 4. Two-phase gas sending (tx gas + optional sweep gas)
 * 5. USD-based sweep threshold
 */

// ============ PRESET GAS VALUES ============
// These cover: approval (if needed) + bridge call
// Deterministic values, not dynamic estimation

const PRESET_GAS_LIMIT: Record<number, bigint> = {
  // Mainnet
  1: 210_000n,
  
  // L2s
  8453: 180_000n,   // Base
  42161: 160_000n,  // Arbitrum
  10: 160_000n,     // Optimism
  59144: 200_000n,  // Linea
  324: 190_000n,    // zkSync
  534352: 200_000n, // Scroll
  34443: 190_000n,  // Mode
  81457: 180_000n,  // Blast
  7777777: 190_000n, // Zora
  
  // Other EVM chains
  137: 200_000n,    // Polygon
  43114: 200_000n,  // Avalanche
  56: 200_000n,     // BNB Chain
  5000: 190_000n,   // Mantle
  100: 200_000n,    // Gnosis
  1101: 200_000n,   // Polygon zkEVM
  42220: 200_000n,  // Celo
};

// Default for unknown chains
const DEFAULT_PRESET_GAS = 200_000n;

// ============ GAS PRICE CAPS ============
// Maximum gas price we're willing to pay (in gwei)
// Prevents paying excessive fees during spikes

const MAX_GAS_PRICE_GWEI: Record<number, number> = {
  1: 50,        // Ethereum: 50 gwei max
  8453: 0.15,   // Base: 0.15 gwei max
  42161: 0.2,   // Arbitrum: 0.2 gwei max
  10: 0.2,      // Optimism: 0.2 gwei max
  59144: 0.5,   // Linea: 0.5 gwei max
  324: 0.3,     // zkSync: 0.3 gwei max
  534352: 0.3,  // Scroll: 0.3 gwei max
  34443: 0.2,   // Mode: 0.2 gwei max
  81457: 0.2,   // Blast: 0.2 gwei max
  7777777: 0.2, // Zora: 0.2 gwei max
  137: 100,     // Polygon: 100 gwei max
  43114: 50,    // Avalanche: 50 gwei max
  56: 5,        // BNB Chain: 5 gwei max
  5000: 0.2,    // Mantle: 0.2 gwei max
  100: 2,       // Gnosis: 2 gwei max
  1101: 0.3,    // Polygon zkEVM: 0.3 gwei max
  42220: 0.1,   // Celo: 0.1 gwei max
};

// Default max gas price
const DEFAULT_MAX_GAS_PRICE_GWEI = 1.0;

// ============ FIXED BUFFERS ============
// Fixed buffer amounts (not percentage-based)
// Small enough to not waste, large enough to be safe

const FIXED_BUFFER_WEI: Record<number, bigint> = {
  1: parseEther("0.00003"),      // 0.00003 ETH (Mainnet)
  8453: parseEther("0.00001"),   // 0.00001 ETH (Base)
  42161: parseEther("0.00001"),  // 0.00001 ETH (Arbitrum)
  10: parseEther("0.00001"),     // 0.00001 ETH (Optimism)
  59144: parseEther("0.000015"), // 0.000015 ETH (Linea)
  324: parseEther("0.00001"),    // 0.00001 ETH (zkSync)
  534352: parseEther("0.00001"), // 0.00001 ETH (Scroll)
  34443: parseEther("0.00001"),  // 0.00001 ETH (Mode)
  81457: parseEther("0.00001"),  // 0.00001 ETH (Blast)
  7777777: parseEther("0.00001"), // 0.00001 ETH (Zora)
  137: parseEther("0.00002"),    // 0.00002 ETH (Polygon)
  43114: parseEther("0.00002"),  // 0.00002 ETH (Avalanche)
  56: parseEther("0.00002"),     // 0.00002 ETH (BNB Chain)
  5000: parseEther("0.00001"),    // 0.00001 ETH (Mantle)
  100: parseEther("0.00001"),     // 0.00001 ETH (Gnosis)
  1101: parseEther("0.00001"),    // 0.00001 ETH (Polygon zkEVM)
  42220: parseEther("0.00001"),   // 0.00001 ETH (Celo)
};

// Default buffer
const DEFAULT_FIXED_BUFFER = parseEther("0.00002");

// ============ SWEEP CONFIGURATION ============

// Sweep gas limit (ultra-minimal tx)
const SWEEP_GAS_LIMIT = 35_000n;

// Sweep buffer (for sweep tx itself)
const SWEEP_BUFFER_WEI = parseEther("0.000003");

// USD threshold for sweep (if remaining balance > this, trigger sweep)
const SWEEP_USD_THRESHOLD = 0.15; // $0.15

// Expected refund from bridge (some bridges refund unused native)
const EXPECTED_REFUND_WEI = parseEther("0.00001"); // 0.00001 ETH

// ============ INTERFACE ============

export interface GasCalculation {
  /** Total gas needed (in wei) */
  totalGasWei: string;
  /** Gas for main transaction */
  txGasWei: string;
  /** Gas for sweep (if needed) */
  sweepGasWei: string | null;
  /** Should we send sweep gas? */
  shouldSweep: boolean;
  /** Expected remaining balance after all operations */
  expectedRemainingWei: string;
  /** Expected remaining balance in USD */
  expectedRemainingUsd: number;
  /** Gas price used (in gwei) */
  gasPriceGwei: number;
  /** Breakdown for logging */
  breakdown: {
    presetGas: string;
    gasPrice: string;
    fixedBuffer: string;
    expectedRefund: string;
    sweepGas?: string;
  };
}

export interface GasLog {
  chainId: number;
  userAddress: string;
  sentGas: string;
  usedGas: string;
  refunded: string;
  dustLeft: string;
  dustLeftUsd: number;
  timestamp: string;
}

// ============ GAS MANAGER ============

export class GasManager {
  /**
   * Get current gas price for a chain (with cap)
   */
  async getEffectiveGasPrice(chainId: number): Promise<bigint> {
    try {
      const chain = getChainConfig(chainId);
      const client = createPublicClient({
        chain: {
          id: chainId,
          name: chain.name,
          nativeCurrency: {
            name: chain.nativeName,
            symbol: chain.nativeSymbol,
            decimals: chain.decimals,
          },
          rpcUrls: {
            default: { http: [chain.rpcUrls[0]] },
          },
        },
        transport: http(chain.rpcUrls[0]),
      });

      // Get current gas price
      const feeData = await client.estimateFeesPerGas();
      const currentGasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;

      // Convert to gwei
      const currentGasPriceGwei = Number(formatEther(currentGasPrice)) * 1e9;

      // Apply cap
      const maxGasPriceGwei = MAX_GAS_PRICE_GWEI[chainId] ?? DEFAULT_MAX_GAS_PRICE_GWEI;
      const effectiveGasPriceGwei = Math.min(currentGasPriceGwei, maxGasPriceGwei);

      // Convert back to wei
      return BigInt(Math.floor(effectiveGasPriceGwei * 1e9));
    } catch (error) {
      log.error({ err: error, chainId }, 'Failed to get gas price');
      // Fallback: use a conservative estimate
      const maxGasPriceGwei = MAX_GAS_PRICE_GWEI[chainId] ?? DEFAULT_MAX_GAS_PRICE_GWEI;
      return BigInt(Math.floor(maxGasPriceGwei * 1e9));
    }
  }

  /**
   * Calculate required gas for a recovery operation
   * 
   * Formula:
   * required_gas = (preset_gas * effectiveGasPrice) + fixed_buffer - expected_refund
   */
  async calculateRequiredGas(
    chainId: number,
    balanceWei: string,
    includeSweep: boolean = true
  ): Promise<GasCalculation> {
    const balance = BigInt(balanceWei);
    const presetGas = PRESET_GAS_LIMIT[chainId] ?? DEFAULT_PRESET_GAS;
    const fixedBuffer = FIXED_BUFFER_WEI[chainId] ?? DEFAULT_FIXED_BUFFER;
    const effectiveGasPrice = await this.getEffectiveGasPrice(chainId);

    // Calculate main tx gas cost
    const txGasCost = presetGas * effectiveGasPrice;
    const txGasWei = txGasCost + fixedBuffer - EXPECTED_REFUND_WEI;

    // Calculate sweep gas (if needed)
    let sweepGasWei: bigint | null = null;
    let shouldSweep = false;

    // Get native token price for USD calculations
    const chain = getChainConfig(chainId);
    const nativeTokenPrice = await priceOracle.getNativeTokenPrice(chain.nativeSymbol);

    if (includeSweep) {
      const sweepGasCost = SWEEP_GAS_LIMIT * effectiveGasPrice;
      sweepGasWei = sweepGasCost + SWEEP_BUFFER_WEI;

      // Check if sweep is worth it (USD-based threshold)
      const remainingAfterTx = balance - txGasWei;
      const remainingUsd = Number(formatEther(remainingAfterTx)) * nativeTokenPrice;

      shouldSweep = remainingUsd > SWEEP_USD_THRESHOLD;
    }

    // Total gas needed
    const totalGasWei = txGasWei + (shouldSweep ? sweepGasWei! : 0n);

    // Expected remaining balance
    const expectedRemaining = balance - totalGasWei;
    const expectedRemainingUsd = Number(formatEther(expectedRemaining > 0n ? expectedRemaining : 0n)) * nativeTokenPrice;

    return {
      totalGasWei: totalGasWei.toString(),
      txGasWei: txGasWei.toString(),
      sweepGasWei: sweepGasWei?.toString() ?? null,
      shouldSweep,
      expectedRemainingWei: expectedRemaining > 0n ? expectedRemaining.toString() : "0",
      expectedRemainingUsd,
      gasPriceGwei: Number(formatEther(effectiveGasPrice)) * 1e9,
      breakdown: {
        presetGas: presetGas.toString(),
        gasPrice: effectiveGasPrice.toString(),
        fixedBuffer: fixedBuffer.toString(),
        expectedRefund: EXPECTED_REFUND_WEI.toString(),
        sweepGas: sweepGasWei?.toString(),
      },
    };
  }

  /**
   * Calculate bridgeable amount (balance - required gas)
   * Returns null if balance is too low
   */
  async calculateBridgeableAmount(
    chainId: number,
    balanceWei: string
  ): Promise<{
    bridgeableWei: string;
    requiredGasWei: string;
    isTooLow: boolean;
    expectedRemainingUsd: number;
  }> {
    const calculation = await this.calculateRequiredGas(chainId, balanceWei, false); // No sweep in initial calc

    const balance = BigInt(balanceWei);
    const requiredGas = BigInt(calculation.totalGasWei);

    if (balance <= requiredGas) {
      return {
        bridgeableWei: "0",
        requiredGasWei: requiredGas.toString(),
        isTooLow: true,
        expectedRemainingUsd: calculation.expectedRemainingUsd,
      };
    }

    const bridgeable = balance - requiredGas;

    return {
      bridgeableWei: bridgeable.toString(),
      requiredGasWei: requiredGas.toString(),
      isTooLow: false,
      expectedRemainingUsd: calculation.expectedRemainingUsd,
    };
  }

  /**
   * Check if sweep is needed after transaction
   * Uses USD-based threshold
   */
  async shouldSweep(
    chainId: number,
    remainingBalanceWei: string
  ): Promise<{ shouldSweep: boolean; sweepGasWei: string; remainingUsd: number }> {
    const chain = getChainConfig(chainId);
    const nativeTokenPrice = await priceOracle.getNativeTokenPrice(chain.nativeSymbol);
    const remaining = BigInt(remainingBalanceWei);
    const remainingUsd = Number(formatEther(remaining)) * nativeTokenPrice;

    if (remainingUsd <= SWEEP_USD_THRESHOLD) {
      return {
        shouldSweep: false,
        sweepGasWei: "0",
        remainingUsd,
      };
    }

    // Calculate sweep gas
    const effectiveGasPrice = await this.getEffectiveGasPrice(chainId);
    const sweepGasCost = SWEEP_GAS_LIMIT * effectiveGasPrice;
    const sweepGasWei = sweepGasCost + SWEEP_BUFFER_WEI;

    // Check if sweep is worth it (sweep gas < remaining balance)
    if (remaining <= sweepGasWei) {
      return {
        shouldSweep: false,
        sweepGasWei: sweepGasWei.toString(),
        remainingUsd,
      };
    }

    return {
      shouldSweep: true,
      sweepGasWei: sweepGasWei.toString(),
      remainingUsd,
    };
  }

  /**
   * Log gas usage for analytics and tuning
   */
  logGasUsage(gasLog: GasLog): void {
    // In production, send to analytics service
    log.info({
      chainId: gasLog.chainId,
      userAddress: gasLog.userAddress.slice(0, 10) + "...",
      sentGas: formatEther(BigInt(gasLog.sentGas)),
      usedGas: formatEther(BigInt(gasLog.usedGas)),
      refunded: formatEther(BigInt(gasLog.refunded)),
      dustLeft: formatEther(BigInt(gasLog.dustLeft)),
      dustLeftUsd: gasLog.dustLeftUsd.toFixed(4),
      timestamp: gasLog.timestamp,
    }, 'Gas usage logged');
  }
}

// Singleton instance
export const gasManager = new GasManager();

