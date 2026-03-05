"use client";

import { useState } from "react";
import { RagChat } from "@/components/reports/RagChat";
import { ReportsBrowser } from "@/components/reports/ReportsBrowser";

export default function ReportsPage() {
  const [symbol, setSymbol] = useState("");
  const [analyst, setAnalyst] = useState("");

  return (
    <div className="p-6 max-w-[1600px]">
      <div className="mb-5">
        <h1 className="text-2xl font-display text-primary">Research Reports</h1>
        <p className="text-xs font-mono text-muted mt-1">
          RAG search over{" "}
          <span className="text-amber">161 Sunidhi Capital research PDFs</span>
          {" "}· powered by llama3.1:8b
        </p>
      </div>

      <div className="flex gap-5 h-[calc(100vh-180px)]">
        {/* Left: RAG Chat */}
        <div className="flex-1 min-w-0">
          <RagChat symbol={symbol} analyst={analyst} />
        </div>

        {/* Right: Report Browser */}
        <div className="w-80 shrink-0">
          <ReportsBrowser onFilterChange={(sym, ana) => { setSymbol(sym); setAnalyst(ana); }} />
        </div>
      </div>
    </div>
  );
}
