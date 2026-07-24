"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";

const GLOSSARY: { term: string; def: string }[] = [
  { term: "Total MTF Book", def: "Total value of shares currently bought on margin (borrowed money) across every tracked stock, as of today -- the WHOLE universe. Continuous Funders, the Heatmap, Sector Breakdown and Divergence all exclude immaterial/NAV-pegged symbols, so their totals won't sum to this figure -- see each panel's own note for the exact gap." },
  { term: "vs Prior Day", def: "% change in the Total MTF Book compared to the previous trading day." },
  { term: "Leveraging Up / Deleveraging", def: "Number of stocks where margin financing increased / decreased today." },
  { term: "Unchanged", def: "Number of stocks where margin financing stayed flat today, or has no comparable prior-day figure." },
  { term: "Delivery Financed %", def: "Today's NET GAIN/LOSS in the whole universe's MTF book, relative to today's total DELIVERY value (shares actually delivered -- real ownership changing hands, not all traded/intraday volume). A flow metric (day's change), not a level ratio -- signed, can be negative on a day the book shrank. Delivery value approximates each stock's delivered quantity x close price (BHAVCOPY doesn't carry a true volume-weighted delivery price)." },
  { term: "Avg Delivery %", def: "Average % of today's traded quantity that was delivered (settled as real ownership, not squared off intraday), across every tradeable stock -- a market-wide gauge of conviction vs speculative churn. A simple mean is safe here (unlike the old Median Financed % it replaced): delivery % is naturally bounded 0-100, with no unbounded-outlier risk." },
  { term: "Top Gainer / Top Loser", def: "The single stock with the largest DAY-OVER-DAY % increase / decrease in MTF financing (today vs the previous trading day only, not a multi-day or cumulative change) -- this is a change in margin financing, not in the stock's share price." },
  { term: "MTF Cont.", def: "How many of the last 5 trading days that stock's margin financing moved in the same direction. \"5/5\" = every one of the last 5 days." },
  { term: "Price Cont.", def: "The SAME stock's own price-persistence count -- how many of the last 5 trading days its share price (not its financing) moved in the same direction. Independent of MTF Cont.: a stock can show 5/5 on financing while its price only followed 1 or 2 of those days, or vice versa. This is different from Leverage vs Price Divergence below, which flags a single day's mismatch rather than a multi-day pattern." },
  { term: "MTF Chg % / Chg %", def: "Day-over-day % change in that stock's (or sector's) margin-financed amount." },
  { term: "Price Chg %", def: "Day-over-day % change in that stock's share price." },
  { term: "Book", def: "The MTF-financed amount for that stock." },
  { term: "Leverage vs Price Divergence", def: "Flags stocks where margin financing and the share price moved in OPPOSITE directions on a single day -- financing added to a falling stock, or pulled from a rising one. This is a one-day signal, unlike Price Cont./MTF Cont. above which track a multi-day pattern -- a stock can appear here without showing up as a Continuous Funder, and vice versa." },
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
