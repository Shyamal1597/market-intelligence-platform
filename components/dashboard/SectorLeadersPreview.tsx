"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutGrid, ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { clsx } from "clsx";
import type { QuoteData } from "@/lib/yahoo-finance";

export function SectorLeadersPreview() {
    const [sectors, setSectors] = useState<QuoteData[]>([]);

    useEffect(() => {
        // Fetch 12 sectors to fill the full horizontal band layout
        fetch("/api/sectors").then(r => r.json()).then(d => setSectors(d.quotes?.slice(0, 12) || []));
    }, []);

    return (
        <Link href="/sectors" className="glass-panel rounded-2xl group relative overflow-hidden flex flex-col transition-all duration-500 hover:shadow-lg hover:shadow-amber-500/5 hover:border-white/10 p-5 w-full">
            {/* Ambient background glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            {/* Header */}
            <div className="flex items-center gap-3 mb-5 relative z-10">
                <span className="font-display font-semibold tracking-wide text-amber text-sm uppercase">
                    Sector Leaders
                </span>
                <div className="flex-1 h-px bg-border-strong" />
                <span className="font-mono text-[10px] text-amber hover:underline hover:text-glow ml-1 transition-all">
                    Heatmap →
                </span>
            </div>

            {/* Data Grid */}
            <div className="flex-1 grid grid-cols-2 lg:grid-cols-5 gap-3 relative z-10">
                {sectors.length === 0 ? (
                    <div className="text-muted text-xs animate-pulse col-span-full py-4">Syncing live sector data...</div>
                ) : (
                    sectors.map(s => {
                        const isPos = s.changePercent >= 0;
                        return (
                            <div key={s.symbol} className="flex flex-col p-3 rounded-xl border border-border bg-surface-raised hover:bg-white/[0.04] transition-colors group/card hover:border-amber/30">
                                <span className="text-primary font-mono text-xs mb-1.5 truncate group-hover/card:text-amber transition-colors">
                                    {s.label.replace("NIFTY ", "")}
                                </span>
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-sm text-primary font-semibold">
                                        ₹{s.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                    </span>
                                    <div className={clsx("flex items-center gap-1 font-mono text-xs font-semibold px-1.5 py-0.5 rounded", isPos ? "text-teal bg-teal/10" : "text-danger bg-danger/10")}>
                                        {isPos ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                        {isPos ? "+" : ""}{s.changePercent.toFixed(2)}%
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </Link>
    );
}
