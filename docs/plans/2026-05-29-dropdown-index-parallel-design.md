# Design — Compact Selector, Index Pre-computation & Pipeline Parallelization

**Date:** 2026-05-29
**Scope:** Three improvements to make before adding Anthropic API credits.

---

## 1. Company Selector — Sector Dropdown + Inline Chips

**Problem:** The sector accordion occupies ~300–400px on every page load, pushing the
tracker matrix below the fold. It is not the focus of the page.

**Solution:** Replace with a single compact row (~48px total):

```
[Upload Transcript]  [Banking ▼]  [HDFCBANK 19 100%] [ICICIBANK] [SBIN] [AXISBANK] ...
```

### Components

**Sector dropdown** — custom-styled button/popover matching the dark theme. Shows all
19 sectors from `SECTOR_DISPLAY_ORDER`. Defaults to the sector of the currently
selected symbol on load. Selecting a different sector instantly swaps the chip row.

**Stock chip row** — horizontally scrollable row of `CompanyChip` components for the
selected sector only (≤11 stocks). Same chip design as before: symbol + claims count +
on-track % colour-coded teal/amber/danger. Selected chip is amber-highlighted. No
separate search bar needed — sector dropdown limits the list to a scannable size.

### State

- `selectedSector: string` — derived from `SYMBOL_SECTOR[selectedSymbol]` on initial
  load; updated when user picks a different sector from the dropdown.
- `selectedSymbol` — unchanged (drives the matrix below).
- Clicking a chip sets `selectedSymbol` (and `selectedSector` follows automatically).
- On symbol switch (e.g. from TranscriptUpload), `selectedSector` re-derives from the
  new symbol's sector.

### Files to modify

- `components/intel/IntelDashboard.tsx` — replace accordion JSX + add `selectedSector`
  state + add `SectorDropdown` inline component.

---

## 2. Pre-computed `_index.json`

**Problem:** `/api/intel/companies` scans every stock directory and reads
`claims.json` + `checks.json` on every request (~200 file reads, ~200ms cold).

**Solution:** Pre-build a `data/intelligence/_index.json` that stores the full
`CompanySummary[]` array.

### Script: `scripts/intel-build-index.ts`

- Reads `data/intelligence/*/claims.json` and `data/intelligence/*/checks.json`
  for all tracked symbols in `SYMBOL_SECTOR`
- Computes the same `CompanySummary` shape the API already returns
- Writes `data/intelligence/_index.json`

### API route update: `app/api/intel/companies/route.ts`

- Try reading `_index.json` first (single JSON parse, <5ms)
- Fall back to the existing live directory scan if the file is absent (backward compatible)

### Integration

- `package.json`: add `"intel:index": "npx tsx scripts/intel-build-index.ts"`
- `scripts/intel-rebuild.ts`: call `spawnSync('npm run intel:index')` at the end of
  every pipeline run so the index stays fresh automatically
- `data/intelligence/_index.json` is gitignored (derived/regenerable)

---

## 3. Pipeline Parallelization

**Problem:** `scripts/intel-rebuild.ts` processes stocks sequentially. 66 stocks ×
~30s each ≈ 33 minutes wall time.

**Solution:** Add a semaphore to process up to N stocks concurrently. Each stock still
runs its own Stages 3→4→5 sequentially; only different stocks run in parallel.

### Semaphore

Plain TypeScript (~15 lines, no new dependency):

```typescript
function makeSemaphore(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) await new Promise<void>(r => queue.push(r));
    active++;
    try { return await fn(); }
    finally { active--; queue.shift()?.(); }
  };
}
```

### CLI flag

`--concurrency=N` (default 4). Examples:
- `--concurrency=1` — serial (debug mode)
- `--concurrency=4` — default (safe for Anthropic rate limits)
- `--concurrency=8` — if rate limits allow

### Output

Each log line is prefixed with `[SYMBOL]` so output from parallel stocks is readable.
After all stocks complete, the index rebuild runs once.

### Expected improvement

66-stock full pipeline: ~33 min → ~8–10 min wall time.

---

## What Is NOT In Scope

- Changing the matrix/tracker component
- Changing the quarter picker or verdict system
- Any LLM pipeline changes
- Running the pipeline (blocked on API credits)
