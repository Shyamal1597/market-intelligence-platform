// app/portfolio/page.tsx
"use client";

import { useState } from "react";
import { PortfolioSidebar } from "@/components/portfolio/PortfolioSidebar";
import { PortfolioActivityPanel } from "@/components/portfolio/PortfolioActivityPanel";

export default function PortfolioPage() {
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      <PortfolioSidebar
        selected={selected?.symbol ?? null}
        onSelect={(symbol, name) => setSelected({ symbol, name })}
      />
      <div className="flex-1 min-w-0 overflow-hidden">
        {selected ? (
          <PortfolioActivityPanel symbol={selected.symbol} name={selected.name} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <span className="text-4xl opacity-20">📊</span>
            <p
              className="text-[12px] font-mono"
              style={{ color: "#6B7280" }}
            >
              Select a symbol from your portfolio to view activity
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
