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

function ColH({ label, sub, align = "right" }: { label: string; sub?: string; align?: "left" | "right" }) {
  return (
    <th
      className={`px-2 py-2 text-${align} text-[10px] font-mono text-muted tracking-wider font-normal whitespace-nowrap`}
    >
      {label}
      {sub && <span className="block text-[9px] opacity-50">{sub}</span>}
    </th>
  );
}

export function OptionChainTable({ data, barMode, columns }: Props) {
  const { chain, atmStrike, spot, symbol } = data;
  const atmRef = useRef<HTMLTableRowElement>(null);

  // Scroll ATM row into view on symbol/expiry change
  useEffect(() => {
    if (atmRef.current) {
      atmRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [data.expiry, data.symbol]);

  // Scale bars to ±20 strikes from ATM
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

  // Column counts for colspan calculations
  // Calls: Greeks + core NSE cols + bar
  const callExtraCols = [
    columns.rho, columns.vega, columns.theta, columns.gamma, columns.delta,
    columns.oi, columns.oiChange, columns.vol, columns.iv, columns.ltp, columns.chng,
    columns.bidQty, columns.bid, columns.ask, columns.askQty,
  ].filter(Boolean).length + 1; // +1 for bar

  const putExtraCols = [
    columns.askQty, columns.ask, columns.bid, columns.bidQty,
    columns.chng, columns.ltp, columns.iv, columns.vol, columns.oiChange, columns.oi,
    columns.delta, columns.gamma, columns.theta, columns.vega, columns.rho,
  ].filter(Boolean).length + 1; // +1 for bar

  const totalCols = callExtraCols + 1 + putExtraCols; // +1 for strike

  const spotLabel = `${symbol} ${spot.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div className="overflow-auto flex-1 min-h-0">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 z-20 bg-surface">
          {/* Section labels */}
          <tr className="border-b border-border">
            <th
              colSpan={callExtraCols}
              className="py-1.5 text-center text-[10px] font-mono text-cyan-400/60 tracking-[0.2em] uppercase border-r border-border"
            >
              Calls
            </th>
            <th className="px-3 py-1.5 text-center text-[10px] font-mono text-amber/60 tracking-[0.2em] uppercase border-x border-border whitespace-nowrap">
              Strike
            </th>
            <th
              colSpan={putExtraCols}
              className="py-1.5 text-center text-[10px] font-mono text-red-400/60 tracking-[0.2em] uppercase border-l border-border"
            >
              Puts
            </th>
          </tr>

          {/* Column headers -- NSE order */}
          <tr className="border-b border-border/50 bg-surface">
            {/* Calls: outermost → innermost */}
            {columns.rho      && <ColH label="Rho" />}
            {columns.vega     && <ColH label="Vega" />}
            {columns.theta    && <ColH label="Theta" />}
            {columns.gamma    && <ColH label="Gamma" />}
            {columns.delta    && <ColH label="Delta" />}
            {columns.oi       && <ColH label="OI" />}
            {columns.oiChange && <ColH label="Chng OI" />}
            {columns.vol      && <ColH label="Vol" />}
            {columns.iv       && <ColH label="IV" sub="%" />}
            {columns.ltp      && <ColH label="LTP" />}
            {columns.chng     && <ColH label="Chng" />}
            {columns.bidQty   && <ColH label="Bid Qty" />}
            {columns.bid      && <ColH label="Bid" />}
            {columns.ask      && <ColH label="Ask" />}
            {columns.askQty   && <ColH label="Ask Qty" />}
            {/* Bar header */}
            <th className="w-24 px-1 py-2 text-right text-[10px] font-mono text-muted">
              {barMode === "oi" ? "OI" : "Vol"}
            </th>
            {/* Strike */}
            <th className="px-3 py-2 text-center text-[10px] font-mono text-amber/80">Strike</th>
            {/* Puts: innermost → outermost */}
            <th className="w-24 px-1 py-2 text-left text-[10px] font-mono text-muted">
              {barMode === "oi" ? "OI" : "Vol"}
            </th>
            {columns.askQty   && <ColH label="Ask Qty" align="left" />}
            {columns.ask      && <ColH label="Ask" align="left" />}
            {columns.bid      && <ColH label="Bid" align="left" />}
            {columns.bidQty   && <ColH label="Bid Qty" align="left" />}
            {columns.chng     && <ColH label="Chng" align="left" />}
            {columns.ltp      && <ColH label="LTP" align="left" />}
            {columns.iv       && <ColH label="IV" sub="%" align="left" />}
            {columns.vol      && <ColH label="Vol" align="left" />}
            {columns.oiChange && <ColH label="Chng OI" align="left" />}
            {columns.oi       && <ColH label="OI" align="left" />}
            {columns.delta    && <ColH label="Delta" align="left" />}
            {columns.gamma    && <ColH label="Gamma" align="left" />}
            {columns.theta    && <ColH label="Theta" align="left" />}
            {columns.vega     && <ColH label="Vega" align="left" />}
            {columns.rho      && <ColH label="Rho" align="left" />}
          </tr>
        </thead>

        <tbody>
          {chain.map((row, i) => {
            const isAtm = row.strikePrice === atmStrike;
            // Insert NSE-style spot separator between ATM and the row just above it
            const showSeparator = atmIdx >= 0 && i === atmIdx + 1;

            return (
              <>
                {showSeparator && (
                  <tr key={`sep-${row.strikePrice}`} className="pointer-events-none">
                    <td colSpan={totalCols} className="p-0">
                      <div className="relative flex items-center justify-center h-5">
                        <div className="absolute inset-x-0 top-1/2 h-px bg-amber/40" />
                        <span className="relative px-2 py-0.5 bg-surface text-[9px] font-mono text-amber/80 border border-amber/30 rounded whitespace-nowrap z-10">
                          {spotLabel}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                <ChainRow
                  key={row.strikePrice}
                  row={row}
                  isAtm={isAtm}
                  spot={spot}
                  maxBarValue={maxBarValue}
                  barMode={barMode}
                  columns={columns}
                  rowRef={isAtm ? atmRef : undefined}
                />
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
