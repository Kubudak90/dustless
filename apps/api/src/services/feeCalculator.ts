import { formatEther } from "viem";
import { priceOracle } from "./priceOracle.js";

/**
 * Fee Calculator Service
 * 
 * Monetization model:
 * - $0-100: 0.5% fee
 * - $100+: 1% fee
 * - No minimum fee
 * - Fee calculated on net recovered amount (after gas + bridge costs)
 * - Only charged on successful recovery
 */

// Fee tiers
const FEE_TIER_1_THRESHOLD_USD = 100;
const FEE_TIER_1_RATE = 0.005; // 0.5%
const FEE_TIER_2_RATE = 0.01; // 1%

// Batch mode threshold (small amounts go to batch queue)
const BATCH_MODE_THRESHOLD_USD = 10;

export interface FeeCalculation {
  /** Net recovered amount (after gas + bridge, before fee) */
  netRecoveredWei: string;
  /** Net recovered amount in USD */
  netRecoveredUsd: number;
  /** Fee amount in wei */
  feeWei: string;
  /** Fee amount in USD */
  feeUsd: number;
  /** Fee percentage applied */
  feePercentage: number;
  /** Final amount user will receive (after fee) */
  finalAmountWei: string;
  /** Final amount user will receive in USD */
  finalAmountUsd: number;
  /** Should this go to batch queue? */
  shouldBatch: boolean;
  /** Breakdown for transparency */
  breakdown: {
    grossAmountWei: string;
    grossAmountUsd: number;
    gasAndBridgeCostUsd: number;
    netRecoveredUsd: number;
    feeUsd: number;
    finalAmountUsd: number;
  };
}

/**
 * Calculate recovery fee based on net recovered amount
 * 
 * @param grossAmountWei - Total amount recovered (before gas/bridge) in wei
 * @param grossAmountUsd - Total amount recovered in USD (optional, will calculate if not provided)
 * @param gasAndBridgeCostUsd - Total cost of gas + bridge in USD
 * @returns Fee calculation details
 */
export async function calculateRecoveryFee(
  grossAmountWei: string,
  gasAndBridgeCostUsd: number,
  grossAmountUsd?: number
): Promise<FeeCalculation> {
  const grossAmount = BigInt(grossAmountWei);
  
  // Get ETH price for USD conversion if needed
  let calculatedGrossUsd: number;
  let ethPrice: number;
  
  if (grossAmountUsd !== undefined) {
    calculatedGrossUsd = grossAmountUsd;
    // Still need ETH price for wei conversions
    ethPrice = await priceOracle.getETHPrice();
  } else {
    ethPrice = await priceOracle.getETHPrice();
    calculatedGrossUsd = Number(formatEther(grossAmount)) * ethPrice;
  }

  // Calculate net recovered amount (after gas + bridge costs)
  const netRecoveredUsd = Math.max(0, calculatedGrossUsd - gasAndBridgeCostUsd);

  // Determine fee tier
  let feePercentage: number;
  if (netRecoveredUsd < FEE_TIER_1_THRESHOLD_USD) {
    feePercentage = FEE_TIER_1_RATE; // 0.5%
  } else {
    feePercentage = FEE_TIER_2_RATE; // 1%
  }

  // Calculate fee in USD
  const feeUsd = netRecoveredUsd * feePercentage;

  // Calculate final amount user will receive in USD
  const finalAmountUsd = Math.max(0, netRecoveredUsd - feeUsd);

  // Convert back to wei for final amounts
  // Use proportional calculation: net recovered is proportional to gross after costs
  const grossAmountBigInt = BigInt(grossAmountWei);
  
  // Calculate net recovered wei proportionally
  // If gross USD is 0, net is 0
  let netRecoveredWei = 0n;
  let feeWei = 0n;
  let finalAmountWei = 0n;
  
  if (calculatedGrossUsd > 0 && netRecoveredUsd > 0) {
    // Net recovered wei = gross wei * (net USD / gross USD)
    netRecoveredWei = (grossAmountBigInt * BigInt(Math.floor(netRecoveredUsd * 1e6))) / BigInt(Math.floor(calculatedGrossUsd * 1e6));
    
    // Fee wei = net recovered wei * fee percentage
    feeWei = (netRecoveredWei * BigInt(Math.floor(feePercentage * 1e6))) / 1_000_000n;
    
    // Final amount = net recovered - fee
    finalAmountWei = netRecoveredWei > feeWei ? netRecoveredWei - feeWei : 0n;
  }

  // Determine if should batch (small amounts)
  const shouldBatch = netRecoveredUsd > 0 && netRecoveredUsd < BATCH_MODE_THRESHOLD_USD;

  return {
    netRecoveredWei: netRecoveredWei.toString(),
    netRecoveredUsd,
    feeWei: feeWei.toString(),
    feeUsd,
    feePercentage: feePercentage * 100, // Convert to percentage for display
    finalAmountWei: finalAmountWei.toString(),
    finalAmountUsd: Math.max(0, finalAmountUsd),
    shouldBatch,
    breakdown: {
      grossAmountWei: grossAmountWei,
      grossAmountUsd: calculatedGrossUsd,
      gasAndBridgeCostUsd,
      netRecoveredUsd,
      feeUsd,
      finalAmountUsd: Math.max(0, finalAmountUsd),
    },
  };
}

/**
 * Check if recovery is worth it for the user
 * Returns true if user will receive a positive amount after all costs
 */
export function isRecoveryWorthwhile(calculation: FeeCalculation): boolean {
  return calculation.finalAmountUsd > 0;
}

/**
 * Format fee for display
 */
export function formatFeePercentage(percentage: number): string {
  if (percentage < 1) {
    return `${percentage.toFixed(1)}%`;
  }
  return `${percentage.toFixed(0)}%`;
}

/**
 * Get fee tier description
 */
export function getFeeTierDescription(usdAmount: number): string {
  if (usdAmount < FEE_TIER_1_THRESHOLD_USD) {
    return `0.5% fee (under $${FEE_TIER_1_THRESHOLD_USD})`;
  }
  return `1% fee (over $${FEE_TIER_1_THRESHOLD_USD})`;
}

