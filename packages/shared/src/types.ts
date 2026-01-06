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
  symbol: "ETH";
  wei: string;
  ok: true;
}

export interface BalanceError {
  chainId: number;
  ok: false;
  error: string;
}

export type BalanceResponse = BalanceResult | BalanceError;

export interface StuckAsset {
  chainId: number;
  chainName: string;
  symbol: "ETH";
  wei: string;
  usdValue?: number;
}

export interface ScanResponse {
  balances: BalanceResponse[];
  stuck: StuckAsset[];
  totalStuckUsd?: number;
}

// ============ Quote ============

export interface QuoteRequest {
  fromChainId: number;
  toChainId: number;
  tokenSymbol: "ETH";
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
  provider: "lifi" | "socket";
  routeId: string;
  steps: QuoteStep[];
  estimatedReceivedWei: string;
  estimatedReceivedUsd?: number;
  estimatedTotalFeeUsd?: number;
  estimatedTotalTimeSec?: number;
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

export interface BuildResponse {
  steps: TxStep[];
  warnings?: string[];
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
