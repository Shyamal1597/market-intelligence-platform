"use client";

interface SectorRow {
  sector: string; count: number; totalAmtToday: number;
  avgAmtChangePct: number | null; countUp: number; countDown: number;
}

function fmtLakhs(v: number): string {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} L`;
}

export function SectorBreakdown({ sectors }: { sectors: SectorRow[] }) {
  if (sectors.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-[9px] uppercase tracking-widest text-muted mb-2">
        Coverage Universe — Sector Breakdown
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {sectors.map((s) => {
          const total = s.countUp + s.countDown || 1;
          const upPct = (s.countUp / total) * 100;
          return (
            <div key={s.sector} className="rounded border border-border/60 px-2 py-1.5">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] text-primary truncate">{s.sector}</p>
                <p className="text-[9px] text-muted tabular-nums shrink-0">{s.count}</p>
              </div>
              <p className="font-mono text-[11px] text-primary tabular-nums">{fmtLakhs(s.totalAmtToday)}</p>
              {s.avgAmtChangePct !== null && (
                <p className={`font-mono text-[10px] tabular-nums ${s.avgAmtChangePct >= 0 ? "text-teal" : "text-danger"}`}>
                  {s.avgAmtChangePct >= 0 ? "+" : ""}{s.avgAmtChangePct.toFixed(2)}%
                </p>
              )}
              <div className="mt-1 w-full h-1 bg-base rounded-full overflow-hidden flex">
                <div className="h-full bg-teal" style={{ width: `${upPct}%` }} />
                <div className="h-full bg-danger" style={{ width: `${100 - upPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
