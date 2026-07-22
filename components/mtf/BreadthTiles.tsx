"use client";

import { ChevronRight } from "lucide-react";
import { fmtCr } from "@/lib/mtf/format";

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
  onSelectBreadth?: (direction: "up" | "down" | "flat") => void;
}

function Tile({
  label, border, children, onClick,
}: { label: string; border?: string; children: React.ReactNode; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`rounded-lg border ${border ?? "border-border"} bg-surface p-2.5 text-left w-full ${
        onClick ? "cursor-pointer hover:border-amber/40 hover:bg-white/[0.02] transition-colors group" : ""
      }`}
    >
      <p className="text-[9px] uppercase tracking-widest text-muted mb-1 flex items-center justify-between gap-1">
        <span>{label}</span>
        {onClick && (
          <ChevronRight className="w-3 h-3 shrink-0 text-muted/50 group-hover:text-amber group-hover:translate-x-0.5 transition-all" />
        )}
      </p>
      {children}
    </Comp>
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
        <p className="font-mono text-sm text-primary tabular-nums">{fmtCr(props.totalAmtToday)}</p>
        {bookChangePct !== null && (
          <p className={`font-mono text-[10px] tabular-nums ${bookChangePct >= 0 ? "text-teal" : "text-danger"}`}>
            {bookChangePct >= 0 ? "+" : ""}{bookChangePct.toFixed(2)}% <span className="text-muted/60">vs prior day</span>
          </p>
        )}
      </Tile>

      <Tile label="Leveraging Up" border="border-teal/20" onClick={() => props.onSelectBreadth?.("up")}>
        <p className="font-mono text-sm text-teal tabular-nums">{props.countUp}</p>
      </Tile>

      <Tile label="Deleveraging" border="border-danger/20" onClick={() => props.onSelectBreadth?.("down")}>
        <p className="font-mono text-sm text-danger tabular-nums">{props.countDown}</p>
      </Tile>

      <Tile label="Unchanged" onClick={() => props.onSelectBreadth?.("flat")}>
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
