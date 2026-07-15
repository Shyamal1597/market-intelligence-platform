"use client";

export interface SectorRow {
  sector: string;
  amtToday: number;
  amtYesterday: number;
  amtChangePct: number | null;
  symbolCount: number;
}

function fmtLakhs(v: number): string {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} L`;
}

export function SectorBreakdown({
  rows, unclassifiedAmt, unclassifiedCount,
}: { rows: SectorRow[]; unclassifiedAmt: number; unclassifiedCount: number }) {
  const max = Math.max(1, ...rows.map((r) => r.amtToday));

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-[9px] uppercase tracking-widest text-muted mb-0.5">
        MTF Book by Sector -- Where Leverage Money Is Flowing
      </p>
      <p className="text-[9px] text-muted/60 mb-2 max-w-3xl">
        Bar length = total MTF-financed amount in that sector today. % = day-over-day change in that sector&rsquo;s
        book. Sector comes from BSE&rsquo;s real exchange classification (not the research coverage list) --
        every symbol in the file gets grouped, not just the ~100 covered stocks.
      </p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted font-mono py-4">
          Sector data not built yet -- run <code>npm run mtf:build-sector-cache</code>.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.sector} className="flex items-center gap-2 text-[11px] font-mono">
              <span className="w-44 shrink-0 truncate text-primary" title={r.sector}>{r.sector}</span>
              <div className="flex-1 h-4 bg-base/40 rounded-sm overflow-hidden">
                <div className="h-full bg-amber/70 rounded-sm" style={{ width: `${(r.amtToday / max) * 100}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-muted tabular-nums">{fmtLakhs(r.amtToday)}</span>
              <span className={`w-16 shrink-0 text-right tabular-nums ${(r.amtChangePct ?? 0) >= 0 ? "text-teal" : "text-danger"}`}>
                {r.amtChangePct != null ? `${r.amtChangePct >= 0 ? "+" : ""}${r.amtChangePct.toFixed(1)}%` : "—"}
              </span>
              <span className="w-10 shrink-0 text-right text-muted/60 tabular-nums" title="Symbols in this sector">
                {r.symbolCount}
              </span>
            </div>
          ))}
          {unclassifiedCount > 0 && (
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted/50 pt-1.5 mt-1.5 border-t border-border/40">
              <span className="w-44 shrink-0">Unclassified</span>
              <div className="flex-1 h-4" />
              <span className="w-24 shrink-0 text-right tabular-nums">{fmtLakhs(unclassifiedAmt)}</span>
              <span className="w-16 shrink-0" />
              <span className="w-10 shrink-0 text-right tabular-nums">{unclassifiedCount}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
