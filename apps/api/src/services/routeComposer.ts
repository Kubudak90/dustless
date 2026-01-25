/**
 * Route Composer Service
 *
 * Composes multi-hop routes for ERC-20 → ETH cross-chain transfers.
 * Combines swap (on source chain) + bridge (to destination chain).
 */

import { registry } from "../providers/index.js";
import { swapRegistry } from "../providers/SwapProvider.js";
import {
  NATIVE_TOKEN_ADDRESS,
  type MultiHopQuoteRequest,
  type ComposedRoute,
  type RouteStep,
  type SwapQuote,
  type Quote,
} from "@dustless/shared";
import { getChainConfig } from "../config/chains.js";
import { loggers } from "../config/logger.js";

const log = loggers.quote;

/**
 * Compose routes for multi-hop transfers
 * - If fromToken is native (ETH/BNB/etc), directly get bridge quotes
 * - If fromToken is ERC-20, get swap quotes then bridge quotes
 */
export async function composeRoutes(
  request: MultiHopQuoteRequest
): Promise<ComposedRoute[]> {
  const { fromChainId, toChainId, fromToken, amount, userAddress, slippage } = request;

  // Check if from token is native
  const isNativeToken = fromToken.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  const chain = getChainConfig(fromChainId);

  if (isNativeToken) {
    // Direct bridge: native token → native token on destination
    return composeBridgeOnlyRoutes({
      fromChainId,
      toChainId,
      amountWei: amount,
      userAddress,
      tokenSymbol: chain.nativeSymbol,
    });
  }

  // Multi-hop: ERC-20 → native (swap) → bridge to destination
  return composeSwapAndBridgeRoutes({
    fromChainId,
    toChainId,
    fromToken,
    amount,
    userAddress,
    slippage: slippage ?? 3,
  });
}

/**
 * Direct bridge routes for native tokens
 */
async function composeBridgeOnlyRoutes(params: {
  fromChainId: number;
  toChainId: number;
  amountWei: string;
  userAddress: string;
  tokenSymbol: string;
}): Promise<ComposedRoute[]> {
  const { fromChainId, toChainId, amountWei, userAddress, tokenSymbol } = params;

  const providers = registry.all();
  if (providers.length === 0) {
    return [];
  }

  // Get bridge quotes from all providers
  const results = await Promise.allSettled(
    providers.map((p) =>
      p.quote({
        fromChainId,
        toChainId,
        tokenSymbol: tokenSymbol as any,
        amountWei,
        fromAddress: userAddress,
      })
    )
  );

  // Flatten successful quotes
  const bridgeQuotes: Quote[] = results.flatMap((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    log.warn({ provider: providers[i].name, err: result.reason }, "Bridge provider failed");
    return [];
  });

  // Convert to composed routes
  return bridgeQuotes.map((bridgeQuote, index) => {
    const steps: RouteStep[] = [
      {
        type: "bridge",
        chainId: fromChainId,
        fromToken: NATIVE_TOKEN_ADDRESS,
        toToken: NATIVE_TOKEN_ADDRESS,
        tool: bridgeQuote.steps[0]?.tool || bridgeQuote.provider,
        estimatedTimeSec: bridgeQuote.estimatedTotalTimeSec,
      },
    ];

    return {
      id: `direct:${bridgeQuote.routeId}`,
      bridgeQuote,
      estimatedReceivedWei: bridgeQuote.estimatedReceivedWei,
      estimatedReceivedUsd: bridgeQuote.estimatedReceivedUsd,
      estimatedTotalTimeSec: bridgeQuote.estimatedTotalTimeSec || 300,
      estimatedTotalFeeUsd: bridgeQuote.estimatedTotalFeeUsd,
      steps,
    };
  });
}

/**
 * Multi-hop routes: swap ERC-20 to native, then bridge
 */
async function composeSwapAndBridgeRoutes(params: {
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  amount: string;
  userAddress: string;
  slippage: number;
}): Promise<ComposedRoute[]> {
  const { fromChainId, toChainId, fromToken, amount, userAddress, slippage } = params;
  const chain = getChainConfig(fromChainId);

  // Step 1: Get swap quotes (ERC-20 → native token)
  const swapProviders = swapRegistry.all();
  if (swapProviders.length === 0) {
    log.warn("No swap providers configured for multi-hop");
    return [];
  }

  const swapResults = await Promise.allSettled(
    swapProviders.map((p) =>
      p.quote({
        chainId: fromChainId,
        fromToken,
        toToken: NATIVE_TOKEN_ADDRESS,
        amount,
        userAddress,
        slippage,
      })
    )
  );

  const swapQuotes: SwapQuote[] = swapResults.flatMap((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    log.warn({ provider: swapProviders[i].name, err: result.reason }, "Swap provider failed");
    return [];
  });

  if (swapQuotes.length === 0) {
    log.warn({ fromToken }, "No swap quotes found");
    return [];
  }

  // Step 2: For each swap quote, get bridge quotes for the output amount
  const composedRoutes: ComposedRoute[] = [];
  const bridgeProviders = registry.all();

  for (const swapQuote of swapQuotes) {
    // Get bridge quotes for the swap output amount
    const bridgeResults = await Promise.allSettled(
      bridgeProviders.map((p) =>
        p.quote({
          fromChainId,
          toChainId,
          tokenSymbol: chain.nativeSymbol as any,
          amountWei: swapQuote.toAmount,
          fromAddress: userAddress,
        })
      )
    );

    const bridgeQuotes: Quote[] = bridgeResults.flatMap((result, i) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      return [];
    });

    // Compose routes with this swap + each bridge option
    for (const bridgeQuote of bridgeQuotes) {
      const steps: RouteStep[] = [
        {
          type: "swap",
          chainId: fromChainId,
          fromToken,
          toToken: NATIVE_TOKEN_ADDRESS,
          tool: "Odos",
          estimatedTimeSec: 30, // Swaps are typically fast
        },
        {
          type: "bridge",
          chainId: fromChainId,
          fromToken: NATIVE_TOKEN_ADDRESS,
          toToken: NATIVE_TOKEN_ADDRESS,
          tool: bridgeQuote.steps[0]?.tool || bridgeQuote.provider,
          estimatedTimeSec: bridgeQuote.estimatedTotalTimeSec,
        },
      ];

      const totalTimeSec = 30 + (bridgeQuote.estimatedTotalTimeSec || 300);
      const totalFeeUsd =
        (swapQuote.estimatedGasUsd || 0) + (bridgeQuote.estimatedTotalFeeUsd || 0);

      composedRoutes.push({
        id: `multihop:${swapQuote.pathId}:${bridgeQuote.routeId}`,
        swapQuote,
        bridgeQuote,
        estimatedReceivedWei: bridgeQuote.estimatedReceivedWei,
        estimatedReceivedUsd: bridgeQuote.estimatedReceivedUsd,
        estimatedTotalTimeSec: totalTimeSec,
        estimatedTotalFeeUsd: totalFeeUsd,
        steps,
      });
    }
  }

  // Sort by best output (highest received amount)
  composedRoutes.sort((a, b) => {
    const aValue = BigInt(a.estimatedReceivedWei);
    const bValue = BigInt(b.estimatedReceivedWei);
    if (bValue > aValue) return 1;
    if (bValue < aValue) return -1;
    return 0;
  });

  return composedRoutes;
}

/**
 * Build transaction steps for a composed route
 */
export async function buildComposedRoute(
  route: ComposedRoute,
  userAddress: string
): Promise<import("@dustless/shared").TxStep[]> {
  const steps: import("@dustless/shared").TxStep[] = [];

  // Build swap transaction if present
  if (route.swapQuote) {
    const swapProvider = swapRegistry.get(route.swapQuote.provider);
    if (!swapProvider) {
      throw new Error(`Unknown swap provider: ${route.swapQuote.provider}`);
    }

    const swapSteps = await swapProvider.build({
      quote: route.swapQuote,
      userAddress,
    });
    steps.push(...swapSteps);
  }

  // Build bridge transaction
  const bridgeProvider = registry.get(route.bridgeQuote.provider);
  if (!bridgeProvider) {
    throw new Error(`Unknown bridge provider: ${route.bridgeQuote.provider}`);
  }

  const bridgeSteps = await bridgeProvider.build({
    quote: route.bridgeQuote,
    userAddress,
  });
  steps.push(...bridgeSteps);

  return steps;
}
