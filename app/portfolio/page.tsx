// app/portfolio/page.tsx
"use client";

import { useState } from "react";
import { PortfolioSidebar } from "@/components/portfolio/PortfolioSidebar";
import { PortfolioActivityPanel } from "@/components/portfolio/PortfolioActivityPanel";

export default function PortfolioPage() {
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-base fixed inset-0 z-10">
      <PortfolioSidebar
        selected={selected?.symbol ?? null}
        onSelect={(symbol, name) => setSelected({ symbol, name })}
      />
      <div className="flex-1 min-w-0 overflow-hidden">
        <PortfolioActivityPanel
          symbol={selected?.symbol ?? null}
          name={selected?.name ?? null}
        />
      </div>
    </div>
  );
}
