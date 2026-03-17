import type { DerivativesData } from "@/lib/nse-derivatives";
import { clsx } from "clsx";

interface Props { data: DerivativesData; }

function getMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const h = ist.getHours(), m = ist.getMinutes(), total = h * 60 + m;
  return total >= 9 * 60 + 15 && total <= 15 * 60 + 30;
}

export function ChainSummary({ data }: Props) {
  const open = getMarketOpen();
  const pcrColor = data.pcr > 1.2 ? "text-teal" : data.pcr < 0.8 ? "text-danger" : "text-primary";

  return (
    <div className="flex items-center gap-6 px-4 py-2 bg-surface/50 border-b border-border text-xs font-mono flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-muted">Spot</span>
        <span className="text-primary font-semibold tabular-nums">
          {data.spot.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted">ATM IV</span>
        <span className="text-primary tabular-nums">{data.atmIV.toFixed(1)}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted">PCR</span>
        <span className={clsx("tabular-nums font-semibold", pcrColor)}>{data.pcr.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted">Max Pain</span>
        <span className="text-amber tabular-nums">{data.maxPain.toLocaleString("en-IN")}</span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <span className={clsx("w-1.5 h-1.5 rounded-full", open ? "bg-teal animate-pulse" : "bg-danger")} />
        <span className={open ? "text-teal" : "text-danger"}>{open ? "Market Open" : "Market Closed"}</span>
      </div>
      {data.timestamp && (
        <span className="text-[#3A3E55]">Updated {data.timestamp}</span>
      )}
    </div>
  );
}
