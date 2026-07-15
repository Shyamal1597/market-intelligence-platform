"use client";

interface TopMover { symbol: string; amtChangePct: number }

interface BreadthProps {
  date: string | null;
  totalAmtToday: number;
  totalAmtYesterday: number | null;
  countUp: number;
  countDown: number;
  countFlat: number;
  totalSymbols: number;
  aggregateTurnoverFinancedPct: number | null;
  avgTurnoverFinancedPct: number | null;
  topGainer: TopMover | null;
  topLoser: TopMover | null;
  onSelectSymbol?: (symbol: string) => void;
}

function fmtLakhs(v: number): string {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} L`;
}

function Tile({ label, border, children }: { label: string; border?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border ${border ?? "border-border"} bg-surface p-2.5`}>
      <p className="text-[9px] uppercase tracking-widest text-muted mb-1">{label}</p>
      {children}
    </div>
  );
}

export function BreadthTiles(props: BreadthProps) {
  const bookChangePct = props.totalAmtYesterday && props.totalAmtYesterday > 0
    ? ((props.totalAmtToday - props.totalAmtYesterday) / props.totalAmtYesterday) * 100
    : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      <Tile label="Last Updated">
        <p className="font-mono text-sm text-primary tabular-nums">{props.date ?? "—"}</p>
      </Tile>

      <Tile label="Total MTF Book">
        <p className="font-mono text-sm text-primary tabular-nums">{fmtLakhs(props.totalAmtToday)}</p>
        {bookChangePct !== null && (
          <p className={`font-mono text-[10px] tabular-nums ${bookChangePct >= 0 ? "text-teal" : "text-danger"}`}>
            {bookChangePct >= 0 ? "+" : ""}{bookChangePct.toFixed(2)}% <span className="text-muted/60">vs prior day</span>
          </p>
        )}
      </Tile>

      <Tile label="Leveraging Up" border="border-teal/20">
        <p className="font-mono text-sm text-teal tabular-nums">{props.countUp}</p>
      </Tile>

      <Tile label="Deleveraging" border="border-danger/20">
        <p className="font-mono text-sm text-danger tabular-nums">{props.countDown}</p>
      </Tile>

      <Tile label="Unchanged">
        <p className="font-mono text-sm text-muted tabular-nums">{props.countFlat}</p>
      </Tile>

      <Tile label="Symbols w/ Data">
        <p className="font-mono text-sm text-primary tabular-nums">{props.totalSymbols}</p>
      </Tile>

      <Tile label="Turnover Financed %">
        <p className="font-mono text-sm text-primary tabular-nums">
          {props.aggregateTurnoverFinancedPct !== null ? `${props.aggregateTurnoverFinancedPct.toFixed(1)}%` : "—"}
        </p>
      </Tile>

      <Tile label="Avg Financed % (mean)">
        <p className="font-mono text-sm text-primary tabular-nums">
          {props.avgTurnoverFinancedPct !== null ? `${props.avgTurnoverFinancedPct.toFixed(1)}%` : "—"}
        </p>
      </Tile>

      <Tile label="Top MTF Mover">
        <div className="flex flex-col gap-0.5">
          {props.topGainer ? (
            <button
              onClick={() => props.onSelectSymbol?.(props.topGainer!.symbol)}
              className="flex items-center justify-between w-full font-mono text-[11px] text-teal hover:underline text-left"
            >
              <span>{props.topGainer.symbol}</span>
              <span className="tabular-nums">+{props.topGainer.amtChangePct.toFixed(1)}%</span>
            </button>
          ) : (
            <p className="font-mono text-[11px] text-muted">—</p>
          )}
          {props.topLoser ? (
            <button
              onClick={() => props.onSelectSymbol?.(props.topLoser!.symbol)}
              className="flex items-center justify-between w-full font-mono text-[11px] text-danger hover:underline text-left"
            >
              <span>{props.topLoser.symbol}</span>
              <span className="tabular-nums">{props.topLoser.amtChangePct.toFixed(1)}%</span>
            </button>
          ) : (
            <p className="font-mono text-[11px] text-muted">—</p>
          )}
        </div>
      </Tile>
    </div>
  );
}
