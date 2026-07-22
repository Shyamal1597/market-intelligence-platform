"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";

const GLOSSARY: { term: string; def: string }[] = [
  { term: "Total MTF Book", def: "Total value of shares currently bought on margin (borrowed money) across every tracked stock, as of today." },
  { term: "vs Prior Day", def: "% change in the Total MTF Book compared to the previous trading day." },
  { term: "Leveraging Up / Deleveraging", def: "Number of stocks where margin financing increased / decreased today." },
  { term: "Unchanged", def: "Number of stocks where margin financing stayed flat today, or has no comparable prior-day figure." },
  { term: "Turnover Financed %", def: "Share of today's total market trading value that was done using margin financing -- a market-wide average, not any single stock." },
  { term: "Top Gainer / Top Loser", def: "The single stock with the largest % increase / decrease in MTF financing today -- this is a change in margin financing, not in the stock's share price." },
  { term: "Cont.", def: "How many of the last 5 trading days that stock's margin financing moved in the same direction. \"5/5\" = every one of the last 5 days." },
  { term: "MTF Chg % / Chg %", def: "Day-over-day % change in that stock's (or sector's) margin-financed amount." },
  { term: "Price Chg %", def: "Day-over-day % change in that stock's share price." },
  { term: "Book", def: "The MTF-financed amount for that stock." },
  { term: "Leverage up/down, price up/down", def: "Flags days where margin financing and the share price moved in OPPOSITE directions -- financing added to a falling stock, or pulled from a rising one." },
];

export function MtfGlossary() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-mono text-muted">
          <BookOpen className="w-3.5 h-3.5 text-amber" />
          Glossary -- what these terms mean
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
      </button>

      {expanded && (
        <div className="border-t border-border/60 divide-y divide-border/40">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="flex flex-col sm:flex-row gap-1 sm:gap-4 px-4 py-2.5">
              <span className="sm:w-56 shrink-0 text-xs font-mono font-semibold text-primary">
                {g.term}
              </span>
              <span className="text-xs text-muted leading-relaxed">
                {g.def}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
