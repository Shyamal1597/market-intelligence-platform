"use client";

import type { Verdict } from "@/lib/intel/types";

export type VerdictFilter = "all" | Verdict;

interface Props {
  active: VerdictFilter;
  onChange: (f: VerdictFilter) => void;
}

const FILTERS: Array<{ key: VerdictFilter; label: string }> = [
  { key: "all",       label: "All" },
  { key: "met",       label: "Met" },
  { key: "moving",    label: "Moving" },
  { key: "miss",      label: "Miss" },
  { key: "pending",   label: "Pending" },
];

export function VerdictFilterBar({ active, onChange }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
            active === key
              ? "bg-amber/10 border-amber/30 text-amber"
              : "border-border bg-surface text-muted hover:text-primary hover:border-border/60"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
