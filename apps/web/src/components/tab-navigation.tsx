"use client";

import { Search, ArrowLeftRight } from "lucide-react";
import type { ReactNode } from "react";

export type TabType = "scan" | "bridge";

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
        ${active
          ? "border-brand-500 text-white"
          : "border-transparent text-zinc-400 hover:text-white hover:border-zinc-700"
        }
      `}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Tab navigation for switching between Scan and Bridge modes
 */
export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="border-b border-zinc-900">
      <div className="max-w-5xl mx-auto px-6">
        <nav className="flex gap-1">
          <TabButton
            active={activeTab === "scan"}
            onClick={() => onTabChange("scan")}
            icon={<Search className="w-4 h-4" />}
            label="Scan & Recover"
          />
          <TabButton
            active={activeTab === "bridge"}
            onClick={() => onTabChange("bridge")}
            icon={<ArrowLeftRight className="w-4 h-4" />}
            label="Direct Bridge"
          />
        </nav>
      </div>
    </div>
  );
}
