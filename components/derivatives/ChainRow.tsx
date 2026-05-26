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
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(2)}Cr`;
  if (v >= 100_000) return `${(v / 100_000).toFixed(2)}L`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function fmtChng(v: number | null): string {
  if (v == null) return "–";
  return (v >= 0 ? "+" : "") + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      {/* ── Calls side: outermost → innermost ───────────────────────────── */}
      {/* Greeks (outermost, off by default) */}
      {columns.rho     && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted/60"))}>{fmt(row.ceRho, 3)}</td>}
      {columns.vega    && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted/60"))}>{fmt(row.ceVega)}</td>}
      {columns.theta   && <td className={c(clsx(ceItm && ITM_STRIPE, "text-danger/60"))}>{fmt(row.ceTheta)}</td>}
      {columns.gamma   && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted/60"))}>{fmt(row.ceGamma, 4)}</td>}
      {columns.delta   && <td className={c(clsx(ceItm && ITM_STRIPE, "text-teal/70"))}>{fmt(row.ceDelta)}</td>}
      {/* NSE core columns */}
      {columns.oi      && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted"))}>{fmtOI(row.ceOI)}</td>}
      {columns.oiChange && (
        <td className={c(clsx(ceItm && ITM_STRIPE, (row.ceOIChg ?? 0) >= 0 ? "text-teal/70" : "text-danger/70"))}>
          {fmtOI(row.ceOIChg)}
        </td>
      )}
      {columns.vol     && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted/70"))}>{fmtOI(row.ceVol)}</td>}
      {columns.iv      && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted"))}>{fmt(row.ceIV, 1)}</td>}
      {columns.ltp     && <td className={c(clsx(ceItm && ITM_STRIPE, "text-primary font-medium"))}>{fmt(row.ceLTP)}</td>}
      {columns.chng    && (
        <td className={c(clsx(ceItm && ITM_STRIPE, (row.ceChng ?? 0) >= 0 ? "text-teal/80" : "text-danger/80"))}>
          {fmtChng(row.ceChng)}
        </td>
      )}
      {columns.bidQty  && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted/60"))}>{fmtOI(row.ceBidQty)}</td>}
      {columns.bid     && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted"))}>{fmt(row.ceBid)}</td>}
      {columns.ask     && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted"))}>{fmt(row.ceAsk)}</td>}
      {columns.askQty  && <td className={c(clsx(ceItm && ITM_STRIPE, "text-muted/60"))}>{fmtOI(row.ceAskQty)}</td>}

      {/* OI/Vol bar — calls (innermost, always visible) */}
      <td className={clsx("px-0 w-24 py-0", ceItm && ITM_STRIPE)}>
        <div className="relative h-8 flex items-center justify-end">
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 h-[12px] bg-cyan-500/20 rounded-l-sm transition-all duration-500"
            style={{ width: `${ceBarPct}%` }}
          />
          <span className="relative z-10 text-cyan-400/70 text-[10px] pr-1.5 font-mono">{fmtOI(ceBar)}</span>
        </div>
      </td>

      {/* ── Strike ─────────────────────────────────────────────────────── */}
      <td className="px-3 py-0 text-center bg-base" style={{ minWidth: "5rem" }}>
        <div className="inline-flex items-center justify-center h-8">
          <span className={clsx(
            "text-[12px] font-mono font-semibold tabular-nums",
            isAtm ? "text-amber" : "text-primary/70"
          )}>
            {row.strikePrice.toLocaleString("en-IN")}
          </span>
        </div>
      </td>

      {/* ── Puts side: innermost → outermost ────────────────────────────── */}
      {/* OI/Vol bar — puts */}
      <td className={clsx("px-0 w-24 py-0", peItm && ITM_STRIPE)}>
        <div className="relative h-8 flex items-center justify-start">
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-[12px] bg-red-500/20 rounded-r-sm transition-all duration-500"
            style={{ width: `${peBarPct}%` }}
          />
          <span className="relative z-10 text-red-400/70 text-[10px] pl-1.5 font-mono">{fmtOI(peBar)}</span>
        </div>
      </td>

      {columns.askQty  && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted/60 text-left"))}>{fmtOI(row.peAskQty)}</td>}
      {columns.ask     && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted text-left"))}>{fmt(row.peAsk)}</td>}
      {columns.bid     && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted text-left"))}>{fmt(row.peBid)}</td>}
      {columns.bidQty  && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted/60 text-left"))}>{fmtOI(row.peBidQty)}</td>}
      {columns.chng    && (
        <td className={c(clsx(peItm && ITM_STRIPE, "text-left", (row.peChng ?? 0) >= 0 ? "text-teal/80" : "text-danger/80"))}>
          {fmtChng(row.peChng)}
        </td>
      )}
      {columns.ltp     && <td className={c(clsx(peItm && ITM_STRIPE, "text-primary font-medium text-left"))}>{fmt(row.peLTP)}</td>}
      {columns.iv      && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted text-left"))}>{fmt(row.peIV, 1)}</td>}
      {columns.vol     && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted/70 text-left"))}>{fmtOI(row.peVol)}</td>}
      {columns.oiChange && (
        <td className={c(clsx(peItm && ITM_STRIPE, "text-left", (row.peOIChg ?? 0) >= 0 ? "text-teal/70" : "text-danger/70"))}>
          {fmtOI(row.peOIChg)}
        </td>
      )}
      {columns.oi      && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted text-left"))}>{fmtOI(row.peOI)}</td>}
      {/* Greeks (outermost, off by default) */}
      {columns.delta   && <td className={c(clsx(peItm && ITM_STRIPE, "text-danger/60 text-left"))}>{fmt(row.peDelta)}</td>}
      {columns.gamma   && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted/60 text-left"))}>{fmt(row.peGamma, 4)}</td>}
      {columns.theta   && <td className={c(clsx(peItm && ITM_STRIPE, "text-danger/60 text-left"))}>{fmt(row.peTheta)}</td>}
      {columns.vega    && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted/60 text-left"))}>{fmt(row.peVega)}</td>}
      {columns.rho     && <td className={c(clsx(peItm && ITM_STRIPE, "text-muted/60 text-left"))}>{fmt(row.peRho, 3)}</td>}
    </tr>
  );
}
