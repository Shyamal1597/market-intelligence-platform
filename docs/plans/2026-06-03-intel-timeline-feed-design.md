# Intel Timeline Feed — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Replace the Matrix + KPI Tracker tab layout with a single vertical timeline feed where each earnings call is a collapsible "chapter card" containing its guidance claims — making the guidance progression story immediately readable and explainable.

**Problem being solved:** The current Matrix/KPI Tracker layout is table-first, not narrative-first. An analyst cannot walk a colleague through the page and explain "how the story has been progressing." Both views require learning the UI before understanding the data.

**Inspiration:** Tijori Concall Monitor's "Management Consistency" feature — same concept, but our implementation is analyst-grade with sector registries, structured metric keys, and Stage 4 LLM cross-verification.

---

## Mental model

**Quarter-first.** The natural way an analyst explains guidance tracking:
> "In Q2 FY26, management said these 5 things. By Q3 FY26, 3 were confirmed, 1 was still moving, 1 was a miss. Now in Q3 FY26 they're saying these 2 new things — still pending."

Each earnings call is a chapter. Claims live inside chapters. Time flows top-to-bottom (newest first).

---

## Layout

```
[Controls: Upload Transcript | Sector dropdown | Company chips]

[Company summary bar]
BAJAJFINSV  ·  Insurance — Holding  ·  34 claims  ·  87% on track  ·  Q1 FY25 → Q3 FY26

[Verdict filter]
All | Met | Moving | Miss | Pending

[Timeline feed — newest first]

▼ Q3 FY26  ●  Pending verification   2 claims
  [auto-expanded — latest quarter]

▶ Q2 FY26  ✓  5 claims · 3 met · 1 moving · 1 miss · 80% on track

▶ Q1 FY26  ✓  4 claims · 100% on track

▶ Q4 FY25  ✓  ...
```

---

## Components

### 1. `GuidanceTimeline` (main, replaces `IntelMatrix` + `KPITracker`)

- Receives `byQuarter`, `registry`, `segmentDescriptions` (same props as before)
- Renders all quarters sorted newest-first as `QuarterChapter` cards
- Manages which chapters are expanded (latest 1-2 auto-open)
- Manages active verdict filter (`"all" | "met" | "moving" | "miss" | "pending"`)
- If a filter is active and all claims in a quarter are filtered out, the chapter collapses to header-only

### 2. `QuarterChapter` (collapsible chapter card)

**Collapsed state:**
```
▶  Q2 FY26   ✓ verified via Q3 transcript   5 claims · 3 met · 1 moving · 1 miss · 80% on track
```

**Expanded state:**
```
▼  Q2 FY26   ✓ verified via Q3 transcript   5 claims · 80% on track
   ┄ BAGIC — Bajaj Allianz General Insurance
   [GuidanceClaimCard] × N
   ┄ BALIC — Bajaj Allianz Life Insurance
   [GuidanceClaimCard] × N
   ┄ BFL — Bajaj Finance
   [GuidanceClaimCard] × N
```

Props:
- `quarter: string` — e.g. "Q2-FY26"
- `claims: EnrichedClaim[]`
- `verifiedByQuarter: string | null` — next quarter's key used for verification
- `registry: RegistryEntry[]`
- `segmentDescriptions: Record<string, string>`
- `defaultOpen: boolean`
- `verdictFilter: VerdictFilter`

Behaviour:
- Toggle open/close on header click
- Segment dividers are thin (`text-muted/40 text-[10px] uppercase`) — claims are the focus
- Segments with 0 visible claims (after filtering) are hidden entirely

### 3. `GuidanceClaimCard` (individual claim card)

**Structure:**
```
┌─ [MET] ─────────────────────────────────────────────────────┐  ← left border = verdict colour
│  Combined Ratio                        BAGIC                 │  ← metric label + segment chip
│  ↗ Remain close to 100%                                     │  ← targetText
│                                                               │
│  "Underwriting losses are a little on the higher side...    │  ← guidance quote (sentence-aware
│   we believe the combined ratio for Bajaj General will       │    truncation, expandable)
│   still be amongst the lowest in the multiline market."      │
│  — MD & CEO, Q2 FY26 concall                                 │  ← speaker
│                                                               │
│  ── Verified in Q3 FY26 ──────────────────────────────────  │
│  "The combined ratio stood at 97.9%, outperforming           │  ← check.actualText
│   expectations."                                             │
│  Reasoning: transcript explicitly confirms growth resumed    │  ← check.reasoning (collapsed by
│  [show more]                                                  │    default, expandable)
└───────────────────────────────────────────────────────────────┘
```

**Pending (no verification yet):**
```
┌─ [PENDING] ─────────────────────────────────────────────────┐
│  Loss Ratio                            BAGIC                 │
│  ↗ Decline                                                   │
│                                                               │
│  "We're focused on reducing the loss ratio through..."       │
│  — CFO, Q3 FY26 concall                                      │
│                                                               │
│  Awaiting Q4 FY26 transcript                                 │
└───────────────────────────────────────────────────────────────┘
```

Left border colour:
- `met` → `border-teal/60`
- `moving` → `border-amber/60`
- `miss` → `border-danger/60`
- `pending` → `border-border/40`
- `ambiguous` → `border-border/20`

Props: `claim: EnrichedClaim`, `registry: RegistryEntry[]`, `segmentDescriptions: Record<string, string>`

### 4. `CompanySummaryBar`

```
BAJAJFINSV  ·  Insurance — Holding  ·  34 claims  ·  87% on track  ·  Q1 FY25 → Q3 FY26
```

Derived entirely from `byQuarter` + `registry`. Shows:
- Symbol (bold, amber)
- Sector label
- Total claim count
- On-track % (decisive verdicts only: met + moving / total decisive)
- Date range: earliest quarter → latest quarter

### 5. `VerdictFilterBar`

Pill row: `All | Met | Moving | Miss | Pending`

Active pill: `bg-amber/10 border-amber/30 text-amber`. Inactive: `text-muted border-border`.

---

## What gets removed

| Removed | Replaced by |
|---|---|
| `IntelMatrix` | `GuidanceTimeline` |
| `KPITracker` | (not replaced — timeline tells the same story) |
| Quarter compare picker | (not needed — all quarters always shown) |
| View mode toggle (Matrix / KPI) | (not needed — single view) |
| `MAX_COLUMNS` / `showAllQuarters` logic | (not needed) |
| `selectedQuarters` state | (not needed) |

The `SegmentCard` and `ClaimRow` components can remain as-is — `GuidanceClaimCard` is a new component that presents the same data differently.

---

## IntelDashboard changes

Remove:
- `viewMode` state
- `selectedQuarters` state
- `showAllQuarters` state
- Quarter picker JSX block
- View toggle JSX block
- `IntelMatrix` import
- `KPITracker` import

Add:
- `GuidanceTimeline` import
- Pass `byQuarter`, `registry`, `segmentDescriptions` to `GuidanceTimeline`
- `CompanySummaryBar` rendered between company chips and timeline
- `summaries` prop removed from timeline (LLM summaries not used in this design — raw claims tell the story directly)

The sector dropdown, company chips, and upload button are **unchanged**.

---

## Data flow

No API changes needed. `GuidanceTimeline` consumes the same `IntelData` shape from `/api/intel/[symbol]`:

```typescript
interface IntelData {
  byQuarter: Record<string, EnrichedClaim[]>;
  registry: Array<{ key: string; label: string; unit: string; segment: string }>;
  segmentDescriptions: Record<string, string>;
}
```

`EnrichedClaim.check` provides the verdict, actualText, verifiedInQuarter, reasoning — all already present.

---

## Quarter ordering logic

All quarters from `byQuarter` sorted newest-first via existing `sortQuarters()` utility, then reversed:

```typescript
const quarters = [...sortQuarters(Object.keys(byQuarter))].reverse();
// ["Q3-FY26", "Q2-FY26", "Q1-FY26", "Q4-FY25", ...]
```

"Verified by" attribution: for quarter `q`, find the claim where `check.verifiedInQuarter` is set — that's the verification source. If any claim in the quarter has a decisive verdict, show "verified via {verifiedInQuarter} transcript".

---

## New files

- `components/intel/GuidanceTimeline.tsx` — main timeline component
- `components/intel/QuarterChapter.tsx` — collapsible chapter card
- `components/intel/GuidanceClaimCard.tsx` — individual claim card
- `components/intel/CompanySummaryBar.tsx` — company stats line
- `components/intel/VerdictFilterBar.tsx` — filter pill row

---

## TypeScript

`npx tsc --noEmit` must pass. All new components use existing types from `@/lib/intel/types` and `./ClaimRow`. No new type definitions needed.
