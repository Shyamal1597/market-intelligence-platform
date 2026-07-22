"use client";

import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

export type SortDir = "asc" | "desc";

/** Nulls always sort last regardless of direction -- they're "no data", not "smallest". */
export function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

export function SortHeader<F extends string>({
  label, field, active, dir, onClick, align = "right",
}: { label: string; field: F; active: boolean; dir: SortDir; onClick: (f: F) => void; align?: "left" | "right" }) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`font-normal p-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => onClick(field)}
        title={`Sort by ${label}`}
        className={`inline-flex items-center gap-1 w-full px-2 py-1.5 rounded-sm hover:bg-amber/10 hover:text-amber transition-colors cursor-pointer ${
          active ? "text-amber" : "text-muted"
        } ${align === "right" ? "flex-row-reverse justify-start" : "justify-start"}`}
      >
        {label}
        <Icon size={12} className={active ? "opacity-100" : "opacity-70"} />
      </button>
    </th>
  );
}
