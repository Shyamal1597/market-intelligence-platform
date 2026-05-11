# Intel Dashboard — Summary Redesign
**Date:** 2026-05-08  
**Status:** Approved  
**Audience:** Senior stakeholders (primary), analysts (secondary)

---

## Problem

The current dashboard presents management guidance as a flat list of KPI rows. Stakeholders must mentally construct the story themselves — scanning individual metrics, clicking each row, reading raw LLM outputs. This is analyst workflow, not executive workflow.

Three specific complaints:
1. No synthesised narrative — no answer to "how did management perform this quarter overall?"
2. Audit trail is thin — short quote snippets, no speaker attribution, no surrounding context, no longitudinal view
3. LLM verification lacks business context — BAGIC/BALIC/BFL acronyms are opaque to the model, causing misclassification

---

## Approved Design

### Approach: Precomputed narrative (Stage 5 pipeline)

A new `generateSummaries` script runs once after crosscheck and writes `data/intelligence/{SYMBOL}/summaries/{quarter}.json`. The dashboard reads this cached file instantly — no per-request LLM cost or latency.

---

## Data Structures

### New artifact: `data/intelligence/{SYMBOL}/summaries/{quarter}.json`

```typescript
interface QuarterSummary {
  symbol: string;
  sourceQuarter: string;         // e.g. "Q1-FY26"
  verifiedInQuarter: string;     // e.g. "Q2-FY26"
  generatedAt: string;           // ISO timestamp
  model: string;                 // Anthropic model used
  headline: string;              // 2-3 sentence analyst-note paragraph
  segments: Record<string, string>; // segment key → 1-2 sentence note
  keyThemes: string[];           // 2-4 bullet themes
  verdictCounts: {
    met: number; moving: number; miss: number;
    pending: number; ambiguous: number;
  };
  onTrackPct: number;            // (met + moving) / decisive * 100
}
```

**Example:**
```json
{
  "symbol": "BAJAJFINSV",
  "sourceQuarter": "Q1-FY26",
  "verifiedInQuarter": "Q2-FY26",
  "headline": "BAJAJ FinServ broadly delivered on Q1-FY26 guidance. BAGIC maintained GWP momentum and PAT growth, though the loss ratio widened on crop claim spill-over that management attributes to a one-off. BALIC's VNB margin expansion is on track and BFL NIM remains the key metric to watch.",
  "segments": {
    "BAGIC": "GWP grew 9% as guided. PAT up 6% QoQ. Loss ratio widened to 72.5 bps on crop claim timing — management expects normalisation in Q3.",
    "BALIC": "New Business Premium grew 9% in line with guidance. VNB margin at 11.1% tracking toward the guided 4.2% expansion.",
    "BFL": "NIM at 10.8% vs guided 11% — moving but not yet there. Gross NPA stable at guided levels.",
    "Consolidated": "PAT up 30% YoY in line with management trajectory. Solvency ratio strong at 312%."
  },
  "keyThemes": [
    "BAGIC crop claim spill-over is a one-time headwind, not structural",
    "BALIC momentum strong across NBP and margin",
    "BFL NIM the one metric to watch next quarter"
  ],
  "verdictCounts": { "met": 2, "moving": 8, "miss": 1, "pending": 0, "ambiguous": 0 },
  "onTrackPct": 91
}
```

### Extended `ClaimCheck` fields (checks.json)

Three new fields added to each `ClaimCheck`:

```typescript
interface ClaimCheck {
  // ... existing fields ...
  context: string | null;   // ±500 chars around the quote in the target transcript
  speaker: string | null;   // who said it in the target transcript
  section: string | null;   // "prepared remarks" | "Q&A" | null
}
```

`context` is extracted post-LLM: after the model returns its `quote`, we find that text in the full transcript and grab ±500 surrounding characters. This is display-only — not an LLM input.

`speaker` and `section` are extracted by the LLM as new output fields in the Stage 4 prompt.

---

## Pipeline Changes

### Stage 4 — crossCheck (two changes only, no chunking)

**Change 1: Business context header**

Prepend a registry-derived company brief to every system prompt:

```
Company context:
{symbol} — {description}
Subsidiaries/segments being tracked:
- BAGIC (Bajaj Allianz General Insurance): combined ratio, loss ratio, GWP growth, PAT
- BALIC (Bajaj Allianz Life Insurance): NBP growth, VNB margin, persistency, AUM
- BFL (Bajaj Finance Ltd): NIM, credit cost, gross NPA, AUM
```

This is generated from `registry.metrics` grouped by segment at runtime. No hardcoding.

**Change 2: Extended output schema**

Add `speaker`, `section`, and `context` to the LLM output:

```json
{
  "claimId": "...",
  "verdict": "moving",
  "actualText": "...",
  "quote": "...",
  "speaker": "Ramandeep Singh Sahni, CFO",
  "section": "Q&A",
  "reasoning": "..."
}
```

`context` (±500 chars) is extracted from the full transcript after the LLM call completes, keyed off the returned `quote`. Not an LLM output.

Full transcript continues to be passed as-is (no chunking). Existing `--maxTranscriptChars` truncation remains as the safety valve.

Bump `STAGE4_PROMPT_VERSION` to 4.

### Stage 5 — generateSummaries (new)

**Script:** `scripts/generate-summaries.ts`  
**npm target:** `npm run intel:summaries -- <SYMBOL> [--force] [--only=Q1-FY26]`  
**Model:** `claude-sonnet-4-5` via Anthropic API (not Ollama — quality matters for prose)

**LLM call inputs:**
- System: analyst role + company brief
- User: full source transcript + full target transcript + all claims with verified checks + registry metric labels

**Logic:**
1. For each source quarter in `claims.json`:
   - Find `verifiedInQuarter` (the quarter used for most checks)
   - Load both transcripts from `data/intelligence/{SYMBOL}/transcripts/`
   - If summary already exists and `--force` not set, skip
   - Call Anthropic API, parse structured JSON response
   - Write to `data/intelligence/{SYMBOL}/summaries/{quarter}.json`
2. Skip quarters where no checks exist yet (pending pipeline run)

**Cost estimate:** ~$0.01–0.03 per quarter (two full transcripts + claims JSON ≈ 40–60k tokens input)

---

## API Changes

### New endpoint: `GET /api/intel/[symbol]/summaries/[quarter]`

Returns the cached `QuarterSummary` JSON, or `{ pending: true }` if not yet generated.

### Modified endpoint: `GET /api/intel/[symbol]`

No structural change. The existing `enriched` data continues to serve the drill-down claim rows. The summaries are fetched separately by the UI when a quarter is selected.

---

## UI Changes

### Page layout

```
[Company selector row]       BAJAJFINSV 91% ✓    HDFCBANK 59%

[Timeline strip]
  Q1 FY25   Q2 FY25   Q3 FY25   Q4 FY25   Q1 FY26 ▼  Q2 FY26
   91% ●     83% ●     76% ●     88% ●     active      pending

[Expanded quarter panel]
  ┌─ Headline paragraph ──────────────────── verdict bar ─────┐
  │ "BAJAJ FinServ broadly delivered on..."   ████░░  91%     │
  └────────────────────────────────────────────────────────────┘

  [Segment cards row]
  ┌─ BAGIC ─────────┐  ┌─ BALIC ──────────┐  ┌─ BFL ─────────┐
  │ 3 mov  1 miss   │  │ 2 met  1 mov     │  │ 2 mov         │
  │ "GWP grew 9%..."│  │ "VNB on track..."│  │ "NIM 10.8%..."│
  │ ▸ 4 claims      │  │ ▸ 3 claims       │  │ ▸ 2 claims    │
  └─────────────────┘  └──────────────────┘  └───────────────┘

  [Claim drill-down — expands inline below segment card]
    [verdict pills filter] [metric dropdown] [search]
    [claim rows — existing design, now secondary]
```

### Timeline strip (new component: `QuarterTimeline`)

- Quarters sorted chronologically, most recent active on first load
- Each tile: quarter label + on-track % + colour dot (teal ≥70%, amber ≥40%, red <40%)
- Quarters with no summary: muted tile, "—" indicator, click still works (shows claim rows without headline)
- Horizontal scroll on narrow viewports

### Headline panel (new component: `QuarterHeadline`)

- Displays `summary.headline` as a paragraph in `font-display` / `font-sans`
- Verdict bar (stacked teal/amber/red) + on-track % on the right
- Key themes shown as small pills below the paragraph
- If `summary === null` (not generated): shows a neutral placeholder — "Run `npm run intel:summaries` to generate the quarterly brief"

### Segment cards (new component: `SegmentCard`)

- One card per segment that has claims in the selected quarter
- Shows: segment name, mini verdict counts (coloured), the `summary.segments[segment]` note
- "▸ N claims" toggle expands an inline claim list directly below the card
- The existing `ClaimsTable` + `FiltersBar` render inside this expanded area

### Claim detail panel (replaces current `ClaimRow` accordion)

- **Two-column layout**: left = Q{n} Promise, right = Q{n+1} Actuals
- Each side shows: verbatim quote, speaker name, section (prepared remarks / Q&A)
- "Transcript context" collapsible section shows the `context` field (±500 chars)
- Reasoning text below the two columns
- **Longitudinal track**: a pill timeline at the bottom showing all historical checks for this `metricKey` across quarters, computed client-side from `byQuarter` data

### Removed/demoted

- Top-level `FiltersBar` (verdict pills, quarter dropdown, metric dropdown) is removed from the page header — filters now live only inside the segment card drill-down
- `IntelHeader` stat row is replaced by the timeline strip + headline panel (the numbers are still visible, just presented differently)

---

## Components to Create / Modify

| File | Action |
|------|--------|
| `lib/intel/types.ts` | Add `context`, `speaker`, `section` to `ClaimCheck`; add `QuarterSummary` type |
| `lib/intel/crossCheck.ts` | Add company brief header; extend output schema; extract `context` post-LLM; bump to v4 |
| `lib/intel/generateSummary.ts` | New — Anthropic API call, summary prompt, file writer |
| `scripts/generate-summaries.ts` | New — CLI orchestrator for Stage 5 |
| `app/api/intel/[symbol]/summaries/[quarter]/route.ts` | New — serve cached summary JSON |
| `components/intel/QuarterTimeline.tsx` | New — horizontal quarter strip |
| `components/intel/QuarterHeadline.tsx` | New — headline paragraph + verdict bar + themes |
| `components/intel/SegmentCard.tsx` | New — segment tile with drill-down |
| `components/intel/ClaimDetail.tsx` | New — two-column before/after audit trail panel |
| `components/intel/IntelDashboard.tsx` | Restructure to use new components |
| `components/intel/IntelHeader.tsx` | Remove — superseded by QuarterTimeline + QuarterHeadline |
| `components/intel/FiltersBar.tsx` | Move inside SegmentCard drill-down |
| `components/intel/ClaimRow.tsx` | Replace with ClaimDetail in drill-down context |
| `package.json` | Add `intel:summaries` script |

---

## Verification Criteria

1. `npx tsc --noEmit` — zero errors
2. `npm run intel:summaries BAJAJFINSV` — writes `summaries/Q1-FY26.json` through `summaries/Q4-FY25.json`
3. `/intel` in browser — timeline strip renders, clicking Q1-FY26 shows headline paragraph + segment cards
4. Expanding a segment card shows claim rows; expanding a claim row shows two-column audit trail with context
5. Longitudinal track renders for a metric that has been checked across multiple quarters (e.g. `bagic_gwp_growth`)
6. Claim with identical source/target quote shows the dedup correctly (no repeated blockquote)
