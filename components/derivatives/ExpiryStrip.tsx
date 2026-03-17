"use client";

import { useRef } from "react";
import { clsx } from "clsx";

interface Props {
  expiries: string[];
  selected: string;
  onSelect: (expiry: string) => void;
}

function groupByMonth(expiries: string[]): { month: string; dates: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const e of expiries) {
    const parts = e.split("-"); // "17-Mar-2026"
    const key = `${parts[1]} '${parts[2].slice(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return Array.from(groups.entries()).map(([month, dates]) => ({ month, dates }));
}

function shortDate(expiry: string): string {
  return expiry.split("-")[0];
}

export function ExpiryStrip({ expiries, selected, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const groups = groupByMonth(expiries);

  return (
    <div ref={scrollRef} className="flex items-end gap-4 overflow-x-auto scrollbar-none pb-1">
      {groups.map(({ month, dates }) => (
        <div key={month} className="flex flex-col items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono text-muted tracking-widest uppercase">{month}</span>
          <div className="flex gap-1">
            {dates.map((d) => (
              <button
                key={d}
                onClick={() => onSelect(d)}
                className={clsx(
                  "w-9 h-8 rounded-lg text-xs font-mono transition-all",
                  selected === d
                    ? "bg-amber/20 text-amber border border-amber/40 shadow-[0_0_8px_rgba(245,130,13,0.2)]"
                    : "text-muted hover:text-primary hover:bg-white/5 border border-transparent"
                )}
              >
                {shortDate(d)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
