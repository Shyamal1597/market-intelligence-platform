import { useRef } from "react";
import type { OptionRow } from "@/lib/nse-derivatives";
import type { ColumnConfig } from "./ColumnToggle";
import type { BarMode } from "./OptionChainPage";
import { clsx } from "clsx";

interface Props {
  row: OptionRow;
  isAtm: boolean;
  spot: number;
  maxBarValue: number;
  barMode: BarMode;
  columns: ColumnConfig;
  rowRef?: React.RefObject<HTMLTableRowElement | null>;
}

function fmt(v: number | null, dec = 2): string {
  if (v == null) return "–";
  return v.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtOI(v: number | null): string {
  if (v == null) return "–";
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

const ITM_STRIPE =
  "bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.015)_3px,rgba(255,255,255,0.015)_6px)]";

export function ChainRow({ row, isAtm, spot, maxBarValue, barMode, columns, rowRef }: Props) {
  const ceItm = row.strikePrice < spot;
  const peItm = row.strikePrice > spot;

  const ceBar = barMode === "oi" ? row.ceOI : row.ceVol;
  const peBar = barMode === "oi" ? row.peOI : row.peVol;
  const ceBarPct = maxBarValue > 0 && ceBar != null ? Math.min((ceBar / maxBarValue) * 100, 100) : 0;
  const peBarPct = maxBarValue > 0 && peBar != null ? Math.min((peBar / maxBarValue) * 100, 100) : 0;

  const c = (extra?: string) =>
    clsx("px-2 py-1.5 tabular-nums text-right text-[11px]", extra);

  return (
    <tr
      ref={rowRef}
      className={clsx(
        "border-b border-border/40 transition-colors",
        isAtm ? "border-y border-amber/25 bg-amber/[0.03]" : "hover:bg-white/[0.015]"
      )}
    >
      {/* ── Calls side ─────────────────────────────────────────────────── */}
      {columns.rho     && <td className={c(clsx(ceItm && ITM_STRIPE))}>{fmt(row.ceRho, 3)}</td>}
      {columns.vega    && <td className={c(clsx(ceItm && ITM_STRIPE))}>{fmt(row.ceVega)}</td>}
      {columns.theta   && <td className={c(clsx(ceItm && ITM_STRIPE, "text-danger/70"))}>{fmt(row.ceTheta)}</td>}
      {columns.gamma   && <td className={c(clsx(ceItm && ITM_STRIPE))}>{fmt(row.ceGamma, 4)}</td>}
      {columns.delta   && <td className={c(clsx(ceItm && ITM_STRIPE, "text-teal/80"))}>{fmt(row.ceDelta)}</td>}
      {columns.iv      && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted"))}>{fmt(row.ceIV, 1)}</td>}
      {columns.ltp     && <td className={c(clsx(ceItm && ITM_STRIPE, "text-primary font-medium"))}>{fmt(row.ceLTP)}</td>}
      {columns.ask     && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted"))}>{fmt(row.ceAsk)}</td>}
      {columns.bid     && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted"))}>{fmt(row.ceBid)}</td>}
      {columns.oi      && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted"))}>{fmtOI(row.ceOI)}</td>}
      {columns.oiChange && (
        <td className={c(clsx(ceItm && ITM_STRIPE, (row.ceOIChg ?? 0) >= 0 ? "text-teal/80" : "text-danger/80"))}>
          {fmtOI(row.ceOIChg)}
        </td>
      )}

      {/* OI/Vol bar — calls */}
      <td className={clsx("px-0 w-28 py-0", ceItm && ITM_STRIPE)}>
        <div className="relative h-8 flex items-center justify-end">
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 h-[14px] bg-cyan-500/25 rounded-l-sm transition-all duration-500"
            style={{ width: `${ceBarPct}%` }}
          />
          <span className="relative z-10 text-cyan-400/80 text-[10px] pr-1.5 font-mono">{fmtOI(ceBar)}</span>
        </div>
      </td>

      {/* ── Strike ─────────────────────────────────────────────────────── */}
      <td className="px-3 py-0 text-center bg-base sticky" style={{ minWidth: "5rem" }}>
        <div className="relative inline-flex flex-col items-center justify-center h-8">
          {isAtm && (
            <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[9px] bg-amber/20 text-amber px-1.5 py-0.5 rounded whitespace-nowrap border border-amber/30 font-mono">
              {spot.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
            </span>
          )}
          <span className={clsx("text-[12px] font-mono font-semibold tabular-nums", isAtm ? "text-amber" : "text-primary/70")}>
            {row.strikePrice.toLocaleString("en-IN")}
          </span>
        </div>
      </td>

      {/* ── Puts side ──────────────────────────────────────────────────── */}
      {/* OI/Vol bar — puts */}
      <td className={clsx("px-0 w-28 py-0", peItm && ITM_STRIPE)}>
        <div className="relative h-8 flex items-center justify-start">
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-[14px] bg-red-500/25 rounded-r-sm transition-all duration-500"
            style={{ width: `${peBarPct}%` }}
          />
          <span className="relative z-10 text-red-400/80 text-[10px] pl-1.5 font-mono">{fmtOI(peBar)}</span>
        </div>
      </td>

      {columns.oiChange && (
        <td className={c(clsx(peItm && ITM_STRIPE, (row.peOIChg ?? 0) >= 0 ? "text-teal/80" : "text-danger/80"))}>
          {fmtOI(row.peOIChg)}
        </td>
      )}
      {columns.oi      && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted"))}>{fmtOI(row.peOI)}</td>}
      {columns.bid     && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted"))}>{fmt(row.peBid)}</td>}
      {columns.ask     && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted"))}>{fmt(row.peAsk)}</td>}
      {columns.ltp     && <td className={c(clsx(peItm && ITM_STRIPE, "text-primary font-medium"))}>{fmt(row.peLTP)}</td>}
      {columns.iv      && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted"))}>{fmt(row.peIV, 1)}</td>}
      {columns.delta   && <td className={c(clsx(peItm && ITM_STRIPE, "text-danger/70"))}>{fmt(row.peDelta)}</td>}
      {columns.gamma   && <td className={c(clsx(peItm && ITM_STRIPE))}>{fmt(row.peGamma, 4)}</td>}
      {columns.theta   && <td className={c(clsx(peItm && ITM_STRIPE, "text-danger/70"))}>{fmt(row.peTheta)}</td>}
      {columns.vega    && <td className={c(clsx(peItm && ITM_STRIPE))}>{fmt(row.peVega)}</td>}
      {columns.rho     && <td className={c(clsx(peItm && ITM_STRIPE))}>{fmt(row.peRho, 3)}</td>}
    </tr>
  );
}
