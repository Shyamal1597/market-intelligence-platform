# Dropdown Selector, Index Pre-computation & Pipeline Parallelization

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace the full-page sector accordion with a compact dropdown + chip row, add a pre-built companies index for instant API response, and parallelize the pipeline rebuild script.

**Architecture:** Three independent changes to `IntelDashboard.tsx`, `app/api/intel/companies/route.ts` + new `scripts/intel-build-index.ts`, and `scripts/intel-rebuild.ts`. No shared state or cross-task dependencies — safe to implement sequentially.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, Lucide React, Node.js `fs`.

---

## Task 1: Compact Sector Dropdown + Inline Chip Row

**Files:**
- Modify: `components/intel/IntelDashboard.tsx`

### Context

The current file has an accordion built with `openSectors`, `searchQuery`, `companiesBySector`, `searchResults` state/memos, and ~80 lines of accordion JSX. All of that gets replaced by a two-part compact row: `[Upload] [Sector dropdown ▼] [chip chip chip…]`.

`SECTOR_DISPLAY_ORDER`, `SECTOR_LABELS`, and `CompanyChip` already exist in the file and are **kept**. The accordion-specific state is removed.

### Step 1: Remove accordion state & memos

Find and **delete** these from `IntelDashboard`:

```tsx
// DELETE these four state declarations:
const [openSectors, setOpenSectors] = useState<Set<string>>(new Set());
const [searchQuery, setSearchQuery] = useState("");

// DELETE the auto-open sectors effect:
useEffect(() => {
  if (companies.length === 0) return;
  const withData = new Set(companies.filter((c) => c.totalClaims > 0).map((c) => c.sector));
  setOpenSectors(withData);
}, [companies]);

// DELETE these two memos:
const companiesBySector = useMemo(() => { ... }, [companies]);
const searchResults = useMemo(() => { ... }, [companies, searchQuery]);
```

Also remove `setSearchQuery("")` from the `loadSymbol` reset block.

Also remove `Search` from the lucide-react import line (no longer needed):
```tsx
// BEFORE:
import { ChevronDown, ChevronRight, Clock, Search } from "lucide-react";
// AFTER:
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
```

### Step 2: Add `selectedSector` state

Inside `IntelDashboard`, after the `companies` state, add:

```tsx
const [selectedSector, setSelectedSector] = useState<string>(
  () => SYMBOL_SECTOR[DEFAULT_SYMBOL] ?? SECTOR_DISPLAY_ORDER[0]
);
```

Add this import at the top of the file if not already present:
```tsx
import { SYMBOL_SECTOR } from "@/lib/intel/types";
```

### Step 3: Sync sector when symbol changes

Add this effect (after the `useEffect` that calls `loadSymbol`):

```tsx
// Sync selected sector when symbol changes externally
useEffect(() => {
  const s = SYMBOL_SECTOR[selectedSymbol];
  if (s) setSelectedSector(s);
}, [selectedSymbol]);
```

### Step 4: Add `sectorCompanies` memo

After the `segments` memo, add:

```tsx
// Companies for the currently selected sector (drives the chip row)
const sectorCompanies = useMemo(
  () => companies.filter((c) => c.sector === selectedSector),
  [companies, selectedSector]
);
```

### Step 5: Add `SectorDropdown` component

Add this **above** `LatestGuidanceSection` (after the existing `CompanyChip` component):

```tsx
// ── Sector dropdown ───────────────────────────────────────────────────────────

function SectorDropdown({
  selectedSector,
  companies,
  onChange,
}: {
  selectedSector: string;
  companies: CompanySummary[];
  onChange: (sector: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // Only show sectors that have at least one stock loaded
  const availableSectors = SECTOR_DISPLAY_ORDER.filter((s) =>
    companies.some((c) => c.sector === s)
  );

  const sectorCos = companies.filter((c) => c.sector === selectedSector);
  const decisive = sectorCos.reduce((s, c) => s + c.metCount + c.movingCount + c.missCount, 0);
  const onTrack  = sectorCos.reduce((s, c) => s + c.metCount + c.movingCount, 0);
  const pct = decisive > 0 ? Math.round((onTrack / decisive) * 100) : null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-surface text-xs font-mono text-primary hover:border-amber/40 transition-colors"
      >
        <span className="text-muted/60 shrink-0 text-[10px] uppercase tracking-wider">Sector</span>
        <span className="font-bold">{SECTOR_LABELS[selectedSector] ?? selectedSector}</span>
        <span className="text-muted/40">·</span>
        <span className="text-muted/60">{sectorCos.length}</span>
        {pct !== null && (
          <span className={`font-bold ${
            pct >= 70 ? "text-teal" : pct >= 40 ? "text-amber" : "text-danger"
          }`}>
            {pct}%
          </span>
        )}
        <ChevronDown size={11} className="text-muted/50 shrink-0" />
      </button>

      {open && (
        <>
          {/* Backdrop — closes dropdown on outside click */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 w-60 rounded border border-border bg-surface shadow-lg overflow-hidden">
            {availableSectors.map((sector) => {
              const cos = companies.filter((c) => c.sector === sector);
              const dec = cos.reduce((s, c) => s + c.metCount + c.movingCount + c.missCount, 0);
              const ot  = cos.reduce((s, c) => s + c.metCount + c.movingCount, 0);
              const p   = dec > 0 ? Math.round((ot / dec) * 100) : null;
              const isActive = sector === selectedSector;
              return (
                <button
                  key={sector}
                  onClick={() => { onChange(sector); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-mono transition-colors ${
                    isActive
                      ? "bg-amber/10 text-amber"
                      : "text-muted hover:bg-base/60 hover:text-primary"
                  }`}
                >
                  <span className="flex-1 truncate">{SECTOR_LABELS[sector] ?? sector}</span>
                  <span className={`text-[10px] shrink-0 ${isActive ? "text-amber/60" : "text-muted/50"}`}>
                    {cos.length}
                  </span>
                  {p !== null && (
                    <span className={`text-[10px] font-bold shrink-0 ${
                      p >= 70 ? "text-teal" : p >= 40 ? "text-amber" : "text-danger"
                    }`}>
                      {p}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
```

### Step 6: Replace company selector JSX

Find the `{/* ── Company selector: search + sector accordion ── */}` block and replace the entire `<div className="space-y-2">` section with:

```tsx
{/* ── Company selector: sector dropdown + inline chips ── */}
<div className="flex flex-wrap items-center gap-2">
  <TranscriptUpload onComplete={() => loadSymbol(selectedSymbol)} />
  <SectorDropdown
    selectedSector={selectedSector}
    companies={companies}
    onChange={setSelectedSector}
  />
  <div className="flex flex-wrap items-center gap-1.5">
    {sectorCompanies.map((c) => (
      <CompanyChip
        key={c.symbol}
        company={c}
        selectedSymbol={selectedSymbol}
        onSelect={setSelectedSymbol}
      />
    ))}
  </div>
</div>
```

### Step 7: TypeScript check

```bash
npx tsc --noEmit
```

Expected: no output (zero errors).

### Step 8: Commit

```bash
git add components/intel/IntelDashboard.tsx
git commit -m "feat(intel): replace sector accordion with compact dropdown + chip row"
```

---

## Task 2: Pre-computed `_index.json`

**Files:**
- Create: `scripts/intel-build-index.ts`
- Modify: `app/api/intel/companies/route.ts`
- Modify: `package.json`
- Modify: `scripts/intel-rebuild.ts`

### Step 1: Create `scripts/intel-build-index.ts`

```typescript
/**
 * scripts/intel-build-index.ts
 *
 * Pre-builds data/intelligence/_index.json from claims + checks JSON files.
 * The /api/intel/companies route reads this file for instant response instead
 * of scanning all 100 stock directories on every request.
 *
 * Usage:
 *   npx tsx scripts/intel-build-index.ts
 *   npm run intel:index
 *
 * Run after any pipeline stage that produces claims.json or checks.json.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import type { ClaimsArtifact, ChecksArtifact } from "@/lib/intel/types";
import type { CompanySummary } from "@/app/api/intel/companies/route";

async function readJson<T>(filePath: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(filePath, "utf-8")) as T; }
  catch { return null; }
}

async function main() {
  console.log("Building _index.json…");
  const summaries: CompanySummary[] = [];

  for (const [symbol, sector] of Object.entries(SYMBOL_SECTOR)) {
    const base = path.join("data/intelligence", symbol);
    const claims = await readJson<ClaimsArtifact>(path.join(base, "claims.json"));
    const checks  = await readJson<ChecksArtifact>(path.join(base, "checks.json"));

    const totalClaims = claims
      ? Object.values(claims.byQuarter).reduce((s, c) => s + c.length, 0)
      : 0;
    const quarters = claims ? Object.keys(claims.byQuarter).sort() : [];

    let metCount = 0, movingCount = 0, missCount = 0, pendingCount = 0;
    if (checks) {
      for (const batch of Object.values(checks.byTargetQuarter)) {
        for (const c of batch) {
          if (c.verdict === "met")     metCount++;
          if (c.verdict === "moving")  movingCount++;
          if (c.verdict === "miss")    missCount++;
          if (c.verdict === "pending") pendingCount++;
        }
      }
    }

    summaries.push({
      symbol,
      sector,
      totalClaims,
      checkedClaims: metCount + movingCount + missCount,
      metCount,
      movingCount,
      missCount,
      pendingCount,
      quarters,
      lastUpdated: claims?.generatedAt ?? null,
      hasChecks: !!checks,
    });
  }

  const out = {
    generatedAt: new Date().toISOString(),
    companies: summaries,
  };

  const indexPath = path.join("data/intelligence", "_index.json");
  await fs.writeFile(indexPath, JSON.stringify(out, null, 2), "utf-8");

  const withData = summaries.filter((s) => s.totalClaims > 0).length;
  console.log(`✓ _index.json written: ${summaries.length} symbols (${withData} with data)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

### Step 2: Add `intel:index` to `package.json`

Find the `"scripts"` block in `package.json`. Add after the existing intel scripts:

```json
"intel:index": "npx tsx scripts/intel-build-index.ts",
```

### Step 3: Update `app/api/intel/companies/route.ts` — add fast path

Add the fast path at the top of the `GET` function, **before** the existing `for` loop. The file already has all necessary imports (`fs`, `path`).

Find:
```typescript
export async function GET() {
  try {
    const summaries: CompanySummary[] = [];

    for (const [symbol, sector] of Object.entries(SYMBOL_SECTOR)) {
```

Replace with:
```typescript
export async function GET() {
  try {
    // ── Fast path: pre-built index ────────────────────────────────────────────
    const indexPath = path.join("data/intelligence", "_index.json");
    try {
      const raw = await fs.readFile(indexPath, "utf-8");
      const { companies } = JSON.parse(raw) as { generatedAt: string; companies: CompanySummary[] };
      return NextResponse.json(companies);
    } catch {
      // Index not built yet — fall through to live scan below
    }

    // ── Live scan fallback (used on first run before intel:index) ─────────────
    const summaries: CompanySummary[] = [];

    for (const [symbol, sector] of Object.entries(SYMBOL_SECTOR)) {
```

### Step 4: Call `intel:index` at end of `intel-rebuild.ts`

At the bottom of `scripts/intel-rebuild.ts`, find the cost log section:

```typescript
  if (totalCost.v > 0) {
    console.log(`\nTotal LLM cost: ~$${totalCost.v.toFixed(4)}`);
  }
```

Add after it (still inside the IIFE, before the closing `})`):

```typescript
  // Rebuild companies index after pipeline run
  console.log("\nRebuilding companies index…");
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync("npx", ["tsx", "scripts/intel-build-index.ts"], {
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    console.warn("Warning: intel:index rebuild failed (non-fatal)");
  }
```

### Step 5: Add `data/intelligence/_index.json` to `.gitignore`

The index is derived/regenerable. Open `.gitignore` and verify `data/intelligence/` is already gitignored. If so, no change needed — the file is already excluded.

### Step 6: TypeScript check

```bash
npx tsc --noEmit
```

Expected: no output.

### Step 7: Test — run the script

```bash
npx tsx scripts/intel-build-index.ts
```

Expected output:
```
Building _index.json…
✓ _index.json written: 100 symbols (N with data)
```

Verify the file exists:
```bash
node -e "const f=require('./data/intelligence/_index.json'); console.log(f.generatedAt, f.companies.length, 'companies')"
```

Expected: timestamp + `100 companies`.

### Step 8: Commit

```bash
git add scripts/intel-build-index.ts app/api/intel/companies/route.ts package.json scripts/intel-rebuild.ts
git commit -m "feat(intel): add _index.json pre-computation for instant companies API"
```

---

## Task 3: Pipeline Parallelization

**Files:**
- Modify: `scripts/intel-rebuild.ts`

### Step 1: Add `concurrency` to `parseArgs`

Find the `return {` at the end of `parseArgs()`:

```typescript
  return {
    symbol: positional[0] ?? null,
    stage: flags.stage ? parseInt(flags.stage as string) : null,
    force: flags.force === true,
    all: flags.all === true,
    onlyQuarters: flags.only ? (flags.only as string).split(",") : undefined,
    costCap: flags["cost-cap"] ? parseFloat(flags["cost-cap"] as string) : 10,
    dryRun: flags["dry-run"] === true,
  };
```

Replace with:

```typescript
  return {
    symbol: positional[0] ?? null,
    stage: flags.stage ? parseInt(flags.stage as string) : null,
    force: flags.force === true,
    all: flags.all === true,
    onlyQuarters: flags.only ? (flags.only as string).split(",") : undefined,
    costCap: flags["cost-cap"] ? parseFloat(flags["cost-cap"] as string) : 10,
    dryRun: flags["dry-run"] === true,
    concurrency: flags.concurrency ? parseInt(flags.concurrency as string) : 4,
  };
```

### Step 2: Add semaphore helper

Add this function right after the `log` function (before `// ── main ──`):

```typescript
// ── Concurrency semaphore ─────────────────────────────────────────────────────

function makeSemaphore(n: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function acquire<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= n) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
```

### Step 3: Replace the sequential `for` loop with parallel execution

Find the sequential loop at the bottom of the IIFE:

```typescript
  for (const sym of symbols) {
    const runStages = opts.stage ? [opts.stage] : [1, 2, 3, 4];

    if (runStages.includes(1)) await runStage1(sym, opts);
    if (runStages.includes(2)) await runStage2(sym, opts);
    if (runStages.includes(3)) {
      if (totalCost.v > opts.costCap) {
        console.error(`Cost cap $${opts.costCap} exceeded ($${totalCost.v.toFixed(3)}). Aborting.`);
        process.exit(1);
      }
      await runStage3(sym, opts, totalCost);
    }
    if (runStages.includes(4)) {
      if (totalCost.v > opts.costCap) {
        console.error(`Cost cap $${opts.costCap} exceeded ($${totalCost.v.toFixed(3)}). Aborting.`);
        process.exit(1);
      }
      await runStage4(sym, opts, totalCost);
    }
  }
```

Replace with:

```typescript
  const sem = makeSemaphore(opts.concurrency);
  if (symbols.length > 1) {
    console.log(`Running ${symbols.length} symbols with concurrency=${opts.concurrency}`);
  }

  const jobs = symbols.map((sym) =>
    sem(async () => {
      const runStages = opts.stage ? [opts.stage] : [1, 2, 3, 4];
      try {
        if (runStages.includes(1)) await runStage1(sym, opts);
        if (runStages.includes(2)) await runStage2(sym, opts);
        if (runStages.includes(3)) {
          if (totalCost.v > opts.costCap) {
            log(sym, "stage3", `SKIP — cost cap $${opts.costCap} exceeded`);
            return;
          }
          await runStage3(sym, opts, totalCost);
        }
        if (runStages.includes(4)) {
          if (totalCost.v > opts.costCap) {
            log(sym, "stage4", `SKIP — cost cap $${opts.costCap} exceeded`);
            return;
          }
          await runStage4(sym, opts, totalCost);
        }
      } catch (e) {
        log(sym, "error", (e as Error).message ?? String(e));
      }
    })
  );

  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(`\n${failed.length} symbol(s) failed.`);
  }
```

### Step 4: Update the usage comment at the top of the file

Find:
```typescript
 *   --cost-cap=<N>      Abort if cumulative LLM cost exceeds $N (default: 10)
```

Add after it:
```typescript
 *   --concurrency=<N>   Max parallel symbols (default: 4)
```

### Step 5: TypeScript check

```bash
npx tsc --noEmit
```

Expected: no output.

### Step 6: Smoke-test with dry-run

```bash
npx tsx scripts/intel-rebuild.ts --all --dry-run --concurrency=4
```

Expected: output shows `[SYMBOL][stageN] DRY-RUN: …` lines interleaved for multiple symbols simultaneously. No errors.

### Step 7: Commit

```bash
git add scripts/intel-rebuild.ts
git commit -m "feat(intel): add concurrency semaphore to pipeline rebuild (default 4 parallel)"
```

---

## Final check

```bash
npx tsc --noEmit
```

Expected: clean.

All three tasks are now independent — implement in order, commit each separately.
