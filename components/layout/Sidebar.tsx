"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Briefcase,
  Newspaper,
  TrendingUp,
  FileText,
  BookMarked,
  CalendarDays,
  LayoutGrid,
  Activity,
  BarChart2,
  Sigma,
  Layers,
  Target,
  ChevronRight,
} from "lucide-react";
import { clsx } from "clsx";

const NAV = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/portfolio", icon: Briefcase, label: "Portfolio" },
  { href: "/news", icon: Newspaper, label: "Market News" },
  { href: "/macro", icon: TrendingUp, label: "Macro" },
  { href: "/filings", icon: FileText, label: "NSE Filings" },
  { href: "/calendar", icon: CalendarDays, label: "Earnings" },
  { href: "/sectors", icon: LayoutGrid, label: "Sectors" },
  { href: "/flows", icon: Activity, label: "Flows" },
  { href: "/derivatives", icon: Sigma, label: "Derivatives" },
  { href: "/deals", icon: Layers, label: "Bulk & Block" },
  { href: "/results", icon: BarChart2, label: "Results" },
  { href: "/intel", icon: Target, label: "Intel" },
  { href: "/links", icon: BookMarked, label: "Quick Links" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      className={clsx(
        "fixed left-0 top-0 z-50 h-screen flex flex-col transition-all duration-300 ease-in-out",
        "bg-surface border-r border-[#1E2235]",
        expanded ? "w-56" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-[#1E2235] shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* Collapsed: actual Sunidhi logo on white square */}
          {!expanded && (
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0 select-none p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/Sunidhi_logo_homepage.png"
                alt="Sunidhi"
                className="w-full h-full object-contain"
              />
            </div>
          )}
          {/* Expanded: actual Sunidhi logo on white background pill */}
          {expanded && (
            <div className="bg-white rounded-md px-2.5 py-1 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/Sunidhi_logo_homepage.png"
                alt="Sunidhi Securities & Finance"
                className="h-7 w-auto object-contain"
              />
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 flex flex-col gap-1 px-2 overflow-hidden">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-2 py-2.5 transition-all duration-150 group relative",
                active
                  ? "bg-amber/[0.13] text-amber shadow-[inset_0_0_0_1px_rgba(245,130,13,0.15)]"
                  : "text-muted hover:text-primary hover:bg-white/[0.05]"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-amber rounded-r-full shadow-[0_0_8px_rgba(245,130,13,0.6)]" />
              )}
              <Icon className="w-5 h-5 shrink-0" />
              {expanded && (
                <span className="text-sm font-medium whitespace-nowrap font-sans">
                  {label}
                </span>
              )}
              {!expanded && (
                <div className="absolute left-full ml-3 px-2 py-1 bg-[#272B40] text-primary text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
                  {label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-center h-12 border-t border-[#1E2235] text-muted hover:text-primary transition-colors"
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
      >
        <ChevronRight
          className={clsx(
            "w-4 h-4 transition-transform duration-300",
            expanded && "rotate-180"
          )}
        />
      </button>
    </aside>
  );
}
