/**
 * Shared Types
 * Used by both frontend and backend
 */

// ============ Scan ============

export interface ScanRequest {
  address: string;
  chainIds: number[];
}

export interface BalanceResult {
  chainId: number;
  tokenAddress: string; // Native ETH uses NATIVE_TOKEN_ADDRESS
  symbol: string;
  name: string;
  decimals: number;
  balance: string; // Raw balance in smallest unit (wei for ETH, smallest unit for ERC-20)
  ok: true;
}

export interface BalanceError {
  chainId: number;
  tokenAddress?: string;
  ok: false;
  error: string;
}

export type BalanceResponse = BalanceResult | BalanceError;

export interface StuckAsset {
  chainId: number;
  chainName: string;
  tokenAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string; // Raw balance in smallest unit
  bridgeableAmount?: string; // Amount that can actually be bridged (balance - required gas)
  requiredGasWei?: string; // Gas needed for bridge operation
  expectedRemainingUsd?: number; // Expected dust left after bridge (in USD)
  usdValue?: number;
  isStablecoin?: boolean;
}

export interface ScanResponse {
  balances: BalanceResponse[];
  stuck: StuckAsset[];
  totalStuckUsd?: number;
}

// ============ Quote ============

export type NativeTokenSymbol = "ETH" | "BNB" | "AVAX" | "MATIC" | "xDAI" | "CELO" | "MNT";

export interface QuoteRequest {
  fromChainId: number;
  toChainId: number;
  tokenSymbol: NativeTokenSymbol;
  amountWei: string;
  fromAddress: string;
}

export interface QuoteStep {
  fromChainId: number;
  toChainId: number;
  tool: string; // bridge name (e.g., "stargate", "across", "hop")
  estimatedFeeUsd?: number;
  estimatedTimeSec?: number;
}

export interface Quote {
  provider: "lifi" | "socket" | "odos" | "across" | "zora";
  routeId: string;
  steps: QuoteStep[];
  estimatedReceivedWei: string;
  estimatedReceivedUsd?: number;
  estimatedTotalFeeUsd?: number; // Gas + bridge fees (from provider)
  estimatedTotalTimeSec?: number;
  // Recovery fee (our monetization)
  recoveryFeeWei?: string;
  recoveryFeeUsd?: number;
  recoveryFeePercentage?: number;
  finalAmountWei?: string; // Amount user will receive after recovery fee
  finalAmountUsd?: number;
  shouldBatch?: boolean; // Small amounts go to batch queue
}

export interface QuoteResponse {
  quotes: Quote[];
}

// ============ Build ============

export interface BuildRequest {
  quote: Quote;
  userAddress: string;
}

export interface TxStep {
  chainId: number;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string; // wei as string
  gasLimit?: string;
  description?: string; // e.g., "Approve USDC", "Bridge via Stargate"
}

// ============ Simulation ============

export interface StepSimulation {
  stepIndex: number;
  success: boolean;
  gasUsed: string;
  revertReason?: string;
}

export interface SimulationInfo {
  success: boolean;
  totalGasUsed: string;
  stepResults: StepSimulation[];
  warnings: string[];
}

export interface BuildResponse {
  steps: TxStep[];
  warnings?: string[];
  // Simulation results (if simulation was performed)
  simulation?: SimulationInfo;
  // Fee information (for transparency)
  recoveryFee?: {
    feeUsd: number;
    feePercentage: number;
    finalAmountUsd: number;
    shouldBatch?: boolean;
  };
}

// ============ Swap ============

export interface Token {
  address: string; // Token contract address, or NATIVE_TOKEN_ADDRESS for native ETH
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
}

export interface SwapRequest {
  chainId: number;
  fromToken: string; // Token address or NATIVE_TOKEN_ADDRESS
  toToken: string;   // Token address or NATIVE_TOKEN_ADDRESS
  amount: string;    // Amount in token's smallest unit (wei for ETH)
  userAddress: string;
  slippage?: number; // Slippage percentage (default: 3)
}

export interface SwapQuote {
  provider: "odos";
  pathId: string; // Odos pathId for assembling transaction
  fromToken: Token;
  toToken: Token;
  fromAmount: string;
  toAmount: string;
  estimatedGas?: string;
  estimatedGasUsd?: number;
  priceImpact?: number; // Percentage
}

export interface SwapResponse {
  quotes: SwapQuote[];
}

export interface SwapBuildRequest {
  quote: SwapQuote;
  userAddress: string;
}

// ============ Execution Status ============

export type TxStatus = "pending" | "confirming" | "confirmed" | "failed";

export interface ExecutionStep {
  step: TxStep;
  status: TxStatus;
  txHash?: string;
  error?: string;
}

// ============ API Error ============

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

// ============ Multi-Hop Routes ============

export interface MultiHopQuoteRequest {
  fromChainId: number;
  toChainId: number;
  fromToken: string; // Token address on source chain
  amount: string; // Amount in token's smallest unit
  userAddress: string;
  slippage?: number; // Slippage percentage (default: 3)
}

export interface ComposedRoute {
  id: string; // Unique route identifier
  swapQuote?: SwapQuote; // If swap is needed (ERC-20 → native)
  bridgeQuote: Quote; // Bridge native token to destination
  estimatedReceivedWei: string; // Final amount on destination chain
  estimatedReceivedUsd?: number;
  estimatedTotalTimeSec: number;
  estimatedTotalFeeUsd?: number;
  steps: RouteStep[];
}

export interface RouteStep {
  type: "swap" | "bridge";
  chainId: number;
  fromToken: string;
  toToken: string;
  tool: string;
  estimatedTimeSec?: number;
}

export interface MultiHopQuoteResponse {
  routes: ComposedRoute[];
}

export interface MultiHopBuildRequest {
  route: ComposedRoute;
  userAddress: string;
}

export interface MultiHopBuildResponse {
  steps: TxStep[];
  simulation?: SimulationInfo;
  warnings?: string[];
}

// ============ Utility Types ============

export type HexString = `0x${string}`;

export function isHexString(value: string): value is HexString {
  return /^0x[0-9a-fA-F]*$/.test(value);
}

export function formatWei(wei: string | bigint, decimals = 18): string {
  const value = typeof wei === "string" ? BigInt(wei) : wei;
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  
  if (remainder === 0n) {
    return whole.toString();
  }
  
  const remainderStr = remainder.toString().padStart(decimals, "0");
  const trimmed = remainderStr.replace(/0+$/, "");
  return `${whole}.${trimmed}`;
}

export function parseWei(value: string, decimals = 18): bigint {
  const [whole, fraction = ""] = value.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + paddedFraction);
}
