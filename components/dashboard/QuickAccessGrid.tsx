"use client";

import Link from "next/link";
import {
    TrendingUp,
    CalendarDays,
    LayoutGrid,
    Activity,
    BookMarked,
    ArrowRight
} from "lucide-react";

const MODULES = [
    { href: "/macro", label: "Macro Data", icon: TrendingUp, desc: "Global indicators and commodity pricing", color: "text-amber shadow-amber" },
    { href: "/calendar", label: "Earnings Calendar", icon: CalendarDays, desc: "Forward-looking NSE result dates", color: "text-teal shadow-teal" },
    { href: "/sectors", label: "Sector Heatmap", icon: LayoutGrid, desc: "Performance across Nifty indices", color: "text-danger shadow-danger" },
    { href: "/flows", label: "Institutional Flows", icon: Activity, desc: "FII & DII daily market activities", color: "text-amber shadow-amber" },
    { href: "/links", label: "Quick Links", icon: BookMarked, desc: "Curated external portals and tools", color: "text-cyan-400 shadow-cyan-400" },
];

export function QuickAccessGrid() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {MODULES.map((mod) => {
                const Icon = mod.icon;
                return (
                    <Link
                        key={mod.href}
                        href={mod.href}
                        className="glass-panel p-5 rounded-xl group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                    >
                        {/* Ambient Background Glow */}
                        <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-0 group-hover:opacity-10 transition-opacity bg-current ${mod.color.split(" ")[0]}`} />

                        <div className="flex flex-col h-full relative z-10">
                            <div className={`w-8 h-8 rounded-lg bg-surface flex items-center justify-center border border-border mb-4 group-hover:bg-surface-raised transition-colors`}>
                                <Icon size={16} className={`${mod.color.split(" ")[0]} group-hover:text-glow`} />
                            </div>

                            <h3 className="font-sans font-semibold text-primary mb-1 group-hover:text-amber transition-colors">
                                {mod.label}
                            </h3>
                            <p className="font-sans text-xs text-muted mb-4 mt-auto">
                                {mod.desc}
                            </p>

                            <div className="flex items-center text-[10px] font-mono tracking-widest text-muted group-hover:text-amber uppercase mt-auto transition-colors gap-1">
                                Access Module
                                <ArrowRight size={10} className="group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
