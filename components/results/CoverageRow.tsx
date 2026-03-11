import Link from "next/link";
import { clsx } from "clsx";
import type { CoverageEntry } from "@/app/api/coverage/route";

const REPORT_TYPE_SHORT: Record<string, string> = {
  IC: "IC",
  RU: "RU",
  CU: "CU",
  AU: "AU",
  Technical: "Tech",
  "Visit Note": "Visit",
  Other: "Note",
};

function ratingColor(rating: string): string {
  const r = rating.toUpperCase();
  if (/^(BUY|ACCUMULATE|ADD|STRONG.BUY|OUTPERFORM)/.test(r))
    return "text-teal border-teal/40";
  if (/^(SELL|REDUCE|STRONG.SELL|UNDERPERFORM)/.test(r))
    return "text-danger border-danger/40";
  if (/^(HOLD|NEUTRAL|MARKET.PERFORM)/.test(r))
    return "text-amber border-amber/40";
  return "text-muted border-border";
}

function daysAgo(date: string): number {
  return Math.floor(
    (Date.now() - new Date(date).getTime()) / 86_400_000
  );
}

interface Props {
  entry: CoverageEntry;
  selected: boolean;
  onClick: () => void;
}

export function CoverageRow({ entry, selected, onClick }: Props) {
  const age = daysAgo(entry.latestDate);
  const isStale = age > 365;

  // Build a compact type sequence from the 3 most recent reports
  const typeSeq = entry.reports
    .slice(0, 3)
    .map((r) => REPORT_TYPE_SHORT[r.reportType] ?? r.reportType)
    .join(" · ");

  const lastDate = new Date(entry.latestDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: entry.latestDate.startsWith("2024") ? "numeric" : undefined,
  });

  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full text-left px-3 py-2.5 border-b border-border last:border-b-0 relative transition-all",
        selected ? "bg-amber/[0.07]" : "hover:bg-white/[0.03]"
      )}
    >
      {selected && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-amber rounded-r-full" />
      )}

      <div className="pl-1 flex items-start justify-between gap-2">
        {/* Left: symbol + company */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className={clsx(
                "text-[11px] font-mono font-semibold tracking-tight",
                selected ? "text-amber" : "text-primary"
              )}
            >
              {entry.symbol}
            </span>
            <Link
              href={`/research/${entry.symbol}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[9px] font-mono text-muted hover:text-amber transition-colors"
              title={`Open ${entry.symbol} research page`}
            >
              ↗
            </Link>
            {entry.latestRating && (
              <span
                className={clsx(
                  "text-[8px] font-mono px-1 py-px rounded border leading-none",
                  ratingColor(entry.latestRating)
                )}
              >
                {entry.latestRating.split(" ")[0]}
              </span>
            )}
            {isStale && (
              <span className="text-[8px] font-mono text-muted/50 leading-none">
                stale
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted truncate font-sans leading-snug">
            {entry.company}
          </p>
        </div>

        {/* Right: report count + date */}
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-mono text-muted leading-snug">
            {entry.reportCount}{" "}
            <span className="text-muted/50">
              {entry.reportCount === 1 ? "report" : "rpts"}
            </span>
          </p>
          <p className="text-[9px] font-mono text-muted/60">{lastDate}</p>
        </div>
      </div>

      {/* Bottom: analyst + type sequence */}
      <div className="pl-1 mt-0.5 flex items-center gap-2">
        <span className="text-[9px] font-mono text-muted/70 truncate">
          {entry.analysts.slice(0, 2).join(", ")}
          {entry.analysts.length > 2 ? ` +${entry.analysts.length - 2}` : ""}
        </span>
        <span className="text-[9px] font-mono text-muted/40 shrink-0">
          {typeSeq}
        </span>
      </div>
    </button>
  );
}
