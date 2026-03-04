import Link from "next/link";
import { clsx } from "clsx";
import type { WatchlistEntry } from "@/lib/watchlist";
import type { EarningsData } from "@/lib/earnings";

interface Props {
  entry: WatchlistEntry;
  earnings: EarningsData | null | undefined; // undefined = not yet fetched
  selected: boolean;
  onClick: () => void;
}

function yoyDelta(quarters: EarningsData["quarters"]): number | null {
  if (quarters.length < 2) return null;
  const latest = quarters[quarters.length - 1].netIncome;
  const prev = quarters[quarters.length - 2].netIncome;
  if (prev === 0) return null;
  return ((latest - prev) / Math.abs(prev)) * 100;
}

export function EarningsListRow({ entry, earnings, selected, onClick }: Props) {
  const latest = earnings?.quarters[earnings.quarters.length - 1];
  const delta = earnings ? yoyDelta(earnings.quarters) : null;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all border-b border-border last:border-b-0 relative",
        selected ? "bg-amber/[0.07]" : "hover:bg-white/[0.03]"
      )}
    >
      {selected && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-amber rounded-r-full" />
      )}
      <div className="flex-1 min-w-0 pl-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={clsx("text-xs font-mono", selected ? "text-amber" : "text-primary")}>
            {entry.symbol}
          </span>
          <Link
            href={`/research/${entry.symbol}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] font-mono text-muted hover:text-amber transition-colors leading-none"
            title={`Open ${entry.symbol} research page`}
          >
            ↗
          </Link>
          {entry.rating && (
            <span className="text-[9px] font-mono px-1 py-0.5 rounded border border-border text-muted leading-none">
              {entry.rating}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted truncate font-sans">{entry.name}</p>
      </div>
      <div className="text-right shrink-0">
        {earnings === undefined ? (
          <div className="w-12 h-3 bg-border rounded animate-pulse" />
        ) : latest ? (
          <>
            <p className="text-xs font-mono text-primary">
              &#8377;{latest.netIncome.toLocaleString("en-IN")}Cr
            </p>
            {delta !== null && (
              <p className={clsx("text-[10px] font-mono", delta >= 0 ? "text-teal" : "text-danger")}>
                {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
              </p>
            )}
          </>
        ) : (
          <p className="text-[10px] font-mono text-muted">&#8212;</p>
        )}
      </div>
    </button>
  );
}
