"use client";

import { getTargetChains } from "@dustless/shared";
import { getChainColor, getChainName } from "@/lib/utils";
import { Check } from "lucide-react";

interface ChainSelectorProps {
  value: number;
  onChange: (chainId: number) => void;
  label?: string;
}

export function ChainSelector({ value, onChange, label }: ChainSelectorProps) {
  const targetChains = getTargetChains();

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm text-zinc-400">{label}</label>
      )}
      <div className="flex gap-2">
        {targetChains.map((chain) => {
          const isSelected = chain.id === value;
          return (
            <button
              key={chain.id}
              onClick={() => onChange(chain.id)}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all
                ${isSelected 
                  ? "border-brand-500 bg-brand-500/10 text-white" 
                  : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-white"
                }
              `}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getChainColor(chain.id) }}
              />
              <span className="text-sm font-medium">{chain.shortName}</span>
              {isSelected && <Check className="w-4 h-4 text-brand-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
