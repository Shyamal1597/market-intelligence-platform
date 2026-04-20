// components/portfolio/ActivityColumn.tsx
"use client";

import { ReactNode } from "react";

interface ActivityColumnProps {
  title: string;
  icon: ReactNode;
  count: number;
  loading: boolean;
  empty: boolean;
  children: ReactNode;
}

export function ActivityColumn({
  title,
  icon,
  count,
  loading,
  empty,
  children,
}: ActivityColumnProps) {
  return (
    <div className="flex flex-col min-h-0 border-r border-[#1E2235] last:border-r-0">
      {/* Column header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-[#1E2235] shrink-0"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <span style={{ color: "#F5820D" }}>{icon}</span>
        <span
          className="text-[10px] font-mono font-bold uppercase tracking-widest"
          style={{ color: "#F0EDE8" }}
        >
          {title}
        </span>
        {!loading && count > 0 && (
          <span
            className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background: "rgba(245,130,13,0.12)",
              color: "#F5820D",
            }}
          >
            {count}
          </span>
        )}
      </div>

      {/* Column body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-12 rounded-lg animate-pulse"
                style={{ background: "#1E2235" }}
              />
            ))}
          </div>
        )}
        {!loading && empty && (
          <div className="flex flex-col items-center justify-center h-full py-12 gap-2">
            <span className="text-2xl opacity-30">—</span>
            <span
              className="text-[10px] font-mono text-center"
              style={{ color: "#6B7280" }}
            >
              No new activity detected
            </span>
          </div>
        )}
        {!loading && !empty && children}
      </div>
    </div>
  );
}
