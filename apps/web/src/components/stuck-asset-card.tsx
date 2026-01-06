"use client";

import type { StuckAsset, Quote, SwapQuote } from "@dustless/shared";
import { NATIVE_TOKEN_ADDRESS } from "@dustless/shared";
import {
  formatToken,
  formatUSD,
  formatDuration,
  getChainColor,
  getChainName,
  getTxUrl,
} from "@/lib/utils";
import { useQuote, useSwap, useRecover } from "@/hooks/useRecovery";
import { ArrowRight, Loader2, Check, ExternalLink, AlertTriangle, Repeat } from "lucide-react";
import { useState } from "react";

interface StuckAssetCardProps {
  asset: StuckAsset;
  targetChainId: number;
}

export function StuckAssetCard({ asset, targetChainId }: StuckAssetCardProps) {
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [selectedSwapQuote, setSelectedSwapQuote] = useState<SwapQuote | null>(null);
  const [flow, setFlow] = useState<"idle" | "swap" | "bridge">("idle");

  const { mutate: getQuotes, data: quoteData, isPending: isQuoting } = useQuote();
  const { mutate: getSwapQuotes, data: swapData, isPending: isSwapping } = useSwap();
  const { execute, reset, status, txHash, error } = useRecover();

  // Check if asset is native ETH
  const isNativeETH = asset.tokenAddress === NATIVE_TOKEN_ADDRESS;

  // Check if balance is significant enough (> $1)
  const isSignificant = (asset.usdValue ?? 0) > 1;

  const handleGetQuotes = () => {
    if (!isSignificant) return;

    if (isNativeETH) {
      // For ETH, directly get bridge quotes
      setFlow("bridge");
      getQuotes({
        fromChainId: asset.chainId,
        toChainId: targetChainId,
        amountWei: asset.balance,
      });
    } else {
      // For ERC-20, first get swap quotes
      setFlow("swap");
      getSwapQuotes({
        chainId: asset.chainId,
        fromToken: asset.tokenAddress,
        amount: asset.balance,
      });
    }
  };

  const handleExecuteSwap = () => {
    if (selectedSwapQuote) {
      execute(selectedSwapQuote);
    }
  };

  const handleExecuteBridge = () => {
    if (selectedQuote) {
      execute(selectedQuote);
    }
  };

  const handleAfterSwap = () => {
    // After swap completes, get bridge quotes for the swapped ETH
    if (selectedSwapQuote) {
      setFlow("bridge");
      getQuotes({
        fromChainId: asset.chainId,
        toChainId: targetChainId,
        amountWei: selectedSwapQuote.toAmount,
      });
    }
  };

  // Balance too low
  if (!isSignificant) {
    return (
      <div className="bg-zinc-900/50 border border-yellow-900/50 rounded-2xl p-5">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: getChainColor(asset.chainId) }}
              />
              {getChainName(asset.chainId)}
            </div>
            <div className="font-mono text-xl text-yellow-500">
              {formatToken(asset.balance, asset.decimals)} {asset.symbol}
            </div>
            {asset.usdValue !== undefined && (
              <div className="text-sm text-zinc-500">≈ {formatUSD(asset.usdValue)}</div>
            )}
          </div>
          <div className="flex items-center gap-2 text-yellow-500">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Balance too low</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-500">
          Balance is less than $1 USD (not worth the gas fees)
        </div>
      </div>
    );
  }

  // Recovery in progress
  if (status !== "idle" && status !== "error") {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: getChainColor(asset.chainId) }}
              />
              {getChainName(asset.chainId)}
              {!isNativeETH && flow === "swap" && (
                <>
                  <Repeat className="w-3 h-3" />
                  <span>ETH</span>
                </>
              )}
              {flow === "bridge" && (
                <>
                  <ArrowRight className="w-3 h-3" />
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: getChainColor(targetChainId) }}
                  />
                  {getChainName(targetChainId)}
                </>
              )}
            </div>
            <div className="font-mono text-lg">
              {formatToken(asset.balance, asset.decimals)} {asset.symbol}
              {!isNativeETH && flow === "swap" && " → ETH"}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {status === "done" ? (
              <div className="flex items-center gap-2 text-green-500">
                <Check className="w-5 h-5" />
                <span>Done</span>
              </div>
            ) : (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
                <span className="text-sm text-zinc-400">
                  {status === "building" && "Building tx..."}
                  {status === "switching" && "Switch chain..."}
                  {status === "signing" && "Sign in wallet..."}
                  {status === "confirming" && "Confirming..."}
                </span>
              </>
            )}
          </div>
        </div>

        {txHash && (
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <a
              href={getTxUrl(asset.chainId, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-brand-500 hover:underline"
            >
              View transaction <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {status === "done" && !isNativeETH && flow === "swap" && (
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <button
              onClick={handleAfterSwap}
              className="w-full py-2 bg-brand-500 hover:bg-brand-600 text-black font-medium rounded-xl transition-colors"
            >
              Continue to Bridge
            </button>
          </div>
        )}
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div className="bg-zinc-900/50 border border-red-900/50 rounded-2xl p-5">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="text-red-500 text-sm mb-1">Recovery failed</div>
            <div className="text-xs text-zinc-500">{error}</div>
          </div>
          <button
            onClick={reset}
            className="px-4 py-2 text-sm border border-zinc-700 rounded-lg hover:bg-zinc-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-4">
      {/* Asset info */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getChainColor(asset.chainId) }}
            />
            {getChainName(asset.chainId)}
            {!isNativeETH && asset.isStablecoin && (
              <span className="px-2 py-0.5 bg-green-500/20 text-green-500 text-xs rounded-full font-medium">
                Stablecoin
              </span>
            )}
          </div>
          <div className="font-mono text-xl">
            {formatToken(asset.balance, asset.decimals)} {asset.symbol}
          </div>
          {asset.usdValue && (
            <div className="text-sm text-zinc-500">
              ≈ {formatUSD(asset.usdValue)}
            </div>
          )}
        </div>

        {!swapData && !quoteData && (
          <button
            onClick={handleGetQuotes}
            disabled={isQuoting || isSwapping}
            className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-black font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {(isQuoting || isSwapping) ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Getting quotes...
              </>
            ) : (
              <>
                {isNativeETH ? "Bridge" : "Convert to ETH"}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Swap Quotes (for ERC-20 tokens) */}
      {swapData?.quotes && swapData.quotes.length > 0 && flow === "swap" && (
        <div className="border-t border-zinc-800 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Swap to ETH via Odos:</span>
          </div>

          {swapData.quotes.map((swapQuote) => (
            <button
              key={swapQuote.pathId}
              onClick={() => setSelectedSwapQuote(swapQuote)}
              className={`
                w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left
                ${selectedSwapQuote?.pathId === swapQuote.pathId
                  ? "border-brand-500 bg-brand-500/10"
                  : "border-zinc-800 hover:border-zinc-700"
                }
              `}
            >
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  {asset.symbol} <Repeat className="w-3 h-3" /> ETH
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {swapQuote.estimatedGasUsd && (
                    <>Gas: {formatUSD(swapQuote.estimatedGasUsd)}</>
                  )}
                  {swapQuote.priceImpact && (
                    <> · Impact: {swapQuote.priceImpact.toFixed(2)}%</>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono">
                  {formatToken(swapQuote.toAmount, 18)} ETH
                </div>
                <div className="text-xs text-brand-500">Best rate</div>
              </div>
            </button>
          ))}

          {selectedSwapQuote && (
            <button
              onClick={handleExecuteSwap}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-black font-semibold rounded-xl transition-colors"
            >
              Swap to ETH
            </button>
          )}
        </div>
      )}

      {/* Bridge Quotes (for ETH or after swap) */}
      {quoteData?.quotes && quoteData.quotes.length > 0 && flow === "bridge" && (
        <div className="border-t border-zinc-800 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Select bridge route:</span>
          </div>

          {quoteData.quotes.map((quote, i) => (
            <button
              key={quote.routeId}
              onClick={() => setSelectedQuote(quote)}
              className={`
                w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left
                ${selectedQuote?.routeId === quote.routeId
                  ? "border-brand-500 bg-brand-500/10"
                  : "border-zinc-800 hover:border-zinc-700"
                }
              `}
            >
              <div>
                <div className="text-sm font-medium">
                  via {quote.steps.map((s) => s.tool).join(" → ")}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {quote.estimatedTotalTimeSec
                    ? `~${formatDuration(quote.estimatedTotalTimeSec)}`
                    : "Time varies"
                  }
                  {quote.estimatedTotalFeeUsd && (
                    <> · Fee: {formatUSD(quote.estimatedTotalFeeUsd)}</>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono">
                  {formatToken(quote.estimatedReceivedWei, 18)} ETH
                </div>
                {i === 0 && (
                  <div className="text-xs text-brand-500">Best rate</div>
                )}
              </div>
            </button>
          ))}

          {selectedQuote && (
            <button
              onClick={handleExecuteBridge}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-black font-semibold rounded-xl transition-colors"
            >
              Bridge to {getChainName(targetChainId)}
            </button>
          )}
        </div>
      )}

      {/* No quotes */}
      {((swapData?.quotes?.length === 0 && flow === "swap") ||
        (quoteData?.quotes?.length === 0 && flow === "bridge")) && (
        <div className="border-t border-zinc-800 pt-4">
          <div className="text-zinc-500 text-sm text-center py-4">
            No routes available for this {flow === "swap" ? "swap" : "transfer"}.
            <br />
            Try again later or contact support.
          </div>
        </div>
      )}
    </div>
  );
}
