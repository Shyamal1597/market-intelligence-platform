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
  aggregateDeliveryFinancedPct: number | null;
  avgDeliveryPct: number | null;
  topGainer: TopMover | null;
  topLoser: TopMover | null;
  onSelectSymbol?: (symbol: string) => void;
  onSelectBreadth?: (direction: "up" | "down" | "flat") => void;
}

function Tile({
  label, border, children, onClick, tooltip,
}: { label: string; border?: string; children: React.ReactNode; onClick?: () => void; tooltip?: string }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      title={tooltip}
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

      <Tile
        label="Delivery Financed %"
        tooltip="Today's NET GAIN/LOSS in the whole universe's MTF book, relative to today's total delivery value (shares actually delivered, not all traded volume). A flow metric, not a level -- can be negative on a day the book shrank. Delivery value approximates each stock's delivered quantity x close price."
      >
        <p className={`font-mono text-sm tabular-nums ${
          props.aggregateDeliveryFinancedPct === null ? "text-primary"
            : props.aggregateDeliveryFinancedPct >= 0 ? "text-teal" : "text-danger"
        }`}>
          {props.aggregateDeliveryFinancedPct !== null
            ? `${props.aggregateDeliveryFinancedPct >= 0 ? "+" : ""}${props.aggregateDeliveryFinancedPct.toFixed(1)}%`
            : "—"}
        </p>
      </Tile>

      <Tile
        label="Avg Delivery %"
        tooltip="Average % of today's traded quantity that was delivered (real ownership changing hands) rather than squared off intraday, across every tradeable stock -- a market-wide gauge of conviction vs speculative churn, independent of MTF-book levels or flows."
      >
        <p className="font-mono text-sm text-primary tabular-nums">
          {props.avgDeliveryPct !== null ? `${props.avgDeliveryPct.toFixed(1)}%` : "—"}
        </p>
      </Tile>

      <Tile
        label="Top Gainer"
        border="border-teal/20"
        onClick={props.topGainer ? () => props.onSelectSymbol?.(props.topGainer!.symbol) : undefined}
        tooltip="The stock with the largest DAY-OVER-DAY increase in MTF-financed amount (today vs the previous trading day only -- not a multi-day or cumulative change)."
      >
        {props.topGainer ? (
          <>
            <p className="font-mono text-sm text-teal tabular-nums">{props.topGainer.symbol}</p>
            <p className="font-mono text-[10px] tabular-nums text-teal">
              +{props.topGainer.amtChangePct.toFixed(1)}% <span className="text-muted/60">day/day</span>
            </p>
          </>
        ) : (
          <p className="font-mono text-sm text-muted">—</p>
        )}
      </Tile>

      <Tile
        label="Top Loser"
        border="border-danger/20"
        onClick={props.topLoser ? () => props.onSelectSymbol?.(props.topLoser!.symbol) : undefined}
        tooltip="The stock with the largest DAY-OVER-DAY decrease in MTF-financed amount (today vs the previous trading day only -- not a multi-day or cumulative change)."
      >
        {props.topLoser ? (
          <>
            <p className="font-mono text-sm text-danger tabular-nums">{props.topLoser.symbol}</p>
            <p className="font-mono text-[10px] tabular-nums text-danger">
              {props.topLoser.amtChangePct.toFixed(1)}% <span className="text-muted/60">day/day</span>
            </p>
          </>
        ) : (
          <p className="font-mono text-sm text-muted">—</p>
        )}
      </Tile>
    </div>
  );
}
