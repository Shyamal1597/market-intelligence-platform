"use client";

import type { CheckStatus } from "@/lib/intel/types";

export interface IntelFilters {
  quarter: string | null;    // "all" or specific quarter
  status: string;            // "all" | "hit" | "miss" | "partial" | "pending" | "no-data"
  segment: string | null;    // "all" or segment name
  metric: string | null;     // "all" or metricKey
  search: string;
}

interface Props {
  filters: IntelFilters;
  quarters: string[];
  metrics: Array<{ key: string; label: string; segment: string }>;
  onChange: (f: IntelFilters) => void;
}

const STATUSES: Array<{ value: string; label: string }> = [
  { value: "all",      label: "All statuses" },
  { value: "hit",      label: "Hit" },
  { value: "miss",     label: "Miss" },
  { value: "partial",  label: "Partial" },
  { value: "pending",  label: "Pending" },
  { value: "no-data",  label: "No Data" },
];

export function FiltersBar({ filters, quarters, metrics, onChange }: Props) {
  const set = (patch: Partial<IntelFilters>) => onChange({ ...filters, ...patch });

  // Derive unique segments from registry, in insertion order
  const segments = Array.from(new Set(metrics.map((m) => m.segment)));
  // When segment changes, clear metric filter
  const setSegment = (seg: string | null) =>
    onChange({ ...filters, segment: seg, metric: null });

  // Metrics visible in current segment (or all metrics)
  const visibleMetrics = filters.segment
    ? metrics.filter((m) => m.segment === filters.segment)
    : metrics;

  const selectClass = "bg-surface border border-border rounded text-primary text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-amber/50 cursor-pointer";

  const dirty =
    filters.quarter || filters.status !== "all" || filters.segment ||
    filters.metric || filters.search;

  return (
    <div className="flex flex-wrap gap-3 items-center mb-4">
      {/* Quarter filter */}
      <select
        className={selectClass}
        value={filters.quarter ?? "all"}
        onChange={(e) => set({ quarter: e.target.value === "all" ? null : e.target.value })}
      >
        <option value="all">All quarters</option>
        {quarters.map((q) => (
          <option key={q} value={q}>{q}</option>
        ))}
      </select>

      {/* Status filter */}
      <select
        className={selectClass}
        value={filters.status}
        onChange={(e) => set({ status: e.target.value })}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* Segment filter — hidden when only one segment exists */}
      {segments.length > 1 && (
        <select
          className={selectClass}
          value={filters.segment ?? "all"}
          onChange={(e) => setSegment(e.target.value === "all" ? null : e.target.value)}
        >
          <option value="all">All segments</option>
          {segments.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}

      {/* Metric filter */}
      <select
        className={selectClass}
        value={filters.metric ?? "all"}
        onChange={(e) => set({ metric: e.target.value === "all" ? null : e.target.value })}
      >
        <option value="all">All metrics</option>
        {visibleMetrics.map((m) => (
          <option key={m.key} value={m.key}>{m.label}</option>
        ))}
      </select>

      {/* Free-text search */}
      <input
        type="text"
        placeholder="Search quotes…"
        value={filters.search}
        onChange={(e) => set({ search: e.target.value })}
        className="bg-surface border border-border rounded text-primary text-xs font-mono px-2 py-1.5 focus:outline-none focus:border-amber/50 w-48 placeholder:text-muted"
      />

      {/* Reset */}
      {dirty && (
        <button
          onClick={() => onChange({ quarter: null, status: "all", segment: null, metric: null, search: "" })}
          className="text-xs text-muted hover:text-amber font-mono transition-colors"
        >
          reset
        </button>
      )}
    </div>
  );
}
