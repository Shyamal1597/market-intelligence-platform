"use client";

import { useState, useEffect } from "react";
import { Settings2 } from "lucide-react";

export interface ColumnConfig {
  // Greeks (NSE doesn't supply; kept for future B-S computation)
  delta: boolean; gamma: boolean; theta: boolean; vega: boolean; rho: boolean;
  // Price
  ltp: boolean; chng: boolean; bid: boolean; ask: boolean;
  bidQty: boolean; askQty: boolean;
  // Market data
  oi: boolean; oiChange: boolean; vol: boolean; iv: boolean;
}

export const DEFAULT_COLUMNS: ColumnConfig = {
  // Greeks off by default (NSE doesn't return them)
  delta: false, gamma: false, theta: false, vega: false, rho: false,
  ltp: true, chng: true, bid: true, ask: true,
  bidQty: false, askQty: false,
  oi: true, oiChange: true, vol: false, iv: true,
};

const STORAGE_KEY = "nebula:options:columns";

export function useColumnConfig(): [ColumnConfig, (c: ColumnConfig) => void] {
  const [config, setConfig] = useState<ColumnConfig>(DEFAULT_COLUMNS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setConfig({ ...DEFAULT_COLUMNS, ...JSON.parse(stored) });
    } catch { /* ignore */ }
  }, []);

  const update = (c: ColumnConfig) => {
    setConfig(c);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
  };

  return [config, update];
}

interface Props { config: ColumnConfig; onChange: (c: ColumnConfig) => void; }

const GROUPS = [
  {
    label: "Market",
    cols: [
      { key: "oi" as const, label: "OI" },
      { key: "oiChange" as const, label: "OI Chg" },
      { key: "vol" as const, label: "Volume" },
      { key: "iv" as const, label: "IV%" },
    ],
  },
  {
    label: "Price",
    cols: [
      { key: "ltp" as const, label: "LTP" },
      { key: "chng" as const, label: "Chng" },
      { key: "bid" as const, label: "Bid" },
      { key: "ask" as const, label: "Ask" },
      { key: "bidQty" as const, label: "Bid Qty" },
      { key: "askQty" as const, label: "Ask Qty" },
    ],
  },
  {
    label: "Greeks",
    cols: [
      { key: "delta" as const, label: "Delta" },
      { key: "gamma" as const, label: "Gamma" },
      { key: "theta" as const, label: "Theta" },
      { key: "vega" as const, label: "Vega" },
      { key: "rho" as const, label: "Rho" },
    ],
  },
] as const;

export function ColumnToggle({ config, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted hover:text-primary hover:border-amber/40 transition-colors text-xs font-mono"
      >
        <Settings2 size={13} />
        Columns
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 z-50 w-52 bg-surface border border-border rounded-lg shadow-2xl shadow-black/50 p-3 flex flex-col gap-3">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] text-muted tracking-widest uppercase mb-1.5">{g.label}</p>
              <div className="grid grid-cols-2 gap-1">
                {g.cols.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={config[key]}
                      onChange={(e) => onChange({ ...config, [key]: e.target.checked })}
                      className="accent-amber w-3 h-3"
                    />
                    <span className="text-xs font-mono text-muted group-hover:text-primary">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
