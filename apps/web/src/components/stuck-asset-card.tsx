"use client";

import type { StuckAsset, Quote } from "@dustless/shared";
import { 
  formatETH, 
  formatUSD, 
  formatDuration, 
  getChainColor, 
  getChainName, 
  getTxUrl,
  calculateBridgeableAmount,
  formatGasBuffer,
} from "@/lib/utils";
import { useQuote, useRecover } from "@/hooks/useRecovery";
import { ArrowRight, Loader2, Check, ExternalLink, AlertTriangle, Fuel } from "lucide-react";
import { useState, useMemo } from "react";

interface StuckAssetCardProps {
  asset: StuckAsset;
  targetChainId: number;
}

export function StuckAssetCard({ asset, targetChainId }: StuckAssetCardProps) {
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const { mutate: getQuotes, data: quoteData, isPending: isQuoting } = useQuote();
  const { execute, reset, status, txHash, error } = useRecover();

  // Calculate bridgeable amount (balance - gas buffer)
  const bridgeInfo = useMemo(() => {
    return calculateBridgeableAmount(asset.wei, asset.chainId);
  }, [asset.wei, asset.chainId]);

  const handleGetQuotes = () => {
    if (bridgeInfo.isTooLow) return;
    
    getQuotes({
      fromChainId: asset.chainId,
      toChainId: targetChainId,
      amountWei: bridgeInfo.amountWei, // Use amount minus gas buffer!
    });
  };

  const handleRecover = () => {
    if (selectedQuote) {
      execute(selectedQuote);
    }
  };

  // Balance too low to bridge
  if (bridgeInfo.isTooLow) {
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
              {formatETH(asset.wei)} ETH
            </div>
          </div>
          <div className="flex items-center gap-2 text-yellow-500">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Too low to bridge</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-500">
          Balance is less than gas buffer ({formatGasBuffer(asset.chainId)} ETH needed for gas)
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
              <ArrowRight className="w-3 h-3" />
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: getChainColor(targetChainId) }}
              />
              {getChainName(targetChainId)}
            </div>
            <div className="font-mono text-lg">
              {formatETH(bridgeInfo.amountWei)} ETH
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
          </div>
          <div className="font-mono text-xl">
            {formatETH(asset.wei)} ETH
          </div>
          {asset.usdValue && (
            <div className="text-sm text-zinc-500">
              ≈ {formatUSD(asset.usdValue)}
            </div>
          )}
        </div>

        {!quoteData && (
          <button
            onClick={handleGetQuotes}
            disabled={isQuoting}
            className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-black font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isQuoting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Getting quotes...
              </>
            ) : (
              <>
                Get Quote
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Gas info banner */}
      {!quoteData && (
        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded-lg text-xs text-zinc-400">
          <Fuel className="w-3.5 h-3.5" />
          <span>
            Bridging {formatETH(bridgeInfo.amountWei)} ETH 
            <span className="text-zinc-500"> · {formatGasBuffer(asset.chainId)} ETH reserved for gas</span>
          </span>
        </div>
      )}

      {/* Quotes */}
      {quoteData?.quotes && quoteData.quotes.length > 0 && (
        <div className="border-t border-zinc-800 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Select route:</span>
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <Fuel className="w-3 h-3" />
              {formatGasBuffer(asset.chainId)} ETH for gas
            </span>
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
                  {formatETH(quote.estimatedReceivedWei)} ETH
                </div>
                {i === 0 && (
                  <div className="text-xs text-brand-500">Best rate</div>
                )}
              </div>
            </button>
          ))}

          {selectedQuote && (
            <button
              onClick={handleRecover}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-black font-semibold rounded-xl transition-colors"
            >
              Recover to {getChainName(targetChainId)}
            </button>
          )}
        </div>
      )}

      {/* No quotes */}
      {quoteData?.quotes?.length === 0 && (
        <div className="border-t border-zinc-800 pt-4">
          <div className="text-zinc-500 text-sm text-center py-4">
            No routes available for this transfer.
            <br />
            Try a different target chain or wait for liquidity.
          </div>
        </div>
      )}
    </div>
  );
}
