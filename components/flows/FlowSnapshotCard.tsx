interface FlowSnapshotCardProps {
  label: string;
  buy: number;
  sell: number;
  net: number;
}

function crore(v: number): string {
  const abs = Math.abs(v);
  return `₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
}

export function FlowSnapshotCard({ label, buy, sell, net }: FlowSnapshotCardProps) {
  const positive = net >= 0;
  const bgClass = positive
    ? "bg-teal/10 border-teal/20"
    : "bg-danger/10 border-danger/20";
  const netColor = positive ? "text-teal" : "text-danger";
  const sign = positive ? "+" : "-";

  return (
    <div className={`border rounded-xl p-4 flex flex-col gap-2 ${bgClass}`}>
      <p className="font-mono text-[10px] tracking-widest text-muted uppercase">
        {label}
      </p>
      <p className={`font-mono text-2xl font-bold leading-none ${netColor}`}>
        {sign}{crore(net)}
      </p>
      <div className="flex flex-col gap-0.5 mt-1">
        <p className="font-mono text-xs text-muted">
          <span className="text-teal/70">B</span>&nbsp;{crore(buy)}
        </p>
        <p className="font-mono text-xs text-muted">
          <span className="text-danger/70">S</span>&nbsp;{crore(sell)}
        </p>
      </div>
    </div>
  );
}
