"use client";

import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { getMarketStatus, getMarketStatusLabel } from "@/lib/market-status";
import { useTheme } from "@/lib/theme";

export function TopBar() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState(getMarketStatus());
  const { setSettingsOpen } = useTheme();

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      setTime(
        ist.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
      setDate(
        ist.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      );
      setStatus(getMarketStatus());
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const statusColor =
    status === "open"
      ? "text-teal"
      : status === "pre-open"
      ? "text-amber"
      : "text-danger";

  const dotClass =
    status === "open"
      ? "bg-teal animate-pulse"
      : status === "pre-open"
      ? "bg-amber animate-pulse"
      : "bg-danger";

  return (
    <div className="h-12 flex items-center justify-between px-6 border-b border-border bg-surface/90 backdrop-blur-sm shrink-0">
      <h1 className="font-mono text-[11px] font-medium tracking-[0.18em] uppercase flex items-center gap-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-amber opacity-80" />
        <span className="text-amber/75">Sunidhi</span>
        <span className="text-[#272B40]">·</span>
        <span className="text-muted">Research Intelligence</span>
      </h1>
      <div className="flex items-center gap-5">
        <div className={`flex items-center gap-2 text-xs font-mono ${statusColor}`}>
          <span className={`w-2 h-2 rounded-full ${dotClass}`} />
          {getMarketStatusLabel(status)}
        </div>
        <div className="text-xs font-mono text-muted">
          <span className="text-primary">{time}</span>
          <span className="mx-2 text-[#2A2D42]">|</span>
          {date} IST
        </div>
        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="Display settings"
          className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-primary hover:bg-white/[0.06] transition-all duration-150"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
