# Intel Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **For LLM-stage tasks (5, 7, 9, 10):** ALSO invoke `claude-api` skill before implementing. It enforces prompt-caching, model versioning, and SDK best practices for Anthropic SDK code.
> **Source of truth:** see the design doc at `docs/plans/2026-04-29-intel-dashboard-design.md` for the why behind every decision below.

**Goal:** Ship `/intel` — a per-company dashboard that surfaces every forward-looking claim management has made on concalls plus a hit/miss/partial verdict against actual quarterly fundamentals. MVP supports BAJAJFINSV and HDFCBANK.

**Architecture:** Pre-computed batch pipeline writes JSON artifacts under `data/intelligence/{SYMBOL}/`; dashboard is a thin reader. Four pipeline stages: Excel → fundamentals JSON, PDFs → cleaned transcripts, transcripts → claims (LLM Haiku), claims + actuals → checks (LLM Sonnet). Dashboard mirrors the existing `/portfolio` master-detail layout.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4 with CSS-variable theme tokens, `xlsx` (SheetJS) for Excel, `pdf2json` for PDFs (Python `pdfminer.six` fallback), `@anthropic-ai/sdk` for Claude calls, Vitest for unit tests, file-based JSON persistence (no DB).

**Per project convention** (`CLAUDE.md`):
- Do NOT add Claude as co-author in commits.
- Hex colour literals only; never `bg-base`-style class without a fallback (CSS variables actually work in this project's `@theme` setup, but everywhere we touch Recharts, `style={...}`, or non-class consumers, use `var(--color-*)` or hex).
- Every commit step in this plan stages files only with `git add`. **The user commits at their own cadence.** Skip the `git commit` invocation unless the user explicitly asks; bundle several tasks per commit.
- Run `npx tsc --noEmit -p tsconfig.json` before staging anything.

**Worktree:** work happens in `D:/Sunidhi-Intranet-Futuristic` directly (no separate worktree needed for this feature; existing branch).

---

## Phase 0 — Setup

### Task 0.1: Install runtime dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install xlsx and Anthropic SDK**

Run:
```bash
cd "D:/Sunidhi-Intranet-Futuristic" && npm install xlsx @anthropic-ai/sdk
```

Expected: `xlsx` and `@anthropic-ai/sdk` added to `dependencies`. No errors.

**Step 2: Verify**

Run: `node -e "console.log(require('xlsx').version); console.log(require('@anthropic-ai/sdk').default.name)"`
Expected: A version string + `Anthropic` printed.

**Step 3: Stage**

```bash
git add package.json package-lock.json
```

---

### Task 0.2: Install Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Step 1: Install Vitest**

Run:
```bash
npm install -D vitest @vitest/ui
```

**Step 2: Add test script to package.json**

Modify `package.json` `scripts` block:
```json
"scripts": {
  "dev": "next dev -p 3001",
  "build": "next build",
  "start": "next start -p 3001",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

**Step 3: Create vitest.config.ts**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
    globals: false,
  },
});
```

**Step 4: Smoke test**

Create temp file `lib/_smoke.test.ts`:
```ts
import { test, expect } from "vitest";
test("vitest works", () => { expect(1 + 1).toBe(2); });
```

Run: `npm test`
Expected: 1 passing test.

**Step 5: Delete the smoke file and stage**

```bash
rm lib/_smoke.test.ts
git add package.json package-lock.json vitest.config.ts
```

---

### Task 0.3: ANTHROPIC_API_KEY convention

**Files:**
- Create: `.env.local.example`
- Modify: `CLAUDE.md` (append a Secrets section)

**Step 1: Document the env var**

Create `.env.local.example`:
```
# Required for /intel dashboard pipeline (LLM stages 3 + 4).
# Get a key from console.anthropic.com.
ANTHROPIC_API_KEY=sk-ant-...
```

**Step 2: Append to CLAUDE.md**

Append to `D:/Sunidhi-Intranet-Futuristic/CLAUDE.md`:

```md

## Secrets

- `ANTHROPIC_API_KEY` — required for `npm run intel:rebuild`. Place in `.env.local` (gitignored). See `.env.local.example`.
```

**Step 3: Stage**

```bash
git add .env.local.example CLAUDE.md
```

---

### Task 0.4: Folder scaffold

**Files:**
- Create: empty directories

**Step 1: Create directories**

Run:
```bash
mkdir -p "D:/Sunidhi-Intranet-Futuristic/data/intelligence/registries"
mkdir -p "D:/Sunidhi-Intranet-Futuristic/lib/intel"
mkdir -p "D:/Sunidhi-Intranet-Futuristic/scripts"
mkdir -p "D:/Sunidhi-Intranet-Futuristic/app/intel"
mkdir -p "D:/Sunidhi-Intranet-Futuristic/app/api/intel"
mkdir -p "D:/Sunidhi-Intranet-Futuristic/components/intel"
```

**Step 2: Add placeholder so dirs are tracked**

Run:
```bash
touch "D:/Sunidhi-Intranet-Futuristic/data/intelligence/.gitkeep"
```

**Step 3: Stage**

```bash
git add data/intelligence/.gitkeep
```

---

## Phase 1 — Sector registries

### Task 1.1: Define registry types

**Files:**
- Create: `lib/intel/types.ts`

**Step 1: Write the types**

Create `lib/intel/types.ts`:
```ts
// lib/intel/types.ts — shared types for the /intel pipeline and dashboard.

export type SectorKey = "insurance-holding" | "bank";

export type Unit = "%" | "Cr" | "bps" | "x" | "ratio" | "count";
export type Direction = "lower-is-better" | "higher-is-better" | "neutral";

export interface RegistryMetric {
  key: string;                 // stable id, e.g. "bagic_combined_ratio"
  label: string;               // UI label
  unit: Unit;
  direction: Direction;
  segment: string;             // for filtering — e.g. "BAGIC", "Whole Bank"
  excel: {
    sheet: string;
    rowLabelMatch: string[];   // case-insensitive substring; first hit wins
  };
  aliases: string[];           // surface forms for the LLM extractor
  description: string;         // one-line plain English for the LLM
}

export interface SectorRegistry {
  sector: SectorKey;
  metrics: RegistryMetric[];
}

// ── Fundamentals (Stage 1 output) ───────────────────────────────────────────
export interface QuarterFundamentals {
  endDate: string;             // "2025-12-31"
  metrics: { [registryKey: string]: number | null };
}

export interface Fundamentals {
  symbol: string;
  ticker: string;              // Bloomberg ticker
  unit: "Cr";
  quarters: { [quarterLabel: string]: QuarterFundamentals };
  estimates?: { [quarterLabel: string]: QuarterFundamentals };
  warnings: string[];
}

// ── Claims (Stage 3 output) ─────────────────────────────────────────────────
export type ClaimDirection = "value" | "range" | "up" | "down" | "stable";
export type Confidence = "high" | "medium" | "low";

export interface ExtractedClaim {
  id: string;                  // generated, e.g. "BAJAJFINSV-Q1FY26-c1"
  metricKey: string;
  quote: string;
  speaker: string | null;
  direction: ClaimDirection;
  value: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  qualitativeText: string | null;
  targetQuarter: string | null;
  targetText: string;
  confidence: Confidence;
  conditional: string | null;
}

export interface ClaimsArtifact {
  symbol: string;
  promptVersion: number;
  model: string;
  generatedAt: string;
  registryHash: string;
  byQuarter: { [sourceQuarter: string]: ExtractedClaim[] };
  warnings: string[];
}

// ── Checks (Stage 4 output) ─────────────────────────────────────────────────
export type CheckStatus =
  | "hit" | "miss" | "partial" | "no-data" | "pending" | "ambiguous";

export interface ClaimCheck {
  claimId: string;
  metricKey: string;
  sourceQuarter: string;
  targetQuarter: string;
  status: CheckStatus;
  actualValue: number | null;
  actualUnit: string;
  reasoning: string;
  deltaText: string;
  conditionalApplied: boolean;
  conditionalNote: string | null;
}

export interface ChecksArtifact {
  symbol: string;
  promptVersion: number;
  model: string;
  generatedAt: string;
  claimsHash: string;
  fundamentalsHash: string;
  byTargetQuarter: { [targetQuarter: string]: ClaimCheck[] };
  warnings: string[];
}

// ── Symbol → sector ─────────────────────────────────────────────────────────
export const SYMBOL_SECTOR: Record<string, SectorKey> = {
  BAJAJFINSV: "insurance-holding",
  HDFCBANK: "bank",
};
```

**Step 2: Type check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

**Step 3: Stage**

```bash
git add lib/intel/types.ts
```

---

### Task 1.2: Insurance-holding registry (BAJAJFINSV)

**Files:**
- Create: `data/intelligence/registries/insurance-holding.json`

**Step 1: Write the JSON**

Create the file with these 18 metrics. `excel.sheet` and `excel.rowLabelMatch[]` are best-guess from the schemas already inspected — Task 2.7 will resolve any mismatches.

```json
{
  "sector": "insurance-holding",
  "metrics": [
    {
      "key": "bagic_combined_ratio",
      "label": "BAGIC Combined Ratio",
      "unit": "%",
      "direction": "lower-is-better",
      "segment": "BAGIC",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["combined ratio"] },
      "aliases": ["combined ratio", "loss + expense ratio", "underwriting ratio"],
      "description": "Loss ratio + expense ratio for BAGIC. Below 100% means underwriting profit."
    },
    {
      "key": "bagic_loss_ratio",
      "label": "BAGIC Loss Ratio",
      "unit": "%",
      "direction": "lower-is-better",
      "segment": "BAGIC",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["loss ratio"] },
      "aliases": ["loss ratio", "claims ratio", "incurred claims ratio"],
      "description": "Net incurred claims as a share of net earned premium for BAGIC."
    },
    {
      "key": "bagic_expense_ratio",
      "label": "BAGIC Expense Ratio",
      "unit": "%",
      "direction": "lower-is-better",
      "segment": "BAGIC",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["expense ratio"] },
      "aliases": ["expense ratio", "operating expense ratio"],
      "description": "Operating expenses as a share of net written premium for BAGIC."
    },
    {
      "key": "bagic_gwp_growth",
      "label": "BAGIC GWP Growth",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "BAGIC",
      "excel": { "sheet": "Segments", "rowLabelMatch": ["BAGIC", "general insurance gwp", "gross written premium"] },
      "aliases": ["GWP growth", "gross written premium growth", "premium growth"],
      "description": "Year-on-year growth in BAGIC's gross written premium."
    },
    {
      "key": "bagic_pat",
      "label": "BAGIC PAT",
      "unit": "Cr",
      "direction": "higher-is-better",
      "segment": "BAGIC",
      "excel": { "sheet": "Segments", "rowLabelMatch": ["BAGIC PAT", "BAGIC profit"] },
      "aliases": ["BAGIC profit", "general insurance profit"],
      "description": "Profit after tax for Bajaj Allianz General Insurance."
    },
    {
      "key": "balic_nbp_growth",
      "label": "BALIC New Business Premium Growth",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "BALIC",
      "excel": { "sheet": "Segments", "rowLabelMatch": ["new business premium", "BALIC NBP"] },
      "aliases": ["NBP growth", "new business premium growth", "individual rated new business"],
      "description": "YoY growth in Bajaj Allianz Life's new business premium."
    },
    {
      "key": "balic_vnb_margin",
      "label": "BALIC VNB Margin",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "BALIC",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["VNB margin", "value of new business margin"] },
      "aliases": ["VNB margin", "value of new business margin", "new business margin"],
      "description": "Value of new business as a share of annualised premium equivalent for BALIC."
    },
    {
      "key": "balic_persistency_13m",
      "label": "BALIC Persistency 13M",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "BALIC",
      "excel": { "sheet": "Supplemental", "rowLabelMatch": ["persistency 13", "13 month persistency"] },
      "aliases": ["13-month persistency", "13M persistency", "first year persistency"],
      "description": "Share of policies still in force 13 months after issuance."
    },
    {
      "key": "balic_persistency_61m",
      "label": "BALIC Persistency 61M",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "BALIC",
      "excel": { "sheet": "Supplemental", "rowLabelMatch": ["persistency 61", "61 month persistency"] },
      "aliases": ["61-month persistency", "61M persistency", "5-year persistency"],
      "description": "Share of policies still in force 61 months after issuance."
    },
    {
      "key": "balic_aum",
      "label": "BALIC AUM",
      "unit": "Cr",
      "direction": "higher-is-better",
      "segment": "BALIC",
      "excel": { "sheet": "Segments", "rowLabelMatch": ["BALIC AUM", "life insurance AUM"] },
      "aliases": ["BALIC AUM", "assets under management", "life insurance AUM"],
      "description": "Total policyholder + shareholder assets under management at BALIC."
    },
    {
      "key": "bfl_aum",
      "label": "BFL AUM",
      "unit": "Cr",
      "direction": "higher-is-better",
      "segment": "BFL",
      "excel": { "sheet": "Segments", "rowLabelMatch": ["BFL AUM", "Bajaj Finance AUM", "loan book"] },
      "aliases": ["BFL AUM", "Bajaj Finance AUM", "loan book", "AUM"],
      "description": "Bajaj Finance Limited's loan assets under management."
    },
    {
      "key": "bfl_nim",
      "label": "BFL NIM",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "BFL",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["NIM", "net interest margin"] },
      "aliases": ["NIM", "net interest margin", "spread"],
      "description": "Net interest margin at Bajaj Finance."
    },
    {
      "key": "bfl_credit_cost",
      "label": "BFL Credit Cost",
      "unit": "%",
      "direction": "lower-is-better",
      "segment": "BFL",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["credit cost", "loan loss"] },
      "aliases": ["credit cost", "loan losses", "credit loss"],
      "description": "Annualised credit cost (loan losses + provisions) as a share of average AUM."
    },
    {
      "key": "bfl_gross_npa",
      "label": "BFL Gross NPA",
      "unit": "%",
      "direction": "lower-is-better",
      "segment": "BFL",
      "excel": { "sheet": "Supplemental", "rowLabelMatch": ["gross NPA", "GNPA"] },
      "aliases": ["GNPA", "gross NPA", "gross non-performing assets"],
      "description": "Gross non-performing assets as a share of total advances at BFL."
    },
    {
      "key": "consol_revenue",
      "label": "Consolidated Revenue",
      "unit": "Cr",
      "direction": "higher-is-better",
      "segment": "Consolidated",
      "excel": { "sheet": "Income Statement", "rowLabelMatch": ["total revenue", "revenue"] },
      "aliases": ["revenue", "total revenue", "consolidated revenue"],
      "description": "Total consolidated revenue for Bajaj Finserv."
    },
    {
      "key": "consol_pat",
      "label": "Consolidated PAT",
      "unit": "Cr",
      "direction": "higher-is-better",
      "segment": "Consolidated",
      "excel": { "sheet": "Income Statement", "rowLabelMatch": ["net income", "profit after tax", "consolidated PAT"] },
      "aliases": ["consolidated PAT", "net income", "profit after tax"],
      "description": "Total consolidated profit after tax for Bajaj Finserv."
    },
    {
      "key": "consol_solvency_ratio",
      "label": "BAGIC + BALIC Solvency Ratio",
      "unit": "x",
      "direction": "higher-is-better",
      "segment": "Consolidated",
      "excel": { "sheet": "Supplemental", "rowLabelMatch": ["solvency ratio", "solvency"] },
      "aliases": ["solvency ratio", "solvency"],
      "description": "Available solvency margin to required solvency margin (regulatory minimum is 1.5x)."
    },
    {
      "key": "windmill_revenue",
      "label": "Windmill Revenue",
      "unit": "Cr",
      "direction": "neutral",
      "segment": "Other",
      "excel": { "sheet": "Segments", "rowLabelMatch": ["windmill"] },
      "aliases": ["windmill revenue", "wind energy revenue"],
      "description": "Revenue from the windmill business segment (small, mostly historical)."
    }
  ]
}
```

**Step 2: Validate JSON parses**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('data/intelligence/registries/insurance-holding.json','utf-8')).metrics.length)"`
Expected: `18`.

**Step 3: Stage**

```bash
git add data/intelligence/registries/insurance-holding.json
```

---

### Task 1.3: Bank registry (HDFCBANK)

**Files:**
- Create: `data/intelligence/registries/bank.json`

**Step 1: Write the JSON**

Create with 18 metrics. Same shape as Task 1.2.

```json
{
  "sector": "bank",
  "metrics": [
    {
      "key": "nim",
      "label": "Net Interest Margin",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["net interest margin", "NIM"] },
      "aliases": ["NIM", "net interest margin"],
      "description": "Net interest income as a share of average interest-earning assets."
    },
    {
      "key": "gross_npa",
      "label": "Gross NPA %",
      "unit": "%",
      "direction": "lower-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Supplemental", "rowLabelMatch": ["gross NPA", "GNPA"] },
      "aliases": ["GNPA", "gross NPA"],
      "description": "Gross non-performing assets as a share of total advances."
    },
    {
      "key": "net_npa",
      "label": "Net NPA %",
      "unit": "%",
      "direction": "lower-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Supplemental", "rowLabelMatch": ["net NPA", "NNPA"] },
      "aliases": ["NNPA", "net NPA"],
      "description": "Net non-performing assets after provisions, as a share of net advances."
    },
    {
      "key": "pcr",
      "label": "Provision Coverage Ratio",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Supplemental", "rowLabelMatch": ["provision coverage", "PCR"] },
      "aliases": ["PCR", "provision coverage ratio"],
      "description": "Provisions held as a share of gross NPAs (excludes technical write-offs)."
    },
    {
      "key": "credit_cost",
      "label": "Credit Cost",
      "unit": "%",
      "direction": "lower-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["credit cost", "provisions/avg loans"] },
      "aliases": ["credit cost", "provisioning cost"],
      "description": "Annualised credit cost (loan loss provisions) as a share of average advances."
    },
    {
      "key": "slippages",
      "label": "Gross Slippages",
      "unit": "Cr",
      "direction": "lower-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Supplemental", "rowLabelMatch": ["slippage", "gross slippages"] },
      "aliases": ["slippages", "fresh NPAs", "gross slippages"],
      "description": "Fresh additions to gross NPAs during the quarter (in absolute Cr)."
    },
    {
      "key": "cost_to_income",
      "label": "Cost-to-Income Ratio",
      "unit": "%",
      "direction": "lower-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["cost to income", "cost-to-income"] },
      "aliases": ["cost to income", "C/I ratio", "operating efficiency"],
      "description": "Operating expenses as a share of net total income."
    },
    {
      "key": "casa_ratio",
      "label": "CASA Ratio",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Supplemental", "rowLabelMatch": ["CASA", "current and savings"] },
      "aliases": ["CASA", "CASA ratio", "low-cost deposits"],
      "description": "Current + savings deposits as a share of total deposits."
    },
    {
      "key": "deposit_growth",
      "label": "Deposit Growth (YoY)",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["deposit growth", "deposits growth"] },
      "aliases": ["deposit growth", "deposits growth"],
      "description": "Year-on-year growth in total deposits."
    },
    {
      "key": "advance_growth",
      "label": "Advance Growth (YoY)",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["advance growth", "loan growth", "advances growth"] },
      "aliases": ["advance growth", "loan growth", "advances growth", "credit growth"],
      "description": "Year-on-year growth in gross advances."
    },
    {
      "key": "retail_advance_share",
      "label": "Retail Share of Advances",
      "unit": "%",
      "direction": "neutral",
      "segment": "Retail",
      "excel": { "sheet": "Segments", "rowLabelMatch": ["retail loans", "retail advances", "retail share"] },
      "aliases": ["retail share", "retail advances mix", "retail loans"],
      "description": "Retail loans as a share of total advances."
    },
    {
      "key": "nii",
      "label": "Net Interest Income",
      "unit": "Cr",
      "direction": "higher-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Income Statement", "rowLabelMatch": ["net interest income", "NII"] },
      "aliases": ["NII", "net interest income"],
      "description": "Interest income minus interest expense for the quarter."
    },
    {
      "key": "pat",
      "label": "Profit After Tax",
      "unit": "Cr",
      "direction": "higher-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Income Statement", "rowLabelMatch": ["net income", "profit after tax"] },
      "aliases": ["PAT", "net profit", "profit after tax"],
      "description": "Net profit attributable to shareholders for the quarter."
    },
    {
      "key": "roa",
      "label": "Return on Assets",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["return on assets", "ROA"] },
      "aliases": ["ROA", "return on assets"],
      "description": "Net income as a share of average total assets, annualised."
    },
    {
      "key": "roe",
      "label": "Return on Equity",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Ratios", "rowLabelMatch": ["return on equity", "ROE"] },
      "aliases": ["ROE", "return on equity"],
      "description": "Net income as a share of average shareholders' equity, annualised."
    },
    {
      "key": "cet1",
      "label": "CET1 Ratio",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Capital Structure Summary", "rowLabelMatch": ["CET1", "common equity tier 1"] },
      "aliases": ["CET1", "common equity tier 1"],
      "description": "Common Equity Tier 1 capital as a share of risk-weighted assets."
    },
    {
      "key": "crar",
      "label": "Total Capital Ratio (CRAR)",
      "unit": "%",
      "direction": "higher-is-better",
      "segment": "Whole Bank",
      "excel": { "sheet": "Capital Structure Summary", "rowLabelMatch": ["capital adequacy", "CRAR", "total capital ratio"] },
      "aliases": ["CRAR", "capital adequacy ratio", "total capital ratio"],
      "description": "Total regulatory capital as a share of risk-weighted assets."
    },
    {
      "key": "branch_count",
      "label": "Branch Count",
      "unit": "count",
      "direction": "neutral",
      "segment": "Whole Bank",
      "excel": { "sheet": "Supplemental", "rowLabelMatch": ["branches", "branch count"] },
      "aliases": ["branches", "branch network", "outlets"],
      "description": "Total number of bank branches at quarter-end."
    }
  ]
}
```

**Step 2: Validate**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('data/intelligence/registries/bank.json','utf-8')).metrics.length)"`
Expected: `18`.

**Step 3: Stage**

```bash
git add data/intelligence/registries/bank.json
```

---

### Task 1.4: Registry loader

**Files:**
- Create: `lib/intel/registry.ts`
- Create: `lib/intel/registry.test.ts`

**Step 1: Write failing test**

Create `lib/intel/registry.test.ts`:
```ts
import { describe, test, expect } from "vitest";
import { loadRegistry, registryHash } from "./registry";

describe("registry loader", () => {
  test("loads insurance-holding registry", () => {
    const r = loadRegistry("insurance-holding");
    expect(r.sector).toBe("insurance-holding");
    expect(r.metrics.length).toBeGreaterThanOrEqual(15);
    expect(r.metrics.some(m => m.key === "bagic_combined_ratio")).toBe(true);
  });

  test("loads bank registry", () => {
    const r = loadRegistry("bank");
    expect(r.sector).toBe("bank");
    expect(r.metrics.some(m => m.key === "nim")).toBe(true);
  });

  test("rejects duplicate keys within a registry", () => {
    // synthetic — use loadRegistryFromObject
    expect(() => {
      // @ts-expect-error — testing private path via re-import
      const { validateRegistry } = require("./registry");
      validateRegistry({
        sector: "bank",
        metrics: [
          { key: "nim", label: "x", unit: "%", direction: "higher-is-better", segment: "x", excel: { sheet: "x", rowLabelMatch: [] }, aliases: [], description: "x" },
          { key: "nim", label: "y", unit: "%", direction: "higher-is-better", segment: "x", excel: { sheet: "x", rowLabelMatch: [] }, aliases: [], description: "y" },
        ],
      });
    }).toThrow(/duplicate/i);
  });

  test("registryHash is deterministic", () => {
    const a = registryHash(loadRegistry("bank"));
    const b = registryHash(loadRegistry("bank"));
    expect(a).toBe(b);
  });
});
```

**Step 2: Run test — expect failure**

Run: `npm test -- lib/intel/registry.test.ts`
Expected: FAIL ("Cannot find module './registry'").

**Step 3: Implement**

Create `lib/intel/registry.ts`:
```ts
// lib/intel/registry.ts — typed loader + validator + hashing for sector registries.

import { promises as fs } from "node:fs";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SectorKey, SectorRegistry, RegistryMetric } from "./types";

const REG_DIR = path.join(process.cwd(), "data", "intelligence", "registries");

export function loadRegistry(sector: SectorKey): SectorRegistry {
  const file = path.join(REG_DIR, `${sector}.json`);
  const raw = fsSync.readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw) as SectorRegistry;
  validateRegistry(parsed);
  return parsed;
}

export async function loadRegistryAsync(sector: SectorKey): Promise<SectorRegistry> {
  const file = path.join(REG_DIR, `${sector}.json`);
  const raw = await fs.readFile(file, "utf-8");
  const parsed = JSON.parse(raw) as SectorRegistry;
  validateRegistry(parsed);
  return parsed;
}

export function validateRegistry(r: SectorRegistry): void {
  if (!r.sector) throw new Error("registry missing sector");
  if (!Array.isArray(r.metrics)) throw new Error("registry missing metrics array");
  const seen = new Set<string>();
  for (const m of r.metrics) {
    if (!m.key) throw new Error("metric missing key");
    if (seen.has(m.key)) throw new Error(`duplicate key in registry: ${m.key}`);
    seen.add(m.key);
    if (!m.excel?.sheet) throw new Error(`metric ${m.key} missing excel.sheet`);
  }
}

export function registryHash(r: SectorRegistry): string {
  // Stable hash that ignores key order in JSON
  const stable = JSON.stringify(r, Object.keys(r).sort());
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

export function metricByKey(r: SectorRegistry, key: string): RegistryMetric | null {
  return r.metrics.find((m) => m.key === key) ?? null;
}
```

**Step 4: Run test — expect pass**

Run: `npm test -- lib/intel/registry.test.ts`
Expected: 4 passing.

**Step 5: Stage**

```bash
git add lib/intel/registry.ts lib/intel/registry.test.ts
```

---

## Phase 2 — Excel parser (Stage 1)

### Task 2.1: Quarter normalization helpers

**Files:**
- Create: `lib/intel/quarters.ts`
- Create: `lib/intel/quarters.test.ts`

**Step 1: Write failing test**

```ts
import { describe, test, expect } from "vitest";
import { dateToQuarter, bloombergFqToQuarter, normalizeQuarter, quarterAddOffset } from "./quarters";

describe("quarter helpers", () => {
  test("dateToQuarter: 2025-12-31 → Q3-FY26 (Indian FY)", () => {
    expect(dateToQuarter("2025-12-31")).toBe("Q3-FY26");
  });
  test("dateToQuarter: 2025-03-31 → Q4-FY25", () => {
    expect(dateToQuarter("2025-03-31")).toBe("Q4-FY25");
  });
  test("dateToQuarter: 2025-06-30 → Q1-FY26", () => {
    expect(dateToQuarter("2025-06-30")).toBe("Q1-FY26");
  });
  test("dateToQuarter: 2025-09-30 → Q2-FY26", () => {
    expect(dateToQuarter("2025-09-30")).toBe("Q2-FY26");
  });

  test("bloombergFqToQuarter: 'FQ3 2026' → Q3-FY26 (CIQ FQ uses calendar-end-year notation aligned with Indian FY)", () => {
    expect(bloombergFqToQuarter("FQ3 2026")).toBe("Q3-FY26");
  });

  test("normalizeQuarter accepts Q3-FY26", () => {
    expect(normalizeQuarter("Q3-FY26")).toBe("Q3-FY26");
  });
  test("normalizeQuarter accepts 'Q3 FY26'", () => {
    expect(normalizeQuarter("Q3 FY26")).toBe("Q3-FY26");
  });

  test("quarterAddOffset: Q3-FY26 + 1 = Q4-FY26", () => {
    expect(quarterAddOffset("Q3-FY26", 1)).toBe("Q4-FY26");
  });
  test("quarterAddOffset: Q4-FY26 + 1 = Q1-FY27", () => {
    expect(quarterAddOffset("Q4-FY26", 1)).toBe("Q1-FY27");
  });
  test("quarterAddOffset: Q1-FY26 - 1 = Q4-FY25", () => {
    expect(quarterAddOffset("Q1-FY26", -1)).toBe("Q4-FY25");
  });
});
```

**Step 2: Run test — expect failure**

Run: `npm test -- lib/intel/quarters.test.ts`
Expected: FAIL.

**Step 3: Implement**

Create `lib/intel/quarters.ts`:
```ts
// lib/intel/quarters.ts — Indian Financial Year quarter helpers.
//
// Conventions:
//   Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar.
//   FY{yy} ends March of year 20{yy}. So Q3-FY26 covers Oct–Dec 2025.
//   Bloomberg/CIQ "FQ3 2026" labels also follow this convention for Indian-FY filers.

export type Quarter = string; // "Q{1-4}-FY{yy}"

const Q_RE = /^Q([1-4])-FY(\d{2})$/;

/** Turn an ISO end-of-quarter date into a Q label. Accepts "YYYY-MM-DD" or Date. */
export function dateToQuarter(input: string | Date): Quarter {
  const d = typeof input === "string" ? new Date(input) : input;
  const m = d.getUTCMonth() + 1; // 1..12
  const y = d.getUTCFullYear();
  let q: number, fyEnd: number;
  if (m >= 4 && m <= 6)  { q = 1; fyEnd = y + 1; }
  else if (m >= 7 && m <= 9)  { q = 2; fyEnd = y + 1; }
  else if (m >= 10) { q = 3; fyEnd = y + 1; }
  else { q = 4; fyEnd = y; } // Jan-Mar
  return `Q${q}-FY${String(fyEnd % 100).padStart(2, "0")}`;
}

/** "FQ3 2026" → "Q3-FY26". CIQ uses calendar end-year for the FY label. */
export function bloombergFqToQuarter(label: string): Quarter | null {
  const m = label.match(/^FQ([1-4])\s+(\d{4})$/);
  if (!m) return null;
  return `Q${m[1]}-FY${String(parseInt(m[2]) % 100).padStart(2, "0")}`;
}

/** Accepts "Q3-FY26", "Q3 FY26", "Q3FY26"; returns canonical "Q3-FY26" or null. */
export function normalizeQuarter(s: string): Quarter | null {
  const cleaned = s.replace(/\s+/g, "").toUpperCase();
  const m = cleaned.match(/^Q([1-4])-?FY(\d{2})$/);
  if (!m) return null;
  return `Q${m[1]}-FY${m[2]}`;
}

/** Add a positive or negative number of quarters. */
export function quarterAddOffset(q: Quarter, offset: number): Quarter {
  const m = q.match(Q_RE);
  if (!m) throw new Error(`bad quarter: ${q}`);
  let qi = parseInt(m[1]); // 1..4
  let fy = 2000 + parseInt(m[2]); // e.g. 2026

  let total = (fy - 2000) * 4 + (qi - 1) + offset;
  let newFy = 2000 + Math.floor(total / 4);
  let newQ = (total % 4 + 4) % 4 + 1;
  if (newQ === 0) newQ = 4;
  return `Q${newQ}-FY${String(newFy % 100).padStart(2, "0")}`;
}
```

**Step 4: Run test — expect pass**

Run: `npm test -- lib/intel/quarters.test.ts`
Expected: 9 passing.

**Step 5: Stage**

```bash
git add lib/intel/quarters.ts lib/intel/quarters.test.ts
```

---

### Task 2.2: Excel parser — sheet scanner

**Files:**
- Create: `lib/intel/parseExcel.ts`
- Create: `lib/intel/parseExcel.test.ts`
- Create: `lib/intel/__fixtures__/tiny.xlsx` (fixture file generated at test setup time, not committed)

**Step 1: Write failing test**

```ts
import { describe, test, expect, beforeAll } from "vitest";
import * as XLSX from "xlsx";
import path from "node:path";
import fs from "node:fs";
import { findRow, buildQuarterIndex } from "./parseExcel";

const FIXTURE = path.join(__dirname, "__fixtures__", "tiny.xlsx");

beforeAll(() => {
  // Synthesize a small workbook in-memory and write it.
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  const data = [
    [],
    ["", "Ticker", "TEST IN", "", "Accounting"],
    [],
    ["", "Q", "-3Q", "-2Q", "-1Q", "-0Q"],
    ["", "Income Statement", "FQ1 2025", "FQ2 2025", "FQ3 2025", "FQ4 2025"],
    ["", "", "2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31"],
    ["SALES_REV/10^6", "Revenue", 100, 200, 300, 400],
    ["NIM", "Net Interest Margin", 4.1, 4.2, 4.15, 4.3],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Income Statement");
  XLSX.writeFile(wb, FIXTURE);
});

describe("parseExcel scanners", () => {
  test("findRow matches by case-insensitive substring", () => {
    const wb = XLSX.readFile(FIXTURE);
    const ws = wb.Sheets["Income Statement"];
    const hit = findRow(ws, ["net interest margin"]);
    expect(hit).not.toBeNull();
    expect(hit!.label).toMatch(/net interest margin/i);
  });

  test("findRow returns null when no match", () => {
    const wb = XLSX.readFile(FIXTURE);
    const ws = wb.Sheets["Income Statement"];
    expect(findRow(ws, ["does not exist"])).toBeNull();
  });

  test("buildQuarterIndex maps date columns to quarter labels", () => {
    const wb = XLSX.readFile(FIXTURE);
    const ws = wb.Sheets["Income Statement"];
    const idx = buildQuarterIndex(ws);
    // 2024-06-30 → Q1-FY25, 2024-09-30 → Q2-FY25, 2024-12-31 → Q3-FY25, 2025-03-31 → Q4-FY25
    expect(idx).toMatchObject({
      "Q1-FY25": expect.any(Number),
      "Q2-FY25": expect.any(Number),
      "Q3-FY25": expect.any(Number),
      "Q4-FY25": expect.any(Number),
    });
  });
});
```

**Step 2: Run test — expect failure**

Run: `npm test -- lib/intel/parseExcel.test.ts`
Expected: FAIL.

**Step 3: Implement**

Create `lib/intel/parseExcel.ts`:
```ts
// lib/intel/parseExcel.ts — Bloomberg/CIQ Excel → Fundamentals JSON.
//
// Bloomberg layout assumption (verified on Bajaj Finserv + HDFC files):
//   - Header rows in the top ~10 rows of each sheet
//   - Column A may hold Bloomberg field codes ("SALES_REV_TURN/10^6")
//   - Column B (or C) holds human labels ("Revenue", "Net Interest Margin")
//   - One header row contains period dates ("2024-12-31") OR Bloomberg labels ("FQ3 2026")
//   - One column may contain LTM values; others are quarterly actuals or estimates

import * as XLSX from "xlsx";
import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import type { Fundamentals, QuarterFundamentals, SectorRegistry } from "./types";
import { dateToQuarter, bloombergFqToQuarter } from "./quarters";

interface RowHit {
  rowIndex: number;          // 0-based
  label: string;             // text of the matched label cell
  values: (number | null)[]; // values from each column (col index aligns with sheet)
}

const MAX_HEADER_SCAN_ROWS = 12;

/** Find the first row in `ws` whose label cell (col B or C) contains any of `needles` (case-insensitive substring). */
export function findRow(ws: XLSX.WorkSheet, needles: string[]): RowHit | null {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  for (let r = 0; r <= range.e.r; r++) {
    for (const labelCol of [1, 2]) { // B then C
      const cell = ws[XLSX.utils.encode_cell({ r, c: labelCol })];
      const label = cell?.v != null ? String(cell.v) : "";
      if (!label) continue;
      const ll = label.toLowerCase();
      if (needles.some((n) => ll.includes(n.toLowerCase()))) {
        const values: (number | null)[] = [];
        for (let c = 0; c <= range.e.c; c++) {
          const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
          if (typeof v === "number" && Number.isFinite(v)) values.push(v);
          else values.push(null);
        }
        return { rowIndex: r, label, values };
      }
    }
  }
  return null;
}

/** Scan top rows for a header line that contains period dates or Bloomberg FQ labels.
 *  Returns map: quarterLabel → column index. */
export function buildQuarterIndex(ws: XLSX.WorkSheet): Record<string, number> {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  const out: Record<string, number> = {};
  // Two passes: prefer date headers; fall back to FQ labels
  for (let r = 0; r <= Math.min(MAX_HEADER_SCAN_ROWS, range.e.r); r++) {
    for (let c = 0; c <= range.e.c; c++) {
      const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
      if (v == null) continue;
      // Date detection
      if (v instanceof Date) {
        const iso = v.toISOString().slice(0, 10);
        const q = dateToQuarter(iso);
        if (!(q in out)) out[q] = c;
        continue;
      }
      const s = String(v);
      // ISO-ish date string
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const q = dateToQuarter(`${m[1]}-${m[2]}-${m[3]}`);
        if (!(q in out)) out[q] = c;
        continue;
      }
      // FQ label fallback (only if we haven't found dates for this column)
      const fq = bloombergFqToQuarter(s);
      if (fq && !(fq in out)) out[fq] = c;
    }
  }
  return out;
}

/** Top-level parse: produce a Fundamentals object for `symbol` from the workbook at `xlsxPath`. */
export async function parseExcel(opts: {
  symbol: string;
  ticker: string;
  xlsxPath: string;
  registry: SectorRegistry;
}): Promise<Fundamentals> {
  const wb = XLSX.readFile(opts.xlsxPath);
  const warnings: string[] = [];
  const quarters: { [q: string]: QuarterFundamentals } = {};

  // Cache quarter-index per sheet
  const qIndexCache: Record<string, Record<string, number>> = {};
  function getQIndex(sheetName: string) {
    if (!qIndexCache[sheetName]) {
      const ws = wb.Sheets[sheetName];
      qIndexCache[sheetName] = ws ? buildQuarterIndex(ws) : {};
    }
    return qIndexCache[sheetName];
  }

  // For every metric, find its row in the named sheet, then read each quarter's value.
  for (const m of opts.registry.metrics) {
    const ws = wb.Sheets[m.excel.sheet];
    if (!ws) {
      warnings.push(`${m.key}: sheet "${m.excel.sheet}" not found`);
      continue;
    }
    const hit = findRow(ws, m.excel.rowLabelMatch);
    if (!hit) {
      warnings.push(`${m.key}: no row matching ${JSON.stringify(m.excel.rowLabelMatch)} in sheet "${m.excel.sheet}"`);
      continue;
    }
    const qIdx = getQIndex(m.excel.sheet);
    for (const [q, col] of Object.entries(qIdx)) {
      let v = hit.values[col];
      if (v == null) continue;
      // Bloomberg field codes ending in "/10^6" mean the value is in millions
      // → divide by 10 to get crores. Detect from column-A code on the same row.
      const fieldCode = ws[XLSX.utils.encode_cell({ r: hit.rowIndex, c: 0 })]?.v;
      if (typeof fieldCode === "string" && /\/10\^6$/.test(fieldCode)) {
        v = v / 10;
      }
      // Ratios reported as fractions (0.998) → convert to percent display when unit is %
      if (m.unit === "%" && typeof v === "number" && Math.abs(v) < 5 && /\/100$/.test(String(fieldCode ?? ""))) {
        v = v * 100;
      }
      if (!quarters[q]) quarters[q] = { endDate: "", metrics: {} };
      quarters[q].metrics[m.key] = v;
    }
  }

  // Fill endDate from quarter index for any sheet (use Income Statement if present)
  // Best-effort — derive from the quarter label.
  for (const q of Object.keys(quarters)) {
    if (!quarters[q].endDate) {
      const m = q.match(/^Q([1-4])-FY(\d{2})$/);
      if (m) {
        const qi = parseInt(m[1]);
        const fyEndYear = 2000 + parseInt(m[2]);
        const monthEnd = qi === 1 ? "06-30" : qi === 2 ? "09-30" : qi === 3 ? "12-31" : "03-31";
        const yearEnd = qi === 4 ? fyEndYear : fyEndYear - 1;
        quarters[q].endDate = `${yearEnd}-${monthEnd}`;
      }
    }
  }

  return {
    symbol: opts.symbol,
    ticker: opts.ticker,
    unit: "Cr",
    quarters,
    warnings,
  };
}

/** Stable hash of a Fundamentals object for cache invalidation. */
export function fundamentalsHash(f: Fundamentals): string {
  return crypto.createHash("sha256").update(JSON.stringify(f.quarters)).digest("hex").slice(0, 16);
}

/** Persist a Fundamentals JSON to disk (atomic write). */
export async function writeFundamentals(symbol: string, f: Fundamentals): Promise<string> {
  const dir = path.join(process.cwd(), "data", "intelligence", symbol);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "fundamentals.json");
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(f, null, 2), "utf-8");
  await fs.rename(tmp, file);
  return file;
}
```

**Step 4: Run test — expect pass**

Run: `npm test -- lib/intel/parseExcel.test.ts`
Expected: 3 passing.

**Step 5: Stage**

```bash
git add lib/intel/parseExcel.ts lib/intel/parseExcel.test.ts
```

---

### Task 2.3: First Excel parse run (BAJAJFINSV)

**Files:**
- Create: `data/intelligence/BAJAJFINSV/fundamentals.json` (generated)

**Step 1: Write a one-off script**

Create `scripts/_one-off-parse-bajajfinsv.ts`:
```ts
import { parseExcel, writeFundamentals } from "@/lib/intel/parseExcel";
import { loadRegistry } from "@/lib/intel/registry";

(async () => {
  const f = await parseExcel({
    symbol: "BAJAJFINSV",
    ticker: "BJFIN IN",
    xlsxPath: "Concall Data/Fundamental data/Bajaj finserve.xlsx",
    registry: loadRegistry("insurance-holding"),
  });
  console.log(`Quarters: ${Object.keys(f.quarters).length}`);
  console.log(`Warnings: ${f.warnings.length}`);
  for (const w of f.warnings) console.log("  -", w);
  await writeFundamentals("BAJAJFINSV", f);
})().catch((e) => { console.error(e); process.exit(1); });
```

**Step 2: Run it**

Run:
```bash
npx tsx scripts/_one-off-parse-bajajfinsv.ts
```

(Install tsx if needed: `npm install -D tsx`.)

Expected: prints quarter count and warnings; produces `data/intelligence/BAJAJFINSV/fundamentals.json`.

**Step 3: Inspect output**

Run:
```bash
node -e "const f=JSON.parse(require('fs').readFileSync('data/intelligence/BAJAJFINSV/fundamentals.json','utf-8')); console.log('quarters:',Object.keys(f.quarters)); console.log('latest:',f.quarters[Object.keys(f.quarters).sort().pop()]); console.log('warnings:',f.warnings)"
```

Expected: ≥ 8 quarters with reasonable values for `consol_revenue`, `bagic_combined_ratio`, `balic_vnb_margin`. Some warnings are likely (e.g. `bagic_motor_premium_share`, `windmill_revenue` may not match) — that's the iteration target.

**Step 4: Iterate the registry to fix warnings**

For each warning, open the Bajaj Finserv Excel manually (or via `python -c "import openpyxl; ..."` script) and find the actual row label. Update `excel.rowLabelMatch[]` in `data/intelligence/registries/insurance-holding.json`. Re-run step 2. Iterate until warnings are minimal (some rows may genuinely not exist — that's OK, leave them in warnings).

**Step 5: Delete the one-off script**

```bash
rm scripts/_one-off-parse-bajajfinsv.ts
```

**Step 6: Stage**

```bash
git add data/intelligence/BAJAJFINSV/fundamentals.json data/intelligence/registries/insurance-holding.json
```

---

### Task 2.4: First Excel parse run (HDFCBANK)

**Files:**
- Create: `data/intelligence/HDFCBANK/fundamentals.json` (generated)

Repeat Task 2.3 substituting:
- ticker: `"hdfcb in"`
- xlsxPath: `"Concall Data/Fundamental data/HDFC.xlsx"`
- symbol: `"HDFCBANK"`
- registry: `loadRegistry("bank")`

Same iteration loop on warnings. Stage the resulting file + any registry edits.

---

## Phase 3 — Transcript cleaning (Stage 2)

### Task 3.1: Filename → quarter detection

**Files:**
- Create: `lib/intel/transcripts.ts` (initial slice)
- Create: `lib/intel/transcripts.test.ts`

**Step 1: Failing test**

```ts
import { describe, test, expect } from "vitest";
import { detectQuarterFromFilename, detectDateFromHeader, dateToQuarterLabel } from "./transcripts";

describe("transcript detection", () => {
  test("filename Q3-FY26", () => {
    expect(detectQuarterFromFilename("Earnings Call Transcript Q3-FY26.pdf")).toBe("Q3-FY26");
  });
  test("filename Q1 - FY25 (with spaces)", () => {
    expect(detectQuarterFromFilename("Earnings Call Transcript Q1 - FY25.pdf")).toBe("Q1-FY25");
  });
  test("filename without quarter returns null", () => {
    expect(detectQuarterFromFilename("145964f9-uuid.pdf")).toBeNull();
  });
  test("header date 'July 19, 2025' → Q1-FY26", () => {
    expect(detectDateFromHeader("HDFC Bank Limited / July 19, 2025 / Q1 FY26 Earnings")).toBe("2025-07-19");
    expect(dateToQuarterLabel("2025-07-19")).toBe("Q2-FY26");
    // Note: a call held 19 Jul reports Q1-FY26 results — see Task 3.2 for the heuristic.
  });
});
```

**Step 2: Run — expect fail**

`npm test -- lib/intel/transcripts.test.ts` → FAIL.

**Step 3: Implement (minimal)**

Create `lib/intel/transcripts.ts`:
```ts
// lib/intel/transcripts.ts — PDF transcript ingestion + cleaning.

import { dateToQuarter, normalizeQuarter, quarterAddOffset } from "./quarters";

export function detectQuarterFromFilename(filename: string): string | null {
  // Match "Q1 FY26" / "Q1-FY26" / "Q1FY26" / "Q1 - FY25"
  const m = filename.match(/Q\s*([1-4])\s*-?\s*FY\s*(\d{2})/i);
  if (!m) return null;
  return `Q${m[1]}-FY${m[2]}`;
}

export function detectDateFromHeader(text: string): string | null {
  // Match "April 18, 2026" / "July 19, 2025" etc.
  const m = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i);
  if (!m) return null;
  const months: Record<string, string> = {
    january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",
    july:"07",august:"08",september:"09",october:"10",november:"11",december:"12",
  };
  return `${m[3]}-${months[m[1].toLowerCase()]}-${String(m[2]).padStart(2,"0")}`;
}

export function dateToQuarterLabel(iso: string): string {
  return dateToQuarter(iso);
}
```

**Step 4: Run — expect pass**

`npm test -- lib/intel/transcripts.test.ts` → 4 passing.

**Step 5: Stage**

```bash
git add lib/intel/transcripts.ts lib/intel/transcripts.test.ts
```

---

### Task 3.2: Call-date → reporting-quarter heuristic

**Files:**
- Modify: `lib/intel/transcripts.ts`
- Modify: `lib/intel/transcripts.test.ts`

A call held mid-July reports the Q1-FY26 (Apr-Jun) quarter just ended. A call held early February reports Q3-FY26 (Oct-Dec). The "reporting quarter" is roughly `quarterOfDate(callDate) - 1`.

**Step 1: Failing tests**

Append to `lib/intel/transcripts.test.ts`:
```ts
import { reportingQuarterFromCallDate } from "./transcripts";

describe("reporting quarter heuristic", () => {
  test("call on Jul 19 2025 → Q1-FY26 (Apr-Jun 2025) results", () => {
    expect(reportingQuarterFromCallDate("2025-07-19")).toBe("Q1-FY26");
  });
  test("call on Apr 18 2026 → Q4-FY26 results", () => {
    expect(reportingQuarterFromCallDate("2026-04-18")).toBe("Q4-FY26");
  });
  test("call on Feb 5 2026 → Q3-FY26 results", () => {
    expect(reportingQuarterFromCallDate("2026-02-05")).toBe("Q3-FY26");
  });
});
```

**Step 2: Run — expect fail**

**Step 3: Implement**

Append to `lib/intel/transcripts.ts`:
```ts
/** Convert a call date to the quarter the call is REPORTING ON.
 *  Heuristic: take quarter-of-date and subtract one, since calls are held a few weeks
 *  after a quarter ends to report on the just-finished quarter. */
export function reportingQuarterFromCallDate(iso: string): string {
  const callQ = dateToQuarter(iso);
  return quarterAddOffset(callQ, -1);
}
```

**Step 4: Run — expect pass**

**Step 5: Stage**

```bash
git add lib/intel/transcripts.ts lib/intel/transcripts.test.ts
```

---

### Task 3.3: PDF → text via pdf2json + Python fallback

**Files:**
- Modify: `lib/intel/transcripts.ts`
- Create: `scripts/extract-transcripts.py`

**Step 1: Implement Python helper**

Create `scripts/extract-transcripts.py`:
```python
#!/usr/bin/env python3
# scripts/extract-transcripts.py — pdfminer.six fallback for transcripts pdf2json mangles.
# Usage: python scripts/extract-transcripts.py <input.pdf>
# Prints extracted text to stdout.

import sys
from pdfminer.high_level import extract_text

if len(sys.argv) != 2:
    print("usage: extract-transcripts.py <pdf>", file=sys.stderr)
    sys.exit(2)

print(extract_text(sys.argv[1]))
```

Make executable:
```bash
chmod +x scripts/extract-transcripts.py
```

**Step 2: Implement Node side — extractor with fallback**

Append to `lib/intel/transcripts.ts`:
```ts
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const MIN_CHARS_PER_KB = 100; // heuristic: < 100 chars per KB of PDF = mangled

function tryPdf2json(pdfPath: string): Promise<string> {
  // pdf2json's API is stream-based and quirky; we shell out to a one-liner via npx.
  // Simpler: use require("pdf2json") + textContent extraction.
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const PDFParser = require("pdf2json");
    const p = new PDFParser(null, 1);
    let raw = "";
    p.on("pdfParser_dataError", (err: unknown) => reject(err));
    p.on("pdfParser_dataReady", () => { raw = p.getRawTextContent(); resolve(raw); });
    p.loadPDF(pdfPath);
  });
}

function tryPython(pdfPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python", ["scripts/extract-transcripts.py", pdfPath]);
    let out = "", err = "";
    proc.stdout.on("data", (d) => out += d.toString());
    proc.stderr.on("data", (d) => err += d.toString());
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`python extractor failed (${code}): ${err}`));
    });
    proc.on("error", reject);
  });
}

export async function extractPdfText(pdfPath: string): Promise<{ text: string; method: string }> {
  const stat = await fs.stat(pdfPath);
  const sizeKb = stat.size / 1024;

  let text = "";
  let method = "pdf2json";
  try {
    text = await tryPdf2json(pdfPath);
  } catch (e) {
    console.warn(`[transcripts] pdf2json failed on ${path.basename(pdfPath)}:`, e);
  }

  if (text.length < MIN_CHARS_PER_KB * sizeKb) {
    try {
      const pyText = await tryPython(pdfPath);
      if (pyText.length > text.length) {
        text = pyText;
        method = "pdfminer";
      }
    } catch (e) {
      console.warn(`[transcripts] python fallback failed on ${path.basename(pdfPath)}:`, e);
    }
  }
  return { text, method };
}
```

**Step 3: Smoke test**

Add to `lib/intel/transcripts.test.ts`:
```ts
import { extractPdfText } from "./transcripts";
import path from "node:path";

describe("extractPdfText", () => {
  test("extracts a real Bajaj Finserv transcript", async () => {
    const p = path.join(process.cwd(), "Concall Data", "Earnings Call Transcript Q1-FY26.pdf");
    const { text, method } = await extractPdfText(p);
    expect(text.length).toBeGreaterThan(10000);
    expect(text.toLowerCase()).toContain("bajaj finserv");
    expect(["pdf2json", "pdfminer"]).toContain(method);
  }, 60_000);
});
```

**Step 4: Run — expect pass**

`npm test -- lib/intel/transcripts.test.ts`

**Step 5: Stage**

```bash
git add lib/intel/transcripts.ts lib/intel/transcripts.test.ts scripts/extract-transcripts.py
```

---

### Task 3.4: Cover-letter strip + footer dedupe

**Files:**
- Modify: `lib/intel/transcripts.ts`
- Modify: `lib/intel/transcripts.test.ts`

**Step 1: Failing tests**

Append:
```ts
import { stripCoverLetter, stripRepeatingFooters } from "./transcripts";

describe("transcript cleaning", () => {
  test("stripCoverLetter removes regulatory preamble", () => {
    const sample = `CIN: L65920MH1994PLC080618\nRef. No. SE/2025-26/177\nApril 24, 2026\n\n[boilerplate]\n\nModerator: Ladies and Gentlemen, welcome...`;
    const out = stripCoverLetter(sample);
    expect(out.startsWith("Moderator")).toBe(true);
  });

  test("stripRepeatingFooters removes 'Page N of M' style lines", () => {
    const sample = "First line\nPage 1 of 12\nSecond line\nPage 2 of 12\nThird\nPage 3 of 12\nFourth\nPage 4 of 12";
    const out = stripRepeatingFooters(sample);
    expect(out).not.toMatch(/Page \d+ of 12/);
    expect(out).toContain("First line");
  });
});
```

**Step 2: Run — fail**

**Step 3: Implement**

Append to `lib/intel/transcripts.ts`:
```ts
const COVER_TRIGGERS = [/^Moderator\s*:/im, /^Operator\s*:/im, /Earnings Conference Call/i];

export function stripCoverLetter(text: string): string {
  for (const trig of COVER_TRIGGERS) {
    const m = text.match(trig);
    if (m && typeof m.index === "number") {
      // Step back to start-of-line containing the match
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      return text.slice(lineStart);
    }
  }
  return text; // no trigger found — return as-is
}

export function stripRepeatingFooters(text: string): string {
  const lines = text.split(/\r?\n/);
  const counts = new Map<string, number>();
  for (const ln of lines) {
    const trimmed = ln.trim();
    if (trimmed.length === 0 || trimmed.length > 80) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  return lines.filter((ln) => (counts.get(ln.trim()) ?? 0) <= 3).join("\n");
}
```

**Step 4: Run — pass**

**Step 5: Stage**

```bash
git add lib/intel/transcripts.ts lib/intel/transcripts.test.ts
```

---

### Task 3.5: Per-symbol transcript ingestion driver

**Files:**
- Modify: `lib/intel/transcripts.ts`

**Step 1: Implement driver**

Append:
```ts
export interface TranscriptManifest {
  symbol: string;
  ingested: { quarter: string; sourcePath: string; method: string; chars: number }[];
  failed: { sourcePath: string; reason: string }[];
  duplicatesSkipped: { sourcePath: string; quarter: string; keptPath: string }[];
}

export interface IngestOptions {
  symbol: string;
  inputDir: string;          // "Concall Data"
  outputDir: string;         // "data/intelligence/{SYMBOL}/transcripts"
  filenameFilter?: (name: string) => boolean;  // optional pre-filter
}

const COMPANY_FINGERPRINTS: Record<string, RegExp[]> = {
  BAJAJFINSV: [/bajaj\s*finserv/i],
  HDFCBANK:   [/hdfc\s*bank\s*limited/i, /hdfc bank/i],
};

function fingerprintMatches(symbol: string, text: string): boolean {
  const pats = COMPANY_FINGERPRINTS[symbol] ?? [];
  return pats.some((p) => p.test(text));
}

export async function ingestTranscripts(opts: IngestOptions): Promise<TranscriptManifest> {
  const manifest: TranscriptManifest = { symbol: opts.symbol, ingested: [], failed: [], duplicatesSkipped: [] };
  await fs.mkdir(opts.outputDir, { recursive: true });

  const files = (await fs.readdir(opts.inputDir))
    .filter((n) => n.toLowerCase().endsWith(".pdf"))
    .filter((n) => opts.filenameFilter ? opts.filenameFilter(n) : true);

  // first pass: extract + identify
  type Item = { src: string; quarter: string | null; text: string; method: string };
  const items: Item[] = [];
  for (const name of files) {
    const src = path.join(opts.inputDir, name);
    try {
      const { text, method } = await extractPdfText(src);
      if (!fingerprintMatches(opts.symbol, text)) continue; // skip other companies' files
      let quarter = detectQuarterFromFilename(name);
      if (!quarter) {
        const callDate = detectDateFromHeader(text.slice(0, 4000));
        if (callDate) quarter = reportingQuarterFromCallDate(callDate);
      }
      items.push({ src, quarter, text, method });
    } catch (e) {
      manifest.failed.push({ sourcePath: src, reason: String(e) });
    }
  }

  // group by quarter, dedupe by length
  const byQ: Record<string, Item[]> = {};
  for (const it of items) {
    if (!it.quarter) { manifest.failed.push({ sourcePath: it.src, reason: "could not detect quarter" }); continue; }
    if (!byQ[it.quarter]) byQ[it.quarter] = [];
    byQ[it.quarter].push(it);
  }
  for (const [q, group] of Object.entries(byQ)) {
    group.sort((a, b) => b.text.length - a.text.length);
    const winner = group[0];
    for (const loser of group.slice(1)) {
      manifest.duplicatesSkipped.push({ sourcePath: loser.src, quarter: q, keptPath: winner.src });
    }
    const cleaned = stripRepeatingFooters(stripCoverLetter(winner.text)).trim();
    const outFile = path.join(opts.outputDir, `${q}.txt`);
    await fs.writeFile(outFile, cleaned, "utf-8");
    manifest.ingested.push({ quarter: q, sourcePath: winner.src, method: winner.method, chars: cleaned.length });
  }
  manifest.ingested.sort((a, b) => a.quarter.localeCompare(b.quarter));
  return manifest;
}
```

**Step 2: One-off run**

Create `scripts/_one-off-ingest-transcripts.ts`:
```ts
import { ingestTranscripts } from "@/lib/intel/transcripts";
import path from "node:path";

(async () => {
  for (const sym of ["BAJAJFINSV", "HDFCBANK"]) {
    const m = await ingestTranscripts({
      symbol: sym,
      inputDir: "Concall Data",
      outputDir: path.join("data/intelligence", sym, "transcripts"),
    });
    console.log(`[${sym}] ingested:`, m.ingested.map(i => `${i.quarter}(${i.chars}c)`).join(", "));
    if (m.duplicatesSkipped.length) console.log(`  dup skipped:`, m.duplicatesSkipped);
    if (m.failed.length) console.log(`  failed:`, m.failed);
  }
})().catch((e) => { console.error(e); process.exit(1); });
```

Run: `npx tsx scripts/_one-off-ingest-transcripts.ts`

Expected: 7 transcripts for BAJAJFINSV (Q1-FY25..Q3-FY26), 4-5 for HDFCBANK, no failures, possibly some dup-skipped.

**Step 3: Inspect**

Run:
```bash
ls "data/intelligence/BAJAJFINSV/transcripts/" "data/intelligence/HDFCBANK/transcripts/"
head -c 500 "data/intelligence/BAJAJFINSV/transcripts/Q1-FY26.txt"
```

Confirm files exist and start at "Moderator:".

**Step 4: Delete one-off**

```bash
rm scripts/_one-off-ingest-transcripts.ts
```

**Step 5: Stage**

```bash
git add lib/intel/transcripts.ts data/intelligence/BAJAJFINSV/transcripts data/intelligence/HDFCBANK/transcripts
```

---

## Phase 4 — Anthropic SDK wrapper

### Task 4.1: Anthropic client wrapper

> **Invoke `claude-api` skill before writing this task** to ensure SDK best practices, prompt caching, and current model versioning.

**Files:**
- Create: `lib/intel/anthropic.ts`
- Create: `lib/intel/anthropic.test.ts`

**Step 1: Failing test (mock-only)**

```ts
import { describe, test, expect, vi } from "vitest";
import { withRetry } from "./anthropic";

describe("withRetry", () => {
  test("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await withRetry(fn, { tries: 3, baseMs: 1 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries on failure then succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("ok");
    expect(await withRetry(fn, { tries: 3, baseMs: 1 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("throws after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(withRetry(fn, { tries: 2, baseMs: 1 })).rejects.toThrow(/nope/);
  });
});
```

**Step 2: Run — fail**

**Step 3: Implement**

Create `lib/intel/anthropic.ts`:
```ts
// lib/intel/anthropic.ts — thin wrapper over @anthropic-ai/sdk with retry, JSON parsing,
// and basic cost telemetry. Always returns the parsed JSON body for response_format=json.

import Anthropic from "@anthropic-ai/sdk";

// Model IDs current as of plan write (2026-04-29). Update here if the project upgrades.
export const MODEL_HAIKU = "claude-haiku-4-5";
export const MODEL_SONNET = "claude-sonnet-4-7";

export interface RetryOptions { tries: number; baseMs: number; }

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = { tries: 3, baseMs: 1000 }): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < opts.tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i < opts.tries - 1) {
        await new Promise((r) => setTimeout(r, opts.baseMs * Math.pow(4, i)));
      }
    }
  }
  throw lastErr;
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing — see .env.local.example");
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface CallJsonOpts {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  cacheControl?: boolean; // if true, set cache_control on the system block
}

export interface CallJsonResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
}

/** Issue a JSON-mode call. Caller is responsible for instructing the model
 *  to output a JSON object; we parse the first text block as JSON. */
export async function callJson<T>(opts: CallJsonOpts): Promise<CallJsonResult<T>> {
  const c = client();
  const sys = opts.cacheControl
    ? [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }]
    : opts.system;

  const resp = await withRetry(() => c.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0,
    system: sys as never,
    messages: [{ role: "user", content: opts.user }],
  }));

  const block = resp.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Anthropic response had no text block");
  let parsed: T;
  try { parsed = JSON.parse(block.text) as T; }
  catch (e) { throw new Error(`Anthropic returned non-JSON: ${block.text.slice(0, 200)}...`); }

  // Usage typing per SDK v0.30+
  const u = resp.usage as unknown as {
    input_tokens?: number; output_tokens?: number;
    cache_read_input_tokens?: number; cache_creation_input_tokens?: number;
  };
  return {
    data: parsed,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheCreateTokens: u.cache_creation_input_tokens ?? 0,
  };
}

/** Approximate USD cost from token counts. Update rates if Anthropic price changes. */
export function estimateCostUsd(model: string, r: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheCreateTokens?: number; }): number {
  // Rates (per million tokens) at plan write — update as needed.
  const RATES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
    [MODEL_HAIKU]:  { in: 1.0,  out: 5.0,  cacheRead: 0.10, cacheWrite: 1.25 },
    [MODEL_SONNET]: { in: 3.0,  out: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  };
  const rate = RATES[model];
  if (!rate) return 0;
  return (
    (r.inputTokens / 1_000_000) * rate.in +
    (r.outputTokens / 1_000_000) * rate.out +
    ((r.cacheReadTokens ?? 0) / 1_000_000) * rate.cacheRead +
    ((r.cacheCreateTokens ?? 0) / 1_000_000) * rate.cacheWrite
  );
}
```

**Step 4: Run — pass**

`npm test -- lib/intel/anthropic.test.ts`

**Step 5: Stage**

```bash
git add lib/intel/anthropic.ts lib/intel/anthropic.test.ts
```

---

## Phase 5 — Stage 3: Extract claims

> **Invoke `claude-api` skill before writing this task.**

### Task 5.1: Claim-extraction prompt + function

**Files:**
- Create: `lib/intel/extractClaims.ts`
- Create: `lib/intel/extractClaims.test.ts`

**Step 1: Failing test (validation only — no live LLM call)**

```ts
import { describe, test, expect } from "vitest";
import { validateClaim, buildExtractPrompt } from "./extractClaims";
import { loadRegistry } from "./registry";

describe("extractClaims helpers", () => {
  test("validateClaim drops claims with unknown metricKey", () => {
    const reg = loadRegistry("bank");
    const ok = validateClaim({ metricKey: "nim", quote: "...", direction: "value", value: 4.2, rangeMin: null, rangeMax: null, qualitativeText: null, targetQuarter: "Q1-FY27", targetText: "next quarter", confidence: "high", conditional: null, speaker: null }, reg);
    expect(ok.valid).toBe(true);

    const bad = validateClaim({ metricKey: "nope", quote: "...", direction: "value", value: 4.2, rangeMin: null, rangeMax: null, qualitativeText: null, targetQuarter: null, targetText: "", confidence: "high", conditional: null, speaker: null }, reg);
    expect(bad.valid).toBe(false);
  });

  test("buildExtractPrompt embeds the registry as JSON", () => {
    const reg = loadRegistry("bank");
    const p = buildExtractPrompt({ symbol: "HDFCBANK", quarter: "Q3-FY26", registry: reg, transcript: "..." });
    expect(p.system).toContain("research analyst");
    expect(p.user).toContain("HDFCBANK");
    expect(p.user).toContain("Q3-FY26");
    expect(p.user).toContain('"key": "nim"');
  });
});
```

**Step 2: Run — fail**

**Step 3: Implement**

Create `lib/intel/extractClaims.ts`:
```ts
// lib/intel/extractClaims.ts — Stage 3: turn a transcript into structured claims.
//
// One LLM call per transcript. Output is validated against the registry; claims
// referencing unknown metricKeys are dropped (logged in warnings).

import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import type { ClaimsArtifact, ExtractedClaim, SectorRegistry, ClaimDirection, Confidence } from "./types";
import { callJson, MODEL_HAIKU, estimateCostUsd } from "./anthropic";

export const STAGE3_PROMPT_VERSION = 1;

interface BuildPromptArgs {
  symbol: string;
  quarter: string;
  registry: SectorRegistry;
  transcript: string;
}

export function buildExtractPrompt(a: BuildPromptArgs): { system: string; user: string } {
  const system = `You are a senior equity research analyst extracting forward-looking management guidance from earnings concall transcripts. You work with extreme precision: only extract claims that are explicit, quantifiable, and tied to a specific tracked metric. Reject vague platitudes.

WHAT COUNTS AS A CLAIM:
- Forward-looking: refers to future performance (next quarter, this fiscal year, near-term, etc.). Past performance is NOT a claim.
- Quantifiable: a specific number/range OR a clear directional statement (increase / decrease / maintain).
- Tied to a tracked metric: must map to one of the registered metrics provided in the user message.

WHAT DOES NOT COUNT:
- Pure historical commentary ("we grew 18% this quarter").
- Vague optimism ("we feel good about prospects", "we are excited").
- Industry/macro commentary not specific to the company.
- Q&A clarifications about already-reported numbers.

OUTPUT: a JSON object: { "claims": [Claim, ...] } where Claim is:
{
  "metricKey": string (MUST be exactly one of the keys provided),
  "quote": string (verbatim from transcript, ≤ 300 chars),
  "speaker": string | null (best inference from preceding paragraph; null if unclear),
  "direction": "value" | "range" | "up" | "down" | "stable",
  "value": number | null,
  "rangeMin": number | null,
  "rangeMax": number | null,
  "qualitativeText": string | null  // e.g. "moderately", "meaningfully"
  "targetQuarter": string | null,    // "Q3-FY26" if explicit, else null
  "targetText": string,              // verbatim "by H2 FY26", "near-term", "next quarter"
  "confidence": "high" | "medium" | "low",
  "conditional": string | null       // e.g. "subject to favorable rate environment"
}

If a claim references something not in the registry, do NOT extract it. Do not invent metricKeys.`;

  const registryJson = JSON.stringify(a.registry.metrics.map(m => ({
    key: m.key, label: m.label, unit: m.unit, segment: m.segment,
    aliases: m.aliases, description: m.description,
  })), null, 2);

  const user = `COMPANY: ${a.symbol}
QUARTER (when this call took place — use this as the source quarter for any "next quarter" target inference): ${a.quarter}

TRACKED METRICS (only extract claims about these — match by aliases or description):
${registryJson}

TRANSCRIPT:
${a.transcript}`;

  return { system, user };
}

export function validateClaim(raw: Partial<ExtractedClaim>, registry: SectorRegistry): { valid: boolean; reason?: string } {
  if (!raw.metricKey || !registry.metrics.some(m => m.key === raw.metricKey)) {
    return { valid: false, reason: `unknown metricKey: ${raw.metricKey}` };
  }
  if (!raw.quote || raw.quote.length === 0) return { valid: false, reason: "missing quote" };
  if (!raw.direction) return { valid: false, reason: "missing direction" };
  return { valid: true };
}

export interface ExtractClaimsArgs {
  symbol: string;
  registry: SectorRegistry;
  transcriptsDir: string;            // data/intelligence/{SYMBOL}/transcripts
  outFile: string;                   // data/intelligence/{SYMBOL}/claims.json
  registryHash: string;
  onlyQuarters?: string[];           // optional: re-run for these quarters only
}

export interface ExtractClaimsResult {
  artifact: ClaimsArtifact;
  totalCostUsd: number;
}

export async function extractClaimsForSymbol(args: ExtractClaimsArgs): Promise<ExtractClaimsResult> {
  const files = (await fs.readdir(args.transcriptsDir)).filter(n => n.endsWith(".txt"));
  const byQuarter: Record<string, ExtractedClaim[]> = {};
  const warnings: string[] = [];
  let totalCost = 0;

  for (const fname of files) {
    const quarter = fname.replace(/\.txt$/i, "");
    if (args.onlyQuarters && !args.onlyQuarters.includes(quarter)) continue;
    const transcript = await fs.readFile(path.join(args.transcriptsDir, fname), "utf-8");
    const { system, user } = buildExtractPrompt({
      symbol: args.symbol, quarter, registry: args.registry, transcript,
    });

    const result = await callJson<{ claims: Partial<ExtractedClaim>[] }>({
      model: MODEL_HAIKU,
      system, user,
      maxTokens: 8192,
      temperature: 0,
      cacheControl: true, // system + registry rarely change
    });
    totalCost += estimateCostUsd(MODEL_HAIKU, result);

    const accepted: ExtractedClaim[] = [];
    let n = 0;
    for (const raw of result.data.claims ?? []) {
      const v = validateClaim(raw, args.registry);
      if (!v.valid) { warnings.push(`${quarter}: ${v.reason}`); continue; }
      accepted.push({
        id: `${args.symbol}-${quarter}-c${++n}`,
        metricKey: raw.metricKey!,
        quote: raw.quote!,
        speaker: raw.speaker ?? null,
        direction: raw.direction as ClaimDirection,
        value: raw.value ?? null,
        rangeMin: raw.rangeMin ?? null,
        rangeMax: raw.rangeMax ?? null,
        qualitativeText: raw.qualitativeText ?? null,
        targetQuarter: raw.targetQuarter ?? null,
        targetText: raw.targetText ?? "",
        confidence: (raw.confidence ?? "medium") as Confidence,
        conditional: raw.conditional ?? null,
      });
    }
    byQuarter[quarter] = accepted;
  }

  const artifact: ClaimsArtifact = {
    symbol: args.symbol,
    promptVersion: STAGE3_PROMPT_VERSION,
    model: MODEL_HAIKU,
    generatedAt: new Date().toISOString(),
    registryHash: args.registryHash,
    byQuarter,
    warnings,
  };

  await fs.writeFile(args.outFile, JSON.stringify(artifact, null, 2), "utf-8");
  return { artifact, totalCostUsd: totalCost };
}

export function claimsHash(c: ClaimsArtifact): string {
  return crypto.createHash("sha256").update(JSON.stringify(c.byQuarter)).digest("hex").slice(0, 16);
}
```

**Step 4: Run — pass**

`npm test -- lib/intel/extractClaims.test.ts`

**Step 5: Stage**

```bash
git add lib/intel/extractClaims.ts lib/intel/extractClaims.test.ts
```

---

### Task 5.2: First live extraction run (BAJAJFINSV)

**Files:**
- Create: `data/intelligence/BAJAJFINSV/claims.json` (generated)

**Step 1: Confirm `.env.local` exists with `ANTHROPIC_API_KEY`**

Run: `node -e "require('dotenv').config({path:'.env.local'}); console.log(!!process.env.ANTHROPIC_API_KEY)"` (install dotenv if needed, but Next.js loads `.env.local` at runtime; for the CLI we'll handle it in Phase 8). For now, set in shell:

PowerShell: `$env:ANTHROPIC_API_KEY = "..."`
Bash: `export ANTHROPIC_API_KEY=...`

**Step 2: One-off driver**

Create `scripts/_one-off-extract.ts`:
```ts
import { loadRegistry, registryHash } from "@/lib/intel/registry";
import { extractClaimsForSymbol } from "@/lib/intel/extractClaims";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import path from "node:path";

(async () => {
  const sym = process.argv[2];
  if (!sym) { console.error("usage: ... <SYMBOL>"); process.exit(2); }
  const sector = SYMBOL_SECTOR[sym];
  const reg = loadRegistry(sector);
  const r = await extractClaimsForSymbol({
    symbol: sym,
    registry: reg,
    transcriptsDir: path.join("data/intelligence", sym, "transcripts"),
    outFile: path.join("data/intelligence", sym, "claims.json"),
    registryHash: registryHash(reg),
  });
  const total = Object.values(r.artifact.byQuarter).reduce((s, c) => s + c.length, 0);
  console.log(`[${sym}] extracted ${total} claims across ${Object.keys(r.artifact.byQuarter).length} quarters; cost ~$${r.totalCostUsd.toFixed(3)}`);
  if (r.artifact.warnings.length) console.log(`warnings:`, r.artifact.warnings.slice(0, 5));
})().catch(e => { console.error(e); process.exit(1); });
```

**Step 3: Run for BAJAJFINSV**

Run: `npx tsx scripts/_one-off-extract.ts BAJAJFINSV`
Expected: ≥ 30 claims across ≥ 5 quarters; cost < $0.50.

**Step 4: Manual quality review**

Open `data/intelligence/BAJAJFINSV/claims.json`. Spot-check 5 random claims:
- Does the `quote` actually appear in the corresponding `transcripts/Q*-FY*.txt`?
- Is the `metricKey` reasonable for the quote?
- Is the `direction` right?

If quality is poor (e.g., past-tense statements being extracted), iterate the system prompt in `lib/intel/extractClaims.ts`, bump `STAGE3_PROMPT_VERSION`, re-run.

**Step 5: Stage**

```bash
git add data/intelligence/BAJAJFINSV/claims.json
```

---

### Task 5.3: First live extraction run (HDFCBANK)

Same as 5.2 but `sym=HDFCBANK`.

```bash
npx tsx scripts/_one-off-extract.ts HDFCBANK
git add data/intelligence/HDFCBANK/claims.json
```

Once both companies have acceptable claims:

```bash
rm scripts/_one-off-extract.ts
```

---

## Phase 6 — Target-quarter resolver

### Task 6.1: Resolver

**Files:**
- Create: `lib/intel/targetResolver.ts`
- Create: `lib/intel/targetResolver.test.ts`

**Step 1: Failing tests**

```ts
import { describe, test, expect } from "vitest";
import { resolveTargetQuarter } from "./targetResolver";

describe("resolveTargetQuarter", () => {
  test("explicit targetQuarter passes through", () => {
    expect(resolveTargetQuarter({ sourceQuarter: "Q1-FY26", targetQuarter: "Q3-FY26", targetText: "" })).toEqual({ quarter: "Q3-FY26", confidence: "high" });
  });
  test("'next quarter' resolves to source+1", () => {
    expect(resolveTargetQuarter({ sourceQuarter: "Q1-FY26", targetQuarter: null, targetText: "next quarter" })).toEqual({ quarter: "Q2-FY26", confidence: "high" });
  });
  test("'by FY27' resolves to Q4-FY27", () => {
    expect(resolveTargetQuarter({ sourceQuarter: "Q1-FY26", targetQuarter: null, targetText: "by FY27" })).toEqual({ quarter: "Q4-FY27", confidence: "medium" });
  });
  test("'near-term' resolves to source+1 with low confidence", () => {
    expect(resolveTargetQuarter({ sourceQuarter: "Q2-FY26", targetQuarter: null, targetText: "near-term" })).toEqual({ quarter: "Q3-FY26", confidence: "low" });
  });
  test("'medium-term' returns null (pending indefinitely)", () => {
    expect(resolveTargetQuarter({ sourceQuarter: "Q2-FY26", targetQuarter: null, targetText: "medium-term" })).toEqual({ quarter: null, confidence: "low" });
  });
  test("empty target returns null", () => {
    expect(resolveTargetQuarter({ sourceQuarter: "Q2-FY26", targetQuarter: null, targetText: "" })).toEqual({ quarter: null, confidence: "low" });
  });
});
```

**Step 2: Run — fail**

**Step 3: Implement**

Create `lib/intel/targetResolver.ts`:
```ts
import { quarterAddOffset, normalizeQuarter } from "./quarters";

interface ResolveArgs { sourceQuarter: string; targetQuarter: string | null; targetText: string; }

export function resolveTargetQuarter(a: ResolveArgs): { quarter: string | null; confidence: "high" | "medium" | "low" } {
  // 1. Explicit normalized targetQuarter wins.
  if (a.targetQuarter) {
    const norm = normalizeQuarter(a.targetQuarter);
    if (norm) return { quarter: norm, confidence: "high" };
  }
  const t = (a.targetText ?? "").toLowerCase().trim();
  if (!t) return { quarter: null, confidence: "low" };

  // 2. "next quarter" / "next q"
  if (/^next\s+quarter|^next\s+q\b/.test(t)) {
    return { quarter: quarterAddOffset(a.sourceQuarter, 1), confidence: "high" };
  }
  // 3. "by FY27" / "end of FY27" / "exit FY27"
  const fyMatch = t.match(/(?:by|end of|exit)\s+fy\s*(\d{2})/);
  if (fyMatch) {
    return { quarter: `Q4-FY${fyMatch[1]}`, confidence: "medium" };
  }
  // 4. "by Q3 FY27"
  const qMatch = t.match(/(?:by|in|during)\s+q([1-4])\s*-?\s*fy\s*(\d{2})/);
  if (qMatch) return { quarter: `Q${qMatch[1]}-FY${qMatch[2]}`, confidence: "high" };
  // 5. "H1 FY27" / "H2 FY27"
  const hMatch = t.match(/h([12])\s*-?\s*fy\s*(\d{2})/);
  if (hMatch) {
    const q = hMatch[1] === "1" ? "Q2" : "Q4";
    return { quarter: `${q}-FY${hMatch[2]}`, confidence: "medium" };
  }
  // 6. "near-term" / "near term"
  if (/near[-\s]?term/.test(t)) {
    return { quarter: quarterAddOffset(a.sourceQuarter, 1), confidence: "low" };
  }
  // 7. "medium-term" / "long-term" / "over time" — pending indefinitely
  if (/medium[-\s]?term|long[-\s]?term|over time|in the future/.test(t)) {
    return { quarter: null, confidence: "low" };
  }
  // 8. "this fiscal" / "this year"
  if (/this fiscal|this year|fy current/.test(t)) {
    const m = a.sourceQuarter.match(/Q[1-4]-FY(\d{2})/);
    if (m) return { quarter: `Q4-FY${m[1]}`, confidence: "medium" };
  }
  return { quarter: null, confidence: "low" };
}
```

**Step 4: Run — pass**

**Step 5: Stage**

```bash
git add lib/intel/targetResolver.ts lib/intel/targetResolver.test.ts
```

---

## Phase 7 — Stage 4: Cross-check

> **Invoke `claude-api` skill before writing this task.**

### Task 7.1: Cross-check prompt + driver

**Files:**
- Create: `lib/intel/crossCheck.ts`
- Create: `lib/intel/crossCheck.test.ts`

**Step 1: Failing test (validation only)**

```ts
import { describe, test, expect } from "vitest";
import { groupClaimsByTargetQuarter, buildCrossCheckPrompt } from "./crossCheck";
import { loadRegistry } from "./registry";

describe("crossCheck helpers", () => {
  test("groupClaimsByTargetQuarter resolves and groups", () => {
    const claims = {
      "Q1-FY26": [
        { id: "c1", metricKey: "nim", quote: "...", speaker: null, direction: "value" as const, value: 4.2, rangeMin: null, rangeMax: null, qualitativeText: null, targetQuarter: "Q3-FY26", targetText: "by Q3 FY26", confidence: "high" as const, conditional: null },
        { id: "c2", metricKey: "nim", quote: "...", speaker: null, direction: "stable" as const, value: null, rangeMin: null, rangeMax: null, qualitativeText: null, targetQuarter: null, targetText: "next quarter", confidence: "high" as const, conditional: null },
      ],
    };
    const out = groupClaimsByTargetQuarter(claims);
    expect(out["Q3-FY26"]).toHaveLength(1);
    expect(out["Q2-FY26"]).toHaveLength(1);
  });

  test("buildCrossCheckPrompt embeds claims + actuals", () => {
    const reg = loadRegistry("bank");
    const p = buildCrossCheckPrompt({
      symbol: "HDFCBANK",
      targetQuarter: "Q3-FY26",
      claims: [],
      actuals: { endDate: "2025-12-31", metrics: { nim: 4.18 } },
      registry: reg,
    });
    expect(p.user).toContain("Q3-FY26");
    expect(p.user).toContain("4.18");
  });
});
```

**Step 2: Run — fail**

**Step 3: Implement**

Create `lib/intel/crossCheck.ts`:
```ts
import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import type {
  ChecksArtifact, ClaimCheck, ClaimsArtifact, ExtractedClaim,
  Fundamentals, QuarterFundamentals, SectorRegistry, CheckStatus,
} from "./types";
import { resolveTargetQuarter } from "./targetResolver";
import { callJson, MODEL_SONNET, estimateCostUsd } from "./anthropic";

export const STAGE4_PROMPT_VERSION = 1;

/** For each claim, resolve its target quarter (using sourceQuarter from byQuarter key)
 *  and group claims by target. Claims that resolve to null are dropped from this map. */
export function groupClaimsByTargetQuarter(byQuarter: Record<string, ExtractedClaim[]>): Record<string, (ExtractedClaim & { sourceQuarter: string; resolvedTarget: string })[]> {
  const out: Record<string, (ExtractedClaim & { sourceQuarter: string; resolvedTarget: string })[]> = {};
  for (const [src, claims] of Object.entries(byQuarter)) {
    for (const c of claims) {
      const r = resolveTargetQuarter({ sourceQuarter: src, targetQuarter: c.targetQuarter, targetText: c.targetText });
      if (!r.quarter) continue;
      if (!out[r.quarter]) out[r.quarter] = [];
      out[r.quarter].push({ ...c, sourceQuarter: src, resolvedTarget: r.quarter });
    }
  }
  return out;
}

interface BuildArgs {
  symbol: string;
  targetQuarter: string;
  claims: (ExtractedClaim & { sourceQuarter: string })[];
  actuals: QuarterFundamentals | null;
  registry: SectorRegistry;
}

export function buildCrossCheckPrompt(a: BuildArgs): { system: string; user: string } {
  const system = `You are a senior equity research analyst evaluating whether management delivered on previously made forward-looking claims. For each claim, compare the promise against the actual reported value and assign a status.

STATUS TAXONOMY:
- "hit": actual met or beat the promise (respect direction: lower-is-better/higher-is-better in the registry).
- "miss": actual is clearly outside tolerance.
- "partial": directionally right but short of the specific target.
- "no-data": actual unavailable for this metric in the provided fundamentals.
- "pending": not yet measurable (you should not return this — caller pre-filters).
- "ambiguous": claim too qualitative to verify objectively. Use sparingly.

TOLERANCE (apply with judgment):
- Growth or % claims: ±2pp = hit; ±2-5pp = partial; beyond = miss.
- Margin/ratio in bps: ±5bps = hit; ±5-15bps = partial.
- Absolute Cr values: ±3% = hit; ±3-7% = partial.
- Directional ("should improve"): any movement in promised direction = hit; flat = partial; opposite = miss.
- Range ("16-18%"): inside range = hit; ±5% of nearest band edge = partial.

CONDITIONALS: if a claim has a "conditional" string, assume the condition held unless you have explicit evidence in the user message stating otherwise. If you do downgrade a status because of an unmet condition, set conditionalApplied=true with a short conditionalNote.

OUTPUT: a JSON object: { "checks": [Check, ...] } where Check is:
{
  "claimId": string,            // copied from input claim
  "metricKey": string,          // copied from input claim
  "status": "hit" | "miss" | "partial" | "no-data" | "ambiguous",
  "actualValue": number | null,
  "actualUnit": string,
  "reasoning": string,          // 2-3 sentences in plain English
  "deltaText": string,          // human-readable delta, e.g. "actual 14.18% vs promised 14.20% — within 5bps"
  "conditionalApplied": boolean,
  "conditionalNote": string | null
}`;

  const claimsJson = JSON.stringify(a.claims.map(c => ({
    id: c.id, metricKey: c.metricKey, sourceQuarter: c.sourceQuarter,
    quote: c.quote, direction: c.direction, value: c.value,
    rangeMin: c.rangeMin, rangeMax: c.rangeMax,
    qualitativeText: c.qualitativeText, targetText: c.targetText,
    conditional: c.conditional,
  })), null, 2);

  // Provide only the metrics referenced by these claims, not the whole registry
  const referencedKeys = new Set(a.claims.map(c => c.metricKey));
  const relevantMetrics = a.registry.metrics
    .filter(m => referencedKeys.has(m.key))
    .map(m => ({ key: m.key, label: m.label, unit: m.unit, direction: m.direction, description: m.description }));

  const actualsJson = JSON.stringify({
    targetQuarter: a.targetQuarter,
    endDate: a.actuals?.endDate ?? null,
    metrics: a.actuals?.metrics ?? {},
  }, null, 2);

  const user = `COMPANY: ${a.symbol}
TARGET QUARTER (resolved): ${a.targetQuarter}

CLAIMS TO CHECK (sourceQuarter is when the claim was made):
${claimsJson}

REGISTRY METRICS (for direction + unit):
${JSON.stringify(relevantMetrics, null, 2)}

ACTUALS FOR ${a.targetQuarter}:
${actualsJson}`;

  return { system, user };
}

interface CrossCheckArgs {
  symbol: string;
  registry: SectorRegistry;
  fundamentals: Fundamentals;
  claims: ClaimsArtifact;
  outFile: string;
  fundamentalsHash: string;
  claimsHash: string;
}

export async function crossCheckForSymbol(args: CrossCheckArgs): Promise<{ artifact: ChecksArtifact; totalCostUsd: number }> {
  const grouped = groupClaimsByTargetQuarter(args.claims.byQuarter);
  const byTarget: Record<string, ClaimCheck[]> = {};
  const warnings: string[] = [];
  let totalCost = 0;

  for (const [targetQ, claims] of Object.entries(grouped)) {
    const actuals = args.fundamentals.quarters[targetQ] ?? null;
    if (!actuals) {
      // pending (target quarter not yet in fundamentals)
      byTarget[targetQ] = claims.map(c => ({
        claimId: c.id,
        metricKey: c.metricKey,
        sourceQuarter: c.sourceQuarter,
        targetQuarter: targetQ,
        status: "pending" as CheckStatus,
        actualValue: null,
        actualUnit: "",
        reasoning: "Target quarter actuals not yet available.",
        deltaText: "",
        conditionalApplied: false,
        conditionalNote: null,
      }));
      continue;
    }

    const { system, user } = buildCrossCheckPrompt({
      symbol: args.symbol, targetQuarter: targetQ, claims, actuals, registry: args.registry,
    });
    try {
      const result = await callJson<{ checks: Partial<ClaimCheck>[] }>({
        model: MODEL_SONNET, system, user, maxTokens: 4096, temperature: 0,
      });
      totalCost += estimateCostUsd(MODEL_SONNET, result);
      const accepted: ClaimCheck[] = [];
      for (const raw of result.data.checks ?? []) {
        if (!raw.claimId || !raw.status) { warnings.push(`${targetQ}: dropped malformed check`); continue; }
        accepted.push({
          claimId: raw.claimId,
          metricKey: raw.metricKey ?? "",
          sourceQuarter: claims.find(c => c.id === raw.claimId)?.sourceQuarter ?? "",
          targetQuarter: targetQ,
          status: raw.status as CheckStatus,
          actualValue: raw.actualValue ?? null,
          actualUnit: raw.actualUnit ?? "",
          reasoning: raw.reasoning ?? "",
          deltaText: raw.deltaText ?? "",
          conditionalApplied: !!raw.conditionalApplied,
          conditionalNote: raw.conditionalNote ?? null,
        });
      }
      byTarget[targetQ] = accepted;
    } catch (e) {
      warnings.push(`${targetQ}: cross-check failed — ${e}`);
    }
  }

  const artifact: ChecksArtifact = {
    symbol: args.symbol,
    promptVersion: STAGE4_PROMPT_VERSION,
    model: MODEL_SONNET,
    generatedAt: new Date().toISOString(),
    claimsHash: args.claimsHash,
    fundamentalsHash: args.fundamentalsHash,
    byTargetQuarter: byTarget,
    warnings,
  };
  await fs.writeFile(args.outFile, JSON.stringify(artifact, null, 2), "utf-8");
  return { artifact, totalCostUsd: totalCost };
}

export function checksHash(c: ChecksArtifact): string {
  return crypto.createHash("sha256").update(JSON.stringify(c.byTargetQuarter)).digest("hex").slice(0, 16);
}
```

**Step 4: Run — pass**

`npm test -- lib/intel/crossCheck.test.ts`

**Step 5: Stage**

```bash
git add lib/intel/crossCheck.ts lib/intel/crossCheck.test.ts
```

---

### Task 7.2: First cross-check run for both companies

**Step 1: One-off driver**

Create `scripts/_one-off-crosscheck.ts`:
```ts
import { loadRegistry, registryHash } from "@/lib/intel/registry";
import { fundamentalsHash } from "@/lib/intel/parseExcel";
import { crossCheckForSymbol } from "@/lib/intel/crossCheck";
import { claimsHash } from "@/lib/intel/extractClaims";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import path from "node:path";
import { promises as fs } from "node:fs";

(async () => {
  const sym = process.argv[2];
  const sector = SYMBOL_SECTOR[sym];
  const reg = loadRegistry(sector);
  const fund = JSON.parse(await fs.readFile(path.join("data/intelligence", sym, "fundamentals.json"), "utf-8"));
  const cls  = JSON.parse(await fs.readFile(path.join("data/intelligence", sym, "claims.json"), "utf-8"));
  const r = await crossCheckForSymbol({
    symbol: sym, registry: reg, fundamentals: fund, claims: cls,
    outFile: path.join("data/intelligence", sym, "checks.json"),
    fundamentalsHash: fundamentalsHash(fund),
    claimsHash: claimsHash(cls),
  });
  const total = Object.values(r.artifact.byTargetQuarter).reduce((s, a) => s + a.length, 0);
  const stats = { hit: 0, miss: 0, partial: 0, pending: 0, "no-data": 0, ambiguous: 0 };
  for (const arr of Object.values(r.artifact.byTargetQuarter))
    for (const c of arr) (stats as any)[c.status] = ((stats as any)[c.status] ?? 0) + 1;
  console.log(`[${sym}] ${total} checks; cost ~$${r.totalCostUsd.toFixed(3)} — `, stats);
})().catch(e => { console.error(e); process.exit(1); });
```

**Step 2: Run for both**

```bash
npx tsx scripts/_one-off-crosscheck.ts BAJAJFINSV
npx tsx scripts/_one-off-crosscheck.ts HDFCBANK
```

Expected: `checks.json` produced for both. Some claims will be `pending` (target quarter > latest fundamentals). Some will be `no-data` (metric missing in `fundamentals.json`). Several should be `hit` / `miss` / `partial`.

**Step 3: Spot-check**

Open `data/intelligence/BAJAJFINSV/checks.json`. For 3 random `hit`/`miss` checks, verify:
- The reasoning makes sense given the actual value.
- The delta text matches the numbers.

If quality is poor, iterate the system prompt in `lib/intel/crossCheck.ts`, bump `STAGE4_PROMPT_VERSION`, re-run.

**Step 4: Clean up + stage**

```bash
rm scripts/_one-off-crosscheck.ts
git add data/intelligence/BAJAJFINSV/checks.json data/intelligence/HDFCBANK/checks.json
```

---

## Phase 8 — CLI orchestrator

### Task 8.1: `intel:rebuild` command

**Files:**
- Create: `scripts/intel-rebuild.ts`
- Modify: `package.json`

**Step 1: Implement orchestrator**

Create `scripts/intel-rebuild.ts`:
```ts
// scripts/intel-rebuild.ts — npm run intel:rebuild SYMBOL [--stage=...] [--force] [--all] [--cost-cap=5]

import { promises as fs } from "node:fs";
import path from "node:path";
import { config as dotenv } from "dotenv";
import { loadRegistry, registryHash } from "@/lib/intel/registry";
import { parseExcel, writeFundamentals, fundamentalsHash } from "@/lib/intel/parseExcel";
import { ingestTranscripts } from "@/lib/intel/transcripts";
import { extractClaimsForSymbol, claimsHash } from "@/lib/intel/extractClaims";
import { crossCheckForSymbol } from "@/lib/intel/crossCheck";
import { SYMBOL_SECTOR, type SectorKey } from "@/lib/intel/types";

dotenv({ path: ".env.local" });

const STAGES = ["parseExcel", "cleanTranscripts", "extractClaims", "crossCheck"] as const;
type Stage = typeof STAGES[number];

interface Args { symbols: string[]; stage: Stage | "all"; force: boolean; costCap: number; }

function parseArgs(argv: string[]): Args {
  const out: Args = { symbols: [], stage: "all", force: false, costCap: 5 };
  for (const a of argv.slice(2)) {
    if (a === "--all") { out.symbols = Object.keys(SYMBOL_SECTOR); }
    else if (a === "--force") out.force = true;
    else if (a.startsWith("--stage=")) {
      const s = a.split("=")[1] as Stage;
      if (!STAGES.includes(s)) throw new Error(`unknown stage: ${s}`);
      out.stage = s;
    }
    else if (a.startsWith("--cost-cap=")) out.costCap = parseFloat(a.split("=")[1]);
    else if (!a.startsWith("--")) out.symbols.push(a);
  }
  if (out.symbols.length === 0) throw new Error("usage: intel-rebuild SYMBOL [--stage=...] [--force] [--all]");
  return out;
}

const EXCEL_PATHS: Record<string, { xlsx: string; ticker: string }> = {
  BAJAJFINSV: { xlsx: "Concall Data/Fundamental data/Bajaj finserve.xlsx", ticker: "BJFIN IN" },
  HDFCBANK:   { xlsx: "Concall Data/Fundamental data/HDFC.xlsx",            ticker: "hdfcb in" },
};

async function rebuild(symbol: string, args: Args) {
  if (!process.env.ANTHROPIC_API_KEY && (args.stage === "all" || args.stage === "extractClaims" || args.stage === "crossCheck")) {
    throw new Error("ANTHROPIC_API_KEY missing — see .env.local.example");
  }
  const sector: SectorKey = SYMBOL_SECTOR[symbol];
  if (!sector) throw new Error(`unknown symbol: ${symbol} (add to SYMBOL_SECTOR)`);
  const reg = loadRegistry(sector);
  const dir = path.join("data/intelligence", symbol);
  await fs.mkdir(dir, { recursive: true });

  let totalCost = 0;
  console.log(`\n=== ${symbol} (${sector}) ===`);

  // Stage 1
  if (args.stage === "all" || args.stage === "parseExcel") {
    console.log("[1/4] parseExcel…");
    const f = await parseExcel({
      symbol, ticker: EXCEL_PATHS[symbol].ticker,
      xlsxPath: EXCEL_PATHS[symbol].xlsx, registry: reg,
    });
    await writeFundamentals(symbol, f);
    console.log(`     ${Object.keys(f.quarters).length} quarters; ${f.warnings.length} warnings`);
  }

  // Stage 2
  if (args.stage === "all" || args.stage === "cleanTranscripts") {
    console.log("[2/4] cleanTranscripts…");
    const m = await ingestTranscripts({
      symbol, inputDir: "Concall Data",
      outputDir: path.join(dir, "transcripts"),
    });
    console.log(`     ${m.ingested.length} transcripts; ${m.failed.length} failed; ${m.duplicatesSkipped.length} dup`);
  }

  // Stage 3
  if (args.stage === "all" || args.stage === "extractClaims") {
    console.log("[3/4] extractClaims…");
    const r = await extractClaimsForSymbol({
      symbol, registry: reg,
      transcriptsDir: path.join(dir, "transcripts"),
      outFile: path.join(dir, "claims.json"),
      registryHash: registryHash(reg),
    });
    const n = Object.values(r.artifact.byQuarter).reduce((s, c) => s + c.length, 0);
    totalCost += r.totalCostUsd;
    console.log(`     ${n} claims; +$${r.totalCostUsd.toFixed(3)} (running $${totalCost.toFixed(3)})`);
    if (totalCost > args.costCap) throw new Error(`cost cap $${args.costCap} exceeded`);
  }

  // Stage 4
  if (args.stage === "all" || args.stage === "crossCheck") {
    console.log("[4/4] crossCheck…");
    const fund = JSON.parse(await fs.readFile(path.join(dir, "fundamentals.json"), "utf-8"));
    const cls = JSON.parse(await fs.readFile(path.join(dir, "claims.json"), "utf-8"));
    const r = await crossCheckForSymbol({
      symbol, registry: reg, fundamentals: fund, claims: cls,
      outFile: path.join(dir, "checks.json"),
      fundamentalsHash: fundamentalsHash(fund),
      claimsHash: claimsHash(cls),
    });
    const stats = { hit: 0, miss: 0, partial: 0, pending: 0, "no-data": 0, ambiguous: 0 };
    for (const arr of Object.values(r.artifact.byTargetQuarter))
      for (const c of arr) (stats as Record<string, number>)[c.status] = ((stats as Record<string, number>)[c.status] ?? 0) + 1;
    totalCost += r.totalCostUsd;
    console.log(`     +$${r.totalCostUsd.toFixed(3)} (running $${totalCost.toFixed(3)})`, stats);
  }

  // Write meta
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify({
    symbol, sector, lastBuiltAt: new Date().toISOString(), totalCostUsd: totalCost,
  }, null, 2));
}

(async () => {
  const args = parseArgs(process.argv);
  for (const sym of args.symbols) await rebuild(sym, args);
})().catch((e) => { console.error("\nFAIL:", e); process.exit(1); });
```

**Step 2: Install dotenv**

Run: `npm install dotenv`

**Step 3: Add npm script**

Modify `package.json` `scripts`:
```json
"scripts": {
  "dev": "next dev -p 3001",
  "build": "next build",
  "start": "next start -p 3001",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "intel:rebuild": "tsx scripts/intel-rebuild.ts"
}
```

**Step 4: Smoke-run**

```bash
npm run intel:rebuild -- BAJAJFINSV --stage=parseExcel
```

Expected: stage 1 only, fast, no LLM.

```bash
npm run intel:rebuild -- BAJAJFINSV
```

Expected: full pipeline; fundamentals/transcripts cached, only Stages 3+4 incur cost.

**Step 5: Stage**

```bash
git add scripts/intel-rebuild.ts package.json package-lock.json data/intelligence/*/meta.json
```

---

## Phase 9 — API routes

### Task 9.1: GET /api/intel/companies

**Files:**
- Create: `app/api/intel/companies/route.ts`

**Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const dir = path.join(process.cwd(), "data", "intelligence");
  const entries: { symbol: string; sector?: string; lastBuiltAt?: string }[] = [];
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const it of items) {
      if (!it.isDirectory() || it.name === "registries") continue;
      const meta = path.join(dir, it.name, "meta.json");
      try {
        const m = JSON.parse(await fs.readFile(meta, "utf-8"));
        entries.push({ symbol: it.name, sector: m.sector, lastBuiltAt: m.lastBuiltAt });
      } catch {
        entries.push({ symbol: it.name });
      }
    }
  } catch { /* dir missing */ }
  return NextResponse.json({ companies: entries });
}
```

**Step 2: Smoke**

```bash
npm run dev
# in another shell:
curl http://localhost:3001/api/intel/companies
```

Expected: list of `{ symbol, sector, lastBuiltAt }` for built companies.

**Step 3: Stage**

```bash
git add app/api/intel/companies/route.ts
```

---

### Task 9.2: GET /api/intel/[symbol]

**Files:**
- Create: `app/api/intel/[symbol]/route.ts`

**Step 1: Implement**

```ts
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadRegistry } from "@/lib/intel/registry";
import { SYMBOL_SECTOR } from "@/lib/intel/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const sector = SYMBOL_SECTOR[symbol];
  if (!sector) return NextResponse.json({ error: "unknown symbol" }, { status: 404 });

  const dir = path.join(process.cwd(), "data", "intelligence", symbol);
  async function readJson<T>(name: string): Promise<T | null> {
    try { return JSON.parse(await fs.readFile(path.join(dir, name), "utf-8")) as T; }
    catch { return null; }
  }

  const [meta, fundamentals, claims, checks] = await Promise.all([
    readJson("meta.json"),
    readJson("fundamentals.json"),
    readJson("claims.json"),
    readJson("checks.json"),
  ]);
  const registry = loadRegistry(sector);
  return NextResponse.json({ symbol, sector, registry, meta, fundamentals, claims, checks });
}
```

**Step 2: Smoke**

```bash
curl http://localhost:3001/api/intel/HDFCBANK | python -c "import sys,json; d=json.load(sys.stdin); print('claims:', sum(len(v) for v in (d['claims']['byQuarter'] if d.get('claims') else {}).values()))"
```

Expected: claim count > 0.

**Step 3: Stage**

```bash
git add app/api/intel/\[symbol\]/route.ts
```

---

## Phase 10 — Dashboard UI

### Task 10.1: Generic `WatchlistSidebar`

**Files:**
- Create: `components/layout/WatchlistSidebar.tsx`

The existing `components/portfolio/PortfolioSidebar.tsx` has all the logic. Generalize by parameterizing storage key and adding an optional per-row badge prop.

**Step 1: Read existing file**

`Read components/portfolio/PortfolioSidebar.tsx`. The interface is:

```ts
interface Props {
  selected: string | null;
  onSelect: (symbol: string, name: string) => void;
  onSearchFocusChange?: (focused: boolean) => void;
}
```

The new version takes:
```ts
interface Props {
  storageKey: string;             // "portfolio_v1" or "intel_companies_v1"
  headerTitle: string;            // "MY PORTFOLIO" or "INTEL"
  selected: string | null;
  onSelect: (symbol: string, name: string) => void;
  onSearchFocusChange?: (focused: boolean) => void;
  rowBadge?: (symbol: string) => React.ReactNode;  // e.g. orange dot for unbuilt
}
```

**Step 2: Implement**

Copy `PortfolioSidebar.tsx` contents to `components/layout/WatchlistSidebar.tsx`. Replace:
- `const STORAGE_KEY = "portfolio_v1";` → take `storageKey` from props.
- Hardcoded "My Portfolio" string → `headerTitle` prop.
- After `entry.symbol` in the row, before the remove button, render `props.rowBadge?.(entry.symbol)`.
- Rename type alias `PortfolioEntry` → `WatchlistEntry`. Re-export from this file.

**Step 3: Update PortfolioSidebar to be a thin wrapper**

Replace the body of `components/portfolio/PortfolioSidebar.tsx` with:
```tsx
"use client";
import { WatchlistSidebar } from "@/components/layout/WatchlistSidebar";

interface Props {
  selected: string | null;
  onSelect: (symbol: string, name: string) => void;
  onSearchFocusChange?: (focused: boolean) => void;
}

export function PortfolioSidebar(props: Props) {
  return <WatchlistSidebar {...props} storageKey="portfolio_v1" headerTitle="My Portfolio" />;
}
```

**Step 4: Smoke**

```bash
npm run dev
# Visit http://localhost:3001/portfolio — confirm it still works exactly as before.
```

**Step 5: Stage**

```bash
git add components/layout/WatchlistSidebar.tsx components/portfolio/PortfolioSidebar.tsx
```

---

### Task 10.2: StatusBadge + sector segment helpers

**Files:**
- Create: `components/intel/StatusBadge.tsx`
- Create: `lib/intel/uiHelpers.ts`

**Step 1: StatusBadge**

```tsx
"use client";
import type { CheckStatus } from "@/lib/intel/types";

const COLORS: Record<CheckStatus, { fg: string; bg: string; sym: string }> = {
  hit:        { fg: "var(--color-teal)",   bg: "color-mix(in srgb, var(--color-teal) 12%, transparent)",   sym: "✓" },
  miss:       { fg: "var(--color-danger)", bg: "color-mix(in srgb, var(--color-danger) 12%, transparent)", sym: "✗" },
  partial:    { fg: "var(--color-amber)",  bg: "color-mix(in srgb, var(--color-amber) 12%, transparent)",  sym: "◐" },
  pending:    { fg: "var(--color-muted)",  bg: "transparent", sym: "⏳" },
  "no-data":  { fg: "var(--color-muted)",  bg: "transparent", sym: "—" },
  ambiguous:  { fg: "var(--color-muted)",  bg: "transparent", sym: "?" },
};

export function StatusBadge({ status }: { status: CheckStatus }) {
  const c = COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider"
      style={{ color: c.fg, background: c.bg }}
    >
      <span>{c.sym}</span>
      <span>{status}</span>
    </span>
  );
}
```

**Step 2: uiHelpers**

```ts
// lib/intel/uiHelpers.ts
import type { ClaimCheck, ExtractedClaim, RegistryMetric, SectorRegistry } from "./types";

export interface JoinedRow {
  claim: ExtractedClaim;
  sourceQuarter: string;
  metric: RegistryMetric | null;
  check: ClaimCheck | null;
}

export function joinClaimsAndChecks(
  claimsByQuarter: Record<string, ExtractedClaim[]>,
  checksByTarget: Record<string, ClaimCheck[]>,
  registry: SectorRegistry,
): JoinedRow[] {
  const checkByClaimId = new Map<string, ClaimCheck>();
  for (const arr of Object.values(checksByTarget)) for (const c of arr) checkByClaimId.set(c.claimId, c);
  const out: JoinedRow[] = [];
  for (const [src, claims] of Object.entries(claimsByQuarter)) {
    for (const claim of claims) {
      out.push({
        claim,
        sourceQuarter: src,
        metric: registry.metrics.find(m => m.key === claim.metricKey) ?? null,
        check: checkByClaimId.get(claim.id) ?? null,
      });
    }
  }
  return out;
}

export function formatPromise(claim: ExtractedClaim): string {
  if (claim.direction === "value" && claim.value != null) return `${claim.value}`;
  if (claim.direction === "range" && claim.rangeMin != null && claim.rangeMax != null) return `${claim.rangeMin}–${claim.rangeMax}`;
  if (claim.direction === "up") return `↑${claim.qualitativeText ? " " + claim.qualitativeText : ""}`;
  if (claim.direction === "down") return `↓${claim.qualitativeText ? " " + claim.qualitativeText : ""}`;
  if (claim.direction === "stable") return "stable";
  return "—";
}
```

**Step 3: Stage**

```bash
git add components/intel/StatusBadge.tsx lib/intel/uiHelpers.ts
```

---

### Task 10.3: ClaimsTable + ClaimRow + FiltersBar + IntelHeader

**Files:**
- Create: `components/intel/IntelHeader.tsx`
- Create: `components/intel/FiltersBar.tsx`
- Create: `components/intel/ClaimsTable.tsx`
- Create: `components/intel/ClaimRow.tsx`

These are composition-heavy and the patterns mirror portfolio components. Keep each component focused; lift filter state into the page.

**Step 1: IntelHeader**

```tsx
"use client";
import type { CheckStatus } from "@/lib/intel/types";

interface Props {
  symbol: string;
  sector: string;
  lastCallDate?: string | null;
  counts: Record<CheckStatus, number>;
}

export function IntelHeader({ symbol, sector, lastCallDate, counts }: Props) {
  return (
    <div className="flex items-center px-5 py-3 border-b border-border bg-surface">
      <div className="flex flex-col">
        <span className="text-sm font-mono font-semibold text-primary">{symbol}</span>
        <span className="text-[10px] font-mono text-muted">
          {sector}{lastCallDate ? ` · last call: ${lastCallDate}` : ""}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3 font-mono text-[11px]">
        <Counter label="hit"     n={counts.hit}     fg="var(--color-teal)" sym="✓" />
        <Counter label="miss"    n={counts.miss}    fg="var(--color-danger)" sym="✗" />
        <Counter label="partial" n={counts.partial} fg="var(--color-amber)" sym="◐" />
        <Counter label="pending" n={counts.pending} fg="var(--color-muted)" sym="⏳" />
        <Counter label="n/a"     n={counts["no-data"]} fg="var(--color-muted)" sym="—" />
      </div>
    </div>
  );
}

function Counter({ label, n, fg, sym }: { label: string; n: number; fg: string; sym: string }) {
  return (
    <span style={{ color: fg }} className="inline-flex items-center gap-1">
      <span>{sym}</span><span className="font-semibold">{n}</span><span className="text-muted">{label}</span>
    </span>
  );
}
```

**Step 2: FiltersBar**

```tsx
"use client";
import type { CheckStatus } from "@/lib/intel/types";

export interface FilterState {
  status: "all" | CheckStatus;
  segment: string;
  sourceQuarter: string;
  query: string;
}

interface Props {
  state: FilterState;
  onChange: (s: FilterState) => void;
  segments: string[];
  sourceQuarters: string[];
}

export function FiltersBar({ state, onChange, segments, sourceQuarters }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-base flex-wrap">
      <Select label="Status" value={state.status} options={["all","hit","miss","partial","pending","no-data","ambiguous"]} onChange={(v) => onChange({...state, status: v as FilterState["status"]})} />
      <Select label="Segment" value={state.segment} options={["all", ...segments]} onChange={(v) => onChange({...state, segment: v})} />
      <Select label="Source Q" value={state.sourceQuarter} options={["all", ...sourceQuarters]} onChange={(v) => onChange({...state, sourceQuarter: v})} />
      <input
        type="text" value={state.query} placeholder="search…"
        onChange={(e) => onChange({...state, query: e.target.value})}
        className="ml-auto px-2 py-1 text-[11px] font-mono rounded bg-surface border border-border text-primary placeholder:text-muted"
      />
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1 text-[10px] font-mono text-muted">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-surface border border-border rounded px-1 py-0.5 text-primary">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
```

**Step 3: ClaimsTable + ClaimRow**

`components/intel/ClaimRow.tsx`:
```tsx
"use client";
import { useState } from "react";
import { StatusBadge } from "./StatusBadge";
import type { JoinedRow } from "@/lib/intel/uiHelpers";
import { formatPromise } from "@/lib/intel/uiHelpers";

export function ClaimRow({ row }: { row: JoinedRow }) {
  const [open, setOpen] = useState(false);
  const status = row.check?.status ?? "pending";
  const tgt = row.check?.targetQuarter ?? row.claim.targetQuarter ?? "—";
  return (
    <>
      <tr onClick={() => setOpen(o => !o)} className="border-b border-border hover:bg-surface cursor-pointer">
        <td className="px-2 py-1.5 font-mono text-[11px] text-primary">{row.sourceQuarter}</td>
        <td className="px-2 py-1.5 font-mono text-[11px] text-muted">{row.claim.speaker ?? "—"}</td>
        <td className="px-2 py-1.5 font-mono text-[11px] text-primary truncate max-w-[300px]">{row.claim.quote}</td>
        <td className="px-2 py-1.5 font-mono text-[11px] text-amber">{row.metric?.label ?? row.claim.metricKey}</td>
        <td className="px-2 py-1.5 font-mono text-[11px] text-primary">{formatPromise(row.claim)}</td>
        <td className="px-2 py-1.5 font-mono text-[11px] text-muted">{tgt}</td>
        <td className="px-2 py-1.5 font-mono text-[11px] text-primary">{row.check?.actualValue ?? "—"}</td>
        <td className="px-2 py-1.5"><StatusBadge status={status} /></td>
      </tr>
      {open && (
        <tr className="border-b border-border bg-surface">
          <td colSpan={8} className="px-4 py-3 font-mono text-[11px] text-muted leading-relaxed">
            <p className="text-primary mb-1.5">"{row.claim.quote}"</p>
            {row.check?.reasoning && <p className="mb-1"><span className="text-amber">Reasoning:</span> {row.check.reasoning}</p>}
            {row.check?.deltaText && <p className="mb-1"><span className="text-amber">Delta:</span> {row.check.deltaText}</p>}
            {row.claim.conditional && <p className="mb-1"><span className="text-amber">Condition:</span> {row.claim.conditional}</p>}
          </td>
        </tr>
      )}
    </>
  );
}
```

`components/intel/ClaimsTable.tsx`:
```tsx
"use client";
import type { JoinedRow } from "@/lib/intel/uiHelpers";
import { ClaimRow } from "./ClaimRow";

export function ClaimsTable({ rows }: { rows: JoinedRow[] }) {
  return (
    <div className="overflow-auto">
      <table className="w-full">
        <thead className="bg-surface">
          <tr className="border-b border-border">
            {["Q Made","Speaker","Quote","Metric","Promise","Target","Actual","Status"].map(h =>
              <th key={h} className="px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted">{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => <ClaimRow key={r.claim.id} row={r} />)}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center font-mono text-[11px] text-muted py-12">No claims match the current filters.</p>
      )}
    </div>
  );
}
```

**Step 4: Stage**

```bash
git add components/intel/
```

---

### Task 10.4: `app/intel/page.tsx`

**Files:**
- Create: `app/intel/page.tsx`

**Step 1: Implement**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { WatchlistSidebar } from "@/components/layout/WatchlistSidebar";
import { IntelHeader } from "@/components/intel/IntelHeader";
import { FiltersBar, type FilterState } from "@/components/intel/FiltersBar";
import { ClaimsTable } from "@/components/intel/ClaimsTable";
import type { ClaimsArtifact, ChecksArtifact, SectorRegistry, CheckStatus } from "@/lib/intel/types";
import { joinClaimsAndChecks, type JoinedRow } from "@/lib/intel/uiHelpers";

interface IntelPayload {
  symbol: string;
  sector: string;
  registry: SectorRegistry;
  meta: { lastBuiltAt: string } | null;
  claims: ClaimsArtifact | null;
  checks: ChecksArtifact | null;
}

const DEFAULT_FILTER: FilterState = { status: "all", segment: "all", sourceQuarter: "all", query: "" };

export default function IntelPage() {
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [payload, setPayload] = useState<IntelPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);

  const sym = selected?.symbol ?? null;
  useEffect(() => {
    if (!sym) { setPayload(null); return; }
    setLoading(true);
    fetch(`/api/intel/${sym}`).then(r => r.ok ? r.json() : null)
      .then((d: IntelPayload | null) => { setPayload(d); setLoading(false); });
  }, [sym]);

  const rows = useMemo<JoinedRow[]>(() => {
    if (!payload?.claims) return [];
    return joinClaimsAndChecks(
      payload.claims.byQuarter,
      payload.checks?.byTargetQuarter ?? {},
      payload.registry,
    );
  }, [payload]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter.status !== "all") {
        const s = r.check?.status ?? "pending";
        if (s !== filter.status) return false;
      }
      if (filter.segment !== "all" && r.metric?.segment !== filter.segment) return false;
      if (filter.sourceQuarter !== "all" && r.sourceQuarter !== filter.sourceQuarter) return false;
      if (filter.query.trim()) {
        const q = filter.query.toLowerCase();
        const hay = `${r.claim.quote} ${r.check?.reasoning ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      if (a.sourceQuarter !== b.sourceQuarter) return b.sourceQuarter.localeCompare(a.sourceQuarter);
      const order = { miss: 0, partial: 1, pending: 2, hit: 3, "no-data": 4, ambiguous: 5 } as Record<string, number>;
      return (order[a.check?.status ?? "pending"] ?? 9) - (order[b.check?.status ?? "pending"] ?? 9);
    });
  }, [rows, filter]);

  const counts = useMemo(() => {
    const c: Record<CheckStatus, number> = { hit: 0, miss: 0, partial: 0, pending: 0, "no-data": 0, ambiguous: 0 };
    for (const r of rows) c[r.check?.status ?? "pending"]++;
    return c;
  }, [rows]);

  const segments = useMemo(() => Array.from(new Set(payload?.registry.metrics.map(m => m.segment) ?? [])), [payload]);
  const sourceQuarters = useMemo(() => Array.from(new Set(rows.map(r => r.sourceQuarter))).sort(), [rows]);

  return (
    <div className="flex h-screen overflow-hidden bg-base fixed inset-0 z-10">
      <WatchlistSidebar
        storageKey="intel_companies_v1"
        headerTitle="Intel"
        selected={selected?.symbol ?? null}
        onSelect={(s, n) => setSelected({ symbol: s, name: n })}
        onSearchFocusChange={setSearchFocused}
      />
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {payload && !searchFocused ? (
          <>
            <IntelHeader
              symbol={payload.symbol}
              sector={payload.sector}
              lastCallDate={payload.meta?.lastBuiltAt?.slice(0, 10) ?? null}
              counts={counts}
            />
            <FiltersBar state={filter} onChange={setFilter} segments={segments} sourceQuarters={sourceQuarters} />
            {loading
              ? <p className="p-6 font-mono text-muted">Loading…</p>
              : <ClaimsTable rows={filtered} />}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted font-mono">
            Select a company from the sidebar.
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Smoke**

```bash
npm run dev
# add HDFCBANK and BAJAJFINSV to the sidebar; click each.
```

Confirm the table renders, filters work, row expansion shows reasoning.

**Step 3: Stage**

```bash
git add app/intel/page.tsx
```

---

### Task 10.5: OmniCore navigation entry

**Files:**
- Modify: `components/layout/OmniCore.tsx`

**Step 1: Inspect existing OmniCore**

`Read components/layout/OmniCore.tsx` to find where the bottom-nav icons are defined.

**Step 2: Add an entry**

Add an entry next to the portfolio icon (briefcase) for `/intel` using a `Telescope` icon from `lucide-react`. Match the existing pattern of the portfolio entry.

**Step 3: Smoke**

Visit any page; click the new icon → navigates to `/intel`.

**Step 4: Stage**

```bash
git add components/layout/OmniCore.tsx
```

---

## Phase 11 — Polish & verification

### Task 11.1: Type check

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

Fix any errors that surfaced. Stage fixes.

### Task 11.2: Full pipeline rerun

Run:
```bash
npm run intel:rebuild -- BAJAJFINSV --force
npm run intel:rebuild -- HDFCBANK --force
```

Expected: end-to-end build for both companies; total cost reported under $2.

### Task 11.3: Quality review pass

For each company:
- Open `/intel`, click company.
- Filter by `Status: miss`. Spot-check 3 rows: read the quote, the reasoning, the delta. Does the verdict make sense?
- Filter by `Status: hit`. Same check.
- Filter by `Segment: BAGIC` (BAJAJFINSV) or `Segment: Whole Bank` (HDFCBANK). Confirm only relevant claims appear.
- Search for a known phrase (e.g. "credit cost"); rows should narrow to relevant claims.

**If quality is poor for a category** (e.g. too many "ambiguous"), iterate the corresponding stage prompt, bump the version, re-run that stage only:
```bash
npm run intel:rebuild -- BAJAJFINSV --stage=extractClaims
npm run intel:rebuild -- BAJAJFINSV --stage=crossCheck
```

### Task 11.4: README update

**Files:**
- Modify: `README.md`

Append a section:

```md
## /intel — Promise tracker

Per-company dashboard surfacing every forward-looking claim management has made on concalls plus a hit/miss/partial verdict against actual quarterly fundamentals.

### Add a new company
1. Place its concall transcripts (PDF) in `Concall Data/` (any naming).
2. Place its Bloomberg/CIQ Excel in `Concall Data/Fundamental data/`.
3. Add the symbol → sector mapping to `lib/intel/types.ts` `SYMBOL_SECTOR`.
4. Add the Excel path to `EXCEL_PATHS` in `scripts/intel-rebuild.ts`.
5. Run: `npm run intel:rebuild SYMBOL`.

### Rebuild a single stage
- `--stage=parseExcel` (Excel → fundamentals.json)
- `--stage=cleanTranscripts` (PDFs → text/)
- `--stage=extractClaims` (LLM, Haiku)
- `--stage=crossCheck` (LLM, Sonnet)

### Secrets
`ANTHROPIC_API_KEY` in `.env.local`.
```

**Step 5: Stage**

```bash
git add README.md
```

---

## Done — what to verify before declaring victory

1. `npm test` — all passing.
2. `npx tsc --noEmit -p tsconfig.json` — clean.
3. `/intel` renders with both companies; tables populated.
4. `/portfolio` still works after the `WatchlistSidebar` refactor.
5. `npm run intel:rebuild BAJAJFINSV --stage=extractClaims --force` re-runs Stage 3 only and reports cost.

---

Plan complete and saved to `docs/plans/2026-04-29-intel-dashboard.md`. Two execution options:

1. **Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best when you want momentum and willingness to review my reviews.
2. **Parallel Session (separate)** — open a new session pointed at this worktree with `superpowers:executing-plans`, batch execution with checkpoints. Best when you want to do something else while it runs.

Which approach?
