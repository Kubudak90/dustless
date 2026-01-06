"use client";

import { useMutation } from "@tanstack/react-query";
import { useAccount, useSwitchChain, useSendTransaction, usePublicClient } from "wagmi";
import { api } from "@/lib/api";
import type { Quote, TxStep, StuckAsset } from "@dustless/shared";
import { useState, useCallback } from "react";

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
 * Hook for building and executing recovery transactions
 */
export function useRecover() {
  const { address, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient();

  const [status, setStatus] = useState<"idle" | "building" | "switching" | "signing" | "confirming" | "done" | "error">("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [txHash, setTxHash] = useState<string>();
  const [error, setError] = useState<string>();

  const execute = useCallback(
    async (quote: Quote) => {
      if (!address) {
        setError("Wallet not connected");
        setStatus("error");
        return;
      }

      try {
        // Build transaction
        setStatus("building");
        const { steps, warnings } = await api.build({
          quote,
          userAddress: address,
        });

        if (warnings?.length) {
          console.warn("Build warnings:", warnings);
        }

        setTotalSteps(steps.length);

        // Execute each step
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          setCurrentStep(i + 1);

          // Switch chain if needed
          if (chain?.id !== step.chainId) {
            setStatus("switching");
            await switchChainAsync({ chainId: step.chainId });
          }

          // Send transaction
          setStatus("signing");
          const hash = await sendTransactionAsync({
            to: step.to,
            data: step.data,
            value: BigInt(step.value),
            gas: step.gasLimit ? BigInt(step.gasLimit) : undefined,
          });

          setTxHash(hash);
          setStatus("confirming");

          // Wait for transaction confirmation
          if (publicClient) {
            await publicClient.waitForTransactionReceipt({
              hash,
              confirmations: 1,
              timeout: 60_000, // 60 seconds timeout
            });
          }
        }

        setStatus("done");
      } catch (err) {
        console.error("Recovery failed:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    },
    [address, chain, switchChainAsync, sendTransactionAsync, publicClient]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setCurrentStep(0);
    setTotalSteps(0);
    setTxHash(undefined);
    setError(undefined);
  }, []);

  return {
    execute,
    reset,
    status,
    currentStep,
    totalSteps,
    txHash,
    error,
  };
}
