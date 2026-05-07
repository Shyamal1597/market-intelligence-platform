"use client";

import { ReactNode } from "react";

export interface ColumnTab {
  key: string;
  label: string;
}

interface ActivityColumnProps {
  title: string;
  icon: ReactNode;
  count: number;
  loading: boolean;
  empty: boolean;
  children: ReactNode;
  tabs?: ColumnTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
}

export function ActivityColumn({
  title, icon, count, loading, empty, children,
  tabs, activeTab, onTabChange,
}: ActivityColumnProps) {
  return (
    <div className="flex flex-col min-h-0 border-r border-border last:border-r-0">
      {/* Column header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0 bg-surface">
        <span className="text-amber">{icon}</span>
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          {title}
        </span>
        {!loading && count > 0 && (
          <span
            className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: "rgba(var(--color-amber-rgb, 245 130 13) / 0.12)", color: "var(--color-amber)" }}
          >
            {count}
          </span>
        )}
      </div>

      {/* Tab bar */}
      {tabs && tabs.length > 0 && (
        <div
          className="flex items-center gap-0 px-2 py-1.5 border-b border-border shrink-0 overflow-x-auto bg-base"
          style={{ scrollbarWidth: "none" }}
        >
          {tabs.map((t) => {
            const isActive = t.key === activeTab;
            return (
              <button
                key={t.key}
                onClick={() => onTabChange?.(t.key)}
                className="shrink-0 px-2 py-0.5 rounded text-[9px] font-mono tracking-wide transition-all whitespace-nowrap"
                style={{
                  background: isActive ? "color-mix(in srgb, var(--color-amber) 15%, transparent)" : "transparent",
                  color: isActive ? "var(--color-amber)" : "var(--color-muted)",
                  border: isActive ? "1px solid color-mix(in srgb, var(--color-amber) 30%, transparent)" : "1px solid transparent",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Column body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg animate-pulse bg-border" />
            ))}
          </div>
        )}
        {!loading && empty && (
          <div className="flex flex-col items-center justify-center h-full py-12 gap-2">
            <span className="text-2xl opacity-30">—</span>
            <span className="text-[10px] font-mono text-center text-muted">
              No new activity detected
            </span>
          </div>
        )}
        {!loading && !empty && children}
      </div>
    </div>
  );
}
