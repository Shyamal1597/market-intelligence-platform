import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import type {
  ClaimsArtifact,
  ChecksArtifact,
  ClaimCheck,
  CheckStatus,
  ExtractedClaim,
  SectorRegistry,
} from "./types";
import type { Fundamentals } from "./types";
import { callJson, estimateCostUsd, defaultVerificationModel } from "./llm";
import { resolveClaimTarget } from "./targetResolver";
import { claimsHash } from "./extractClaims";

export const STAGE4_PROMPT_VERSION = 1;

// ── types ─────────────────────────────────────────────────────────────────────

export interface CrossCheckArgs {
  symbol: string;
  claims: ClaimsArtifact;
  fundamentals: Fundamentals;
  registry: SectorRegistry;
  outFile: string;
  claimsHashValue: string;
  fundamentalsHashValue: string;
  /** Process only specific source quarters (used for incremental runs). */
  onlyQuarters?: string[];
}

export interface CrossCheckResult {
  artifact: ChecksArtifact;
  totalCostUsd: number;
}

// ── prompt ────────────────────────────────────────────────────────────────────

interface VerifyItem {
  claimId: string;
  metricKey: string;
  metricLabel: string;
  metricUnit: string;
  quote: string;
  direction: string;
  value: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  qualitativeText: string | null;
  targetText: string;
  resolvedTargetQuarter: string;
  actualValue: number | null;
  sourceQuarterValue: number | null;
  conditional: string | null;
}

export function buildCrossCheckPrompt(items: VerifyItem[]): { system: string; user: string } {
  const system = `You are a senior equity research analyst verifying management guidance accuracy. You are given a set of claims made during an earnings concall, each paired with the actual reported value for the target period.

VERDICTS — assign exactly one per claim:
- "hit"        — guidance was achieved; actual matches direction/value within reasonable margin (±10% for value claims, within range for range claims, directionally correct for up/down/stable)
- "miss"       — guidance clearly not achieved
- "partial"    — partially achieved; directionally correct but magnitude off, or within an extended margin (10–25%)
- "no-data"    — actual value is null / unavailable; cannot assess
- "pending"    — target quarter is in the future; no actual data yet
- "ambiguous"  — the claim is too vague to verify even with data

For conditional claims, evaluate only if the condition applied (or assume it did if unknown).

OUTPUT: a JSON object: { "results": [Result, ...] } where Result is:
{
  "claimId": string,
  "status": "hit" | "miss" | "partial" | "no-data" | "pending" | "ambiguous",
  "actualValue": number | null,
  "deltaText": string,       // e.g. "Guided 4.0%, reported 4.2% (+20bps)" or "" if no-data/pending
  "reasoning": string,       // 1–2 sentences explaining the verdict
  "conditionalApplied": boolean,
  "conditionalNote": string | null
}`;

  const user = `Verify the following management guidance claims against reported actuals:

${JSON.stringify(items, null, 2)}

Return ONLY the JSON object with "results" array.`;

  return { system, user };
}

// ── rule-based fallback ───────────────────────────────────────────────────────

/**
 * Fast rule-based check for quantitative claims.
 * Returns null when the claim is qualitative-only (needs LLM).
 */
export function ruleBasedCheck(item: VerifyItem): Omit<ClaimCheck, "claimId" | "metricKey" | "sourceQuarter" | "targetQuarter" | "actualUnit"> | null {
  const actual = item.actualValue;

  // Can't check without actual
  if (actual === null) {
    return {
      status: "no-data",
      actualValue: null,
      reasoning: "No actual data available for the target quarter.",
      deltaText: "",
      conditionalApplied: false,
      conditionalNote: null,
    };
  }

  const { direction, value, rangeMin, rangeMax, qualitativeText } = item;

  // Qualitative-only claims need LLM
  if ((direction === "up" || direction === "down" || direction === "stable") && qualitativeText && !value) {
    return null;
  }

  const src = item.sourceQuarterValue;

  if (direction === "value" && value !== null) {
    const pctDiff = Math.abs((actual - value) / (value || 1));
    const status: CheckStatus = pctDiff <= 0.10 ? "hit" : pctDiff <= 0.25 ? "partial" : "miss";
    const delta = actual - value;
    const sign = delta > 0 ? "+" : "";
    return {
      status,
      actualValue: actual,
      reasoning: `Guided ${value}${item.metricUnit}, reported ${actual}${item.metricUnit} (${sign}${delta.toFixed(2)}${item.metricUnit}, ${(pctDiff * 100).toFixed(1)}% diff).`,
      deltaText: `Guided ${value}${item.metricUnit}, reported ${actual}${item.metricUnit}`,
      conditionalApplied: false,
      conditionalNote: null,
    };
  }

  if (direction === "range" && rangeMin !== null && rangeMax !== null) {
    const inRange = actual >= rangeMin && actual <= rangeMax;
    const nearRange = actual >= rangeMin * 0.90 && actual <= rangeMax * 1.10;
    const status: CheckStatus = inRange ? "hit" : nearRange ? "partial" : "miss";
    return {
      status,
      actualValue: actual,
      reasoning: `Guided ${rangeMin}–${rangeMax}${item.metricUnit}, reported ${actual}${item.metricUnit}.`,
      deltaText: `Guided ${rangeMin}–${rangeMax}${item.metricUnit}, reported ${actual}${item.metricUnit}`,
      conditionalApplied: false,
      conditionalNote: null,
    };
  }

  if (direction === "up" && src !== null) {
    const status: CheckStatus = actual > src ? "hit" : actual >= src * 0.97 ? "partial" : "miss";
    return {
      status,
      actualValue: actual,
      reasoning: `Guided improvement from ${src}${item.metricUnit}; reported ${actual}${item.metricUnit}.`,
      deltaText: `${src}${item.metricUnit} → ${actual}${item.metricUnit}`,
      conditionalApplied: false,
      conditionalNote: null,
    };
  }

  if (direction === "down" && src !== null) {
    const status: CheckStatus = actual < src ? "hit" : actual <= src * 1.03 ? "partial" : "miss";
    return {
      status,
      actualValue: actual,
      reasoning: `Guided decline from ${src}${item.metricUnit}; reported ${actual}${item.metricUnit}.`,
      deltaText: `${src}${item.metricUnit} → ${actual}${item.metricUnit}`,
      conditionalApplied: false,
      conditionalNote: null,
    };
  }

  if (direction === "stable" && src !== null) {
    const pctDiff = Math.abs((actual - src) / (src || 1));
    const status: CheckStatus = pctDiff <= 0.05 ? "hit" : pctDiff <= 0.10 ? "partial" : "miss";
    return {
      status,
      actualValue: actual,
      reasoning: `Guided stable around ${src}${item.metricUnit}; reported ${actual}${item.metricUnit}.`,
      deltaText: `${src}${item.metricUnit} → ${actual}${item.metricUnit}`,
      conditionalApplied: false,
      conditionalNote: null,
    };
  }

  // Couldn't apply any rule → LLM fallback
  return null;
}

// ── main driver ───────────────────────────────────────────────────────────────

export async function crossCheckForSymbol(args: CrossCheckArgs): Promise<CrossCheckResult> {
  const model = defaultVerificationModel();
  const byTargetQuarter: Record<string, ClaimCheck[]> = {};
  const warnings: string[] = [];
  let totalCost = 0;

  // Flatten all claims into a list with resolved target quarters
  const allClaims: Array<{ claim: ExtractedClaim; sourceQuarter: string; targetQuarter: string | null }> = [];

  for (const [sourceQ, claims] of Object.entries(args.claims.byQuarter)) {
    if (args.onlyQuarters && !args.onlyQuarters.includes(sourceQ)) continue;
    for (const claim of claims) {
      const resolved = resolveClaimTarget(claim.targetQuarter, claim.targetText, sourceQ);
      allClaims.push({ claim, sourceQuarter: sourceQ, targetQuarter: resolved.quarter });
    }
  }

  // Group by target quarter for batched LLM calls
  const llmBatch: VerifyItem[] = [];

  for (const { claim, sourceQuarter, targetQuarter } of allClaims) {
    const metric = args.registry.metrics.find((m) => m.key === claim.metricKey);
    if (!metric) {
      warnings.push(`${claim.id}: metric ${claim.metricKey} not in registry`);
      continue;
    }

    // Look up actual value
    let actualValue: number | null = null;
    let sourceQuarterValue: number | null = null;

    if (targetQuarter) {
      const qFund = args.fundamentals.quarters[targetQuarter];
      if (qFund) actualValue = qFund.metrics[claim.metricKey] ?? null;
    }
    const srcFund = args.fundamentals.quarters[sourceQuarter];
    if (srcFund) sourceQuarterValue = srcFund.metrics[claim.metricKey] ?? null;

    // Status for claims with no resolved target quarter
    if (!targetQuarter) {
      const check: ClaimCheck = {
        claimId: claim.id,
        metricKey: claim.metricKey,
        sourceQuarter,
        targetQuarter: "unknown",
        status: "ambiguous",
        actualValue: null,
        actualUnit: metric.unit,
        reasoning: "Could not determine target quarter from claim text.",
        deltaText: "",
        conditionalApplied: false,
        conditionalNote: null,
      };
      byTargetQuarter["unknown"] = [...(byTargetQuarter["unknown"] ?? []), check];
      continue;
    }

    const item: VerifyItem = {
      claimId: claim.id,
      metricKey: claim.metricKey,
      metricLabel: metric.label,
      metricUnit: metric.unit,
      quote: claim.quote,
      direction: claim.direction,
      value: claim.value,
      rangeMin: claim.rangeMin,
      rangeMax: claim.rangeMax,
      qualitativeText: claim.qualitativeText,
      targetText: claim.targetText,
      resolvedTargetQuarter: targetQuarter,
      actualValue,
      sourceQuarterValue,
      conditional: claim.conditional,
    };

    // Try rule-based first
    const ruleResult = ruleBasedCheck(item);
    if (ruleResult) {
      const check: ClaimCheck = {
        claimId: claim.id,
        metricKey: claim.metricKey,
        sourceQuarter,
        targetQuarter,
        actualUnit: metric.unit,
        ...ruleResult,
      };
      byTargetQuarter[targetQuarter] = [...(byTargetQuarter[targetQuarter] ?? []), check];
    } else {
      // Queue for LLM batch
      llmBatch.push(item);
    }
  }

  // Process LLM batch in chunks of 10 to keep prompts manageable
  const CHUNK = 10;
  for (let i = 0; i < llmBatch.length; i += CHUNK) {
    const chunk = llmBatch.slice(i, i + CHUNK);
    const { system, user } = buildCrossCheckPrompt(chunk);

    const result = await callJson<{ results: Array<Partial<ClaimCheck>> }>({
      model,
      system,
      user,
      maxTokens: 4096,
      temperature: 0,
    });
    totalCost += estimateCostUsd(model, result);

    for (const r of result.data.results ?? []) {
      if (!r.claimId) continue;
      // Find the original item
      const item = chunk.find((it) => it.claimId === r.claimId);
      if (!item) continue;
      const metric = args.registry.metrics.find((m) => m.key === item.metricKey);

      const check: ClaimCheck = {
        claimId: r.claimId,
        metricKey: item.metricKey,
        sourceQuarter: allClaims.find((a) => a.claim.id === r.claimId)?.sourceQuarter ?? "unknown",
        targetQuarter: item.resolvedTargetQuarter,
        status: (r.status ?? "ambiguous") as CheckStatus,
        actualValue: r.actualValue ?? item.actualValue,
        actualUnit: metric?.unit ?? "",
        reasoning: r.reasoning ?? "",
        deltaText: r.deltaText ?? "",
        conditionalApplied: r.conditionalApplied ?? false,
        conditionalNote: r.conditionalNote ?? null,
      };
      byTargetQuarter[check.targetQuarter] = [...(byTargetQuarter[check.targetQuarter] ?? []), check];
    }
  }

  const artifact: ChecksArtifact = {
    symbol: args.symbol,
    promptVersion: STAGE4_PROMPT_VERSION,
    model,
    generatedAt: new Date().toISOString(),
    claimsHash: args.claimsHashValue,
    fundamentalsHash: args.fundamentalsHashValue,
    byTargetQuarter,
    warnings,
  };

  await fs.writeFile(args.outFile, JSON.stringify(artifact, null, 2), "utf-8");
  return { artifact, totalCostUsd: totalCost };
}

export function checksHash(c: ChecksArtifact): string {
  return crypto.createHash("sha256").update(JSON.stringify(c.byTargetQuarter)).digest("hex").slice(0, 16);
}
