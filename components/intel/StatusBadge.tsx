"use client";

import type { Verdict } from "@/lib/intel/types";

interface Props {
  status: Verdict | "unknown";
  size?: "sm" | "md";
}

const CONFIG: Record<Verdict | "unknown", { label: string; classes: string }> = {
  met:       { label: "MET",       classes: "bg-teal/10 text-teal border-teal/25" },
  moving:    { label: "MOVING",    classes: "bg-amber/10 text-amber border-amber/25" },
  miss:      { label: "MISS",      classes: "bg-danger/10 text-danger border-danger/25" },
  pending:   { label: "PENDING",   classes: "bg-surface text-muted border-border" },
  ambiguous: { label: "AMBIGUOUS", classes: "bg-surface text-muted border-border" },
  unknown:   { label: "?",         classes: "bg-surface text-muted border-border" },
};

export function StatusBadge({ status, size = "sm" }: Props) {
  const cfg = CONFIG[status] ?? CONFIG.unknown;
  const sizeClass = size === "md"
    ? "text-xs px-2.5 py-0.5 font-semibold"
    : "text-[10px] px-2 py-0.5 font-bold";
  return (
    <span className={`inline-flex items-center rounded border font-mono tracking-wider ${sizeClass} ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}
