import { request } from "undici";
import { createPublicClient, http, erc20Abi, encodeFunctionData } from "viem";
import type { SwapProvider } from "./SwapProvider.js";
import type { SwapQuote, SwapRequest, SwapBuildRequest, TxStep, Token } from "@dustless/shared";
import { NATIVE_TOKEN_ADDRESS, ProviderError } from "@dustless/shared";
import { env } from "../config/env.js";
import { getChainConfig } from "../config/chains.js";
import { loggers } from "../config/logger.js";

const log = loggers.odos;

const ODOS_BASE_URL = env.ODOS_BASE_URL ?? "https://api.odos.xyz";
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Odos uses zero address (0x0000...) for native ETH
const ODOS_NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Convert NATIVE_TOKEN_ADDRESS to Odos format (zero address)
 */
function toOdosTokenAddress(address: string): string {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()
    ? ODOS_NATIVE_TOKEN_ADDRESS
    : address;
}

/**
 * Odos DEX Aggregator Provider
 * Smart Order Routing for best swap rates
 *
 * Docs: https://docs.odos.xyz/
 */
export class OdosProvider implements SwapProvider {
  readonly name = "odos" as const;

  async quote(req: SwapRequest): Promise<SwapQuote[]> {
    const url = new URL(`${ODOS_BASE_URL}/sor/quote/v2`);

    // Convert native token address to Odos format (zero address)
    const fromTokenAddress = toOdosTokenAddress(req.fromToken);
    const toTokenAddress = toOdosTokenAddress(req.toToken);

    const requestBody: OdosQuoteRequest = {
      chainId: req.chainId,
      inputTokens: [{
        tokenAddress: fromTokenAddress,
        amount: req.amount,
      }],
      outputTokens: [{
        tokenAddress: toTokenAddress,
        proportion: 1, // 100% of output to this token
      }],
      userAddr: req.userAddress,
      slippageLimitPercent: req.slippage ?? 3, // Default 3%
      compact: true, // Reduced response size
    };

    try {
      const response = await request(url.toString(), {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        headersTimeout: REQUEST_TIMEOUT,
        bodyTimeout: REQUEST_TIMEOUT,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (response.statusCode !== 200) {
        const body = await response.body.text();
        log.error({ statusCode: response.statusCode, body }, 'Odos quote error');
        throw new ProviderError("odos", `Quote failed: ${body}`, response.statusCode);
      }

      const json = await response.body.json() as OdosQuoteResponse;

      if (!json.pathId || !json.outAmounts || json.outAmounts.length === 0) {
        log.warn('Odos returned no valid route');
        return [];
      }

      const quote = this.normalizeQuote(json, req);
      return quote ? [quote] : [];
    } catch (err) {
      if (err instanceof ProviderError) {
        throw err;
      }
      log.error({ err }, 'Odos quote failed');
      return [];
    }
  }

  async build(req: SwapBuildRequest): Promise<TxStep[]> {
    const url = new URL(`${ODOS_BASE_URL}/sor/assemble`);

    const requestBody: OdosAssembleRequest = {
      userAddr: req.userAddress,
      pathId: req.quote.pathId,
      simulate: false, // Set to true for testing without execution
    };

    try {
      const response = await request(url.toString(), {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        headersTimeout: REQUEST_TIMEOUT,
        bodyTimeout: REQUEST_TIMEOUT,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (response.statusCode !== 200) {
        const body = await response.body.text();
        throw new ProviderError("odos", `Assemble failed: ${body}`, response.statusCode);
      }

      const json = await response.body.json() as OdosAssembleResponse;

      if (!json.transaction) {
        throw new ProviderError("odos", "No transaction data in Odos response", 500);
      }

      const steps: TxStep[] = [];
      const chainId = req.quote.fromToken.chainId;
      const fromTokenAddress = req.quote.fromToken.address;
      const isNativeToken = fromTokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

      // Check if approval transaction is needed (only for ERC-20 tokens, not native ETH)
      if (!isNativeToken) {
        // First check if Odos returned an approval transaction
        if (json.approvalTransaction && json.approvalTransaction.data && json.approvalTransaction.to) {
          steps.push({
            chainId,
            to: json.approvalTransaction.to as `0x${string}`,
            data: json.approvalTransaction.data as `0x${string}`,
            value: json.approvalTransaction.value || "0",
            gasLimit: json.approvalTransaction.gas,
            description: `Approve ${req.quote.fromToken.symbol} for swap`,
          });
        } else {
          // Check allowance manually and create approval if needed
          const odosRouterAddress = json.transaction.to as `0x${string}`;
          const needsApproval = await this.checkAndCreateApproval(
            chainId,
            fromTokenAddress,
            odosRouterAddress,
            req.userAddress,
            req.quote.fromAmount
          );

          if (needsApproval) {
            steps.push(needsApproval);
          }
        }
      }

      // Add the main swap transaction
      if (json.transaction.data && json.transaction.to) {
        steps.push({
          chainId,
          to: json.transaction.to as `0x${string}`,
          data: json.transaction.data as `0x${string}`,
          value: json.transaction.value || "0",
          gasLimit: json.transaction.gas,
          description: `Swap ${req.quote.fromToken.symbol} → ${req.quote.toToken.symbol} via Odos`,
        });
      }

      if (steps.length === 0) {
        throw new ProviderError("odos", "No valid transaction steps found in Odos response", 500);
      }

      return steps;
    } catch (err) {
      log.error({ err }, 'Odos assemble failed');
      throw err;
    }
  }

  /**
   * Check if token approval is needed and create approval transaction if required
   */
  private async checkAndCreateApproval(
    chainId: number,
    tokenAddress: string,
    spenderAddress: string,
    userAddress: string,
    amount: string
  ): Promise<TxStep | null> {
    try {
      const chain = getChainConfig(chainId);
      const client = createPublicClient({
        chain: {
          id: chainId,
          name: chain.name,
          nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
          },
          rpcUrls: {
            default: { http: [chain.rpcUrls[0]] },
          },
        },
        transport: http(chain.rpcUrls[0]),
      });

      // Check current allowance
      const allowance = await client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [userAddress as `0x${string}`, spenderAddress as `0x${string}`],
      });

      const amountBigInt = BigInt(amount);
      const allowanceBigInt = BigInt(allowance.toString());

      // If allowance is sufficient, no approval needed
      if (allowanceBigInt >= amountBigInt) {
        return null;
      }

      // Create approval transaction (approve max uint256 for better UX)
      const maxApproval = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
      const approvalData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spenderAddress as `0x${string}`, maxApproval],
      });

      return {
        chainId,
        to: tokenAddress as `0x${string}`,
        data: approvalData,
        value: "0",
        description: `Approve token for swap`,
      };
    } catch (error) {
      log.error({ err: error }, 'Failed to check/create approval');
      // If we can't check allowance, assume approval is needed (safer)
      const maxApproval = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
      const approvalData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spenderAddress as `0x${string}`, maxApproval],
      });

      return {
        chainId,
        to: tokenAddress as `0x${string}`,
        data: approvalData,
        value: "0",
        description: `Approve token for swap`,
      };
    }
  }

  private normalizeQuote(json: OdosQuoteResponse, req: SwapRequest): SwapQuote | null {
    if (!json.outAmounts?.[0] || !json.pathId) {
      return null;
    }

    // Check if tokens are native ETH (either NATIVE_TOKEN_ADDRESS or zero address from Odos)
    const isFromNative = req.fromToken.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase() ||
                         json.inTokens?.[0]?.toLowerCase() === ODOS_NATIVE_TOKEN_ADDRESS.toLowerCase();
    const isToNative = req.toToken.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase() ||
                       json.outTokens?.[0]?.toLowerCase() === ODOS_NATIVE_TOKEN_ADDRESS.toLowerCase();

    // Extract token info from response or use request data
    const fromToken: Token = {
      address: req.fromToken, // Keep original address format
      symbol: isFromNative ? "ETH" : "TOKEN", // Will be enhanced with token info
      name: isFromNative ? "Ethereum" : "Token",
      decimals: 18, // Default, should be fetched from token contract
      chainId: req.chainId,
    };

    const toToken: Token = {
      address: req.toToken, // Keep original address format
      symbol: isToNative ? "ETH" : "TOKEN",
      name: isToNative ? "Ethereum" : "Token",
      decimals: 18,
      chainId: req.chainId,
    };

    return {
      provider: "odos",
      pathId: json.pathId,
      fromToken,
      toToken,
      fromAmount: req.amount,
      toAmount: json.outAmounts[0],
      estimatedGas: json.gasEstimate?.toString(),
      estimatedGasUsd: json.gasEstimateValue,
      priceImpact: json.priceImpact,
    };
  }
}

// ============ Odos API Types ============

interface OdosQuoteRequest {
  chainId: number;
  inputTokens: Array<{
    tokenAddress: string;
    amount: string;
  }>;
  outputTokens: Array<{
    tokenAddress: string;
    proportion: number;
  }>;
  userAddr: string;
  slippageLimitPercent: number;
  compact?: boolean;
  referralCode?: number;
  disableRFQs?: boolean;
}

interface OdosQuoteResponse {
  pathId: string;
  inTokens: string[];
  outTokens: string[];
  inAmounts: string[];
  outAmounts: string[];
  gasEstimate: number;
  gasEstimateValue?: number;
  dataGasEstimate?: number;
  gweiPerGas?: number;
  priceImpact?: number;
  percentDiff?: number;
  blockNumber?: number;
  deprecated?: string;
}

interface OdosAssembleRequest {
  userAddr: string;
  pathId: string;
  simulate?: boolean;
}

interface OdosAssembleResponse {
  deprecated?: string;
  blockNumber?: number;
  gasEstimate?: number;
  gasEstimateValue?: number;
  inputTokens?: Array<{
    tokenAddress: string;
    amountIn: string;
  }>;
  outputTokens?: Array<{
    tokenAddress: string;
    amountOut: string;
  }>;
  // Approval transaction (if needed for ERC-20 tokens)
  approvalTransaction?: {
    gas?: string;
    gasPrice?: string;
    value?: string;
    to: string;
    from?: string;
    data: string;
    nonce?: number;
    chainId?: number;
  };
  // Main swap transaction
  transaction: {
    gas?: string;
    gasPrice?: string;
    value?: string;
    to: string;
    from?: string;
    data: string;
    nonce?: number;
    chainId?: number;
  };
  simulation?: {
    isSuccess: boolean;
    amountsOut: number[];
    gasEstimate: number;
    simulationError?: {
      errorMessage: string;
    };
  };
}
