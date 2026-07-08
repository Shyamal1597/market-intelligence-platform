"use client";

interface BreadthProps {
  date: string | null;
  totalAmtToday: number;
  totalAmtYesterday: number | null;
  countUp: number;
  countDown: number;
  totalSymbols: number;
  aggregateTurnoverFinancedPct: number | null;
}

function fmtLakhs(v: number): string {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} L`;
}

export function BreadthTiles(props: BreadthProps) {
  const bookChangePct = props.totalAmtYesterday && props.totalAmtYesterday > 0
    ? ((props.totalAmtToday - props.totalAmtYesterday) / props.totalAmtYesterday) * 100
    : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-1">Last Updated</p>
        <p className="font-mono text-lg text-primary">{props.date ?? "—"}</p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-1">Total MTF Book</p>
        <p className="font-mono text-lg text-primary">{fmtLakhs(props.totalAmtToday)}</p>
        {bookChangePct !== null && (
          <p className={`font-mono text-xs ${bookChangePct >= 0 ? "text-teal" : "text-danger"}`}>
            {bookChangePct >= 0 ? "+" : ""}{bookChangePct.toFixed(2)}%
          </p>
        )}
      </div>
      <div className="rounded-lg border border-teal/20 bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-1">Leveraging Up</p>
        <p className="font-mono text-lg text-teal">{props.countUp}</p>
      </div>
      <div className="rounded-lg border border-danger/20 bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-1">Deleveraging</p>
        <p className="font-mono text-lg text-danger">{props.countDown}</p>
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-1">Turnover Financed</p>
        <p className="font-mono text-lg text-primary">
          {props.aggregateTurnoverFinancedPct !== null ? `${props.aggregateTurnoverFinancedPct.toFixed(1)}%` : "—"}
        </p>
      </div>
    </div>
  );
}
