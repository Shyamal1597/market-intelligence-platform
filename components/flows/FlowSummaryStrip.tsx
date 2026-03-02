import type { FiiDiiEntry } from "@/lib/nse-flows";

interface FlowSummaryStripProps {
  entries: FiiDiiEntry[];
}

function croreStr(v: number): string {
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
}

function colorClass(v: number) {
  return v >= 0 ? "text-teal" : "text-danger";
}

export function FlowSummaryStrip({ entries }: FlowSummaryStripProps) {
  if (!entries.length) return null;

  const today = new Date();
  const startOfMonth = today.toISOString().slice(0, 7);
  const startOfQuarter = (() => {
    const qStartMonth = Math.floor(today.getMonth() / 3) * 3;
    const d = new Date(today.getFullYear(), qStartMonth, 1);
    return d.toISOString().slice(0, 7);
  })();
  const startOfYear = `${today.getFullYear()}-01`;

  const mtd = entries
    .filter((e) => e.date.slice(0, 7) >= startOfMonth)
    .reduce((s, e) => s + e.fiiEquityNet, 0);
  const qtd = entries
    .filter((e) => e.date.slice(0, 7) >= startOfQuarter)
    .reduce((s, e) => s + e.fiiEquityNet, 0);
  const ytd = entries
    .filter((e) => e.date.slice(0, 7) >= startOfYear)
    .reduce((s, e) => s + e.fiiEquityNet, 0);

  const buyerDays = entries.filter((e) => e.fiiEquityNet > 0).length;
  const sellerDays = entries.filter((e) => e.fiiEquityNet < 0).length;

  const streakSign =
    (entries[entries.length - 1]?.fiiEquityNet ?? 0) >= 0 ? "buyer" : "seller";
  let streak = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const isPositive = entries[i].fiiEquityNet >= 0;
    if (
      (streakSign === "buyer" && isPositive) ||
      (streakSign === "seller" && !isPositive)
    ) {
      streak++;
    } else {
      break;
    }
  }

  const sorted = [...entries].sort((a, b) => b.fiiEquityNet - a.fiiEquityNet);
  const topInflows = sorted.slice(0, 5);
  const topOutflows = sorted.slice(-5).reverse();

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <div className="border border-[#1E2235] rounded-xl bg-surface p-5 space-y-5">
      {/* MTD / QTD / YTD + streak */}
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <span className="font-mono text-xs text-muted">
          MTD&nbsp;
          <span className={`${colorClass(mtd)} font-semibold`}>{croreStr(mtd)}</span>
        </span>
        <span className="font-mono text-xs text-muted">
          QTD&nbsp;
          <span className={`${colorClass(qtd)} font-semibold`}>{croreStr(qtd)}</span>
        </span>
        <span className="font-mono text-xs text-muted">
          YTD&nbsp;
          <span className={`${colorClass(ytd)} font-semibold`}>{croreStr(ytd)}</span>
        </span>
        <span className="text-muted font-mono text-xs">·</span>
        <span className="font-mono text-xs text-muted">
          Net buyer&nbsp;<span className="text-primary">{buyerDays}d</span>
        </span>
        <span className="font-mono text-xs text-muted">
          Net seller&nbsp;<span className="text-primary">{sellerDays}d</span>
        </span>
        <span className="text-muted font-mono text-xs">·</span>
        <span className="font-mono text-xs text-muted">
          Streak&nbsp;
          <span className={streakSign === "buyer" ? "text-teal" : "text-danger"}>
            {streak}d net {streakSign}
          </span>
        </span>
      </div>

      {/* Top flow days */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted uppercase mb-2">
            Biggest Inflows (FII Equity)
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {topInflows.map((e) => (
              <span key={e.date} className="font-mono text-xs">
                <span className="text-muted">{formatDate(e.date)}</span>
                &nbsp;
                <span className="text-teal">
                  +₹{Math.round(e.fiiEquityNet).toLocaleString("en-IN")} Cr
                </span>
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted uppercase mb-2">
            Biggest Outflows (FII Equity)
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {topOutflows.map((e) => (
              <span key={e.date} className="font-mono text-xs">
                <span className="text-muted">{formatDate(e.date)}</span>
                &nbsp;
                <span className="text-danger">
                  -₹{Math.round(Math.abs(e.fiiEquityNet)).toLocaleString("en-IN")} Cr
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
