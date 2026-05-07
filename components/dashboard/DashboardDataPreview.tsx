"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, CalendarDays, LayoutGrid, Activity, ArrowRight } from "lucide-react";
import { clsx } from "clsx";

// Types
import type { QuoteData } from "@/lib/yahoo-finance";
import type { FlowsSnapshot } from "@/lib/nse-flows";
import type { EarningsEntry } from "@/lib/bse-calendar";

function formatNumber(n: number) {
    return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function DashboardDataPreview() {
    const [flows, setFlows] = useState<FlowsSnapshot | null>(null);
    const [calendar, setCalendar] = useState<EarningsEntry[]>([]);

    // Note: we're using static data for Macro preview as per macro/page.tsx
    const macroPreview = [
        { label: "RBI Repo Rate", value: "6.50%", note: "Feb '25" },
        { label: "US 10Y Yield", value: "4.42%", note: "Fred" },
        { label: "DXY (Dollar)", value: "107.2", note: "Approx" },
    ];

    useEffect(() => {
        // Fetch Flows
        fetch("/api/flows").then(r => r.json()).then(d => setFlows(d.snapshot));
        // Fetch Calendar
        fetch("/api/calendar").then(r => r.json()).then(d => setCalendar(d.entries?.slice(0, 4) || []));
    }, []);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Flows Mini */}
            <Link href="/flows" className="glass-panel rounded-xl group relative overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,229,255,0.15)] hover:border-teal/30 p-5">
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-10 transition-opacity bg-teal" />
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center border border-border group-hover:border-teal/30">
                        <Activity size={16} className="text-teal group-hover:text-glow text-teal" />
                    </div>
                    <h3 className="font-display font-semibold text-primary group-hover:text-teal transition-colors">Daily Net Flows</h3>
                </div>
                <div className="flex-1 space-y-3 relative z-10">
                    {!flows ? (
                        <div className="text-muted text-xs animate-pulse">Syncing NSE data...</div>
                    ) : (
                        <>
                            <div className="flex justify-between items-center">
                                <span className="text-muted text-xs font-mono uppercase tracking-widest">FII Equity</span>
                                <span className={clsx("font-mono font-semibold", flows.fiiEquityNet >= 0 ? "text-teal" : "text-danger")}>
                                    {flows.fiiEquityNet > 0 ? "+" : ""}
                                    {formatNumber(flows.fiiEquityNet)} <span className="text-[10px] text-muted font-normal uppercase opacity-70">Cr</span>
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted text-xs font-mono uppercase tracking-widest">DII Equity</span>
                                <span className={clsx("font-mono font-semibold", flows.diiEquityNet >= 0 ? "text-teal" : "text-danger")}>
                                    {flows.diiEquityNet > 0 ? "+" : ""}
                                    {formatNumber(flows.diiEquityNet)} <span className="text-[20px] text-muted font-normal uppercase opacity-70">Cr</span>
                                </span>
                            </div>
                            <div className="flex justify-between items-center opacity-60">
                                <span className="text-muted text-xs font-mono uppercase tracking-widest">FII Debt</span>
                                <span className={clsx("font-mono text-xs", flows.fiiDebtNet >= 0 ? "text-teal" : "text-danger")}>
                                    {flows.fiiDebtNet > 0 ? "+" : ""}{formatNumber(flows.fiiDebtNet)} <span className="text-[9px]">Cr</span>
                                </span>
                            </div>
                        </>
                    )}
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex justify-between items-center text-xs font-mono text-muted uppercase tracking-widest group-hover:text-teal transition-colors">
                    <span>Flow Data</span>
                    <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                </div>
            </Link>

            {/* Macro Mini */}
            <Link href="/macro" className="glass-panel rounded-xl group relative overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(255,30,86,0.15)] hover:border-danger/30 p-5">
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-10 transition-opacity bg-danger" />
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center border border-border group-hover:border-danger/30">
                        <TrendingUp size={16} className="text-danger group-hover:text-glow text-danger" />
                    </div>
                    <h3 className="font-display font-semibold text-primary group-hover:text-danger transition-colors">Macro Pulse</h3>
                </div>
                <div className="flex-1 space-y-3 relative z-10">
                    {macroPreview.map(m => (
                        <div key={m.label} className="flex justify-between items-center">
                            <div className="flex flex-col">
                                <span className="text-muted font-mono text-xs">{m.label}</span>
                            </div>
                            <span className="font-mono text-primary font-semibold">{m.value}</span>
                        </div>
                    ))}
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex justify-between items-center text-xs font-mono text-muted uppercase tracking-widest group-hover:text-danger transition-colors">
                    <span>Global Indices</span>
                    <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                </div>
            </Link>

            {/* Earnings Mini */}
            <Link href="/calendar" className="glass-panel rounded-xl group relative overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(245,130,13,0.15)] hover:border-amber/30 p-5">
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-10 transition-opacity bg-amber" />
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center border border-border group-hover:border-amber/30">
                        <CalendarDays size={16} className="text-amber group-hover:text-glow text-amber" />
                    </div>
                    <h3 className="font-display font-semibold text-primary group-hover:text-amber transition-colors">Up Next</h3>
                </div>
                <div className="flex-1 space-y-3 relative z-10">
                    {calendar.length === 0 ? (
                        <div className="text-muted text-xs animate-pulse">Syncing dates...</div>
                    ) : (
                        calendar.map((c, i) => (
                            <div key={i} className="flex justify-between items-center">
                                <span className="text-muted font-mono text-[10px] uppercase truncate max-w-[120px]" title={c.company}>
                                    {c.company}
                                </span>
                                <span className="font-mono text-xs text-primary bg-surface-raised px-1.5 py-0.5 rounded ml-2 whitespace-nowrap border border-[var(--color-border)]">
                                    {c.category}
                                </span>
                            </div>
                        ))
                    )}
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex justify-between items-center text-xs font-mono text-muted uppercase tracking-widest group-hover:text-amber transition-colors">
                    <span>Full Calendar</span>
                    <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
                </div>
            </Link>

        </div>
    );
}
