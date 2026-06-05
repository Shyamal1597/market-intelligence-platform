"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, ExternalLink, CheckCircle, X } from "lucide-react";

interface GapDate {
  date: string;
  isKnownHoliday: boolean;
}

interface GapData {
  gapCount: number;
  gapDates: GapDate[];
  sums: {
    fiiMtd: number; fiiYtd: number;
    diiMtd: number; diiYtd: number;
    mtdDays: number; ytdDays: number;
  };
}

interface RowValues {
  fiiEquityBuy: string;
  fiiEquitySell: string;
  diiEquityBuy: string;
  diiEquitySell: string;
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
}

export function FlowsGapAlert({ onPatched }: { onPatched?: () => void }) {
  const [gaps, setGaps]         = useState<GapData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows]         = useState<Record<string, RowValues>>({});
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadGaps = useCallback(async () => {
    try {
      const res = await fetch("/api/flows/gaps");
      if (res.ok) setGaps(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadGaps(); }, [loadGaps]);

  if (!gaps || gaps.gapCount === 0) return null;

  function setRow(date: string, field: keyof RowValues, val: string) {
    setRows((prev) => ({
      ...prev,
      [date]: { ...(prev[date] ?? { fiiEquityBuy:"", fiiEquitySell:"", diiEquityBuy:"", diiEquitySell:"" }), [field]: val },
    }));
  }

  function calcNet(buy: string, sell: string): number {
    const b = parseFloat(buy) || 0;
    const s = parseFloat(sell) || 0;
    return +(s - b).toFixed(2); // NSE convention: net = sell - buy (negative when buy > sell)
  }

  async function handleSave() {
    if (!gaps) return;
    const filled = gaps.gapDates
      .filter((g) => {
        const r = rows[g.date];
        return r && (r.fiiEquityBuy || r.fiiEquitySell || r.diiEquityBuy || r.diiEquitySell);
      })
      .map((g) => {
        const r = rows[g.date] ?? { fiiEquityBuy:"0", fiiEquitySell:"0", diiEquityBuy:"0", diiEquitySell:"0" };
        const fiiB = parseFloat(r.fiiEquityBuy)  || 0;
        const fiiS = parseFloat(r.fiiEquitySell) || 0;
        const diiB = parseFloat(r.diiEquityBuy)  || 0;
        const diiS = parseFloat(r.diiEquitySell) || 0;
        return {
          date: g.date,
          fiiEquityBuy: fiiB, fiiEquitySell: fiiS, fiiEquityNet: +(fiiS - fiiB).toFixed(2),
          diiEquityBuy: diiB, diiEquitySell: diiS, diiEquityNet: +(diiS - diiB).toFixed(2),
        };
      });

    if (filled.length === 0) {
      setSaveError("Enter at least one date's data before saving.");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/flows/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: filled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      setExpanded(false);
      await loadGaps();
      onPatched?.();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const mtdDays = gaps.sums.mtdDays;
  const ytdDays = gaps.sums.ytdDays;

  return (
    <div className="rounded-xl border border-amber/30 bg-amber/5 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber shrink-0" />
          <div>
            <span className="text-sm font-mono text-amber font-semibold">
              {gaps.gapCount} missing trading day{gaps.gapCount !== 1 ? "s" : ""} in history
            </span>
            <span className="text-xs font-mono text-muted ml-2">
              — MTD uses {mtdDays} day{mtdDays !== 1 ? "s" : ""}, YTD uses {ytdDays} days
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://www.nseindia.com/market-data/fii-dii-data"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[11px] font-mono text-muted hover:text-amber transition-colors"
          >
            NSE source <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-mono px-3 py-1.5 rounded border border-amber/30 text-amber hover:bg-amber/10 transition-colors"
          >
            {expanded ? "Close" : "Fill Gaps"}
          </button>
        </div>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="border-t border-amber/20 px-4 py-4">
          <p className="text-xs font-mono text-muted mb-3">
            Enter Buy and Sell values (Rs Cr) for each missing date.
            Net = Sell − Buy. Leave blank to skip a date.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2 pr-3 text-muted font-normal">Date</th>
                  <th className="text-right py-2 px-2 text-muted font-normal">FII Buy</th>
                  <th className="text-right py-2 px-2 text-muted font-normal">FII Sell</th>
                  <th className="text-right py-2 px-2 text-teal/70 font-normal">FII Net</th>
                  <th className="text-right py-2 px-2 text-muted font-normal">DII Buy</th>
                  <th className="text-right py-2 px-2 text-muted font-normal">DII Sell</th>
                  <th className="text-right py-2 px-2 text-teal/70 font-normal">DII Net</th>
                </tr>
              </thead>
              <tbody>
                {gaps.gapDates.map((g) => {
                  const r = rows[g.date] ?? { fiiEquityBuy:"", fiiEquitySell:"", diiEquityBuy:"", diiEquitySell:"" };
                  const fiiNet = (r.fiiEquityBuy || r.fiiEquitySell)
                    ? calcNet(r.fiiEquityBuy, r.fiiEquitySell) : null;
                  const diiNet = (r.diiEquityBuy || r.diiEquitySell)
                    ? calcNet(r.diiEquityBuy, r.diiEquitySell) : null;

                  return (
                    <tr key={g.date} className="border-b border-border/30 hover:bg-white/[0.02]">
                      <td className="py-1.5 pr-3 text-primary whitespace-nowrap">
                        {fmtDate(g.date)}
                      </td>
                      {(["fiiEquityBuy","fiiEquitySell"] as const).map((f) => (
                        <td key={f} className="py-1 px-1">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={r[f]}
                            onChange={(e) => setRow(g.date, f, e.target.value)}
                            className="w-24 text-right bg-surface border border-border/60 rounded px-2 py-1 text-[11px] text-primary focus:border-amber/50 focus:outline-none"
                          />
                        </td>
                      ))}
                      <td className={`py-1.5 px-2 text-right tabular-nums ${fiiNet === null ? "text-muted" : fiiNet >= 0 ? "text-teal" : "text-danger"}`}>
                        {fiiNet !== null ? (fiiNet >= 0 ? "+" : "") + fiiNet.toFixed(2) : "—"}
                      </td>
                      {(["diiEquityBuy","diiEquitySell"] as const).map((f) => (
                        <td key={f} className="py-1 px-1">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={r[f]}
                            onChange={(e) => setRow(g.date, f, e.target.value)}
                            className="w-24 text-right bg-surface border border-border/60 rounded px-2 py-1 text-[11px] text-primary focus:border-amber/50 focus:outline-none"
                          />
                        </td>
                      ))}
                      <td className={`py-1.5 px-2 text-right tabular-nums ${diiNet === null ? "text-muted" : diiNet >= 0 ? "text-teal" : "text-danger"}`}>
                        {diiNet !== null ? (diiNet >= 0 ? "+" : "") + diiNet.toFixed(2) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {saveError && (
            <p className="mt-2 text-xs text-danger font-mono">{saveError}</p>
          )}

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-amber text-black text-sm font-semibold font-mono hover:bg-amber/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save Entries"}
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="px-3 py-2 rounded-lg border border-border text-muted text-sm font-mono hover:text-primary transition-colors"
            >
              Cancel
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-xs text-teal font-mono">
                <CheckCircle className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
