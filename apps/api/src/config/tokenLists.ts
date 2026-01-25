/**
 * Token Discovery Configuration
 *
 * Explorer API configurations for token discovery per chain.
 */

import { env } from "./env.js";

// ============ Types ============

export interface ExplorerConfig {
  apiUrl: string;
  apiKey?: string;
  tokenTxEndpoint: string; // /api?module=account&action=tokentx
}

// ============ Explorer Configurations ============

export const EXPLORER_CONFIGS: Record<number, ExplorerConfig> = {
  // Ethereum Mainnet
  1: {
    apiUrl: "https://api.etherscan.io",
    apiKey: env.ETHERSCAN_API_KEY,
    tokenTxEndpoint: "/api?module=account&action=tokentx",
  },
  // Base
  8453: {
    apiUrl: "https://api.basescan.org",
    apiKey: env.BASESCAN_API_KEY,
    tokenTxEndpoint: "/api?module=account&action=tokentx",
  },
  // Arbitrum
  42161: {
    apiUrl: "https://api.arbiscan.io",
    apiKey: env.ARBISCAN_API_KEY,
    tokenTxEndpoint: "/api?module=account&action=tokentx",
  },
  // Blast
  81457: {
    apiUrl: "https://api.blastscan.io",
    apiKey: env.BLASTSCAN_API_KEY,
    tokenTxEndpoint: "/api?module=account&action=tokentx",
  },
  // Polygon
  137: {
    apiUrl: "https://api.polygonscan.com",
    apiKey: env.POLYGONSCAN_API_KEY,
    tokenTxEndpoint: "/api?module=account&action=tokentx",
  },
  // BNB Chain
  56: {
    apiUrl: "https://api.bscscan.com",
    apiKey: env.BSCSCAN_API_KEY,
    tokenTxEndpoint: "/api?module=account&action=tokentx",
  },
  // Avalanche
  43114: {
    apiUrl: "https://api.snowtrace.io",
    apiKey: env.SNOWTRACE_API_KEY,
    tokenTxEndpoint: "/api?module=account&action=tokentx",
  },
  // Optimism
  10: {
    apiUrl: "https://api-optimistic.etherscan.io",
    apiKey: env.ETHERSCAN_API_KEY, // Uses Etherscan API key
    tokenTxEndpoint: "/api?module=account&action=tokentx",
  },
};

// ============ Popular Tokens (Fallback) ============

export interface PopularToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

/**
 * Popular tokens per chain - used as fallback when explorer API is unavailable
 */
export const POPULAR_TOKENS: Record<number, PopularToken[]> = {
  // Base
  8453: [
    { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", symbol: "DAI", name: "Dai Stablecoin", decimals: 18 },
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
    { address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", symbol: "cbETH", name: "Coinbase Wrapped Staked ETH", decimals: 18 },
  ],
  // Arbitrum
  42161: [
    { address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", symbol: "USDC.e", name: "Bridged USDC", decimals: 6 },
    { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", name: "Tether USD", decimals: 6 },
    { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", symbol: "DAI", name: "Dai Stablecoin", decimals: 18 },
    { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
  ],
  // Blast
  81457: [
    { address: "0x4300000000000000000000000000000000000003", symbol: "USDB", name: "USDB", decimals: 18 },
    { address: "0x4300000000000000000000000000000000000004", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
  ],
  // Polygon
  137: [
    { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", symbol: "USDC.e", name: "Bridged USDC", decimals: 6 },
    { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", symbol: "USDT", name: "Tether USD", decimals: 6 },
    { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", symbol: "DAI", name: "Dai Stablecoin", decimals: 18 },
    { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
  ],
  // BNB Chain
  56: [
    { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", name: "USD Coin", decimals: 18 },
    { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", name: "Tether USD", decimals: 18 },
    { address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", symbol: "BUSD", name: "Binance USD", decimals: 18 },
    { address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", symbol: "ETH", name: "Ethereum Token", decimals: 18 },
    { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", symbol: "WBNB", name: "Wrapped BNB", decimals: 18 },
  ],
  // Avalanche
  43114: [
    { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", symbol: "USDT", name: "Tether USD", decimals: 6 },
    { address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", symbol: "DAI.e", name: "Dai Stablecoin", decimals: 18 },
    { address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", symbol: "WETH.e", name: "Wrapped Ether", decimals: 18 },
    { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", symbol: "WAVAX", name: "Wrapped AVAX", decimals: 18 },
  ],
  // Optimism
  10: [
    { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", symbol: "USDC.e", name: "Bridged USDC", decimals: 6 },
    { address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", symbol: "USDT", name: "Tether USD", decimals: 6 },
    { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", symbol: "DAI", name: "Dai Stablecoin", decimals: 18 },
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
  ],
  // Ethereum
  1: [
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether USD", decimals: 6 },
    { address: "0x6B175474E89094C44Da98b954EescdeCB5cC5", symbol: "DAI", name: "Dai Stablecoin", decimals: 18 },
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
  ],
};

/**
 * Get popular tokens for a chain
 */
export function getPopularTokens(chainId: number): PopularToken[] {
  return POPULAR_TOKENS[chainId] || [];
}

/**
 * Get explorer config for a chain
 */
export function getExplorerConfig(chainId: number): ExplorerConfig | undefined {
  return EXPLORER_CONFIGS[chainId];
}

/**
 * Check if explorer API is available for a chain
 */
export function hasExplorerApi(chainId: number): boolean {
  const config = EXPLORER_CONFIGS[chainId];
  return !!config && !!config.apiKey;
}
