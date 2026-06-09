"use client";

export interface IntelFilters {
  quarter: string | null;    // null = all quarters
  status: string;            // "all" | "met" | "moving" | "miss" | "pending" | "ambiguous"
  segment: string | null;    // null = all segments
  metric: string | null;     // null = all metrics
  search: string;
}

interface Props {
  filters: IntelFilters;
  quarters: string[];
  metrics: Array<{ key: string; label: string; segment: string }>;
  onChange: (f: IntelFilters) => void;
}

const STATUSES: Array<{
  value: string;
  label: string;
  activeClass: string;
}> = [
  {
    value: "all",
    label: "ALL",
    activeClass: "border-border bg-surface/80 text-primary",
  },
  {
    value: "met",
    label: "MET",
    activeClass: "border-teal/50 bg-teal/10 text-teal",
  },
  {
    value: "moving",
    label: "MOVING",
    activeClass: "border-amber/50 bg-amber/10 text-amber",
  },
  {
    value: "miss",
    label: "MISS",
    activeClass: "border-danger/50 bg-danger/10 text-danger",
  },
  {
    value: "pending",
    label: "PENDING",
    activeClass: "border-border/70 bg-surface text-muted",
  },
  {
    value: "ambiguous",
    label: "AMBIGUOUS",
    activeClass: "border-border/70 bg-surface text-muted",
  },
];

export function FiltersBar({ filters, quarters, metrics, onChange }: Props) {
  const set = (patch: Partial<IntelFilters>) => onChange({ ...filters, ...patch });

  const segments = Array.from(new Set(metrics.map((m) => m.segment)));
  const setSegment = (seg: string | null) =>
    onChange({ ...filters, segment: seg, metric: null });

  const visibleMetrics = filters.segment
    ? metrics.filter((m) => m.segment === filters.segment)
    : metrics;

  const selectClass =
    "bg-surface border border-border rounded text-primary text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-amber/50 cursor-pointer";

  const dirty =
    filters.quarter ||
    filters.status !== "all" ||
    filters.segment ||
    filters.metric ||
    filters.search;

  return (
    <div className="space-y-3 mb-5">
      {/* Row 1 -- verdict pill buttons */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] font-mono text-muted uppercase tracking-wider mr-1">
          Status
        </span>
        {STATUSES.map((s) => {
          const isActive = filters.status === s.value;
          return (
            <button
              key={s.value}
              onClick={() => set({ status: s.value })}
              className={`px-2.5 py-1 rounded border text-[10px] font-mono font-bold tracking-wider transition-colors ${
                isActive
                  ? s.activeClass
                  : "border-border bg-transparent text-muted hover:text-primary hover:border-border/70"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Row 2 -- dropdowns + search */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Quarter -- only render when there are selectable quarters */}
        {quarters.length > 0 && (
          <select
            className={selectClass}
            value={filters.quarter ?? "all"}
            onChange={(e) =>
              set({ quarter: e.target.value === "all" ? null : e.target.value })
            }
          >
            <option value="all">All quarters</option>
            {quarters.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        )}

        {/* Segment -- hidden when only one */}
        {segments.length > 1 && (
          <select
            className={selectClass}
            value={filters.segment ?? "all"}
            onChange={(e) =>
              setSegment(e.target.value === "all" ? null : e.target.value)
            }
          >
            <option value="all">All segments</option>
            {segments.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        {/* Metric */}
        <select
          className={selectClass}
          value={filters.metric ?? "all"}
          onChange={(e) =>
            set({ metric: e.target.value === "all" ? null : e.target.value })
          }
        >
          <option value="all">All metrics</option>
          {visibleMetrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>

        {/* Free-text search */}
        <input
          type="text"
          placeholder="Search quotes…"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          className="bg-surface border border-border rounded text-primary text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-amber/50 w-52 placeholder:text-muted"
        />

        {/* Reset */}
        {dirty && (
          <button
            onClick={() =>
              onChange({
                quarter: null,
                status: "all",
                segment: null,
                metric: null,
                search: "",
              })
            }
            className="text-xs text-muted hover:text-amber font-mono transition-colors"
          >
            reset
          </button>
        )}
      </div>
    </div>
  );
}
