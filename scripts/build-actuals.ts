#!/usr/bin/env tsx
/**
 * scripts/build-actuals.ts
 *
 * Zero-cost actuals extraction: for each forward guidance claim where the
 * target quarter is in the past AND a transcript for that quarter exists,
 * keyword-searches the transcript for sentences mentioning the metric and
 * writes the matches to data/intelligence/{SYMBOL}/actuals.json.
 *
 * No LLM calls -- pure text matching.
 *
 * Usage:
 *   npx tsx scripts/build-actuals.ts              # all symbols
 *   npx tsx scripts/build-actuals.ts HDFCBANK     # single symbol
 *   npx tsx scripts/build-actuals.ts --dry-run    # print without writing
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import type { ClaimsArtifact, ExtractedClaim } from "@/lib/intel/types";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targetSymbol = args.find(a => !a.startsWith("--")) ?? null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActualSnippet {
  claimId: string;
  metricKey: string;
  /** Display label derived from metricKey */
  metricLabel: string;
  sourceQuarter: string;
  targetQuarter: string;
  /** Original guidance text */
  guidanceText: string;
  /** Relevant sentences extracted from the targetQuarter transcript */
  snippets: string[];
}

export interface ActualsArtifact {
  symbol: string;
  generatedAt: string;
  /** actuals keyed by targetQuarter */
  byQuarter: Record<string, ActualSnippet[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Current quarter as an int (2026-06 → Q2-FY27 = 272). */
function currentQuarterInt(): number {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  // Indian FY: Apr=Q1, Jul=Q2, Oct=Q3, Jan=Q4
  let fy: number;
  let q: number;
  if (month >= 4) { fy = year + 1 - 2000; q = Math.floor((month - 4) / 3) + 1; }
  else             { fy = year - 2000;     q = 4; }
  return fy * 10 + q;
}

function quarterInt(q: string): number {
  const m = q.match(/^Q(\d)-FY(\d+)$/);
  if (!m) return 0;
  return parseInt(m[2]) * 10 + parseInt(m[1]);
}

/** Convert metricKey ("net_interest_margin") to readable label ("Net Interest Margin"). */
function toLabel(metricKey: string): string {
  return metricKey
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Build search keywords from a metricKey + optional guidance text. */
function buildKeywords(metricKey: string, guidanceText: string): RegExp[] {
  const terms: string[] = [];

  // 1. The metric key itself (snake_case → space-separated, then also as-is)
  const labelWords = metricKey.replace(/_/g, " ").toLowerCase();
  terms.push(labelWords);

  // 2. Known abbreviation expansions for common metrics
  const ABBREV: Record<string, string[]> = {
    nim:                ["nim", "net interest margin", "net interest spread"],
    credit_cost:        ["credit cost", "provisioning cost", "credit costs", "provision coverage"],
    loan_growth:        ["loan growth", "advances growth", "credit growth", "loan book"],
    roe:                ["roe", "return on equity"],
    roa:                ["roa", "return on assets"],
    casa_ratio:         ["casa", "current account", "savings account"],
    gnpa:               ["gnpa", "gross npa", "gross non-performing"],
    nnpa:               ["nnpa", "net npa", "net non-performing"],
    net_npa:            ["net npa", "nnpa"],
    gross_npa:          ["gross npa", "gnpa"],
    aum:                ["aum", "assets under management"],
    aum_growth:         ["aum growth", "aum grew", "assets under management"],
    revenue_growth:     ["revenue growth", "revenue grew", "total revenue"],
    pat_growth:         ["pat", "profit after tax", "net profit growth"],
    ebitda_margin:      ["ebitda margin", "ebitda margins", "operating margin"],
    volume_growth:      ["volume growth", "volumes grew", "total volumes"],
    market_share:       ["market share", "market position"],
    export_growth:      ["export", "exports grew", "export volume"],
    realization:        ["realization", "average realization", "per unit"],
    capacity_utilization:["capacity utilization", "utilisation", "utilization"],
    order_book:         ["order book", "order backlog", "orders"],
    collection_efficiency:["collection efficiency", "collections"],
    disbursement_growth:["disbursement", "disbursements grew"],
    nii_growth:         ["nii", "net interest income"],
    fee_income:         ["fee income", "fee-based income", "non-interest income"],
    opex_ratio:         ["opex", "cost-to-income", "operating expenses"],
    capex:              ["capex", "capital expenditure", "capital expenditures"],
    dividend:           ["dividend", "payout"],
    revenue:            ["revenue", "total income", "topline"],
    pat:                ["pat", "profit after tax", "net profit"],
    ebitda:             ["ebitda", "operating profit"],
    margin:             ["margin", "margins"],
    gwp_growth:         ["gwp", "gross written premium", "premium growth"],
    vnb_margin:         ["vnb margin", "value of new business", "vnb"],
    embedded_value:     ["embedded value", "apev"],
    solvency_ratio:     ["solvency ratio", "solvency"],
    new_business_premium:["new business premium", "nbp"],
  };

  const abbrevTerms = ABBREV[metricKey];
  if (abbrevTerms) terms.push(...abbrevTerms);

  // 3. Extract numbers/percentages from guidanceText as additional context
  const nums = (guidanceText.match(/\d[\d,.]*\s*%?/g) ?? []).map(n => n.trim());
  // Only use short numbers as keywords if meaningful
  const usefulNums = nums.filter(n => n.includes("%") || parseFloat(n.replace(/,/g,"")) > 0);

  // Build regexes: match any sentence containing the term (case-insensitive)
  const regs: RegExp[] = terms.map(t =>
    new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i")
  );

  // Also add a regex for numbers with % if we have specific targets
  if (usefulNums.length > 0 && usefulNums.length <= 3) {
    const numPattern = usefulNums.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    regs.push(new RegExp(`(${numPattern})`, "i"));
  }

  return regs;
}

/** Split transcript text into sentences. */
function splitSentences(text: string): string[] {
  // Split on ". " or ".\n" followed by capital letter or end, but not "vs." "Mr." etc.
  const raw = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"])/g);
  return raw
    .map(s => s.trim().replace(/\s+/g, " "))
    .filter(s => s.length > 30 && s.length < 600);
}

/** Find sentences in transcript that match any keyword. Returns top N by relevance. */
function findSnippets(transcript: string, keywords: RegExp[], maxResults = 4): string[] {
  const sentences = splitSentences(transcript);
  const scored: Array<{ s: string; score: number }> = [];

  for (const s of sentences) {
    let score = 0;
    for (const kw of keywords) {
      if (kw.test(s)) score++;
    }
    if (score > 0) {
      // Boost sentences that contain numbers/percentages (more likely to be quantitative)
      if (/\d[\d,.]*\s*%/.test(s)) score += 2;
      if (/\d[\d,.]*\s*(crore|cr\b|lakh|bn\b|billion|million)/i.test(s)) score += 1;
      scored.push({ s, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(x => x.s);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const CURRENT_Q_INT = currentQuarterInt();
const symbols = targetSymbol
  ? [targetSymbol]
  : Object.keys(SYMBOL_SECTOR);

let processed = 0;
let totalActuals = 0;

for (const symbol of symbols) {
  const base = path.join("data/intelligence", symbol);
  const claimsPath = path.join(base, "claims.json");
  const txDir = path.join(base, "transcripts");
  const outPath = path.join(base, "actuals.json");

  if (!existsSync(claimsPath) || !existsSync(txDir)) continue;

  let claims: ClaimsArtifact;
  try {
    claims = JSON.parse(readFileSync(claimsPath, "utf-8")) as ClaimsArtifact;
  } catch {
    continue;
  }

  const txFiles = new Set(
    readdirSync(txDir)
      .filter(f => f.endsWith(".txt"))
      .map(f => f.replace(".txt", ""))
  );

  // Load transcripts lazily (only when needed)
  const txCache: Record<string, string> = {};
  function getTx(quarter: string): string | null {
    if (txCache[quarter]) return txCache[quarter];
    if (!txFiles.has(quarter)) return null;
    try {
      txCache[quarter] = readFileSync(path.join(txDir, `${quarter}.txt`), "utf-8");
      return txCache[quarter];
    } catch { return null; }
  }

  const byQuarter: Record<string, ActualSnippet[]> = {};

  for (const [sourceQ, claimList] of Object.entries(claims.byQuarter)) {
    for (const claim of (claimList as ExtractedClaim[])) {
      const tq = claim.targetQuarter;
      if (!tq) continue;
      if (quarterInt(tq) >= CURRENT_Q_INT) continue; // future quarter -- skip
      if (quarterInt(tq) === 0) continue; // invalid quarter

      const tx = getTx(tq);
      if (!tx) continue; // no transcript for target quarter

      const keywords = buildKeywords(claim.metricKey, claim.targetText ?? "");
      const snippets = findSnippets(tx, keywords);
      if (snippets.length === 0) continue; // nothing found

      const label = toLabel(claim.metricKey);
      const entry: ActualSnippet = {
        claimId: claim.id,
        metricKey: claim.metricKey,
        metricLabel: label,
        sourceQuarter: sourceQ,
        targetQuarter: tq,
        guidanceText: claim.targetText ?? claim.quote ?? "",
        snippets,
      };

      if (!byQuarter[tq]) byQuarter[tq] = [];
      byQuarter[tq].push(entry);
    }
  }

  const totalForSymbol = Object.values(byQuarter).reduce((s, a) => s + a.length, 0);
  if (totalForSymbol === 0) continue;

  const artifact: ActualsArtifact = {
    symbol,
    generatedAt: new Date().toISOString(),
    byQuarter,
  };

  if (!dryRun) {
    writeFileSync(outPath, JSON.stringify(artifact, null, 2), "utf-8");
  }

  console.log(`[${symbol}] ${totalForSymbol} actuals across ${Object.keys(byQuarter).length} quarters`);
  Object.entries(byQuarter).forEach(([q, entries]) => {
    entries.forEach(e => {
      console.log(`  ${e.sourceQuarter} → ${q} | ${e.metricKey} | ${e.snippets[0]?.slice(0, 70)}…`);
    });
  });

  processed++;
  totalActuals += totalForSymbol;
}

console.log(`\nDone. ${processed} symbols, ${totalActuals} actuals total.`);
if (dryRun) console.log("(dry-run -- no files written)");
