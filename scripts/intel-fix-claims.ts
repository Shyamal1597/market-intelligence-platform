#!/usr/bin/env tsx
/**
 * scripts/intel-fix-claims.ts
 *
 * Post-extraction data quality fixes for claims.json files.
 *
 *   --fix-target-quarter
 *       Normalises non-standard targetQuarter values to null.
 *       Per the extraction spec, targetQuarter must be "Q{n}-FY{yy}" or null.
 *       Full-year ("FY27"), half-year ("H1-FY27"), calendar-year ("CY26"), and
 *       range targets ("Q4-FY26 to FY27") are all set to null -- they are
 *       multi-period commitments that cannot be pinned to a single quarter.
 *
 *   --remove-past-results
 *       Deletes claims where targetQuarter === sourceQuarter.
 *       These are historical results reported in the transcript as facts
 *       (e.g. "We delivered 1.2% growth in Q4"), not forward guidance.
 *       Rule: the extraction spec explicitly rejects current-quarter results.
 *
 *   --remove-old-quarters
 *       Deletes entire byQuarter entries whose quarter label is before Q4-FY25
 *       (int < 2504). These are pre-MIN_QUARTER_INT claims extracted by legacy
 *       Qwen runs and preserved by the --only merge. They are too old to be
 *       actionable and should not appear on the dashboard.
 *
 *   --fix-direction
 *       Normalises direction fields set by Qwen to valid ClaimDirection values.
 *       Qwen models use "higher-is-better"/"lower-is-better"/"neutral" instead
 *       of "up"/"down"/"stable". Maps them to the nearest valid equivalent.
 *
 *   --symbol=<SYM>   Run only for this symbol (default: all)
 *   --dry-run        Print what would change without writing
 *
 * Usage:
 *   npx tsx scripts/intel-fix-claims.ts --fix-target-quarter --remove-past-results --remove-old-quarters --fix-direction
 *   npx tsx scripts/intel-fix-claims.ts --fix-direction --dry-run
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import type { ClaimsArtifact, ExtractedClaim } from "@/lib/intel/types";

// -- CLI -----------------------------------------------------------------------

const args = process.argv.slice(2);
const FLAG = (f: string) => args.includes(f);
const OPT  = (k: string) => { const m = args.find(a => a.startsWith(`--${k}=`)); return m ? m.split("=")[1] : null; };

const fixTargetQuarter  = FLAG("--fix-target-quarter");
const removePastResults = FLAG("--remove-past-results");
const removeOldQuarters = FLAG("--remove-old-quarters");
const fixDirection      = FLAG("--fix-direction");
const dryRun            = FLAG("--dry-run");
const onlySymbol        = OPT("symbol");

if (!fixTargetQuarter && !removePastResults && !removeOldQuarters && !fixDirection) {
  console.error("Nothing to do. Pass one or more of: --fix-target-quarter, --remove-past-results, --remove-old-quarters, --fix-direction");
  process.exit(1);
}

// Qwen models use registry-style direction strings ("higher-is-better", "lower-is-better")
// instead of the valid ClaimDirection values ("up", "down", "stable", "value", "range").
// Map to the nearest valid equivalent.
const QWEN_DIRECTION_MAP: Record<string, string> = {
  "higher-is-better": "up",
  "lower-is-better":  "down",
  "neutral":          "stable",
};

// Q4-FY25 is the minimum actionable quarter (same as pipeline MIN_QUARTER_INT = 2504).
// Any byQuarter key with int < 2504 is from a legacy run and should be removed.
function quarterToInt(q: string): number {
  const m = q.match(/^Q(\d)-FY(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[2], 10) * 10 + parseInt(m[1], 10);
}
const MIN_QUARTER_INT = quarterToInt("Q4-FY25"); // = 254  (FY25*10 + Q4)

// -- Helpers -------------------------------------------------------------------

/** Returns true if the value is a valid Q{n}-FY{yy} quarter string. */
function isValidQuarter(q: string | null | undefined): boolean {
  if (!q) return false;
  return /^Q\d-FY\d{2}$/.test(q);
}

let totalSymbols = 0;
let totalRemoved = 0;
let totalNulled = 0;
let totalFixed = 0;
let totalRemovedQtrs = 0;

// -- Main ----------------------------------------------------------------------

const symbols = onlySymbol
  ? [onlySymbol]
  : Object.keys(SYMBOL_SECTOR);

for (const symbol of symbols) {
  const filePath = path.join("data/intelligence", symbol, "claims.json");
  if (!existsSync(filePath)) continue;

  let artifact: ClaimsArtifact;
  try {
    artifact = JSON.parse(readFileSync(filePath, "utf-8")) as ClaimsArtifact;
  } catch {
    console.warn(`[${symbol}] Failed to parse claims.json -- skipping`);
    continue;
  }

  let changed = false;
  let symbolRemoved = 0;
  let symbolNulled = 0;
  let symbolFixed = 0;
  let symbolRemovedQtrs = 0;

  // -- Fix 3: remove pre-MIN_QUARTER_INT quarters ----------------------------
  if (removeOldQuarters) {
    for (const quarter of Object.keys(artifact.byQuarter)) {
      const qi = quarterToInt(quarter);
      if (qi > 0 && qi < MIN_QUARTER_INT) {
        const count = (artifact.byQuarter[quarter] ?? []).length;
        console.log(`  [${symbol}/${quarter}] REMOVE old quarter (${count} claims, below Q4-FY25 cutoff)`);
        if (!dryRun) {
          delete artifact.byQuarter[quarter];
        }
        symbolRemovedQtrs++;
        changed = true;
      }
    }
  }

  for (const [quarter, claims] of Object.entries(artifact.byQuarter)) {
    const kept: ExtractedClaim[] = [];

    for (const claim of claims) {
      let drop = false;

      // Preserve original targetQuarter before any in-place mutation below
      const originalTargetQuarter = claim.targetQuarter;

      // -- Fix 0: normalise invalid direction strings (Qwen artefact) ------
      // Qwen models use "higher-is-better", "lower-is-better" etc. instead
      // of the valid ClaimDirection enum values. Map to nearest equivalent.
      if (fixDirection) {
        const d = claim.direction as string;
        if (QWEN_DIRECTION_MAP[d]) {
          const fixed = QWEN_DIRECTION_MAP[d];
          console.log(`  [${symbol}/${quarter}] FIX direction: "${d}" → "${fixed}"  (${claim.id})`);
          if (!dryRun) {
            (claim as unknown as Record<string, unknown>).direction = fixed;
          }
          symbolFixed++;
          changed = true;
        }
      }

      // -- Fix 1: normalise non-standard targetQuarter ----------------------
      // Valid format: Q{n}-FY{yy} -- e.g. "Q4-FY26". Everything else (full-year
      // targets like "FY27", half-year "H1-FY27", calendar-year "CY26", ranges,
      // etc.) must be null because they cannot be pinned to a single quarter.
      if (fixTargetQuarter && originalTargetQuarter !== null && originalTargetQuarter !== undefined) {
        if (!isValidQuarter(originalTargetQuarter)) {
          if (!dryRun) {
            (claim as unknown as Record<string, unknown>).targetQuarter = null;
          }
          symbolNulled++;
          changed = true;
          console.log(`  [${symbol}/${quarter}] NULL tgtQ: "${originalTargetQuarter}" → null  (${claim.id})`);
        }
      }

      // -- Fix 2: remove past-result claims (targetQ == sourceQ) ------------
      // A claim where the target quarter equals the source quarter is a
      // historical result the LLM mistook for forward guidance.
      // Rule from extraction spec: current-quarter results must be rejected.
      // We test against the ORIGINAL targetQuarter (pre-mutation).
      if (removePastResults && originalTargetQuarter === quarter) {
        drop = true;
        symbolRemoved++;
        changed = true;
        console.log(`  [${symbol}/${quarter}] REMOVE past-result: ${claim.id} | ${claim.metricKey} | "${String(claim.targetText ?? "").slice(0,60)}"`);
      }

      if (!drop) kept.push(claim);
    }

    if (!dryRun) {
      artifact.byQuarter[quarter] = kept;
    }
  }

  if (changed) {
    totalSymbols++;
    totalRemoved      += symbolRemoved;
    totalNulled       += symbolNulled;
    totalFixed        += symbolFixed;
    totalRemovedQtrs  += symbolRemovedQtrs;

    if (!dryRun) {
      writeFileSync(filePath, JSON.stringify(artifact, null, 2), "utf-8");
      console.log(`  [${symbol}] ✓ saved -- removed ${symbolRemoved}, nulled ${symbolNulled} tgtQ, fixed ${symbolFixed} directions, dropped ${symbolRemovedQtrs} old qtrs`);
    } else {
      console.log(`  [${symbol}] DRY-RUN -- would remove ${symbolRemoved}, null ${symbolNulled} tgtQ, fix ${symbolFixed} directions, drop ${symbolRemovedQtrs} old qtrs`);
    }
  }
}

console.log(`\nDone.`);
console.log(`  Symbols with changes : ${totalSymbols}`);
console.log(`  Old quarters removed : ${totalRemovedQtrs}  (below Q4-FY25 cutoff)`);
console.log(`  Claims removed       : ${totalRemoved}      (past-result rule)`);
console.log(`  targetQuarter nulled : ${totalNulled}       (format normalisation)`);
console.log(`  Directions fixed     : ${totalFixed}        (Qwen non-standard → ClaimDirection)`);
if (dryRun) console.log(`  (dry-run -- no files written)`);
