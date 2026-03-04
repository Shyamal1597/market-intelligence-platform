"use client";

import { useState } from "react";
import { X, Plus, RefreshCw } from "lucide-react";
import type { WatchlistEntry } from "@/lib/watchlist";

interface Props {
  watchlist: WatchlistEntry[];
  onRemove: (symbol: string) => void;
  onAdd: (symbol: string) => void;
  onReset: () => void;
  adding: boolean;
}

export function WatchlistManager({ watchlist, onRemove, onAdd, onReset, adding }: Props) {
  const [input, setInput] = useState("");

  function handleAdd() {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    onAdd(sym);
    setInput("");
  }

  return (
    <div className="flex items-center gap-2 flex-wrap border border-[#1E2235] rounded-lg px-3 py-2 bg-surface">
      <span className="text-[10px] font-mono text-muted tracking-widest mr-1">COVERAGE</span>
      {watchlist.map((e) => (
        <button
          key={e.symbol}
          onClick={() => onRemove(e.symbol)}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-[#1E2235] text-primary hover:bg-danger/20 hover:text-danger transition-colors group"
        >
          {e.symbol}
          <X className="w-3 h-3 opacity-40 group-hover:opacity-100" />
        </button>
      ))}
      <div className="flex items-center gap-1 ml-auto">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="ADD SYMBOL"
          className="w-28 px-2 py-0.5 text-xs font-mono bg-background border border-[#1E2235] rounded text-primary placeholder-[#3A4060] focus:outline-none focus:border-amber/60 transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !input.trim()}
          className="p-1 text-amber hover:bg-amber/10 rounded disabled:opacity-30 transition-colors"
          title="Add stock"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={onReset}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-muted hover:text-primary hover:bg-white/5 rounded transition-colors tracking-wider"
          title="Reset to Nifty 50"
        >
          <RefreshCw className="w-3 h-3" />
          NIFTY50
        </button>
      </div>
    </div>
  );
}
