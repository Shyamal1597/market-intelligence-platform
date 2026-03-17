"use client";

import { useEffect, useRef } from "react";
import type { DerivativesData } from "@/lib/nse-derivatives";
import type { ColumnConfig } from "./ColumnToggle";
import type { BarMode } from "./OptionChainPage";
import { ChainRow } from "./ChainRow";

interface Props {
  data: DerivativesData;
  barMode: BarMode;
  columns: ColumnConfig;
}

function ColH({ label, sub }: { label: string; sub?: string }) {
  return (
    <th className="px-2 py-2 text-right text-[10px] font-mono text-muted tracking-wider font-normal whitespace-nowrap">
      {label}
      {sub && <span className="block text-[9px] opacity-50">{sub}</span>}
    </th>
  );
}

export function OptionChainTable({ data, barMode, columns }: Props) {
  const { chain, atmStrike, spot } = data;
  const atmRef = useRef<HTMLTableRowElement>(null);

  // Scroll ATM row into view on load / expiry change
  useEffect(() => {
    if (atmRef.current) {
      atmRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [data.expiry, data.symbol]);

  // Scale bars to visible range: ±20 strikes from ATM
  const atmIdx = chain.findIndex((r) => r.strikePrice === atmStrike);
  const lo = Math.max(0, atmIdx - 20);
  const hi = Math.min(chain.length - 1, atmIdx + 20);
  const visible = chain.slice(lo, hi + 1);
  const maxBarValue = Math.max(
    1,
    ...visible.map((r) =>
      Math.max(
        barMode === "oi" ? (r.ceOI ?? 0) : (r.ceVol ?? 0),
        barMode === "oi" ? (r.peOI ?? 0) : (r.peVol ?? 0)
      )
    )
  );

  const callColCount =
    [columns.rho, columns.vega, columns.theta, columns.gamma, columns.delta,
     columns.iv, columns.ltp, columns.ask, columns.bid, columns.oi, columns.oiChange]
      .filter(Boolean).length + 1; // +1 for bar

  const putColCount =
    [columns.oiChange, columns.oi, columns.bid, columns.ask, columns.ltp,
     columns.iv, columns.delta, columns.gamma, columns.theta, columns.vega, columns.rho]
      .filter(Boolean).length + 1; // +1 for bar

  return (
    <div className="overflow-auto flex-1 min-h-0">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 z-20 bg-surface">
          <tr className="border-b border-border">
            <th
              colSpan={callColCount}
              className="py-1.5 text-center text-[10px] font-mono text-cyan-400/60 tracking-[0.2em] uppercase border-r border-border"
            >
              Calls
            </th>
            <th className="px-3 py-1.5 text-center text-[10px] font-mono text-amber/60 tracking-[0.2em] uppercase border-x border-border whitespace-nowrap">
              Strike
            </th>
            <th
              colSpan={putColCount}
              className="py-1.5 text-center text-[10px] font-mono text-red-400/60 tracking-[0.2em] uppercase border-l border-border"
            >
              Puts
            </th>
          </tr>
          <tr className="border-b border-border/50 bg-surface">
            {/* Calls column headers (outermost first) */}
            {columns.rho      && <ColH label="Rho" />}
            {columns.vega     && <ColH label="Vega" />}
            {columns.theta    && <ColH label="Theta" />}
            {columns.gamma    && <ColH label="Gamma" />}
            {columns.delta    && <ColH label="Delta" />}
            {columns.iv       && <ColH label="IV" sub="%" />}
            {columns.ltp      && <ColH label="LTP" />}
            {columns.ask      && <ColH label="Ask" />}
            {columns.bid      && <ColH label="Bid" />}
            {columns.oi       && <ColH label="OI" />}
            {columns.oiChange && <ColH label="OI Chg" />}
            <th className="w-28 px-1 py-2 text-right text-[10px] font-mono text-muted">
              {barMode === "oi" ? "OI" : "Vol"}
            </th>
            {/* Strike */}
            <th className="px-3 py-2 text-center text-[10px] font-mono text-amber/80">Strike</th>
            {/* Puts */}
            <th className="w-28 px-1 py-2 text-left text-[10px] font-mono text-muted">
              {barMode === "oi" ? "OI" : "Vol"}
            </th>
            {columns.oiChange && <ColH label="OI Chg" />}
            {columns.oi       && <ColH label="OI" />}
            {columns.bid      && <ColH label="Bid" />}
            {columns.ask      && <ColH label="Ask" />}
            {columns.ltp      && <ColH label="LTP" />}
            {columns.iv       && <ColH label="IV" sub="%" />}
            {columns.delta    && <ColH label="Delta" />}
            {columns.gamma    && <ColH label="Gamma" />}
            {columns.theta    && <ColH label="Theta" />}
            {columns.vega     && <ColH label="Vega" />}
            {columns.rho      && <ColH label="Rho" />}
          </tr>
        </thead>
        <tbody>
          {chain.map((row) => (
            <ChainRow
              key={row.strikePrice}
              row={row}
              isAtm={row.strikePrice === atmStrike}
              spot={spot}
              maxBarValue={maxBarValue}
              barMode={barMode}
              columns={columns}
              rowRef={row.strikePrice === atmStrike ? atmRef : undefined}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
