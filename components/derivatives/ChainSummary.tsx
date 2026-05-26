import type { DerivativesData } from "@/lib/nse-derivatives";
import { clsx } from "clsx";

interface Props { data: DerivativesData; }

function getMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const h = ist.getHours(), m = ist.getMinutes(), total = h * 60 + m;
  return total >= 9 * 60 + 15 && total <= 15 * 60 + 30;
}

function fmtLargeNum(v: number): string {
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(2)}Cr`;
  if (v >= 100_000) return `${(v / 100_000).toFixed(2)}L`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted">{label}</span>
      <span className={clsx("tabular-nums", color ?? "text-primary")}>{value}</span>
    </div>
  );
}

export function ChainSummary({ data }: Props) {
  const open = getMarketOpen();
  const pcrColor = data.pcr > 1.2 ? "text-teal" : data.pcr < 0.8 ? "text-danger" : "text-primary";

  return (
    <div className="px-4 py-2 bg-surface/50 border-b border-border text-xs font-mono space-y-1.5">
      {/* Row 1 — core metrics */}
      <div className="flex items-center gap-5 flex-wrap">
        <Metric label="Spot" value={data.spot.toLocaleString("en-IN", { maximumFractionDigits: 2 })} color="text-primary font-semibold" />
        <Metric label="ATM IV" value={`${data.atmIV.toFixed(1)}%`} />
        <Metric label="PCR" value={data.pcr.toFixed(2)} color={clsx("font-semibold", pcrColor)} />

        <Metric label="Max Pain" value={data.maxPain.toLocaleString("en-IN")} color="text-amber font-semibold" />

        {/* OI walls — resistance/support */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted">Resistance</span>
          <span className="text-cyan-400/70 tabular-nums">{data.cePeakOI.toLocaleString("en-IN")}</span>
          <span className="text-muted/30">|</span>
          <span className="text-muted">Support</span>
          <span className="text-red-400/70 tabular-nums">{data.pePeakOI.toLocaleString("en-IN")}</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span className={clsx("w-1.5 h-1.5 rounded-full", open ? "bg-teal animate-pulse" : "bg-danger")} />
          <span className={open ? "text-teal" : "text-danger"}>{open ? "Market Open" : "Market Closed"}</span>
        </div>
        {data.timestamp && (
          <span className="text-[#3A3E55]">Updated {data.timestamp}</span>
        )}
      </div>

      {/* Row 2 — OI & Volume totals */}
      <div className="flex items-center gap-5 flex-wrap text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="text-muted">Total OI</span>
          <span className="text-cyan-400/70">CE {fmtLargeNum(data.totalCeOI)}</span>
          <span className="text-muted/40">·</span>
          <span className="text-red-400/70">PE {fmtLargeNum(data.totalPeOI)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted">Total Vol</span>
          <span className="text-cyan-400/70">CE {fmtLargeNum(data.totalCeVol)}</span>
          <span className="text-muted/40">·</span>
          <span className="text-red-400/70">PE {fmtLargeNum(data.totalPeVol)}</span>
        </div>
      </div>
    </div>
  );
}
