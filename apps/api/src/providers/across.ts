import { request } from "undici";
import type { BridgeProvider } from "./BridgeProvider.js";
import type { Quote, QuoteRequest, BuildRequest, TxStep } from "@dustless/shared";
import { NATIVE_TOKEN_ADDRESS, ProviderError } from "@dustless/shared";
import { env } from "../config/env.js";
import { loggers } from "../config/logger.js";

const log = loggers.across;

const ACROSS_BASE_URL = "https://api.across.to";
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Across Protocol Bridge Provider
 * Fast, secure cross-chain bridge with optimistic execution
 * 
 * Docs: https://docs.across.to/
 */
export class AcrossProvider implements BridgeProvider {
  readonly name = "across" as const;

  async quote(req: QuoteRequest): Promise<Quote[]> {
    const url = new URL(`${ACROSS_BASE_URL}/api/v1/quote`);
    
    const params = {
      originChainId: String(req.fromChainId),
      destinationChainId: String(req.toChainId),
      originToken: NATIVE_TOKEN_ADDRESS,
      destinationToken: NATIVE_TOKEN_ADDRESS,
      amount: req.amountWei,
      recipient: req.fromAddress,
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
        headersTimeout: REQUEST_TIMEOUT,
        bodyTimeout: REQUEST_TIMEOUT,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (response.statusCode !== 200) {
        const body = await response.body.text();
        log.error({ statusCode: response.statusCode, body }, 'Across quote error');
        return [];
      }

      const json = await response.body.json() as AcrossQuoteResponse;

      if (json.relayerFeePct === undefined || json.relayerFeePct === null) {
        log.warn('Across returned invalid quote');
        return [];
      }

      // Calculate received amount (amount - relayer fee)
      const amountBigInt = BigInt(req.amountWei);
      const relayerFeeBigInt = (amountBigInt * BigInt(Math.floor(Number(json.relayerFeePct) * 10000))) / 1000000n;
      const estimatedReceived = amountBigInt - relayerFeeBigInt;

      return [{
        provider: "across",
        routeId: `across:${req.fromChainId}:${req.toChainId}:${req.amountWei}:${json.timestamp}`,
        steps: [{
          fromChainId: req.fromChainId,
          toChainId: req.toChainId,
          tool: "Across",
          estimatedTimeSec: json.estimatedTime || 300, // Default 5 minutes
        }],
        estimatedReceivedWei: estimatedReceived.toString(),
        estimatedReceivedUsd: json.destinationTokenUsdValue ? parseFloat(json.destinationTokenUsdValue) : undefined,
        estimatedTotalFeeUsd: json.relayerFeeTotalUsd ? parseFloat(json.relayerFeeTotalUsd) : undefined,
        estimatedTotalTimeSec: json.estimatedTime || 300,
      }];
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        log.error({ timeout: REQUEST_TIMEOUT }, 'Across quote timeout');
      } else {
        log.error({ err }, 'Across quote failed');
      }
      return [];
    }
  }

  async build(req: BuildRequest): Promise<TxStep[]> {
    const routeId = req.quote.routeId;
    if (!routeId.startsWith("across:")) {
      throw new Error("Invalid Across route ID");
    }

    // Parse route ID
    const parts = routeId.split(":");
    if (parts.length < 5) {
      throw new Error("Invalid Across route format");
    }

    const fromChainId = parseInt(parts[1]);
    const toChainId = parseInt(parts[2]);
    const amount = parts[3];
    const timestamp = parts[4];

    // Get quote again to build transaction
    const url = new URL(`${ACROSS_BASE_URL}/api/v1/quote`);
    const params = {
      originChainId: String(fromChainId),
      destinationChainId: String(toChainId),
      originToken: NATIVE_TOKEN_ADDRESS,
      destinationToken: NATIVE_TOKEN_ADDRESS,
      amount: amount,
      recipient: req.userAddress,
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
        headersTimeout: REQUEST_TIMEOUT,
        bodyTimeout: REQUEST_TIMEOUT,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (response.statusCode !== 200) {
        const body = await response.body.text();
        throw new ProviderError("across", `Build failed: ${body}`, response.statusCode);
      }

      const json = await response.body.json() as AcrossQuoteResponse;

      if (!json.depositContract || !json.depositCalldata) {
        throw new ProviderError("across", "No transaction data in Across response", 500);
      }

      return [{
        chainId: fromChainId,
        to: json.depositContract as `0x${string}`,
        data: json.depositCalldata as `0x${string}`,
        value: amount,
        description: `Bridge via Across Protocol`,
      }];
    } catch (err) {
      log.error({ err }, 'Across build failed');
      throw err;
    }
  }
}

// Across API Response Types
interface AcrossQuoteResponse {
  relayerFeePct: string; // Fee percentage as string (e.g., "0.0003" for 0.03%)
  relayerFeeTotalUsd?: string;
  destinationTokenUsdValue?: string;
  estimatedTime?: number; // Estimated time in seconds
  timestamp: string;
  depositContract: string;
  depositCalldata: string;
  originToken: string;
  destinationToken: string;
}

