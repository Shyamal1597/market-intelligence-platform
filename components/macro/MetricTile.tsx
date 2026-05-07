import { TrendingUp, TrendingDown } from "lucide-react";
import { Sparkline } from "./Sparkline";

interface MetricTileProps {
  label: string;
  price: number;
  change: number;
  changePercent: number;
  symbol: string;
  history: number[];
}

function fmt(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(4);
  if (["BZ=F", "GC=F"].includes(symbol)) return price.toFixed(2);
  if (price > 10000) return price.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return price.toFixed(2);
}

export function MetricTile({ label, price, change, changePercent, symbol, history }: MetricTileProps) {
  const up = change >= 0;
  return (
    <div
      className={`relative rounded-xl border p-5 bg-surface overflow-hidden transition-all hover:shadow-lg ${up
        ? "border-teal/20 hover:border-teal/40"
        : "border-danger/20 hover:border-danger/40"
        }`}
    >
      <p className="text-xl font-mono text-muted uppercase tracking-widest mb-3">{label}</p>
      <p className="font-mono text-3xl font-semibold text-primary mb-1">{fmt(price, symbol)}</p>
      <div className={`flex items-center gap-1 text-2xl font-mono ${up ? "text-teal" : "text-danger"}`}>
        {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        {up ? "+" : ""}
        {change.toFixed(2)} ({up ? "+" : ""}
        {changePercent.toFixed(2)}%)
      </div>
      <div className="mt-3 opacity-50">
        <Sparkline data={history} positive={up} />
      </div>
    </div>
  );
}
