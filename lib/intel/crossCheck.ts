import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import type {
  ClaimsArtifact,
  ChecksArtifact,
  ClaimCheck,
  Verdict,
  ExtractedClaim,
  SectorRegistry,
} from "./types";
import { callJson, estimateCostUsd, defaultVerificationModel } from "./llm";
import { resolveClaimTarget } from "./targetResolver";
import { claimsHash } from "./extractClaims";

export const STAGE4_PROMPT_VERSION = 3;

// ── types ─────────────────────────────────────────────────────────────────────

export interface CrossCheckArgs {
  symbol: string;
  claims: ClaimsArtifact;
  /** Directory containing {quarter}.txt transcript files. */
  transcriptsDir: string;
  registry: SectorRegistry;
  outFile: string;
  claimsHashValue: string;
  /** Process only claims from specific source quarters. */
  onlyQuarters?: string[];
}

export interface CrossCheckResult {
  artifact: ChecksArtifact;
  totalCostUsd: number;
}

// ── prompt ────────────────────────────────────────────────────────────────────

interface ClaimForVerification {
  claimId: string;
  metricLabel: string;
  metricUnit: string;
  /** Original statement from the source quarter — do NOT reuse as verification evidence. */
  managementStatement: string;
  direction: string;
  value: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  qualitativeText: string | null;
  targetText: string;
  conditional: string | null;
}

export function buildCrossCheckPrompt(
  sourceQuarter: string,
  targetQuarter: string,
  claims: ClaimForVerification[],
  transcript: string,
): { system: string; user: string } {
  const system = `You are verifying whether company management delivered on forward-looking promises from earnings calls.

CLASSIFICATION RULES (apply in order):
1. "met"       — the specific metric was explicitly discussed and management clearly achieved the stated target or guided direction
2. "moving"    — the specific metric was explicitly discussed and is trending in the right direction but the full target is not yet reached
3. "miss"      — the specific metric was explicitly discussed and clearly failed: opposite direction, significantly below target, or management acknowledged missing it
4. "ambiguous" — the specific metric was NOT explicitly named or discussed in this transcript; do NOT infer from adjacent or general statements

STRICT EVIDENCE RULES:
- A verdict of met/moving/miss REQUIRES the exact metric (or a clear synonym) to be explicitly named in the transcript
- Do NOT infer combined ratio from GWP growth, loss ratio from underwriting commentary, or any other proxy
- Each claimId must have its OWN quote from the transcript — never use the same verbatim sentence for two different claimIds unless the transcript literally covers both metrics in that exact sentence
- The "quote" field MUST be taken verbatim from the TARGET TRANSCRIPT provided below — it is NEVER the managementStatement from the source quarter
- If you cannot find explicit evidence for a claim, return "ambiguous" with quote: null

OUTPUT: { "results": [ Result, ... ] } where each Result is:
{
  "claimId": string,
  "verdict": "met" | "moving" | "miss" | "ambiguous",
  "actualText": string | null,   // 1-2 sentences summarising what management reported for this specific metric (null if ambiguous)
  "quote": string | null,        // verbatim from the TARGET TRANSCRIPT only, ≤200 chars; null if ambiguous
  "reasoning": string            // 1 sentence explaining why this verdict was chosen
}`;

  const user = `FORWARD-LOOKING CLAIMS MADE IN ${sourceQuarter} — verify each against the ${targetQuarter} transcript below:
${JSON.stringify(claims, null, 2)}

${targetQuarter} EARNINGS TRANSCRIPT:
${transcript}

Return ONLY the JSON object with "results" array. Every claimId must appear exactly once.`;

  return { system, user };
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Sort quarter labels chronologically. Returns positive if a > b. */
function compareQuarters(a: string, b: string): number {
  // Format: Q{1-4}-FY{YY}
  const parse = (q: string) => {
    const m = q.match(/^Q(\d)-FY(\d+)$/);
    if (!m) return 0;
    return parseInt(m[2]) * 10 + parseInt(m[1]);
  };
  return parse(a) - parse(b);
}

// ── main driver ───────────────────────────────────────────────────────────────

export async function crossCheckForSymbol(args: CrossCheckArgs): Promise<CrossCheckResult> {
  const model = defaultVerificationModel();
  const byTargetQuarter: Record<string, ClaimCheck[]> = {};
  const warnings: string[] = [];
  let totalCost = 0;

  // Load all available transcripts
  const transcriptFiles = (await fs.readdir(args.transcriptsDir).catch(() => [] as string[]))
    .filter((f) => f.endsWith(".txt"))
    .sort((a, b) => compareQuarters(a.replace(/\.txt$/i, ""), b.replace(/\.txt$/i, "")));

  const transcriptMap = new Map<string, string>();
  for (const fname of transcriptFiles) {
    const quarter = fname.replace(/\.txt$/i, "");
    const text = await fs.readFile(path.join(args.transcriptsDir, fname), "utf-8");
    transcriptMap.set(quarter, text);
  }

  const availableQuarters = [...transcriptMap.keys()].sort(compareQuarters);

  // Flatten claims and resolve target transcripts
  // Group by (sourceQuarter, verifiedInQuarter) → batch those together into one LLM call
  type BatchKey = string; // `${sourceQuarter}::${verifiedInQuarter}`
  const batches = new Map<BatchKey, {
    sourceQuarter: string;
    verifiedInQuarter: string;
    targetQuarter: string;
    claim: ExtractedClaim;
  }[]>();

  for (const [sourceQ, claims] of Object.entries(args.claims.byQuarter)) {
    if (args.onlyQuarters && !args.onlyQuarters.includes(sourceQ)) continue;

    for (const claim of claims) {
      const resolved = resolveClaimTarget(claim.targetQuarter, claim.targetText, sourceQ);
      const targetQ = resolved.quarter; // may be null for vague targets

      // Find which transcript to verify against
      let verifiedInQuarter: string | null = null;

      if (targetQ && transcriptMap.has(targetQ)) {
        // Exact match: use the target quarter transcript
        verifiedInQuarter = targetQ;
      } else if (targetQ && !transcriptMap.has(targetQ)) {
        // Target quarter exists but no transcript → pending
        const check: ClaimCheck = {
          claimId: claim.id,
          metricKey: claim.metricKey,
          sourceQuarter: sourceQ,
          targetQuarter: targetQ,
          verifiedInQuarter: targetQ,
          verdict: "pending",
          actualText: null,
          quote: null,
          reasoning: `Transcript for ${targetQ} not yet available.`,
          context: null,
          speaker: null,
          section: null,
        };
        byTargetQuarter[targetQ] = [...(byTargetQuarter[targetQ] ?? []), check];
        continue;
      } else {
        // No resolved target quarter (vague claim) → use earliest transcript after sourceQ
        const laterQuarters = availableQuarters.filter((q) => compareQuarters(q, sourceQ) > 0);
        if (laterQuarters.length > 0) {
          verifiedInQuarter = laterQuarters[0];
        } else {
          // No later transcript available → pending
          const check: ClaimCheck = {
            claimId: claim.id,
            metricKey: claim.metricKey,
            sourceQuarter: sourceQ,
            targetQuarter: "unknown",
            verifiedInQuarter: "unknown",
            verdict: "pending",
            actualText: null,
            quote: null,
            reasoning: "No subsequent transcript available to verify this claim.",
            context: null,
            speaker: null,
            section: null,
          };
          byTargetQuarter["unknown"] = [...(byTargetQuarter["unknown"] ?? []), check];
          continue;
        }
      }

      const key: BatchKey = `${sourceQ}::${verifiedInQuarter}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key)!.push({
        sourceQuarter: sourceQ,
        verifiedInQuarter,
        targetQuarter: targetQ ?? verifiedInQuarter,
        claim,
      });
    }
  }

  // Process each batch (one LLM call per source+target transcript pair)
  for (const [key, items] of batches) {
    const { sourceQuarter, verifiedInQuarter } = items[0];
    const transcript = transcriptMap.get(verifiedInQuarter)!;

    const metric = (metricKey: string) =>
      args.registry.metrics.find((m) => m.key === metricKey);

    const claimsForPrompt: ClaimForVerification[] = items.map(({ claim }) => {
      const m = metric(claim.metricKey);
      return {
        claimId: claim.id,
        metricLabel: m?.label ?? claim.metricKey,
        metricUnit: m?.unit ?? "",
        managementStatement: claim.quote,
        direction: claim.direction,
        value: claim.value,
        rangeMin: claim.rangeMin,
        rangeMax: claim.rangeMax,
        qualitativeText: claim.qualitativeText,
        targetText: claim.targetText,
        conditional: claim.conditional,
      };
    });

    const { system, user } = buildCrossCheckPrompt(
      sourceQuarter,
      verifiedInQuarter,
      claimsForPrompt,
      transcript,
    );

    let result: Awaited<ReturnType<typeof callJson<{ results: Array<Partial<ClaimCheck> & { verdict?: Verdict }> }>>>;
    try {
      result = await callJson({
        model,
        system,
        user,
        maxTokens: 4096,
        temperature: 0,
      });
    } catch (err) {
      warnings.push(`${key}: LLM error — ${(err as Error).message.slice(0, 120)}`);
      // Mark all claims in this batch as ambiguous
      for (const { claim, targetQuarter } of items) {
        const check: ClaimCheck = {
          claimId: claim.id,
          metricKey: claim.metricKey,
          sourceQuarter,
          targetQuarter,
          verifiedInQuarter,
          verdict: "ambiguous",
          actualText: null,
          quote: null,
          reasoning: "LLM verification failed.",
          context: null,
          speaker: null,
          section: null,
        };
        byTargetQuarter[targetQuarter] = [...(byTargetQuarter[targetQuarter] ?? []), check];
      }
      continue;
    }

    totalCost += estimateCostUsd(model, result);

    // Map results back to ClaimCheck objects
    const resultMap = new Map<string, typeof result.data.results[0]>();
    for (const r of result.data.results ?? []) {
      if (r.claimId) resultMap.set(r.claimId as string, r);
    }

    for (const { claim, targetQuarter } of items) {
      const r = resultMap.get(claim.id);
      const check: ClaimCheck = {
        claimId: claim.id,
        metricKey: claim.metricKey,
        sourceQuarter,
        targetQuarter,
        verifiedInQuarter,
        verdict: (r?.verdict ?? "ambiguous") as Verdict,
        actualText: (r as { actualText?: string | null })?.actualText ?? null,
        quote: (r as { quote?: string | null })?.quote ?? null,
        reasoning: (r as { reasoning?: string })?.reasoning ?? "",
        context: (r as { context?: string | null })?.context ?? null,
        speaker: (r as { speaker?: string | null })?.speaker ?? null,
        section: ((r as { section?: string | null })?.section ?? null) as "prepared remarks" | "Q&A" | null,
      };
      byTargetQuarter[targetQuarter] = [...(byTargetQuarter[targetQuarter] ?? []), check];
    }
  }

  const artifact: ChecksArtifact = {
    symbol: args.symbol,
    promptVersion: STAGE4_PROMPT_VERSION,
    model,
    generatedAt: new Date().toISOString(),
    claimsHash: args.claimsHashValue,
    byTargetQuarter,
    warnings,
  };

  await fs.writeFile(args.outFile, JSON.stringify(artifact, null, 2), "utf-8");
  return { artifact, totalCostUsd: totalCost };
}

export function checksHash(c: ChecksArtifact): string {
  return crypto.createHash("sha256").update(JSON.stringify(c.byTargetQuarter)).digest("hex").slice(0, 16);
}
