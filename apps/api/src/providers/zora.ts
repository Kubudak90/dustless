import type { BridgeProvider } from "./BridgeProvider.js";
import type { Quote, QuoteRequest, BuildRequest, TxStep } from "@dustless/shared";
import { ProviderError } from "@dustless/shared";
import { createPublicClient, http, encodeFunctionData, erc20Abi } from "viem";
import { getChainConfig } from "../config/chains.js";

/**
 * Zora Native Bridge Provider
 * Zora uses Base's native bridge for cross-chain transfers
 * 
 * Note: Zora is built on Base, so bridging from Zora typically goes through Base's native bridge
 */
export class ZoraProvider implements BridgeProvider {
  readonly name = "zora" as const;

  async quote(req: QuoteRequest): Promise<Quote[]> {
    // Zora native bridge only works for Zora (7777777) → Base (8453)
    // Skip for all other chains
    if (req.fromChainId !== 7777777) {
      return [];
    }

    if (req.toChainId !== 8453) {
      // Zora can only bridge to Base directly
      return [];
    }

    // Zora to Base bridge uses Base's native bridge
    // Estimate: ~0.0001 ETH fee for bridge
    const bridgeFee = BigInt("100000000000000"); // 0.0001 ETH
    const amountBigInt = BigInt(req.amountWei);
    
    // Check if amount is sufficient (must cover bridge fee)
    if (amountBigInt <= bridgeFee) {
      return [];
    }

    const estimatedReceived = amountBigInt - bridgeFee;

    return [{
      provider: "zora",
      routeId: `zora:${req.fromChainId}:${req.toChainId}:${req.amountWei}`,
      steps: [{
        fromChainId: req.fromChainId,
        toChainId: req.toChainId,
        tool: "Zora Native Bridge",
        estimatedTimeSec: 120, // ~2 minutes for Base bridge
      }],
      estimatedReceivedWei: estimatedReceived.toString(),
      estimatedReceivedUsd: undefined,
      estimatedTotalFeeUsd: undefined,
      estimatedTotalTimeSec: 120,
    }];
  }

  async build(req: BuildRequest): Promise<TxStep[]> {
    const routeId = req.quote.routeId;
    if (!routeId.startsWith("zora:")) {
      throw new Error("Invalid Zora route ID");
    }

    // Zora to Base bridge - use Base's native bridge contract
    // Base bridge contract address on Zora
    const BASE_BRIDGE_CONTRACT = "0x4200000000000000000000000000000000000010" as `0x${string}`;
    
    const fromChainId = req.quote.steps[0]?.fromChainId ?? 7777777;
    const toChainId = req.quote.steps[0]?.toChainId ?? 8453;

    // Zora native bridge only works for Zora → Base
    if (fromChainId !== 7777777) {
      throw new ProviderError("zora", "Zora native bridge only supports Zora (7777777) as source", 400);
    }

    if (toChainId !== 8453) {
      throw new ProviderError("zora", "Zora native bridge only supports Base (8453) as destination", 400);
    }

    try {
      const chain = getChainConfig(fromChainId);
      const client = createPublicClient({
        chain: {
          id: fromChainId,
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

      // Base bridge uses a simple transfer to the bridge contract
      // The bridge contract address receives ETH and bridges it to Base
      // For native ETH bridge, we send ETH directly to the bridge contract
      
      // Parse amount from routeId
      const parts = routeId.split(":");
      const amount = parts[3] || "0";

      return [{
        chainId: fromChainId,
        to: BASE_BRIDGE_CONTRACT,
        data: "0x" as `0x${string}`, // Empty data for native ETH transfer
        value: amount,
        description: `Bridge ETH from Zora to Base via native bridge`,
      }];
    } catch (err) {
      console.error("Zora build failed:", err);
      throw new ProviderError("zora", `Build failed: ${err instanceof Error ? err.message : "Unknown error"}`, 500);
    }
  }
}

