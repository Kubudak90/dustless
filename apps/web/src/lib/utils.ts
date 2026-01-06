import { clsx, type ClassValue } from "clsx";
import { formatEther } from "viem";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatETH(wei: string | bigint): string {
  const value = typeof wei === "string" ? BigInt(wei) : wei;
  const eth = formatEther(value);
  const num = parseFloat(eth);
  
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  if (num < 0.01) return num.toFixed(5);
  if (num < 1) return num.toFixed(4);
  if (num < 100) return num.toFixed(3);
  return num.toFixed(2);
}

export function formatUSD(value: number | undefined): string {
  if (value === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds) return "-";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function getChainColor(chainId: number): string {
  const colors: Record<number, string> = {
    8453: "#0052FF",   // Base
    42161: "#28A0F0",  // Arbitrum
    10: "#FF0420",     // Optimism
    81457: "#FCFC03",  // Blast
    59144: "#121212",  // Linea
    324: "#8C8DFC",    // zkSync
    534352: "#FFEEDA", // Scroll
    34443: "#DFFE00",  // Mode
    7777777: "#000000", // Zora
  };
  return colors[chainId] ?? "#888888";
}

export function getChainName(chainId: number): string {
  const names: Record<number, string> = {
    8453: "Base",
    42161: "Arbitrum",
    10: "Optimism",
    81457: "Blast",
    59144: "Linea",
    324: "zkSync",
    534352: "Scroll",
    34443: "Mode",
    7777777: "Zora",
  };
  return names[chainId] ?? `Chain ${chainId}`;
}

export function getExplorerUrl(chainId: number): string {
  const explorers: Record<number, string> = {
    8453: "https://basescan.org",
    42161: "https://arbiscan.io",
    10: "https://optimistic.etherscan.io",
    81457: "https://blastscan.io",
    59144: "https://lineascan.build",
    324: "https://explorer.zksync.io",
    534352: "https://scrollscan.com",
    34443: "https://modescan.io",
    7777777: "https://explorer.zora.energy",
  };
  return explorers[chainId] ?? "https://etherscan.io";
}

export function getTxUrl(chainId: number, txHash: string): string {
  return `${getExplorerUrl(chainId)}/tx/${txHash}`;
}

/**
 * Gas buffer amounts per chain (in wei)
 * L2s have much cheaper gas, but we still need some buffer
 */
const GAS_BUFFER_WEI: Record<number, bigint> = {
  // Mainnet - higher gas
  1: BigInt("5000000000000000"),      // 0.005 ETH
  
  // L2s - lower gas
  8453: BigInt("500000000000000"),    // 0.0005 ETH (Base)
  42161: BigInt("500000000000000"),   // 0.0005 ETH (Arbitrum)
  10: BigInt("500000000000000"),      // 0.0005 ETH (Optimism)
  81457: BigInt("500000000000000"),   // 0.0005 ETH (Blast)
  59144: BigInt("500000000000000"),   // 0.0005 ETH (Linea)
  324: BigInt("500000000000000"),     // 0.0005 ETH (zkSync)
  534352: BigInt("500000000000000"),  // 0.0005 ETH (Scroll)
  34443: BigInt("500000000000000"),   // 0.0005 ETH (Mode)
  7777777: BigInt("500000000000000"), // 0.0005 ETH (Zora)
};

// Default gas buffer for unknown chains
const DEFAULT_GAS_BUFFER = BigInt("1000000000000000"); // 0.001 ETH

/**
 * Get gas buffer for a chain
 */
export function getGasBuffer(chainId: number): bigint {
  return GAS_BUFFER_WEI[chainId] ?? DEFAULT_GAS_BUFFER;
}

/**
 * Calculate bridgeable amount (total - gas buffer)
 * Returns null if balance is too low
 */
export function calculateBridgeableAmount(
  balanceWei: string,
  chainId: number
): { amountWei: string; gasBuffer: string; isTooLow: boolean } {
  const balance = BigInt(balanceWei);
  const gasBuffer = getGasBuffer(chainId);
  
  // Check if balance is too low to bridge
  if (balance <= gasBuffer) {
    return {
      amountWei: "0",
      gasBuffer: gasBuffer.toString(),
      isTooLow: true,
    };
  }
  
  const bridgeableAmount = balance - gasBuffer;
  
  return {
    amountWei: bridgeableAmount.toString(),
    gasBuffer: gasBuffer.toString(),
    isTooLow: false,
  };
}

/**
 * Format gas buffer for display
 */
export function formatGasBuffer(chainId: number): string {
  const buffer = getGasBuffer(chainId);
  return formatETH(buffer.toString());
}
