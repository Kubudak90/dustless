import { request } from "undici";
import type { SwapProvider } from "./SwapProvider.js";
import type { SwapQuote, SwapRequest, SwapBuildRequest, TxStep, Token } from "@dustless/shared";
import { NATIVE_TOKEN_ADDRESS, ProviderError } from "@dustless/shared";
import { env } from "../config/env.js";

const ODOS_BASE_URL = env.ODOS_BASE_URL ?? "https://api.odos.xyz";
const REQUEST_TIMEOUT = 30000; // 30 seconds

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

    // Odos uses checksummed addresses
    const fromTokenAddress = req.fromToken;
    const toTokenAddress = req.toToken;

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
        console.error("Odos quote error:", response.statusCode, body);
        throw new ProviderError("odos", `Quote failed: ${body}`, response.statusCode);
      }

      const json = await response.body.json() as OdosQuoteResponse;

      if (!json.pathId || !json.outAmounts || json.outAmounts.length === 0) {
        console.warn("Odos returned no valid route");
        return [];
      }

      const quote = this.normalizeQuote(json, req);
      return quote ? [quote] : [];
    } catch (err) {
      if (err instanceof ProviderError) {
        throw err;
      }
      console.error("Odos quote failed:", err);
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

      // Odos may return multiple transactions (e.g., approval + swap)
      const steps: TxStep[] = [];

      // Check if approval is needed
      if (json.transaction.data && json.transaction.to) {
        steps.push({
          chainId: req.quote.fromToken.chainId,
          to: json.transaction.to as `0x${string}`,
          data: json.transaction.data as `0x${string}`,
          value: json.transaction.value || "0",
          gasLimit: json.transaction.gas,
          description: `Swap ${req.quote.fromToken.symbol} → ${req.quote.toToken.symbol} via Odos`,
        });
      }

      return steps;
    } catch (err) {
      console.error("Odos assemble failed:", err);
      throw err;
    }
  }

  private normalizeQuote(json: OdosQuoteResponse, req: SwapRequest): SwapQuote | null {
    if (!json.outAmounts?.[0] || !json.pathId) {
      return null;
    }

    // Extract token info from response or use request data
    const fromToken: Token = {
      address: req.fromToken,
      symbol: req.fromToken === NATIVE_TOKEN_ADDRESS ? "ETH" : "TOKEN", // Will be enhanced with token info
      name: req.fromToken === NATIVE_TOKEN_ADDRESS ? "Ethereum" : "Token",
      decimals: 18, // Default, should be fetched from token contract
      chainId: req.chainId,
    };

    const toToken: Token = {
      address: req.toToken,
      symbol: req.toToken === NATIVE_TOKEN_ADDRESS ? "ETH" : "TOKEN",
      name: req.toToken === NATIVE_TOKEN_ADDRESS ? "Ethereum" : "Token",
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
