import { request } from "undici";
import type { BridgeProvider } from "./BridgeProvider.js";
import type { Quote, QuoteRequest, BuildRequest, TxStep } from "@dustless/shared";
import { NATIVE_TOKEN_ADDRESS } from "@dustless/shared";
import { env } from "../config/env.js";

const LIFI_BASE_URL = env.LIFI_BASE_URL ?? "https://li.quest/v1";

/**
 * LI.FI Bridge Provider
 * Aggregates routes from multiple bridges: Stargate, Hop, Across, etc.
 * 
 * Docs: https://docs.li.fi/
 */
export class LiFiProvider implements BridgeProvider {
  readonly name = "lifi" as const;

  async quote(req: QuoteRequest): Promise<Quote[]> {
    const url = new URL(`${LIFI_BASE_URL}/quote`);
    
    // LI.FI uses native token placeholder address
    const params = {
      fromChain: String(req.fromChainId),
      toChain: String(req.toChainId),
      fromToken: NATIVE_TOKEN_ADDRESS,
      toToken: NATIVE_TOKEN_ADDRESS,
      fromAmount: req.amountWei,
      fromAddress: req.fromAddress,
      toAddress: req.fromAddress, // Same address for recovery
      slippage: "0.03", // 3% slippage for MVP
    };

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    try {
      const response = await request(url.toString(), {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      });

      if (response.statusCode !== 200) {
        const body = await response.body.text();
        console.error("LI.FI quote error:", response.statusCode, body);
        return [];
      }

      const json = await response.body.json() as LiFiQuoteResponse;

      // LI.FI returns a single best route for /quote
      // Use /routes for multiple options
      const quote = this.normalizeQuote(json, req);
      return quote ? [quote] : [];
    } catch (err) {
      console.error("LI.FI quote failed:", err);
      return [];
    }
  }

  async build(req: BuildRequest): Promise<TxStep[]> {
    // For LI.FI, the quote response already contains transaction data
    // We need to re-fetch with the route ID or use the cached transactionRequest
    
    const url = new URL(`${LIFI_BASE_URL}/quote`);
    
    // Reconstruct the original quote request
    const quoteReq: QuoteRequest = {
      fromChainId: req.quote.steps[0]?.fromChainId ?? 0,
      toChainId: req.quote.steps[req.quote.steps.length - 1]?.toChainId ?? 0,
      tokenSymbol: "ETH",
      amountWei: "0", // Will be in the routeId
      fromAddress: req.userAddress,
    };

    // For MVP, we assume the quote is still valid and re-fetch
    // In production, use step execution API
    const params = {
      fromChain: String(quoteReq.fromChainId),
      toChain: String(quoteReq.toChainId),
      fromToken: NATIVE_TOKEN_ADDRESS,
      toToken: NATIVE_TOKEN_ADDRESS,
      fromAmount: req.quote.routeId.split(":")[1] ?? "0",
      fromAddress: req.userAddress,
      toAddress: req.userAddress,
    };

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    try {
      const response = await request(url.toString(), {
        method: "GET",
        headers: { "Accept": "application/json" },
      });

      if (response.statusCode !== 200) {
        throw new Error(`LI.FI build failed: ${response.statusCode}`);
      }

      const json = await response.body.json() as LiFiQuoteResponse;

      if (!json.transactionRequest) {
        throw new Error("No transaction data in LI.FI response");
      }

      return [{
        chainId: quoteReq.fromChainId,
        to: json.transactionRequest.to as `0x${string}`,
        data: json.transactionRequest.data as `0x${string}`,
        value: json.transactionRequest.value ?? "0",
        gasLimit: json.transactionRequest.gasLimit,
        description: `Bridge via ${json.toolDetails?.name ?? "LI.FI"}`,
      }];
    } catch (err) {
      console.error("LI.FI build failed:", err);
      throw err;
    }
  }

  private normalizeQuote(json: LiFiQuoteResponse, req: QuoteRequest): Quote | null {
    if (!json.estimate?.toAmount) {
      return null;
    }

    const steps = json.includedSteps?.map((step) => ({
      fromChainId: step.action?.fromChainId ?? req.fromChainId,
      toChainId: step.action?.toChainId ?? req.toChainId,
      tool: step.toolDetails?.name ?? step.tool ?? "unknown",
      estimatedFeeUsd: step.estimate?.feeCosts?.reduce(
        (sum, fee) => sum + (parseFloat(fee.amountUSD ?? "0")),
        0
      ),
      estimatedTimeSec: step.estimate?.executionDuration,
    })) ?? [{
      fromChainId: req.fromChainId,
      toChainId: req.toChainId,
      tool: json.toolDetails?.name ?? "LI.FI",
      estimatedTimeSec: json.estimate?.executionDuration,
    }];

    const totalFee = json.estimate?.feeCosts?.reduce(
      (sum, fee) => sum + parseFloat(fee.amountUSD ?? "0"),
      0
    );

    return {
      provider: "lifi",
      routeId: `lifi:${req.amountWei}:${Date.now()}`,
      steps,
      estimatedReceivedWei: json.estimate.toAmount,
      estimatedReceivedUsd: parseFloat(json.estimate.toAmountUSD ?? "0"),
      estimatedTotalFeeUsd: totalFee,
      estimatedTotalTimeSec: json.estimate.executionDuration,
    };
  }
}

// LI.FI Response Types (simplified)
interface LiFiQuoteResponse {
  id?: string;
  type?: string;
  tool?: string;
  toolDetails?: {
    key: string;
    name: string;
    logoURI?: string;
  };
  estimate?: {
    toAmount: string;
    toAmountMin?: string;
    toAmountUSD?: string;
    executionDuration?: number;
    feeCosts?: Array<{
      name: string;
      amount: string;
      amountUSD?: string;
      token?: object;
    }>;
    gasCosts?: Array<{
      amount: string;
      amountUSD?: string;
    }>;
  };
  includedSteps?: Array<{
    id: string;
    type: string;
    tool: string;
    toolDetails?: { name: string };
    action?: {
      fromChainId: number;
      toChainId: number;
    };
    estimate?: {
      executionDuration?: number;
      feeCosts?: Array<{ amountUSD?: string }>;
    };
  }>;
  transactionRequest?: {
    to: string;
    data: string;
    value?: string;
    gasLimit?: string;
    gasPrice?: string;
  };
}
