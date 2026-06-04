# Intel Timeline Feed — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Matrix + KPI Tracker tab layout with a single vertical timeline feed where each earnings call is a collapsible chapter card containing its guidance claims.

**Architecture:** Five new leaf components (`CompanySummaryBar`, `VerdictFilterBar`, `GuidanceClaimCard`, `QuarterChapter`, `GuidanceTimeline`) built bottom-up, then `IntelDashboard` rewired to use them. Old `IntelMatrix` and `KPITracker` are abandoned in-place (not deleted) — simply removed from imports.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS (CSS-var classes only), Lucide React, existing `@/lib/intel/types` + `@/lib/intel/uiHelpers`.

---

## Context for implementer

The `/intel` page is a Management Guidance Tracker. An analyst selects a company (e.g. BAJAJFINSV) and sees forward-looking claims made in each earnings call, verified against the next quarter's transcript.

**Key existing types** in `components/intel/ClaimRow.tsx`:
```typescript
export interface EnrichedClaim {
  id: string;
  metricKey: string;
  metricLabel: string;
  metricUnit: string;
  quote: string;
  speaker: string | null;
  direction: string;
  value: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  qualitativeText: string | null;
  targetText: string;
  targetQuarter: string | null;
  resolvedTargetQuarter: string | null;
  confidence: string;
  conditional: string | null;
  check: {
    verdict: Verdict;
    verifiedInQuarter: string;
    actualText: string | null;
    quote: string | null;
    reasoning: string;
  } | null;
}
```

**`Verdict`** in `lib/intel/types.ts`: `"met" | "moving" | "miss" | "pending" | "ambiguous"`

**Utility functions** in `lib/intel/uiHelpers.ts`:
- `sortQuarters(quarters: string[]): string[]` — sorts `"Q3-FY26"` format chronologically
- `quarterDisplay(q: string): string` — `"Q3-FY26"` → `"Q3 FY26"`

**Color system** (CSS variables, always use these — never hardcode hex):
- `text-teal` / `border-teal` / `bg-teal` — met / positive
- `text-amber` / `border-amber` / `bg-amber` — moving / accent
- `text-danger` / `border-danger` / `bg-danger` — miss / negative
- `text-muted` — secondary text
- `text-primary` — primary text
- `bg-surface` — card backgrounds
- `bg-base` — page background
- `border-border` — borders
- Opacity modifier: `/60` `/40` `/10` etc. all work with these CSS-var classes

**TypeScript check**: `npx tsc --noEmit` — must pass after every task.

---

## Task 1: Add `snippetQuote` to `lib/intel/uiHelpers.ts`

**Files:**
- Modify: `lib/intel/uiHelpers.ts`

`snippetQuote` is currently duplicated in `KPITracker.tsx`. Extract it to the shared utility module so `GuidanceClaimCard` can use it.

**Step 1: Append `snippetQuote` to the end of `lib/intel/uiHelpers.ts`**

Add this block at the end of the file (after the `sortQuarters` function):

```typescript
// ── Quote helpers ─────────────────────────────────────────────────────────────

/**
 * Return a readable quote snippet that ends at a sentence boundary.
 * Cuts at the last `.` / `!` / `?` before maxLen so the reader gets a
 * complete thought rather than an abruptly truncated fragment.
 */
export function snippetQuote(quote: string, maxLen = 320): string {
  if (quote.length <= maxLen) return quote;

  const window = quote.slice(0, maxLen);

  const lastEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf(".\n"),
  );

  if (lastEnd > maxLen * 0.45) {
    return window.slice(0, lastEnd + 1).trimEnd();
  }

  const lastSpace = window.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.7 ? window.slice(0, lastSpace) : window) + "…";
}
```

**Step 2: Verify TypeScript**

```
cd D:\Sunidhi-Intranet-Futuristic
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add lib/intel/uiHelpers.ts
git commit -m "refactor(intel): extract snippetQuote to uiHelpers"
```

---

## Task 2: Create `VerdictFilterBar`

**Files:**
- Create: `components/intel/VerdictFilterBar.tsx`

This exports both the `VerdictFilter` type (used by `QuarterChapter` and `GuidanceTimeline`) and the filter pill row component.

**Step 1: Create the file**

```tsx
"use client";

import type { Verdict } from "@/lib/intel/types";

export type VerdictFilter = "all" | Verdict;

interface Props {
  active: VerdictFilter;
  onChange: (f: VerdictFilter) => void;
}

const FILTERS: Array<{ key: VerdictFilter; label: string }> = [
  { key: "all",       label: "All" },
  { key: "met",       label: "Met" },
  { key: "moving",    label: "Moving" },
  { key: "miss",      label: "Miss" },
  { key: "pending",   label: "Pending" },
];

export function VerdictFilterBar({ active, onChange }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
            active === key
              ? "bg-amber/10 border-amber/30 text-amber"
              : "border-border bg-surface text-muted hover:text-primary hover:border-border/60"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/intel/VerdictFilterBar.tsx
git commit -m "feat(intel): VerdictFilterBar component + VerdictFilter type"
```

---

## Task 3: Create `CompanySummaryBar`

**Files:**
- Create: `components/intel/CompanySummaryBar.tsx`

A single-line stats bar showing symbol · sector · claim count · on-track % · date range.

**Step 1: Create the file**

```tsx
"use client";

import { useMemo } from "react";
import { sortQuarters, quarterDisplay } from "@/lib/intel/uiHelpers";
import type { EnrichedClaim } from "./ClaimRow";

interface Props {
  symbol: string;
  /** Human-readable sector label, e.g. "Insurance — Holding" */
  sectorLabel: string;
  byQuarter: Record<string, EnrichedClaim[]>;
}

export function CompanySummaryBar({ symbol, sectorLabel, byQuarter }: Props) {
  const { totalClaims, onTrackPct, dateRange } = useMemo(() => {
    const allClaims = Object.values(byQuarter).flat();
    const total = allClaims.length;

    let met = 0, moving = 0, decisive = 0;
    for (const c of allClaims) {
      const v = c.check?.verdict;
      if (v === "met")     { met++;     decisive++; }
      else if (v === "moving") { moving++; decisive++; }
      else if (v === "miss")   { decisive++; }
    }
    const pct = decisive > 0 ? Math.round(((met + moving) / decisive) * 100) : null;

    const quarters = sortQuarters(
      Object.keys(byQuarter).filter((q) => (byQuarter[q] ?? []).length > 0)
    );
    const range =
      quarters.length >= 2
        ? `${quarterDisplay(quarters[0])} → ${quarterDisplay(quarters[quarters.length - 1])}`
        : quarters.length === 1
        ? quarterDisplay(quarters[0])
        : null;

    return { totalClaims: total, onTrackPct: pct, dateRange: range };
  }, [byQuarter]);

  const pctColor =
    onTrackPct === null ? "" :
    onTrackPct >= 70    ? "text-teal" :
    onTrackPct >= 40    ? "text-amber" : "text-danger";

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-mono py-2 border-b border-border/30">
      <span className="font-bold text-amber text-sm">{symbol}</span>
      <span className="text-muted/40">·</span>
      <span className="text-muted">{sectorLabel}</span>
      {totalClaims > 0 && (
        <>
          <span className="text-muted/40">·</span>
          <span className="text-muted">
            {totalClaims} claim{totalClaims !== 1 ? "s" : ""}
          </span>
        </>
      )}
      {onTrackPct !== null && (
        <>
          <span className="text-muted/40">·</span>
          <span className={`font-bold ${pctColor}`}>{onTrackPct}% on track</span>
        </>
      )}
      {dateRange && (
        <>
          <span className="text-muted/40">·</span>
          <span className="text-muted/60">{dateRange}</span>
        </>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/intel/CompanySummaryBar.tsx
git commit -m "feat(intel): CompanySummaryBar — symbol/sector/claims stats line"
```

---

## Task 4: Create `GuidanceClaimCard`

**Files:**
- Create: `components/intel/GuidanceClaimCard.tsx`

The core claim display unit. Shows: verdict badge, metric label, target text, guidance quote (sentence-truncated), speaker, and — when verified — the actual outcome + collapsible reasoning.

**Step 1: Create the file**

```tsx
"use client";

import { useState } from "react";
import { snippetQuote } from "@/lib/intel/uiHelpers";
import type { EnrichedClaim } from "./ClaimRow";
import type { Verdict } from "@/lib/intel/types";

interface Props {
  claim: EnrichedClaim;
}

const BORDER_COLOR: Record<string, string> = {
  met:       "border-l-teal/60",
  moving:    "border-l-amber/60",
  miss:      "border-l-danger/60",
  pending:   "border-l-border/40",
  ambiguous: "border-l-border/20",
};

const VERDICT_PILL: Record<string, string> = {
  met:       "text-teal bg-teal/10 border-teal/30",
  moving:    "text-amber bg-amber/10 border-amber/30",
  miss:      "text-danger bg-danger/10 border-danger/30",
  pending:   "text-muted bg-surface border-border",
  ambiguous: "text-muted/50 bg-surface border-border/30",
};

export function GuidanceClaimCard({ claim }: Props) {
  const [reasoningOpen, setReasoningOpen] = useState(false);

  const verdict: Verdict =
    claim.check?.verdict ?? (claim.resolvedTargetQuarter ? "pending" : "ambiguous");

  const borderClass = BORDER_COLOR[verdict] ?? "border-l-border/20";
  const pillClass   = VERDICT_PILL[verdict] ?? "text-muted border-border";

  return (
    <div className={`border-l-2 ${borderClass} pl-4 py-3 rounded-sm`}>

      {/* ── Row 1: verdict badge + metric label ── */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase border shrink-0 ${pillClass}`}
        >
          {verdict}
        </span>
        <span className="text-sm font-sans font-semibold text-primary">
          {claim.metricLabel}
        </span>
      </div>

      {/* ── Row 2: guided target ── */}
      {claim.targetText && (
        <p className="text-xs font-mono text-primary/70 mb-2 leading-snug">
          ↗ {claim.targetText}
        </p>
      )}

      {/* ── Row 3: guidance quote ── */}
      <blockquote className="text-sm font-sans text-primary/65 italic leading-relaxed mb-1">
        &ldquo;{snippetQuote(claim.quote)}&rdquo;
      </blockquote>
      {claim.speaker && (
        <p className="text-[11px] font-mono text-muted/45 mb-2">— {claim.speaker}</p>
      )}

      {/* ── Verification block (decisive/moving claims only) ── */}
      {claim.check ? (
        <div className="mt-3 pt-3 border-t border-border/25 space-y-2">
          <span className="text-[10px] font-mono text-muted/50 uppercase tracking-wider block">
            Verified in {quarterDisplay(claim.check.verifiedInQuarter)}
          </span>

          {(claim.check.actualText ?? claim.check.quote) && (
            <p className="text-sm font-sans text-primary/55 leading-relaxed">
              {snippetQuote(claim.check.actualText ?? claim.check.quote ?? "", 240)}
            </p>
          )}

          {claim.check.reasoning && (
            <>
              {reasoningOpen && (
                <p className="text-[11px] font-sans text-muted/60 leading-relaxed border-t border-border/20 pt-2">
                  {claim.check.reasoning}
                </p>
              )}
              <button
                onClick={() => setReasoningOpen((p) => !p)}
                className="text-[10px] font-mono text-muted/40 hover:text-muted transition-colors"
              >
                {reasoningOpen ? "hide reasoning ▲" : "show reasoning ▾"}
              </button>
            </>
          )}
        </div>
      ) : claim.resolvedTargetQuarter ? (
        <div className="mt-3 pt-3 border-t border-border/25">
          <span className="text-[11px] font-mono text-muted/40">
            Awaiting {quarterDisplay(claim.resolvedTargetQuarter)} transcript
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ── inline helper (avoids circular import) ────────────────────────────────────
function quarterDisplay(q: string): string {
  return q.replace("-", " ");
}
```

**Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/intel/GuidanceClaimCard.tsx
git commit -m "feat(intel): GuidanceClaimCard — verdict badge, quote, verification block"
```

---

## Task 5: Create `QuarterChapter`

**Files:**
- Create: `components/intel/QuarterChapter.tsx`

Collapsible chapter card for a single earnings call. Header shows quarter + verdict summary. Body groups claims by segment with thin dividers between segments.

**Step 1: Create the file**

```tsx
"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { sortQuarters, quarterDisplay } from "@/lib/intel/uiHelpers";
import { GuidanceClaimCard } from "./GuidanceClaimCard";
import type { EnrichedClaim } from "./ClaimRow";
import type { VerdictFilter } from "./VerdictFilterBar";
import type { Verdict } from "@/lib/intel/types";

interface Props {
  quarter: string;
  claims: EnrichedClaim[];
  registry: Array<{ key: string; label: string; unit: string; segment: string }>;
  segmentDescriptions: Record<string, string>;
  defaultOpen?: boolean;
  verdictFilter: VerdictFilter;
}

export function QuarterChapter({
  quarter,
  claims,
  registry,
  segmentDescriptions,
  defaultOpen = false,
  verdictFilter,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let met = 0, moving = 0, miss = 0, pending = 0, decisive = 0;
    for (const c of claims) {
      const v = c.check?.verdict;
      if      (v === "met")     { met++;     decisive++; }
      else if (v === "moving")  { moving++;  decisive++; }
      else if (v === "miss")    { miss++;    decisive++; }
      else                       pending++;
    }
    return { met, moving, miss, pending, decisive };
  }, [claims]);

  const onTrackPct = stats.decisive > 0
    ? Math.round(((stats.met + stats.moving) / stats.decisive) * 100)
    : null;

  // ── Verification attribution ───────────────────────────────────────────────
  const verifiedByQ = useMemo(() => {
    for (const c of claims) {
      if (c.check?.verifiedInQuarter) return c.check.verifiedInQuarter;
    }
    return null;
  }, [claims]);

  // ── Filtered claims ────────────────────────────────────────────────────────
  const visibleClaims = useMemo(() => {
    if (verdictFilter === "all") return claims;
    return claims.filter((c) => {
      const v: Verdict =
        c.check?.verdict ?? (c.resolvedTargetQuarter ? "pending" : "ambiguous");
      return v === verdictFilter;
    });
  }, [claims, verdictFilter]);

  // ── Group by segment (preserve registry order) ─────────────────────────────
  const segmentGroups = useMemo(() => {
    const groups = new Map<string, EnrichedClaim[]>();
    for (const c of visibleClaims) {
      const seg = registry.find((r) => r.key === c.metricKey)?.segment ?? "other";
      if (!groups.has(seg)) groups.set(seg, []);
      groups.get(seg)!.push(c);
    }
    return groups;
  }, [visibleClaims, registry]);

  const hasDecisive     = stats.decisive > 0;
  const hasVisibleClaims = visibleClaims.length > 0;

  // ── Verdict summary string ─────────────────────────────────────────────────
  const verdictSummary = [
    stats.met     > 0 ? `${stats.met} met`    : "",
    stats.moving  > 0 ? `${stats.moving} moving` : "",
    stats.miss    > 0 ? `${stats.miss} miss`   : "",
  ].filter(Boolean).join(" · ");

  const pctColor =
    onTrackPct === null ? "" :
    onTrackPct >= 70    ? "text-teal" :
    onTrackPct >= 40    ? "text-amber" : "text-danger";

  return (
    <div className="rounded border border-border overflow-hidden">

      {/* ── Chapter header ── */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-5 py-3.5 bg-surface hover:bg-surface/80 transition-colors text-left"
      >
        {/* Chevron */}
        <span className="text-muted/50 shrink-0">
          {open && hasVisibleClaims
            ? <ChevronDown size={13} />
            : <ChevronRight size={13} />}
        </span>

        {/* Quarter label */}
        <span className="text-sm font-mono font-bold text-amber shrink-0">
          {quarterDisplay(quarter)}
        </span>

        {/* On-track % or pending badge */}
        {hasDecisive ? (
          <span className={`text-xs font-mono font-semibold shrink-0 ${pctColor}`}>
            {onTrackPct}% on track
          </span>
        ) : (
          <span className="text-[11px] font-mono text-amber/50 shrink-0">
            ● pending verification
          </span>
        )}

        {/* Claim count + verdict breakdown */}
        <span className="text-[11px] font-mono text-muted/50">
          {claims.length} claim{claims.length !== 1 ? "s" : ""}
          {verdictSummary && ` · ${verdictSummary}`}
        </span>

        {/* Verification attribution — right-aligned */}
        {hasDecisive && verifiedByQ && (
          <span className="ml-auto text-[10px] font-mono text-muted/35 shrink-0">
            verified via {quarterDisplay(verifiedByQ)} transcript
          </span>
        )}
      </button>

      {/* ── Chapter body ── */}
      {open && hasVisibleClaims && (
        <div className="divide-y divide-border/20 bg-base/30">
          {[...segmentGroups.entries()].map(([seg, segClaims]) => (
            <div key={seg}>
              {/* Segment divider */}
              <div className="px-5 py-2 bg-surface/40 flex items-center gap-2">
                <span className="text-xs font-sans font-semibold text-primary/70">
                  {segmentDescriptions[seg] ?? seg}
                </span>
                {segmentDescriptions[seg] && (
                  <span className="text-[10px] font-mono text-muted/50 uppercase tracking-wider">
                    {seg}
                  </span>
                )}
              </div>

              {/* Claim cards */}
              <div className="px-5 py-4 space-y-5">
                {segClaims.map((c) => (
                  <GuidanceClaimCard key={c.id} claim={c} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/intel/QuarterChapter.tsx
git commit -m "feat(intel): QuarterChapter — collapsible earnings call chapter card"
```

---

## Task 6: Create `GuidanceTimeline`

**Files:**
- Create: `components/intel/GuidanceTimeline.tsx`

Composes `QuarterChapter` cards + `VerdictFilterBar`. All quarters always visible (newest first), latest auto-expanded.

**Step 1: Create the file**

```tsx
"use client";

import { useMemo, useState } from "react";
import { sortQuarters } from "@/lib/intel/uiHelpers";
import { QuarterChapter } from "./QuarterChapter";
import { VerdictFilterBar } from "./VerdictFilterBar";
import type { EnrichedClaim } from "./ClaimRow";
import type { VerdictFilter } from "./VerdictFilterBar";

interface Props {
  byQuarter: Record<string, EnrichedClaim[]>;
  registry: Array<{ key: string; label: string; unit: string; segment: string }>;
  segmentDescriptions?: Record<string, string>;
}

export function GuidanceTimeline({
  byQuarter,
  registry,
  segmentDescriptions = {},
}: Props) {
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");

  // All quarters with claims, newest first
  const quarters = useMemo(
    () =>
      [...sortQuarters(
        Object.keys(byQuarter).filter((q) => (byQuarter[q] ?? []).length > 0)
      )].reverse(),
    [byQuarter]
  );

  if (quarters.length === 0) {
    return (
      <div className="rounded border border-border bg-surface p-12 text-center text-muted font-mono text-sm">
        No claims data yet — run the pipeline to extract guidance.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Verdict filter */}
      <VerdictFilterBar active={verdictFilter} onChange={setVerdictFilter} />

      {/* Quarter chapters — newest first */}
      <div className="space-y-2">
        {quarters.map((q, i) => (
          <QuarterChapter
            key={q}
            quarter={q}
            claims={byQuarter[q] ?? []}
            registry={registry}
            segmentDescriptions={segmentDescriptions}
            defaultOpen={i === 0}
            verdictFilter={verdictFilter}
          />
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/intel/GuidanceTimeline.tsx
git commit -m "feat(intel): GuidanceTimeline — vertical timeline feed with verdict filter"
```

---

## Task 7: Wire `IntelDashboard`

**Files:**
- Modify: `components/intel/IntelDashboard.tsx`

Replace the Matrix/KPI Tracker rendering with the new timeline. Remove all quarter-compare state, view-mode toggle, summaries fetching.

**Step 1: Update imports**

Remove these imports:
```typescript
import { LayoutGrid, TrendingUp } from "lucide-react";   // remove
import { IntelMatrix } from "./IntelMatrix";               // remove
import { KPITracker } from "./KPITracker";                 // remove
import type { QuarterSummary } from "@/lib/intel/types";  // remove
```

Add these imports:
```typescript
import { GuidanceTimeline } from "./GuidanceTimeline";
import { CompanySummaryBar } from "./CompanySummaryBar";
```

The `ChevronDown` import stays (still used by `SectorDropdown`).

**Step 2: Remove state variables**

Inside `IntelDashboard()`, remove these state declarations:
```typescript
// REMOVE these:
const [summaries, setSummaries] = useState<Record<string, QuarterSummary | null>>({});
const [summariesLoading, setSummariesLoading] = useState(false);
const [selectedQuarters, setSelectedQuarters] = useState<string[]>([]);
const [showAllQuarters, setShowAllQuarters] = useState(false);
const [viewMode, setViewMode] = useState<"matrix" | "kpi">("matrix");
```

**Step 3: Simplify `loadSymbol`**

In `loadSymbol`, remove the entire summary-fetching block (everything after `setData(d)` and `setLoading(false)`). The simplified version:

```typescript
const loadSymbol = useCallback((sym: string) => {
  setLoading(true);
  setError(null);
  setData(null);

  fetch(`/api/intel/${sym}`)
    .then(async (r) => {
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: "unknown" }));
        throw new Error(e.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<IntelData>;
    })
    .then((d) => {
      setData(d);
      setLoading(false);
    })
    .catch((e) => { setError(e.message); setLoading(false); });
}, []);
```

**Step 4: Remove derived state / memos that are no longer needed**

Remove these memos entirely (they were only needed for the old matrix/picker):
```typescript
// REMOVE:
const allQuarters = useMemo(...);
const verifiedSet = useMemo(...);
const sortedQuarters = useMemo(...);
const segments = useMemo(...);
// REMOVE the toggleQuarter function
// REMOVE the useEffect that auto-selects quarters
// REMOVE the useEffect that resets showAllQuarters on symbol switch
```

Keep `sectorCompanies` and `sectorStats` memos — still needed.

**Step 5: Update the render block**

Replace the entire `{!loading && !error && data && (...)}` block with:

```tsx
{!loading && !error && data && (
  <>
    {/* Company summary bar */}
    <CompanySummaryBar
      symbol={selectedSymbol}
      sectorLabel={SECTOR_LABELS[selectedSector] ?? selectedSector}
      byQuarter={data.byQuarter}
    />

    {/* Meta line */}
    <div className="flex flex-wrap gap-3 text-[10px] font-mono text-muted">
      <span>{data.model}</span>
      {!data.hasChecks && (
        <><span>·</span><span className="text-amber">cross-checks pending</span></>
      )}
    </div>

    {/* Timeline feed */}
    <GuidanceTimeline
      byQuarter={data.byQuarter}
      registry={data.registry}
      segmentDescriptions={data.segmentDescriptions}
    />

    {/* Pipeline warnings */}
    {data.warnings.length > 0 && (
      <details className="text-[11px] font-mono text-muted">
        <summary className="cursor-pointer hover:text-primary">
          {data.warnings.length} pipeline warning{data.warnings.length !== 1 ? "s" : ""}
        </summary>
        <ul className="mt-2 space-y-0.5 pl-4">
          {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      </details>
    )}
  </>
)}
```

**Step 6: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors. If TypeScript complains about unused imports that you forgot to remove, clean them up.

**Step 7: Commit**

```bash
git add components/intel/IntelDashboard.tsx
git commit -m "feat(intel): wire GuidanceTimeline into IntelDashboard, remove matrix/KPI tabs"
```

---

## Task 8: Verify in browser

**Step 1: Start dev server**

```
npm run dev
```

Server starts on port 3001 (already in use from other session, may need `--port 3002`).

**Step 2: Open `/intel` and verify:**

- [ ] Page loads without console errors
- [ ] Company summary bar shows `BAJAJFINSV · Insurance — Holding · N claims · X% on track · Q1 FY25 → Q3 FY26`
- [ ] Latest quarter (Q3 FY26) auto-expands
- [ ] Older quarters are collapsed, click to expand
- [ ] Within expanded chapter: segment dividers (BAGIC, BALIC, BFL) followed by claim cards
- [ ] Claim cards show: verdict pill, metric name, target, quote, speaker
- [ ] Verified claims show "Verified in Q{N+1}" section with actual text
- [ ] Pending claims show "Awaiting Q4 FY26 transcript"
- [ ] "show reasoning ▾" toggle works on verified claims
- [ ] Verdict filter pills (All / Met / Moving / Miss / Pending) filter claims correctly
- [ ] Filtering out all claims in a chapter collapses it to header-only

**Step 3: Final TypeScript check**

```
npx tsc --noEmit
```

Expected: no errors.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(intel): timeline feed complete — quarter-first narrative layout"
```

---

## What is NOT changed

- `IntelMatrix.tsx` — left in place but unused (safe to delete later)
- `KPITracker.tsx` — left in place but unused (safe to delete later)
- `SegmentCard.tsx` — left in place, still used by `IntelMatrix` if someone re-imports
- `ClaimRow.tsx` — left in place, still used elsewhere in the Intel dashboard detail views
- `/api/intel/*` — no API changes needed
- `lib/intel/types.ts` — no changes needed
- `SECTOR_LABELS`, `SectorDropdown`, `CompanyChip` in `IntelDashboard.tsx` — unchanged
