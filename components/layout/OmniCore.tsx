"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/lib/theme";
import {
  LayoutDashboard,
  Briefcase,
  Newspaper,
  TrendingUp,
  FileText,
  CalendarDays,
  LayoutGrid,
  Activity,
  BarChart2,
  BookMarked,
  Sigma,
  Layers,
  Settings
} from "lucide-react";
import { clsx } from "clsx";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/news", label: "Market News", icon: Newspaper },
  { href: "/macro", label: "Macro Data", icon: TrendingUp },
  { href: "/filings", label: "NSE Filings", icon: FileText },
  { href: "/calendar", label: "Earnings", icon: CalendarDays },
  { href: "/sectors", label: "Sectors", icon: LayoutGrid },
  { href: "/flows", label: "Flows", icon: Activity },
  { href: "/results", label: "Results", icon: BarChart2 },
  { href: "/derivatives", label: "Derivatives", icon: Sigma },
  { href: "/deals", label: "Bulk & Block Deals", icon: Layers },
  { href: "/links", label: "Quick Links", icon: BookMarked },
];

export function OmniCore() {
  const pathname = usePathname();
  const { setSettingsOpen } = useTheme();

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[slideIn_0.4s_ease-out]">
      <div className="glass-panel rounded-full px-5 py-2.5 flex items-center gap-4 shadow-2xl shadow-cyan-500/10">
        <nav className="flex items-center gap-1.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "relative group flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300",
                  isActive
                    ? "bg-amber/15 text-amber border border-amber/30"
                    : "text-muted hover:text-primary hover:bg-white/5"
                )}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-amber/20 rounded-full blur-md" />
                )}
                <Icon size={18} className="relative z-10" />
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-surface text-primary text-xs font-sans rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap border border-border">
                  {item.label}
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-border" />
                </div>
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => setSettingsOpen(true)}
          className="relative group flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 text-muted hover:text-primary hover:bg-white/5"
        >
          <Settings size={18} className="relative z-10 transition-transform duration-500 group-hover:rotate-45" />
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-surface text-primary text-xs font-sans rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap border border-border">
            Settings
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-border" />
          </div>
        </button>
      </div>
    </div>
  );
}
