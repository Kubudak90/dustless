import { createPublicClient, http, type PublicClient, erc20Abi } from "viem";
import type { BalanceResult } from "@dustless/shared";
import { NATIVE_TOKEN_ADDRESS, type TokenConfig } from "@dustless/shared";
import { getChainConfig } from "../config/chains.js";

/**
 * Reads ERC-20 token balance for an address
 */
export async function getTokenBalance(
  client: PublicClient,
  tokenAddress: string,
  userAddress: string,
  chainId: number
): Promise<string> {
  try {
    const balance = await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [userAddress as `0x${string}`],
    });

    return balance.toString();
  } catch (error) {
    console.error(`Failed to read balance for ${tokenAddress} on chain ${chainId}:`, error);
    throw error;
  }
}

/**
 * Reads native ETH balance for an address
 */
export async function getNativeBalance(
  client: PublicClient,
  userAddress: string
): Promise<string> {
  try {
    const balance = await client.getBalance({
      address: userAddress as `0x${string}`,
    });

    return balance.toString();
  } catch (error) {
    console.error(`Failed to read native balance:`, error);
    throw error;
  }
}

/**
 * Scans all token balances (native + ERC-20) for a user on a specific chain
 * Uses multicall for efficiency
 */
export async function scanTokenBalances(
  chainId: number,
  userAddress: string,
  tokens: TokenConfig[]
): Promise<BalanceResult[]> {
  const chain = getChainConfig(chainId);

  try {
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

    const results: BalanceResult[] = [];

    // Read native ETH balance
    try {
      const nativeBalance = await getNativeBalance(client, userAddress);
      results.push({
        chainId,
        tokenAddress: NATIVE_TOKEN_ADDRESS,
        symbol: "ETH",
        name: "Ethereum",
        decimals: 18,
        balance: nativeBalance,
        ok: true,
      });
    } catch (error) {
      console.error(`Failed to read native balance on chain ${chainId}:`, error);
    }

    // Read ERC-20 token balances using multicall
    if (tokens.length > 0) {
      try {
        const multicallContracts = tokens.map((token) => ({
          address: token.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [userAddress as `0x${string}`],
        }));

        const balances = await client.multicall({
          contracts: multicallContracts,
          allowFailure: true,
        });

        balances.forEach((result, index) => {
          const token = tokens[index];
          if (result.status === "success" && result.result !== undefined) {
            results.push({
              chainId,
              tokenAddress: token.address,
              symbol: token.symbol,
              name: token.name,
              decimals: token.decimals,
              balance: result.result.toString(),
              ok: true,
            });
          } else {
            console.warn(
              `Failed to read balance for ${token.symbol} (${token.address}) on chain ${chainId}:`,
              result.error
            );
          }
        });
      } catch (error) {
        console.error(`Multicall failed for chain ${chainId}:`, error);
        // Fall back to individual calls if multicall fails
        for (const token of tokens) {
          try {
            const balance = await getTokenBalance(client, token.address, userAddress, chainId);
            results.push({
              chainId,
              tokenAddress: token.address,
              symbol: token.symbol,
              name: token.name,
              decimals: token.decimals,
              balance,
              ok: true,
            });
          } catch (err) {
            console.warn(`Failed to read ${token.symbol} balance on chain ${chainId}:`, err);
          }
        }
      }
    }

    return results;
  } catch (error) {
    console.error(`Failed to scan balances on chain ${chainId}:`, error);
    return [];
  }
}

/**
 * Checks if a balance is considered "stuck" (worth rescuing)
 * Threshold: > $1 USD equivalent or > 0.001 ETH/tokens
 */
export function isBalanceStuck(balance: string, decimals: number, usdValue?: number): boolean {
  const balanceBigInt = BigInt(balance);

  // Must have non-zero balance
  if (balanceBigInt === 0n) {
    return false;
  }

  // If we have USD value, use $1 threshold
  if (usdValue !== undefined && usdValue > 1) {
    return true;
  }

  // Otherwise use minimum balance threshold (0.001 tokens = 1e15 for 18 decimals)
  const minThreshold = decimals === 18
    ? BigInt("1000000000000000") // 0.001 ETH
    : decimals === 6
    ? BigInt("1000") // 0.001 USDC/USDT
    : BigInt(10 ** (decimals - 3)); // 0.001 of token

  return balanceBigInt >= minThreshold;
}
