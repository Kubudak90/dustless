import { request } from "undici";
import type { BridgeProvider } from "./BridgeProvider.js";
import type { Quote, QuoteRequest, BuildRequest, TxStep } from "@dustless/shared";
import { NATIVE_TOKEN_ADDRESS, TimeoutError, ProviderError } from "@dustless/shared";
import { env } from "../config/env.js";
import { loggers } from "../config/logger.js";

const log = loggers.socketProvider;

const SOCKET_BASE_URL = "https://api.socket.tech/v2";
const SOCKET_API_KEY = env.SOCKET_API_KEY;
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Socket (Bungee) Bridge Provider
 * Aggregates routes from multiple bridges
 * 
 * Docs: https://docs.socket.tech/
 */
export class SocketProvider implements BridgeProvider {
  readonly name = "socket" as const;

  private get headers(): Record<string, string> {
    return {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(SOCKET_API_KEY ? { "API-KEY": SOCKET_API_KEY } : {}),
    };
  }

  async quote(req: QuoteRequest): Promise<Quote[]> {
    if (!SOCKET_API_KEY) {
      log.warn('Socket API key not configured, skipping');
      return [];
    }

    const url = new URL(`${SOCKET_BASE_URL}/quote`);
    
    const params = {
      fromChainId: String(req.fromChainId),
      toChainId: String(req.toChainId),
      fromTokenAddress: NATIVE_TOKEN_ADDRESS,
      toTokenAddress: NATIVE_TOKEN_ADDRESS,
      fromAmount: req.amountWei,
      userAddress: req.fromAddress,
      uniqueRoutesPerBridge: "true",
      sort: "output", // Sort by output amount
      singleTxOnly: "true", // Prefer single transaction routes
    };

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    try {
      const response = await request(url.toString(), {
        method: "GET",
        headers: this.headers,
        headersTimeout: REQUEST_TIMEOUT,
        bodyTimeout: REQUEST_TIMEOUT,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (response.statusCode !== 200) {
        const body = await response.body.text();
        log.error({ statusCode: response.statusCode, body }, 'Socket quote error');

        // Log specific error details for debugging
        if (response.statusCode === 401) {
          log.error('Socket API: Unauthorized - check API key');
        } else if (response.statusCode === 400) {
          log.error({
            fromChainId: req.fromChainId,
            toChainId: req.toChainId,
            fromTokenAddress: NATIVE_TOKEN_ADDRESS,
          }, 'Socket API: Bad request - check parameters');
        }

        return [];
      }

      const json = await response.body.json() as SocketQuoteResponse;

      // Log response for debugging
      if (!json.success) {
        log.warn({ response: json }, 'Socket API returned success: false');
        return [];
      }

      if (!json.result?.routes?.length) {
        log.warn({
          fromChainId: req.fromChainId,
          toChainId: req.toChainId,
          hasResult: !!json.result,
          routesCount: json.result?.routes?.length ?? 0,
        }, 'Socket API returned no routes');
        return [];
      }

      // Return top 3 routes
      const quotes = json.result.routes
        .slice(0, 3)
        .map((route) => this.normalizeQuote(route, req))
        .filter((q): q is Quote => q !== null);

      if (quotes.length === 0) {
        log.warn({ routesCount: json.result.routes.length }, 'Socket API: All routes failed to normalize');
      }

      return quotes;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        log.error({ timeout: REQUEST_TIMEOUT }, 'Socket quote timeout');
      } else {
        log.error({ err }, 'Socket quote failed');
      }
      return [];
    }
  }

  async build(req: BuildRequest): Promise<TxStep[]> {
    if (!SOCKET_API_KEY) {
      throw new Error("Socket API key not configured");
    }

    // Socket requires building the transaction separately
    const routeData = this.parseRouteId(req.quote.routeId);
    if (!routeData) {
      throw new Error("Invalid Socket route ID");
    }

    const url = new URL(`${SOCKET_BASE_URL}/build-tx`);

    try {
      const response = await request(url.toString(), {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          route: routeData.route,
        }),
        headersTimeout: REQUEST_TIMEOUT,
        bodyTimeout: REQUEST_TIMEOUT,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (response.statusCode !== 200) {
        const body = await response.body.text();
        throw new ProviderError("socket", `Build failed: ${body}`, response.statusCode);
      }

      const json = await response.body.json() as SocketBuildResponse;

      if (!json.success || !json.result?.txData) {
        throw new Error("No transaction data in Socket response");
      }

      return [{
        chainId: req.quote.steps[0]?.fromChainId ?? 0,
        to: json.result.txTarget as `0x${string}`,
        data: json.result.txData as `0x${string}`,
        value: json.result.value ?? "0",
        description: `Bridge via ${req.quote.steps[0]?.tool ?? "Socket"}`,
      }];
    } catch (err) {
      log.error({ err }, 'Socket build failed');
      throw err;
    }
  }

  private normalizeQuote(route: SocketRoute, req: QuoteRequest): Quote | null {
    // Socket API may return toAmount as string or number
    const toAmount = route.toAmount?.toString();
    if (!toAmount || toAmount === "0") {
      log.warn({ routeId: route.routeId, toAmount: route.toAmount }, 'Socket route has invalid toAmount');
      return null;
    }

    const steps = route.userTxs?.map((tx) => ({
      fromChainId: tx.chainId ?? req.fromChainId,
      toChainId: tx.toChainId ?? req.toChainId,
      tool: tx.protocol ?? route.usedBridgeNames?.[0] ?? "Socket",
      estimatedTimeSec: tx.serviceTime,
    })) ?? [{
      fromChainId: req.fromChainId,
      toChainId: req.toChainId,
      tool: route.usedBridgeNames?.[0] ?? "Socket",
      estimatedTimeSec: route.serviceTime,
    }];

    // Calculate total fees
    const bridgeFee = parseFloat(String(route.totalBridgeFeeUSD ?? "0"));
    const gasFee = parseFloat(String(route.totalGasFeesInUsd ?? "0"));

    return {
      provider: "socket",
      // Encode route data in ID for build step
      routeId: `socket:${Buffer.from(JSON.stringify({ route })).toString("base64")}`,
      steps,
      estimatedReceivedWei: toAmount,
      estimatedReceivedUsd: parseFloat(String(route.outputValueInUsd ?? "0")),
      estimatedTotalFeeUsd: bridgeFee + gasFee,
      estimatedTotalTimeSec: Number(route.serviceTime ?? 0),
    };
  }

  private parseRouteId(routeId: string): { route: SocketRoute } | null {
    try {
      if (!routeId.startsWith("socket:")) return null;
      const encoded = routeId.slice(7);
      return JSON.parse(Buffer.from(encoded, "base64").toString());
    } catch {
      return null;
    }
  }
}

// Socket Response Types (simplified)
interface SocketQuoteResponse {
  success: boolean;
  result?: {
    routes: SocketRoute[];
  };
}

interface SocketRoute {
  routeId?: string;
  toAmount?: string | number; // Can be string or number
  outputValueInUsd?: string | number;
  totalBridgeFeeUSD?: string | number;
  totalGasFeesInUsd?: string | number;
  serviceTime?: number;
  usedBridgeNames?: string[];
  userTxs?: Array<{
    chainId?: number;
    toChainId?: number;
    protocol?: string;
    serviceTime?: number;
  }>;
}

interface SocketBuildResponse {
  success: boolean;
  result?: {
    txTarget: string;
    txData: string;
    value?: string;
    chainId?: number;
  };
}
