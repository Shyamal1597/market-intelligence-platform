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

export const STAGE4_PROMPT_VERSION = 2;

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
  quote: string;
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
  const system = `You are verifying whether company management delivered on forward-looking promises made during earnings calls.

For each claim, classify as exactly one of:
- "met":       management clearly achieved the stated target or guided direction
- "moving":    trending in the right direction but the guided level is not yet fully reached
- "miss":      clear failure — opposite direction, significantly below target, or explicitly acknowledged as a miss
- "ambiguous": this specific metric or topic was not discussed in the transcript; insufficient information to judge

OUTPUT: a JSON object { "results": [ Result, ... ] } where Result is:
{
  "claimId": string,
  "verdict": "met" | "moving" | "miss" | "ambiguous",
  "actualText": string | null,   // what management said about the actual outcome (1-2 sentences)
  "quote": string | null,        // verbatim from transcript, ≤200 chars; null if ambiguous
  "reasoning": string            // 1-2 sentences explaining the verdict
}`;

  const user = `CLAIMS MADE IN ${sourceQuarter} (verify against ${targetQuarter} results):
${JSON.stringify(claims, null, 2)}

${targetQuarter} EARNINGS TRANSCRIPT:
${transcript}

Return ONLY the JSON object with "results" array.`;

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
        quote: claim.quote,
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
