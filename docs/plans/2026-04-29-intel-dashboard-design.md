# Intel Dashboard — Design Doc

**Date:** 2026-04-29
**Status:** Approved (in brainstorming session)
**Owner:** Sunidhi Capital Research
**Route:** `/intel`

---

## Problem

Equity analysts spend hours reading concall transcripts and cross-referencing what management *promised* in one quarter against what they *delivered* in the next. Today this is done by hand, kept in personal spreadsheets, and rarely persists across analysts or quarters. There is no tool that surfaces "across the last 8 quarters, HDFC Bank management has missed 3 of 5 credit-cost guidance calls" at a glance.

The intel dashboard solves exactly this: a per-company table of every forward-looking claim management has made, with a hit / miss / partial / pending verdict against actual quarterly fundamentals.

## Scope

**MVP — two companies, manual ingestion:**
- `BAJAJFINSV` (sector: `insurance-holding`)
- `HDFCBANK` (sector: `bank`)
- Source: Bloomberg / CIQ Excel exports (already in `Concall Data/Fundamental data/`)
- Source: PDF concall transcripts (already in `Concall Data/`)

**Out of scope for MVP:**
- BSE XBRL ingestion (deferred to NSE-500 scaling phase)
- Auto-fetching new transcripts from IR pages
- In-app annotation / editing of claims
- Cross-company comparison views
- Per-speaker accountability views
- CSV export from the dashboard

## High-level architecture

Pre-computed batch pipeline. Dashboard is a thin reader of JSON files on disk.

```
Concall Data/                                data/intelligence/
├── *.pdf                                    ├── registries/
└── Fundamental data/                        │   ├── insurance-holding.json
    └── *.xlsx                               │   └── bank.json
                                             └── {SYMBOL}/
                  ┌────────┐                     ├── meta.json
                  │  CLI   │ ──────────────►     ├── transcripts/Q*.txt
                  │ rebuild│                     ├── fundamentals.json
                  └───┬────┘                     ├── claims.json
                      │                          └── checks.json
                      └─── reads source, writes intelligence
                                                                    ▲
                            ┌───────────────────────────────────────┘
                            │ reads only
                  ┌─────────┴─────────┐
                  │  /intel dashboard │
                  └───────────────────┘
```

**Source data is never modified.** Source PDFs and Excels live where the user puts them; the pipeline only reads.

## Pipeline

Four stages, each idempotent, each writing one artifact.

```
1. parseExcel       (in: .xlsx + registry)         →  fundamentals.json
2. cleanTranscripts (in: PDFs in Concall Data/)    →  transcripts/*.txt + meta.json
3. extractClaims    (in: transcripts + registry)   →  claims.json    [LLM, Claude Haiku]
4. crossCheck       (in: claims + fundamentals)    →  checks.json    [LLM, Claude Sonnet]
```

Stages 1 and 2 are independent. Stage 3 depends on 2. Stage 4 depends on 1 + 3.

### Stage 1 — `parseExcel`

Reads `Concall Data/Fundamental data/{Bajaj finserve|HDFC}.xlsx` and emits `data/intelligence/{SYMBOL}/fundamentals.json`.

Algorithm:
1. Load workbook with `xlsx` (SheetJS).
2. For each metric in the sector's registry, look up `excel.sheet`, scan column-A/B/C for any of `excel.rowLabelMatch[]` (case-insensitive substring, first hit wins).
3. From the header rows, build a column → quarter index by parsing dates (`2025-12-31`) and Bloomberg labels (`FQ3 2026`) into Indian-FY quarter labels (`Q3-FY26`).
4. Read values; convert millions to crores by dividing by 10 (Bloomberg's `/10^6` fields). Ratios stay as-is.
5. `--` placeholder → `null`.
6. Append to `warnings[]` any metric whose row could not be located.

Output schema:
```ts
interface Fundamentals {
  symbol: string;
  ticker: string;        // Bloomberg ticker (e.g. "BJFIN IN")
  unit: "Cr";
  quarters: {
    [quarterLabel: string]: {  // "Q3-FY26"
      endDate: string;          // "2025-12-31"
      metrics: { [registryKey: string]: number | null };
    };
  };
  estimates?: { [quarterLabel: string]: { ... } };
  warnings: string[];
}
```

### Stage 2 — `cleanTranscripts`

Reads PDFs in `Concall Data/` and emits one cleaned `.txt` per quarter under `data/intelligence/{SYMBOL}/transcripts/`.

Algorithm:
1. Extract text with `pdf2json`.
2. If output is < 5,000 chars from a > 50KB PDF, fall back to a Python `pdfminer.six` helper invoked via `child_process`.
3. Detect `(symbol, quarter)`:
   - Bajaj Finserv files have descriptive names (`Earnings Call Transcript Q3-FY26.pdf`).
   - HDFC Bank files are UUID-named — read the first page header (`HDFC Bank Limited / July 19, 2025`) and map the call date to a quarter.
4. Strip the regulatory cover letter (HDFC Bank PDFs prefix the transcript with 1-2 pages of `Ref. No. SE/...`). Heuristic: skip everything before the first occurrence of `"Moderator:"` or `"Conference Call"`.
5. Strip recurring page footers via frequency-based filter (any short line appearing >3 times is likely a header/footer).
6. Dedupe across multiple input files for the same `(symbol, quarter)`; keep the longer text, log a `duplicate-skipped` warning.
7. Write `Q{n}-FY{yy}.txt`. Update `meta.json` with the inventory.

### Stage 3 — `extractClaims` (LLM, Claude Haiku)

For each transcript, one LLM call. Output: list of forward-looking claims, each tied to a registry metric.

```ts
interface ExtractedClaim {
  metricKey: string;            // exact key from registry
  quote: string;                // verbatim, ≤ 300 chars
  speaker: string | null;
  direction: "value" | "range" | "up" | "down" | "stable";
  value: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  qualitativeText: string | null;  // "moderately", "meaningfully"
  targetQuarter: string | null;    // "Q3-FY26"
  targetText: string;              // verbatim "by H2 FY26"
  confidence: "high" | "medium" | "low";
  conditional: string | null;
}
```

`claims.json` shape:
```ts
{
  symbol: string;
  promptVersion: number;
  model: string;
  generatedAt: string;
  registryHash: string;
  byQuarter: { [sourceQuarter: string]: ExtractedClaim[] };
  warnings: string[];
}
```

Prompt strategy:
- System role: senior research analyst, extreme precision, only registry metrics.
- Inject registry as JSON (keys, labels, aliases, descriptions, units).
- Hard rejection rules: past-tense, vague optimism, industry/macro, Q&A clarifications.
- Few-shot examples (2 accept, 2 reject).
- `response_format: { type: "json_object" }`.
- Speaker inference: look back from the quote to the most recent paragraph header; null if unresolved.

Cost: ~12 transcripts × $0.04 = ~$0.50 to backfill both companies.

### Stage 4 — `crossCheck` (LLM, Claude Sonnet)

For each `(symbol, targetQuarter)` pair, one LLM call. Inputs: all claims that target this quarter + the quarter's actuals from `fundamentals.json` + the registry.

```ts
interface ClaimCheck {
  claimId: string;            // FK to ExtractedClaim
  metricKey: string;
  sourceQuarter: string;      // when the claim was made
  targetQuarter: string;      // when it was supposed to materialize
  status: "hit" | "miss" | "partial" | "no-data" | "pending" | "ambiguous";
  actualValue: number | null;
  actualUnit: string;
  reasoning: string;           // 2-3 sentence judgment
  deltaText: string;
  conditionalApplied: boolean;
  conditionalNote: string | null;
}
```

Status taxonomy:
- `hit` — actual met or beat the promise (respecting `direction: lower-is-better/higher-is-better`).
- `miss` — clearly outside tolerance.
- `partial` — directionally right but short.
- `no-data` — actual unavailable in `fundamentals.json`.
- `pending` — target quarter is in the future or not yet ingested.
- `ambiguous` — claim too qualitative to verify; tracked for prompt tuning.

Tolerance rules (in prompt; LLM applies with judgment):
- Growth/percentage claims: ±2pp → hit, ±2-5pp → partial.
- Margin/ratio in bps: ±5bps → hit, ±5-15bps → partial.
- Absolute crore values: ±3% → hit, ±3-7% → partial.
- Directional claims: any movement in promised direction → hit; flat → partial; opposite → miss.
- Range claims: within range → hit; ±5% of nearest band edge → partial.

Target-quarter resolution (in code, before LLM call):
- Explicit `targetQuarter` → use as-is.
- "next quarter" + claim made in Q1-FY26 → Q2-FY26.
- "by FY27" → Q4-FY27.
- "near-term" → source quarter +1 (note in reasoning).
- "medium-term" / "over time" → `pending` indefinitely.
- Resolved quarter > latest available actual → `pending`.

## Sector registries

One file per sector at `data/intelligence/registries/{sector}.json`. ~18 metrics each for MVP.

```ts
interface SectorRegistry {
  sector: "insurance-holding" | "bank";
  metrics: RegistryMetric[];
}

interface RegistryMetric {
  key: string;                  // stable id, e.g. "bagic_combined_ratio"
  label: string;                // UI label
  unit: "%" | "Cr" | "bps" | "x" | "ratio" | "count";
  direction: "lower-is-better" | "higher-is-better" | "neutral";
  segment: string;              // for filtering — see below
  excel: {
    sheet: string;
    rowLabelMatch: string[];    // case-insensitive substring; first hit wins
  };
  aliases: string[];            // surface forms the LLM should look for in transcripts
  description: string;          // one-line plain English for the LLM
}
```

**Segment values** (used for dashboard filtering):
- `insurance-holding`: BAGIC / BALIC / BFL / Other / Consolidated.
- `bank`: Whole Bank / Retail / Wholesale / Treasury (most metrics will be Whole Bank).

**MVP metric counts:**
- BAJAJFINSV (insurance-holding): ~18 — BAGIC: combined ratio, GWP growth, motor/health mix, loss ratio, expense ratio · BALIC: NBP growth, VNB margin, persistency 13m/61m, AUM · BFL: AUM, NIM, credit cost, gross NPA · Consolidated: revenue, PAT, solvency.
- HDFCBANK (bank): ~18 — NIM, GNPA, NNPA, PCR, credit cost, slippages, CASA, deposit growth, advance growth, retail share, NII, PAT, ROA, ROE, CET1, CRAR, cost-to-income, branch count.

Registry edits are versioned; bumping `promptVersion` invalidates Stage 3 (and 4).

## Dashboard

Route: `/intel`. Layout mirrors `/portfolio`:

- Left sidebar: company list (localStorage-persisted, key `intel_companies_v1`), search, optional CSV import.
- Right pane: header (name + sector + last call + status counters) → filter bar → claims table.

**Sidebar reuse:** `PortfolioSidebar` is generalized into a `WatchlistSidebar` taking storage key + per-row badge as props; both `/portfolio` and `/intel` consume it.

**Claims table columns:**
| Quarter Made | Speaker | Quote | Metric (segment badge) | Promise | Target Q | Actual | Status |

**Default sort:** `sourceQuarter desc, status asc (miss first)`.

**Status badges (theme-aware via CSS vars):**
- `hit` — `text-teal` ✓
- `miss` — `text-danger` ✗
- `partial` — `text-amber` ◐
- `pending` — `text-muted` ⏳
- `no-data` — `text-muted` —
- `ambiguous` — `text-muted` ?

**Row drill-down:** click row → side panel with full quote in context, LLM reasoning from `checks.json`, conditional note if any, deep-link to transcript .txt, actual-value source attribution.

**Filters:** status, segment, source quarter, target quarter, full-text search over quote/reasoning.

**Empty / partial states:**
- Company in sidebar but no built artifact → orange dot + "Run `npm run intel:rebuild SYMBOL`".
- Built but zero claims → "No tracked claims found in N transcripts. Check `meta.json` warnings."
- Single claim with `no-data` actual → row shows "—" with hover tooltip naming the missing metric.

**API routes:**
- `GET /api/intel/companies` — list of built symbols (scans `data/intelligence/`).
- `GET /api/intel/[symbol]` — bundled `{ meta, registry, fundamentals, claims, checks }`.

**Performance:** total payload per company ~30-100 KB. Fetched once on company select; filters/sort run client-side. No DB. Virtualization deferred until > 500 claims per company.

**OmniCore navigation:** new icon next to portfolio briefcase. Lucide `Telescope` or `ScanSearch`.

## CLI

```bash
npm run intel:rebuild BAJAJFINSV                        # all stages, cached where possible
npm run intel:rebuild BAJAJFINSV --stage=extractClaims  # one stage only
npm run intel:rebuild BAJAJFINSV --force                # bypass all caches
npm run intel:rebuild --all                             # every registered company
```

Cache keys: each stage's output stores hashes of its inputs. Stage 3 caches per-transcript; Stage 4 caches per-(target-quarter). `--force` overrides.

## Failure model

Every stage fails soft:

| Failure | Behavior |
|---|---|
| Registry metric not found in Excel | Warning to `meta.json`, value = `null`. Run continues. |
| PDF extraction returns <5k chars from a >50KB PDF | Try Python fallback. If that fails, mark transcript failed in meta. Skip in Stage 3. |
| LLM API call fails | Retry 3× with exponential backoff (1s, 4s, 16s). Then mark unit-of-work failed. Continue. |
| LLM returns malformed JSON | Save raw response to `data/intelligence/{SYMBOL}/.debug/`. Drop output. Continue. |
| LLM returns claim with unknown `metricKey` | Drop the claim. Log to warnings. Other claims preserved. |
| Total cost > `--cost-cap` (default $5) | Abort with summary of completed work. |
| `ANTHROPIC_API_KEY` missing | **Fail loudly at start**, no silent default. |

Principle: never let one bad transcript or missing metric block the rest of the build. Partial output > no output.

## Secrets

`ANTHROPIC_API_KEY` lives in `.env.local` (already gitignored via `.env*` rule). Build script asserts presence at start.

## Cost guardrails

- Pre-flight estimate printed before any LLM stage based on token counts × model rate.
- TTY runs prompt `[y/N]` if estimate > $1; CI uses `--yes`.
- `--cost-cap` halts run if cumulative actual cost (from API headers) exceeds the cap.
- MVP backfill estimate: < $1.50 total for both companies. Recorded on first run.

## Dependencies to install

- `xlsx` (SheetJS) — Excel parsing.
- `@anthropic-ai/sdk` — Claude API.

Optional, system-level:
- Python `pdfminer.six` — fallback transcript extractor. Only invoked when `pdf2json` produces obviously broken output. Pipeline degrades gracefully if Python is absent.

## File map

```
data/intelligence/
├── registries/
│   ├── insurance-holding.json
│   └── bank.json
├── BAJAJFINSV/
│   ├── meta.json
│   ├── transcripts/Q1-FY25.txt … Q3-FY26.txt
│   ├── fundamentals.json
│   ├── claims.json
│   └── checks.json
└── HDFCBANK/ ... same shape

scripts/
├── intel-rebuild.ts                 # CLI orchestrator
└── extract-transcripts.py           # Python pdfminer fallback (optional)

lib/intel/
├── types.ts                         # shared types
├── parseExcel.ts                    # Stage 1
├── cleanTranscripts.ts              # Stage 2
├── extractClaims.ts                 # Stage 3 + prompt
├── crossCheck.ts                    # Stage 4 + prompt
├── targetResolver.ts                # quarter normalization helpers
└── anthropic.ts                     # SDK wrapper with retry, cost tracking

app/intel/
└── page.tsx
app/api/intel/
├── companies/route.ts
└── [symbol]/route.ts

components/intel/
├── IntelHeader.tsx
├── FiltersBar.tsx
├── ClaimsTable.tsx
├── ClaimRow.tsx
└── StatusBadge.tsx

components/portfolio/
├── PortfolioSidebar.tsx              # refactor → re-exported via composition
└── WatchlistSidebar.tsx              # extracted, generic, used by both pages
```

## Out of scope (deferred)

- BSE XBRL ingestion (NSE-500 phase).
- Auto-fetching transcripts from IR pages.
- In-app annotation / editing.
- Per-speaker accountability views.
- Cross-company comparison.
- Hit-rate trend chart over time.
- CSV export from dashboard.
- Section-aware transcript chunking (Mgmt Commentary vs Q&A).
- Hybrid registry + free-form claim extraction.

## Open questions

- Exact Bloomberg row labels for ~36 metrics — resolved interactively on first parser run; the `rowLabelMatch[]` array gets corrected as warnings appear.
- Whether to share `PortfolioSidebar` and `IntelSidebar` via a `WatchlistSidebar` extraction now or duplicate first and refactor later — leaning toward extracting now, but the implementation plan can decide.
