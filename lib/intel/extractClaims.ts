import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import type { ClaimsArtifact, ExtractedClaim, SectorRegistry, ClaimDirection, Confidence } from "./types";
import { callJson, estimateCostUsd, defaultExtractionModel } from "./llm";

export const STAGE3_PROMPT_VERSION = 2;

interface BuildPromptArgs {
  symbol: string;
  quarter: string;
  registry: SectorRegistry;
  transcript: string;
}

export function buildExtractPrompt(a: BuildPromptArgs): { system: string; user: string } {
  const system = `You are a senior equity research analyst extracting forward-looking management guidance from earnings call transcripts.

A CLAIM is only valid when ALL THREE conditions are met:
1. FORWARD-LOOKING — management is committing to a future outcome. The target period must be AFTER this quarter. Statements describing what already happened this quarter are NOT claims, even if they mention a metric.
2. SPECIFIC — there is at least one operational anchor: a direction with a qualifier ("compress slightly", "normalize from current levels"), an explicit number or range, or a named future period. Pure sentiment ("we feel good", "we remain confident", "we are well-positioned") is NOT a claim.
3. METRIC-MAPPED — maps to exactly one key in the registered metrics list.

REJECT these — they are NOT claims:
- Current-quarter results reported as facts: "NIM was 3.5% this quarter", "PAT grew 22%"
- Vague reassurance with no operational content: "we are optimistic", "momentum is strong"
- Industry/macro commentary not specific to this company
- Any statement where the only supporting evidence is about a DIFFERENT metric

DEDUPLICATION — one claim per (metricKey × target period):
If management mentions the same metric for the same target period more than once, extract the SINGLE most specific instance. Prefer a quote with an explicit number over one that is purely directional. Do not emit duplicate (metricKey, targetQuarter) pairs.

CONFIDENCE:
- "high"   — explicit number or range target ("NIM will be ~3.5%", "credit cost below 2%")
- "medium" — directional with a specific qualifier ("compress slightly next quarter", "normalize from elevated levels")
- "low"    — bare directional with no qualifier ("will improve", "expected to grow") — only extract if no better evidence exists for this metric in this call

FIELD RULES:
- quote      : verbatim from transcript, ≤300 chars, must be the sentence(s) that directly state the forward guidance for THIS metric — not a nearby sentence about a different metric
- targetText : ≤60-char synthesis of what management is specifically committing to for this metric (e.g. "below 2% by Q2 FY26", "stable next 2 quarters", "ROE above 22% this FY") — NOT a copy of the quote
- value      : the explicit FUTURE target number management is committing to — null if no number stated. DO NOT use the current quarter's reported actual number.
- rangeMin/rangeMax : use when management gives a range target; null otherwise
- direction  : "value" if a specific number, "range" if a range, "up"/"down"/"stable" for directional — reflects the GUIDED direction, not what happened this quarter
- targetQuarter : resolve to "Q{n}-FY{yy}" if determinable (e.g. "next quarter" from Q1-FY26 → "Q2-FY26"); null for multi-quarter or fiscal-year targets
- conditional : capture the condition if guidance is explicitly contingent ("if rate cuts materialise")

OUTPUT: Respond ONLY with the JSON object below — no preamble, no explanation, no markdown fences.
{ "claims": [Claim, ...] }`;

  const registryJson = JSON.stringify(
    a.registry.metrics.map((m) => ({
      key: m.key, label: m.label, unit: m.unit, segment: m.segment,
      direction: m.direction, aliases: m.aliases, description: m.description,
    })),
    null, 2,
  );

  const user = `COMPANY: ${a.symbol}
SOURCE QUARTER (when this call took place — all claims must target a period AFTER this quarter): ${a.quarter}

TRACKED METRICS (only extract claims about these — match by key, label, aliases, or description):
${registryJson}

TRANSCRIPT:
${a.transcript}`;

  return { system, user };
}

export function validateClaim(
  raw: Partial<ExtractedClaim>,
  registry: SectorRegistry,
): { valid: boolean; reason?: string } {
  if (!raw.metricKey || !registry.metrics.some((m) => m.key === raw.metricKey)) {
    return { valid: false, reason: `unknown metricKey: ${raw.metricKey}` };
  }
  if (!raw.quote || raw.quote.length === 0) return { valid: false, reason: "missing quote" };
  if (!raw.direction) return { valid: false, reason: "missing direction" };
  if (!raw.targetText || raw.targetText.trim().length === 0) {
    return { valid: false, reason: "missing targetText" };
  }
  return { valid: true };
}

/** Numeric score for claim specificity — used for deduplication. Higher = keep. */
function specificityScore(c: Partial<ExtractedClaim>): number {
  if (c.direction === "value" || c.direction === "range") return 3;
  if (c.confidence === "high") return 2;
  if (c.confidence === "medium") return 1;
  return 0;
}

/**
 * Deduplicate claims at the (metricKey × targetQuarter) level.
 * Within each bucket, keep the single most specific claim.
 */
export function deduplicateClaims(claims: Partial<ExtractedClaim>[]): Partial<ExtractedClaim>[] {
  const groups = new Map<string, Partial<ExtractedClaim>[]>();
  for (const c of claims) {
    const key = `${c.metricKey}::${c.targetQuarter ?? "__null__"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  const result: Partial<ExtractedClaim>[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { result.push(group[0]); continue; }
    const best = group.slice().sort((a, b) => specificityScore(b) - specificityScore(a))[0];
    result.push(best);
  }
  return result;
}

export interface ExtractClaimsArgs {
  symbol: string;
  registry: SectorRegistry;
  transcriptsDir: string;
  outFile: string;
  registryHash: string;
  onlyQuarters?: string[];
  /** Override LLM context window (tokens). Ollama-only; ignored by Anthropic. */
  numCtx?: number;
  /** Override max output tokens. Defaults to Ollama/Anthropic model defaults. */
  maxTokens?: number;
  /** Truncate transcripts to this many characters before sending to LLM.
   *  Use when prompt size causes Ollama grammar sampler to behave incorrectly near context ceiling. */
  maxTranscriptChars?: number;
}

export interface ExtractClaimsResult {
  artifact: ClaimsArtifact;
  totalCostUsd: number;
}

// Max concurrent Haiku calls per symbol. When intel-rebuild runs multiple symbols
// in parallel, total concurrent calls = STAGE3_CONCURRENCY × symbols. Keep low to
// avoid 429s — Haiku's burst limit is ~10 rpm on most Anthropic tiers.
const STAGE3_CONCURRENCY = 2;

// Delay between batch starts (ms). Gives rate-limiter headroom when symbols run together.
const BATCH_DELAY_MS = 2_000;

async function processQuarter(
  fname: string,
  args: ExtractClaimsArgs,
): Promise<{ quarter: string; claims: ExtractedClaim[]; warnings: string[]; cost: number }> {
  const quarter = fname.replace(/\.txt$/i, "");
  let transcript = await fs.readFile(path.join(args.transcriptsDir, fname), "utf-8");
  if (args.maxTranscriptChars && transcript.length > args.maxTranscriptChars) {
    transcript = transcript.slice(0, args.maxTranscriptChars);
  }
  const { system, user } = buildExtractPrompt({
    symbol: args.symbol, quarter, registry: args.registry, transcript,
  });

  const model = defaultExtractionModel();
  const localWarnings: string[] = [];
  let result: Awaited<ReturnType<typeof callJson<{ claims: Partial<ExtractedClaim>[] }>>> | undefined;
  // Retry up to 3 times on 429 rate-limit errors with exponential back-off.
  let lastErr: Error | null = null;
  let succeeded = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 5_000 * attempt));
    try {
      result = await callJson<{ claims: Partial<ExtractedClaim>[] }>({
        model,
        system, user,
        temperature: 0,
        cacheControl: true,
        ...(args.numCtx    !== undefined && { numCtx:    args.numCtx }),
        ...(args.maxTokens !== undefined && { maxTokens: args.maxTokens }),
      });
      succeeded = true;
      break;
    } catch (err) {
      lastErr = err as Error;
      if (!(err as Error).message.includes("429")) break; // non-rate-limit — don't retry
    }
  }
  if (!succeeded || !result) {
    localWarnings.push(`${quarter}: LLM error — ${lastErr!.message.slice(0, 120)}`);
    return { quarter, claims: [], warnings: localWarnings, cost: 0 };
  }
  const cost = estimateCostUsd(model, result);

  // Normalize: LLM may return "key" instead of "metricKey"
  const rawClaims = (result.data.claims ?? []).map((c: any) => {
    if (!c.metricKey && c.key) { c.metricKey = c.key; delete c.key; }
    return c;
  });

  const deduped = deduplicateClaims(rawClaims);
  const accepted: ExtractedClaim[] = [];
  let n = 0;
  for (const raw of deduped) {
    const v = validateClaim(raw, args.registry);
    if (!v.valid) { localWarnings.push(`${quarter}: ${v.reason}`); continue; }
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
  console.log(`  ${quarter}: ${accepted.length} claims (${deduped.length - accepted.length} rejected)`);
  return { quarter, claims: accepted, warnings: localWarnings, cost };
}

// Parse a quarter label "Q4-FY26" → sortable integer 2604, "Q1-FY26" → 2601.
// Used to enforce the Q4-FY25 minimum cutoff.
function quarterToInt(q: string): number {
  const m = q.match(/^Q(\d)-FY(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[2], 10) * 10 + parseInt(m[1], 10);
}
const MIN_QUARTER_INT = quarterToInt("Q4-FY25"); // 2504

export async function extractClaimsForSymbol(args: ExtractClaimsArgs): Promise<ExtractClaimsResult> {
  const allFiles = (await fs.readdir(args.transcriptsDir)).filter((n) => n.endsWith(".txt")).sort();
  const files = allFiles.filter((f) => {
    const q = f.replace(/\.txt$/i, "");
    // Never extract claims from transcripts before Q4-FY25 — too old to be actionable
    // and wastes API credits. onlyQuarters is an additional optional narrowing on top.
    if (quarterToInt(q) < MIN_QUARTER_INT) return false;
    if (args.onlyQuarters) return args.onlyQuarters.includes(q);
    return true;
  });

  const byQuarter: Record<string, ExtractedClaim[]> = {};
  const warnings: string[] = [];
  let totalCost = 0;

  // Process quarters in concurrent batches capped at STAGE3_CONCURRENCY.
  // BATCH_DELAY_MS between batches gives rate-limiter headroom when multiple
  // symbols run in parallel from intel-rebuild.ts.
  for (let i = 0; i < files.length; i += STAGE3_CONCURRENCY) {
    if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    const batch = files.slice(i, i + STAGE3_CONCURRENCY);
    const results = await Promise.all(batch.map((fname) => processQuarter(fname, args)));
    for (const r of results) {
      byQuarter[r.quarter] = r.claims;
      warnings.push(...r.warnings);
      totalCost += r.cost;
    }
  }

  const artifact: ClaimsArtifact = {
    symbol: args.symbol,
    promptVersion: STAGE3_PROMPT_VERSION,
    model: defaultExtractionModel(),
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
