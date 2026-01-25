"use client";

import { useMutation } from "@tanstack/react-query";
import { useAccount, useSwitchChain, useSendTransaction, usePublicClient } from "wagmi";
import { api } from "@/lib/api";
import type { Quote, SwapQuote } from "@dustless/shared";
import { useReducer, useCallback } from "react";
import { NATIVE_TOKEN_ADDRESS } from "@dustless/shared";

/**
 * Hook for scanning wallet for stuck assets
 */
export function useScan() {
  const { address } = useAccount();

  return useMutation({
    mutationFn: async (chainIds?: number[]) => {
      if (!address) throw new Error("Wallet not connected");
      return api.scan({
        address,
        chainIds: chainIds ?? [],
      });
    },
  });
}

/**
 * Hook for getting bridge quotes
 */
export function useQuote() {
  const { address } = useAccount();

  return useMutation({
    mutationFn: async ({
      fromChainId,
      toChainId,
      amountWei,
    }: {
      fromChainId: number;
      toChainId: number;
      amountWei: string;
    }) => {
      if (!address) throw new Error("Wallet not connected");
      return api.quote({
        fromChainId,
        toChainId,
        tokenSymbol: "ETH",
        amountWei,
        fromAddress: address,
      });
    },
  });
}

/**
 * Hook for getting swap quotes (token → ETH)
 */
export function useSwap() {
  const { address } = useAccount();

  return useMutation({
    mutationFn: async ({
      chainId,
      fromToken,
      amount,
      slippage,
    }: {
      chainId: number;
      fromToken: string;
      amount: string;
      slippage?: number;
    }) => {
      if (!address) throw new Error("Wallet not connected");
      return api.swap({
        chainId,
        fromToken,
        toToken: NATIVE_TOKEN_ADDRESS,
        amount,
        userAddress: address,
        slippage: slippage ?? 3,
      });
    },
  });
}

// ============ useRecover Types ============

export type RecoveryStatus =
  | "idle"
  | "building"
  | "switching"
  | "signing"
  | "confirming"
  | "done"
  | "error";

interface RecoveryState {
  status: RecoveryStatus;
  currentStep: number;
  totalSteps: number;
  txHash?: string;
  error?: string;
}

type RecoveryAction =
  | { type: "START_BUILD" }
  | { type: "SET_STEPS"; payload: number }
  | { type: "NEXT_STEP"; payload: number }
  | { type: "SWITCHING" }
  | { type: "SIGNING" }
  | { type: "CONFIRMING"; payload: string }
  | { type: "DONE" }
  | { type: "ERROR"; payload: string }
  | { type: "RESET" };

const initialState: RecoveryState = {
  status: "idle",
  currentStep: 0,
  totalSteps: 0,
  txHash: undefined,
  error: undefined,
};

function recoveryReducer(state: RecoveryState, action: RecoveryAction): RecoveryState {
  switch (action.type) {
    case "START_BUILD":
      return { ...initialState, status: "building" };
    case "SET_STEPS":
      return { ...state, totalSteps: action.payload };
    case "NEXT_STEP":
      return { ...state, currentStep: action.payload };
    case "SWITCHING":
      return { ...state, status: "switching" };
    case "SIGNING":
      return { ...state, status: "signing" };
    case "CONFIRMING":
      return { ...state, status: "confirming", txHash: action.payload };
    case "DONE":
      return { ...state, status: "done" };
    case "ERROR":
      return { ...state, status: "error", error: action.payload };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

// ============ Constants ============

const TX_CONFIRMATION_TIMEOUT = 60_000; // 60 seconds

/**
 * Hook for building and executing recovery transactions
 * Supports both bridge quotes and swap quotes
 *
 * Uses useReducer for cleaner state management and better testability
 */
export function useRecover() {
  const { address, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient();

  const [state, dispatch] = useReducer(recoveryReducer, initialState);

  const execute = useCallback(
    async (quote: Quote | SwapQuote) => {
      if (!address) {
        dispatch({ type: "ERROR", payload: "Wallet not connected" });
        return;
      }

      try {
        // Build transaction
        dispatch({ type: "START_BUILD" });

        // Determine quote type and build accordingly
        const isSwap = "pathId" in quote;
        const { steps, warnings } = isSwap
          ? await api.swapBuild({
              quote: quote as SwapQuote,
              userAddress: address,
            })
          : await api.build({
              quote: quote as Quote,
              userAddress: address,
            });

        if (warnings?.length) {
          console.warn("Build warnings:", warnings);
        }

        dispatch({ type: "SET_STEPS", payload: steps.length });

        // Execute each step sequentially
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          dispatch({ type: "NEXT_STEP", payload: i + 1 });

          // Switch chain if needed
          if (chain?.id !== step.chainId) {
            dispatch({ type: "SWITCHING" });
            await switchChainAsync({ chainId: step.chainId as number });
          }

          // Send transaction
          dispatch({ type: "SIGNING" });
          const hash = await sendTransactionAsync({
            to: step.to,
            data: step.data,
            value: BigInt(step.value),
            gas: step.gasLimit ? BigInt(step.gasLimit) : undefined,
          });

          dispatch({ type: "CONFIRMING", payload: hash });

          // Wait for transaction confirmation
          if (publicClient) {
            await publicClient.waitForTransactionReceipt({
              hash,
              confirmations: 1,
              timeout: TX_CONFIRMATION_TIMEOUT,
            });
          }
        }

        dispatch({ type: "DONE" });
      } catch (err) {
        console.error("Recovery failed:", err);
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        dispatch({ type: "ERROR", payload: errorMessage });
      }
    },
    [address, chain, switchChainAsync, sendTransactionAsync, publicClient]
  );

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  return {
    execute,
    reset,
    ...state,
  };
}

// ============ Utility Hooks ============

/**
 * Hook to check if recovery is in progress
 */
export function useIsRecovering(status: RecoveryStatus): boolean {
  return status !== "idle" && status !== "done" && status !== "error";
}
