/**
 * Stage 5 — Quarterly summary generation.
 * Uses the LLM to write an analyst-quality narrative brief for a given quarter,
 * grounded in both the source and target transcripts + all verified claims.
 */
import type {
  ClaimsArtifact,
  ChecksArtifact,
  SectorRegistry,
  QuarterSummary,
  Verdict,
} from "./types";
import { callJson, estimateCostUsd, defaultVerificationModel } from "./llm";

export interface GenerateSummaryArgs {
  symbol: string;
  sourceQuarter: string;
  verifiedInQuarter: string;
  sourceTranscript: string;
  targetTranscript: string;
  claims: ClaimsArtifact;
  checks: ChecksArtifact;
  registry: SectorRegistry;
}

export interface GenerateSummaryResult {
  summary: QuarterSummary;
  costUsd: number;
}

export const STAGE5_PROMPT_VERSION = 1;

/** Build company brief from registry (same helper pattern as crossCheck). */
function buildCompanyBrief(symbol: string, registry: SectorRegistry): string {
  const bySegment = new Map<string, string[]>();
  for (const m of registry.metrics) {
    if (!bySegment.has(m.segment)) bySegment.set(m.segment, []);
    bySegment.get(m.segment)!.push(m.label);
  }
  const lines = [...bySegment.entries()]
    .map(([seg, labels]) => `  - ${seg}: ${labels.join(", ")}`)
    .join("\n");
  return `Company: ${symbol}\nSegments:\n${lines}`;
}

/** Compute verdict counts for claims in a specific source quarter. */
function computeVerdictCounts(
  sourceQuarter: string,
  claims: ClaimsArtifact,
  checks: ChecksArtifact,
): QuarterSummary["verdictCounts"] {
  const allChecks = Object.values(checks.byTargetQuarter).flat();
  const checkById = Object.fromEntries(allChecks.map((c) => [c.claimId, c]));
  const counts = { met: 0, moving: 0, miss: 0, pending: 0, ambiguous: 0 };
  for (const claim of claims.byQuarter[sourceQuarter] ?? []) {
    const ch = checkById[claim.id];
    if (ch?.verdict && ch.verdict in counts) {
      counts[ch.verdict as Verdict]++;
    }
  }
  return counts;
}

export async function generateQuarterSummary(
  args: GenerateSummaryArgs,
): Promise<GenerateSummaryResult> {
  const model = defaultVerificationModel();
  const companyBrief = buildCompanyBrief(args.symbol, args.registry);

  // Build enriched claims list for prompt context
  const allChecks = Object.values(args.checks.byTargetQuarter).flat();
  const checkById = Object.fromEntries(allChecks.map((c) => [c.claimId, c]));
  const claimsInQuarter = args.claims.byQuarter[args.sourceQuarter] ?? [];

  const enrichedClaims = claimsInQuarter.map((c) => {
    const m = args.registry.metrics.find((r) => r.key === c.metricKey);
    const ch = checkById[c.id];
    return {
      metric: m?.label ?? c.metricKey,
      segment: m?.segment ?? "Unknown",
      guidedDirection: c.direction,
      guidedValue: c.value ?? c.qualitativeText ?? null,
      managementStatement: c.quote,
      verdict: ch?.verdict ?? "pending",
      actualText: ch?.actualText ?? null,
      verifiedQuote: ch?.quote ?? null,
      reasoning: ch?.reasoning ?? null,
    };
  });

  const system = `You are a senior equity research analyst writing a concise quarterly performance brief.

${companyBrief}

You are given:
1. Forward-looking claims management made in ${args.sourceQuarter}
2. How each claim resolved when verified against ${args.verifiedInQuarter} results
3. Excerpts from both earnings call transcripts

Write a brief for senior portfolio managers and board members. Be specific about numbers. No hedging. Direct financial English.

OUTPUT: Return a JSON object with exactly this structure:
{
  "headline": "2-3 sentences covering overall guidance delivery for all major segments",
  "segments": {
    "<SegmentName>": "1-2 sentences on that segment's performance vs guidance — only include segments that had claims this quarter"
  },
  "keyThemes": ["max 4 short themes or watchpoints for the next quarter"]
}`;

  const user = `CLAIMS MADE IN ${args.sourceQuarter} AND THEIR VERIFICATION (${args.verifiedInQuarter}):
${JSON.stringify(enrichedClaims, null, 2)}

${args.sourceQuarter} EARNINGS CALL TRANSCRIPT (source of promises):
${args.sourceTranscript.slice(0, 25000)}

${args.verifiedInQuarter} EARNINGS CALL TRANSCRIPT (source of actuals):
${args.targetTranscript.slice(0, 25000)}

Return ONLY the JSON object.`;

  const result = await callJson<{
    headline: string;
    segments: Record<string, string>;
    keyThemes: string[];
  }>({ model, system, user, maxTokens: 1024, temperature: 0 });

  const costUsd = estimateCostUsd(model, result);

  const verdictCounts = computeVerdictCounts(
    args.sourceQuarter,
    args.claims,
    args.checks,
  );
  const decisive = verdictCounts.met + verdictCounts.moving + verdictCounts.miss;
  const onTrackPct =
    decisive > 0
      ? Math.round(((verdictCounts.met + verdictCounts.moving) / decisive) * 100)
      : 0;

  const summary: QuarterSummary = {
    symbol: args.symbol,
    sourceQuarter: args.sourceQuarter,
    verifiedInQuarter: args.verifiedInQuarter,
    generatedAt: new Date().toISOString(),
    model,
    headline: result.data.headline ?? "",
    segments: result.data.segments ?? {},
    keyThemes: result.data.keyThemes ?? [],
    verdictCounts,
    onTrackPct,
  };

  return { summary, costUsd };
}
