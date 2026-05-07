import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import type { ClaimsArtifact, ExtractedClaim, SectorRegistry, ClaimDirection, Confidence } from "./types";
import { callJson, estimateCostUsd, defaultExtractionModel } from "./llm";

export const STAGE3_PROMPT_VERSION = 1;

interface BuildPromptArgs {
  symbol: string;
  quarter: string;
  registry: SectorRegistry;
  transcript: string;
}

export function buildExtractPrompt(a: BuildPromptArgs): { system: string; user: string } {
  const system = `You are a senior equity research analyst extracting forward-looking management guidance from earnings concall transcripts. You work with extreme precision: only extract claims that are explicit, quantifiable, and tied to a specific tracked metric. Reject vague platitudes.

WHAT COUNTS AS A CLAIM:
- Forward-looking: refers to future performance (next quarter, this fiscal year, near-term, etc.). Past performance is NOT a claim.
- Quantifiable: a specific number/range OR a clear directional statement (increase / decrease / maintain).
- Tied to a tracked metric: must map to one of the registered metrics provided in the user message.

WHAT DOES NOT COUNT:
- Pure historical commentary ("we grew 18% this quarter").
- Vague optimism ("we feel good about prospects", "we are excited").
- Industry/macro commentary not specific to the company.
- Q&A clarifications about already-reported numbers.

OUTPUT: a JSON object: { "claims": [Claim, ...] } where Claim is:
{
  "metricKey": string (MUST be exactly one of the keys provided),
  "quote": string (verbatim from transcript, <= 300 chars),
  "speaker": string | null (best inference from preceding paragraph; null if unclear),
  "direction": "value" | "range" | "up" | "down" | "stable",
  "value": number | null,
  "rangeMin": number | null,
  "rangeMax": number | null,
  "qualitativeText": string | null,
  "targetQuarter": string | null,
  "targetText": string,
  "confidence": "high" | "medium" | "low",
  "conditional": string | null
}

If a claim references something not in the registry, do NOT extract it. Do not invent metricKeys.`;

  const registryJson = JSON.stringify(
    a.registry.metrics.map((m) => ({
      key: m.key, label: m.label, unit: m.unit, segment: m.segment,
      aliases: m.aliases, description: m.description,
    })),
    null, 2,
  );

  const user = `COMPANY: ${a.symbol}
QUARTER (when this call took place — use this as the source quarter for any "next quarter" target inference): ${a.quarter}

TRACKED METRICS (only extract claims about these — match by aliases or description):
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
  return { valid: true };
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

export async function extractClaimsForSymbol(args: ExtractClaimsArgs): Promise<ExtractClaimsResult> {
  const files = (await fs.readdir(args.transcriptsDir)).filter((n) => n.endsWith(".txt")).sort();
  const byQuarter: Record<string, ExtractedClaim[]> = {};
  const warnings: string[] = [];
  let totalCost = 0;

  for (const fname of files) {
    const quarter = fname.replace(/\.txt$/i, "");
    if (args.onlyQuarters && !args.onlyQuarters.includes(quarter)) continue;
    let transcript = await fs.readFile(path.join(args.transcriptsDir, fname), "utf-8");
    if (args.maxTranscriptChars && transcript.length > args.maxTranscriptChars) {
      transcript = transcript.slice(0, args.maxTranscriptChars);
    }
    const { system, user } = buildExtractPrompt({
      symbol: args.symbol, quarter, registry: args.registry, transcript,
    });

    const model = defaultExtractionModel();
    let result: Awaited<ReturnType<typeof callJson<{ claims: Partial<ExtractedClaim>[] }>>>;
    try {
      result = await callJson<{ claims: Partial<ExtractedClaim>[] }>({
        model,
        system, user,
        temperature: 0,
        cacheControl: true,
        ...(args.numCtx    !== undefined && { numCtx:    args.numCtx }),
        ...(args.maxTokens !== undefined && { maxTokens: args.maxTokens }),
      });
    } catch (err) {
      warnings.push(`${quarter}: LLM error — ${(err as Error).message.slice(0, 120)}`);
      byQuarter[quarter] = [];
      continue;
    }
    totalCost += estimateCostUsd(model, result);

    const accepted: ExtractedClaim[] = [];
    let n = 0;
    for (const raw of result.data.claims ?? []) {
      const v = validateClaim(raw, args.registry);
      if (!v.valid) { warnings.push(`${quarter}: ${v.reason}`); continue; }
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
    byQuarter[quarter] = accepted;
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
