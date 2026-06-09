#!/usr/bin/env tsx
/**
 * scripts/intel-audit-claims.ts
 *
 * Generates a human-readable quality audit of all extracted guidance claims.
 * Intended for pre-presentation review -- "no room for error" standard.
 *
 * Output: data/intelligence/_audit.md  (also printed to stdout)
 *
 * What it checks per claim:
 *  1. targetQuarter format validity
 *  2. Past-result detection (targetQ == sourceQ)
 *  3. Missing direction (guidance direction not set)
 *  4. Low confidence (< 0.5)
 *  5. Suspicious targetText -- no numeric value found in text
 *  6. Model source (Qwen = yellow flag; Haiku = clean)
 *  7. Per-quarter 429/LLM error warnings from claims.json
 *
 * Severity legend:
 *  ❌ ERROR   -- claim is almost certainly wrong; must fix before presentation
 *  ⚠️  WARN   -- probable quality issue; review and decide
 *  ℹ️  INFO   -- informational flag; likely fine but worth eyeballing
 *  ✅ CLEAN  -- no flags raised
 *
 * Usage:
 *   npx tsx scripts/intel-audit-claims.ts
 *   npx tsx scripts/intel-audit-claims.ts --symbol=TCS
 *   npx tsx scripts/intel-audit-claims.ts --min-severity=warn   (skip INFO)
 *   npx tsx scripts/intel-audit-claims.ts --errors-only
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import type { ClaimsArtifact, ExtractedClaim } from "@/lib/intel/types";

// -- CLI -----------------------------------------------------------------------

const cliArgs = process.argv.slice(2);
const FLAG    = (f: string) => cliArgs.includes(f);
const OPT     = (k: string) => { const m = cliArgs.find(a => a.startsWith(`--${k}=`)); return m ? m.split("=")[1] : null; };

const onlySymbol  = OPT("symbol");
const errorsOnly  = FLAG("--errors-only");
const minSev      = errorsOnly ? "error" : (OPT("min-severity") ?? "info");

const SEV_RANK: Record<string, number> = { error: 3, warn: 2, info: 1 };
const minRank = SEV_RANK[minSev] ?? 1;

// -- Helpers -------------------------------------------------------------------

function isValidQuarter(q: string | null | undefined): boolean {
  if (!q) return false;
  return /^Q\d-FY\d{2}$/.test(q);
}

/** Rough check: does the text contain a number? */
function hasNumericValue(text: string): boolean {
  return /\d/.test(text);
}

/** Truncate string for display */
function trunc(s: string | null | undefined, n = 80): string {
  if (!s) return "(none)";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// -- Flag types ----------------------------------------------------------------

interface ClaimFlag {
  severity: "error" | "warn" | "info";
  code: string;
  message: string;
}

/** Valid direction values from ClaimDirection type */
const VALID_DIRECTIONS = new Set<string>(["value", "range", "up", "down", "stable"]);

/** Comparable integer for quarter ordering (same logic as pipeline). */
function quarterToInt(q: string): number {
  const m = q.match(/^Q(\d)-FY(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[2], 10) * 10 + parseInt(m[1], 10);
}
const MIN_QUARTER_INT = quarterToInt("Q4-FY25"); // = 254  (FY25*10 + Q4)

function auditClaim(
  claim: ExtractedClaim,
  sourceQuarter: string,
  artifactModel: string,
): ClaimFlag[] {
  const flags: ClaimFlag[] = [];

  // 1. Past result (targetQ == sourceQ)
  //    A claim whose target quarter equals its source quarter is a historical
  //    result the LLM mistook for forward guidance.
  if (claim.targetQuarter === sourceQuarter) {
    flags.push({
      severity: "error",
      code: "PAST_RESULT",
      message: `targetQuarter "${claim.targetQuarter}" equals sourceQuarter "${sourceQuarter}" -- this is a historical result, not guidance. Must be deleted.`,
    });
  }

  // 2. Non-standard targetQuarter format
  //    Valid: Q{n}-FY{yy}. Invalid examples: "FY27", "H1-FY27", "CY26", ranges.
  //    Multi-period targets should be null, not a custom string.
  if (claim.targetQuarter !== null && claim.targetQuarter !== undefined && claim.targetQuarter !== "") {
    if (!isValidQuarter(claim.targetQuarter)) {
      flags.push({
        severity: "warn",
        code: "INVALID_TARGET_QUARTER",
        message: `targetQuarter "${claim.targetQuarter}" is not standard Q{n}-FY{yy} format. Multi-period targets must be null.`,
      });
    }
  }

  // 3. Invalid / missing direction
  //    direction must be one of: "value" | "range" | "up" | "down" | "stable"
  if (!claim.direction || !VALID_DIRECTIONS.has(claim.direction as string)) {
    flags.push({
      severity: "warn",
      code: "INVALID_DIRECTION",
      message: `direction "${claim.direction ?? "(null)"}" is not a valid ClaimDirection. Expected: value/range/up/down/stable.`,
    });
  }

  // 4. Low confidence
  //    confidence is "high" | "medium" | "low". Low = model was uncertain.
  if (claim.confidence === "low") {
    flags.push({
      severity: "warn",
      code: "LOW_CONFIDENCE",
      message: `Confidence "low" -- model was uncertain about this extraction. Verify quote matches targetText.`,
    });
  }

  // 5. No numeric value in targetText
  //    Guidance claims must be quantified. Pure-text targets likely indicate
  //    the LLM extracted a vague directional comment, not a specific metric.
  if (claim.targetText && !hasNumericValue(claim.targetText)) {
    flags.push({
      severity: "info",
      code: "NO_NUMERIC",
      message: `targetText contains no number: "${trunc(claim.targetText, 60)}" -- verify this is a quantified target.`,
    });
  }

  // 6. No supporting quote (or suspiciously short)
  //    Every claim must be auditable via a verbatim transcript quote.
  if (!claim.quote || claim.quote.trim().length < 15) {
    flags.push({
      severity: "warn",
      code: "MISSING_QUOTE",
      message: "Missing or too-short supporting quote -- claim is not auditable without a verbatim source.",
    });
  }

  // 7. Value/range completeness
  //    "value" direction must have a numeric value; "range" must have min+max.
  if (claim.direction === "value" && claim.value === null) {
    flags.push({
      severity: "warn",
      code: "VALUE_WITHOUT_NUMBER",
      message: `direction="value" but value is null. Extraction should have captured the specific number.`,
    });
  }
  if (claim.direction === "range" && claim.rangeMin === null && claim.rangeMax === null) {
    flags.push({
      severity: "warn",
      code: "RANGE_WITHOUT_BOUNDS",
      message: `direction="range" but both rangeMin and rangeMax are null. Bounds should be populated.`,
    });
  }

  // 8. Qwen-generated artifact
  //    Qwen (local Ollama) may hallucinate numbers not in the transcript.
  //    Haiku extractions are authoritative; Qwen outputs need manual verification.
  if (artifactModel.includes("qwen")) {
    flags.push({
      severity: "info",
      code: "QWEN_SOURCE",
      message: "Artifact extracted by Qwen (local Ollama) -- verify quote appears verbatim in transcript PDF.",
    });
  }

  return flags;
}

// -- Main ----------------------------------------------------------------------

const lines: string[] = [];
function emit(s = "") { lines.push(s); }

emit("# Management Guidance Claims -- Quality Audit");
emit(`> Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`);
emit(`> Scope: ${onlySymbol ? onlySymbol : "all symbols"} | min-severity: ${minSev}`);
emit(`> Standard: director-presentation quality -- every ❌ must be resolved before sharing.`);
emit();

const symbols = onlySymbol ? [onlySymbol] : Object.keys(SYMBOL_SECTOR);

let totalClaims = 0;
let totalErrors = 0;
let totalWarns  = 0;
let totalInfos  = 0;
let symbolsWithErrors = 0;
const errorSymbols: string[] = [];

interface SymbolSummary {
  symbol: string;
  sector: string;
  model: string;
  claimCount: number;
  quarterCount: number;
  errors: number;
  warns: number;
  infos: number;
  qwenQuarters: string[];
  warningMessages: string[];
}

const summaryRows: SymbolSummary[] = [];

for (const symbol of symbols) {
  const filePath = path.join("data/intelligence", symbol, "claims.json");
  if (!existsSync(filePath)) continue;

  let artifact: ClaimsArtifact;
  try {
    artifact = JSON.parse(readFileSync(filePath, "utf-8")) as ClaimsArtifact;
  } catch {
    emit(`## ${symbol}`);
    emit(`❌ **PARSE ERROR** -- claims.json is malformed JSON. Re-run Stage 3.`);
    emit();
    continue;
  }

  const model    = artifact.model    ?? "unknown";
  const warnings = artifact.warnings ?? [];

  let symErrors = 0;
  let symWarns  = 0;
  let symInfos  = 0;
  let symClaims = 0;
  const qwenQuarters: string[] = [];
  const claimLines: string[] = [];

  const quarters = Object.keys(artifact.byQuarter).sort((a, b) => {
    const qa = a.match(/^Q(\d)-FY(\d+)$/);
    const qb = b.match(/^Q(\d)-FY(\d+)$/);
    if (!qa || !qb) return 0;
    const na = parseInt(qa[2]) * 10 + parseInt(qa[1]);
    const nb = parseInt(qb[2]) * 10 + parseInt(qb[1]);
    return na - nb;
  });

  for (const quarter of quarters) {
    const claims = artifact.byQuarter[quarter] ?? [];
    const qi = quarterToInt(quarter);

    // Silently skip pre-Q4-FY25 quarters -- these are legacy Qwen entries
    // preserved by the --only merge. intel-fix-claims.ts --remove-old-quarters
    // cleans them up. If they are still present, note it but don't flag each claim.
    if (qi > 0 && qi < MIN_QUARTER_INT) {
      if (claims.length > 0 && minRank <= SEV_RANK["warn"]) {
        symWarns++;
        totalWarns++;
        claimLines.push(`\n### ${quarter} -- ⚠️ ${claims.length} claim${claims.length !== 1 ? "s" : ""} BELOW Q4-FY25 CUTOFF -- run intel-fix-claims.ts --remove-old-quarters`);
      }
      continue;
    }

    if (claims.length === 0) {
      // Empty current-era quarter: flag only if it's ≥ Q4-FY25 (expected to have guidance)
      if (minRank <= SEV_RANK["warn"]) {
        symWarns++;
        totalWarns++;
        claimLines.push(`\n### ${quarter} -- ⚠️ 0 claims (extraction failed -- 429 or LLM error)`);
      }
      continue;
    }

    // Qwen flag is artifact-level (model field covers all quarters in this file)
    const isQwenArtifact = model.includes("qwen");
    if (isQwenArtifact && !qwenQuarters.includes("ALL")) qwenQuarters.push("ALL");

    const qLines: string[] = [];
    for (const claim of claims) {
      symClaims++;
      totalClaims++;

      const flags = auditClaim(claim, quarter, model);

      const errFlags  = flags.filter(f => f.severity === "error");
      const warnFlags = flags.filter(f => f.severity === "warn");
      const infoFlags = flags.filter(f => f.severity === "info");

      symErrors += errFlags.length;
      symWarns  += warnFlags.length;
      symInfos  += infoFlags.length;
      totalErrors += errFlags.length;
      totalWarns  += warnFlags.length;
      totalInfos  += infoFlags.length;

      const maxFlagSev = errFlags.length ? "error" : warnFlags.length ? "warn" : infoFlags.length ? "info" : "clean";
      const maxRank = SEV_RANK[maxFlagSev] ?? 0;

      // Skip if below threshold
      if (flags.length > 0 && maxRank < minRank) continue;
      if (flags.length === 0 && minRank > 0) continue; // skip clean claims unless min=clean

      const icon = maxFlagSev === "error" ? "❌" : maxFlagSev === "warn" ? "⚠️" : maxFlagSev === "info" ? "ℹ️" : "✅";

      qLines.push(`\n#### ${icon} ${claim.id} | ${claim.metricKey} | tgt: ${claim.targetQuarter ?? "null (multi-period)"}`);
      qLines.push(`- **Direction**: ${claim.direction ?? "(none)"} | **Confidence**: ${claim.confidence ?? "(none)"}`);
      qLines.push(`- **Target**: ${trunc(String(claim.targetText ?? ""), 100)}`);
      qLines.push(`- **Quote**: *"${trunc(String(claim.quote ?? ""), 120)}"*`);
      for (const f of flags) {
        const fIcon = f.severity === "error" ? "❌" : f.severity === "warn" ? "⚠️" : "ℹ️";
        qLines.push(`- ${fIcon} \`${f.code}\`: ${f.message}`);
      }
    }

    if (qLines.length > 0) {
      claimLines.push(`\n### ${quarter} -- ${claims.length} claim${claims.length !== 1 ? "s" : ""}${model.includes("qwen") ? " ⚠️ QWEN" : ""}`);
      claimLines.push(...qLines);
    }
  }

  const hasIssues = symErrors > 0 || symWarns > 0;
  if (hasIssues && symErrors > 0) { symbolsWithErrors++; errorSymbols.push(symbol); }

  summaryRows.push({
    symbol,
    sector: SYMBOL_SECTOR[symbol] ?? "unknown",
    model,
    claimCount: symClaims,
    quarterCount: quarters.length,
    errors: symErrors,
    warns: symWarns,
    infos: symInfos,
    qwenQuarters,
    warningMessages: warnings,
  });

  // Only emit symbol section if there are flagged claims to show
  if (claimLines.length > 0 || warnings.length > 0) {
    const statusIcon = symErrors > 0 ? "❌" : symWarns > 0 ? "⚠️" : "ℹ️";
    emit(`## ${statusIcon} ${symbol} -- ${SYMBOL_SECTOR[symbol] ?? "unknown"}`);
    emit(`Model: \`${model}\` | ${symClaims} claims | ${quarters.length} quarters | ${symErrors} errors, ${symWarns} warns, ${symInfos} infos`);

    if (warnings.length > 0) {
      emit();
      emit("**Pipeline warnings:**");
      let activeWarnings = 0;
      for (const w of warnings.slice(0, 10)) {
        // A warning is stale if the quarter it references now has claims (was re-extracted successfully).
        const quarterMatch = w.match(/^(Q\d-FY\d{2}):/);
        const warnedQuarter = quarterMatch?.[1];
        const isStale = warnedQuarter
          ? ((artifact.byQuarter[warnedQuarter] ?? []).length > 0)
          : false;
        if (isStale) {
          emit(`- 🗄 STALE: \`${trunc(w, 100)}\` ← quarter now has claims (inherited from prior failed run)`);
        } else {
          emit(`- ⚠️ ${trunc(w, 120)}`);
          activeWarnings++;
        }
      }
      if (warnings.length > 10) emit(`- …and ${warnings.length - 10} more`);
      if (activeWarnings === 0 && warnings.length > 0) {
        emit(`> All warnings above are stale -- quarters were re-extracted successfully.`);
      }
    }

    for (const l of claimLines) emit(l);
    emit();
  }
}

// -- Summary table -------------------------------------------------------------

const summaryHeader = [
  "# Audit Summary",
  "",
  `Total symbols audited : ${summaryRows.length}`,
  `Total claims          : ${totalClaims}`,
  `Total ❌ errors       : ${totalErrors}`,
  `Total ⚠️  warns        : ${totalWarns}`,
  `Total ℹ️  infos         : ${totalInfos}`,
  `Symbols with errors   : ${symbolsWithErrors} -- ${errorSymbols.join(", ") || "none"}`,
  "",
  "## Per-symbol overview",
  "",
  "| Symbol | Sector | Model | Claims | Qtrs | ❌ | ⚠️ | ℹ️ | Qwen quarters |",
  "|--------|--------|-------|--------|------|---|---|---|---------------|",
];

for (const r of summaryRows) {
  const modelShort = r.model.includes("haiku") ? "haiku" : r.model.includes("qwen") ? "**qwen**" : r.model.slice(0, 15);
  const qwen = r.qwenQuarters.length > 0 ? r.qwenQuarters.join(", ") : "--";
  summaryHeader.push(
    `| ${r.symbol} | ${r.sector} | ${modelShort} | ${r.claimCount} | ${r.quarterCount} | ${r.errors || "--"} | ${r.warns || "--"} | ${r.infos || "--"} | ${qwen} |`
  );
}

// Prepend summary to lines
const output = [...summaryHeader, "", ...lines].join("\n");

// Write to file
const outPath = path.join("data/intelligence/_audit.md");
writeFileSync(outPath, output, "utf-8");

// Print to stdout
console.log(output);
console.log(`\n✓ Audit written to ${outPath}`);
