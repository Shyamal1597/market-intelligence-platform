"use client";

import { useState, useEffect } from "react";
import { Settings2 } from "lucide-react";

export interface ColumnConfig {
  delta: boolean; gamma: boolean; theta: boolean; vega: boolean; rho: boolean;
  ltp: boolean; ask: boolean; bid: boolean;
  oi: boolean; oiChange: boolean; iv: boolean;
}

export const DEFAULT_COLUMNS: ColumnConfig = {
  delta: true, gamma: true, theta: true, vega: false, rho: false,
  ltp: true, ask: true, bid: true,
  oi: false, oiChange: false, iv: true,
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
    label: "Greeks",
    cols: [
      { key: "delta" as const, label: "Delta" },
      { key: "gamma" as const, label: "Gamma" },
      { key: "theta" as const, label: "Theta" },
      { key: "vega" as const, label: "Vega" },
      { key: "rho" as const, label: "Rho" },
    ],
  },
  {
    label: "Price",
    cols: [
      { key: "ltp" as const, label: "LTP" },
      { key: "ask" as const, label: "Ask" },
      { key: "bid" as const, label: "Bid" },
      { key: "iv" as const, label: "IV%" },
    ],
  },
  {
    label: "OI & Volume",
    cols: [
      { key: "oi" as const, label: "OI" },
      { key: "oiChange" as const, label: "OI Chg" },
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
