"use client";

import { Treemap, ResponsiveContainer, Tooltip } from "recharts";

export interface HeatmapNode {
  symbol: string;
  name: string | null;
  amtToday: number;
  amtChangePct: number | null;
  priceChangePct: number | null;
  turnoverLakhs: number | null;
}

function fmtLakhs(v: number | null | undefined): string {
  if (v == null) return "—";
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} L`;
}

function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Green = leverage building, red = leverage unwinding, grey = no/flat data.
 * Real day-over-day MTF-amount moves cluster tightly around 0 (p90 is only
 * ~4.3%, confirmed against live data 2026-07-14) with a long thin tail out
 * to 100%+. A linear +-50% scale left nearly every box looking the same
 * washed-out grey since almost nothing gets close to the cap. Capping at
 * +-20% and applying a sqrt curve pulls the typical, tradeable range apart
 * visually while still saturating fully for genuine outliers.
 */
function colorForChange(pct: number | null | undefined): string {
  if (pct == null) return "#2A2E42";
  const capped = Math.max(-20, Math.min(20, pct));
  const t = Math.sqrt(Math.abs(capped) / 20);
  return capped >= 0 ? hexLerp("#1E2235", "#00C9A7", t) : hexLerp("#1E2235", "#E84040", t);
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p: HeatmapNode = payload[0].payload;
  return (
    <div className="bg-[#13151E] border border-[#1E2235] rounded px-2.5 py-2 text-[11px] font-mono text-[#F0EDE8] max-w-[220px]">
      <p className="font-bold mb-1">{p.symbol}</p>
      {p.name && <p className="text-[#6E7590] mb-1 leading-snug">{p.name}</p>}
      <p>MTF financed today: {fmtLakhs(p.amtToday ?? null)}</p>
      <p style={{ color: (p.amtChangePct ?? 0) >= 0 ? "#00C9A7" : "#E84040" }}>
        MTF change: {p.amtChangePct != null ? `${p.amtChangePct >= 0 ? "+" : ""}${p.amtChangePct.toFixed(1)}%` : "—"}
      </p>
      <p style={{ color: (p.priceChangePct ?? 0) >= 0 ? "#00C9A7" : "#E84040" }}>
        Price change: {p.priceChangePct != null ? `${p.priceChangePct >= 0 ? "+" : ""}${p.priceChangePct.toFixed(2)}%` : "—"}
      </p>
    </div>
  );
}

function CustomContent(props: any) {
  const { x, y, width, height, symbol, amtChangePct } = props;
  if (width <= 0 || height <= 0) return null;
  const fill = colorForChange(amtChangePct ?? null);
  const showText = width > 42 && height > 22;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: "#0C0E14", strokeWidth: 1 }} />
      {showText && (
        <>
          <text x={x + 4} y={y + 14} fontSize={10} fontFamily="var(--font-mono)" fill="#F0EDE8" fontWeight={600}>
            {symbol}
          </text>
          {height > 34 && (
            <text x={x + 4} y={y + 27} fontSize={9} fontFamily="var(--font-mono)" fill="#F0EDE8" opacity={0.85}>
              {amtChangePct != null ? `${amtChangePct >= 0 ? "+" : ""}${amtChangePct.toFixed(0)}%` : "—"}
            </text>
          )}
        </>
      )}
    </g>
  );
}

/** Recharts' squarified Treemap places boxes in the order of the data array,
 * starting from the top-left and proceeding in reading order -- so sorting
 * all "adding leverage" boxes before all "reducing leverage" ones clusters
 * green toward the left and red toward the right, instead of interleaving
 * them purely by book size. */
function sortForLeftRightGrouping(nodes: HeatmapNode[]): HeatmapNode[] {
  const sign = (n: HeatmapNode) => {
    const pct = n.amtChangePct ?? 0;
    return pct > 0 ? 1 : pct < 0 ? -1 : 0;
  };
  return [...nodes].sort((a, b) => {
    const s = sign(b) - sign(a);
    if (s !== 0) return s;
    return (b.amtToday ?? 0) - (a.amtToday ?? 0);
  });
}

export function MTFHeatmap({
  nodes, onSelectSymbol,
}: { nodes: HeatmapNode[]; onSelectSymbol?: (symbol: string) => void }) {
  const data = sortForLeftRightGrouping(nodes).map((n) => ({ ...n, name: n.symbol, size: n.amtToday }));

  return (
    <div className="rounded-lg border border-border bg-surface p-3 h-[560px] flex flex-col">
      <div className="shrink-0 mb-1">
        <p className="text-[9px] uppercase tracking-widest text-muted">
          MTF Leverage Heatmap -- Top {nodes.length} by Financed Amount
        </p>
        <p className="text-[9px] text-muted/60 mt-0.5">
          Box size = how much money is financed on that stock today (bigger = more material).
          Box color = today's change in financed amount -- green means margin funding is being added, red means it&rsquo;s being pulled out.
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            aspectRatio={4 / 3}
            content={<CustomContent />}
            onClick={(node: any) => onSelectSymbol?.(node?.symbol ?? node?.name)}
            isAnimationActive={false}
          >
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>

      <div className="shrink-0 mt-1 flex items-center gap-3 text-[9px] text-muted/70">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#00C9A7" }} /> Adding leverage</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#E84040" }} /> Reducing leverage</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#2A2E42" }} /> No prior-day data</span>
      </div>
    </div>
  );
}
