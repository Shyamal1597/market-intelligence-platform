/**
 * lib/intel/pipeline.ts — Reusable pipeline functions for the Intel Dashboard.
 *
 * These functions encapsulate the core pipeline logic so it can be called
 * from both CLI scripts (intel-rebuild.ts) and API routes (/api/intel/upload, /api/intel/scrape).
 *
 * Pipeline stages:
 *   Stage 2: PDF → cleaned transcript text
 *   Stage 3: Transcript → extracted claims (LLM)
 *   Stage 4: Claims + later transcripts → cross-checked verdicts (LLM)
 *   Stage 5: Claims + checks → quarter summaries (LLM)
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";

import { SYMBOL_SECTOR } from "@/lib/intel/types";
import { loadRegistryAsync, registryHash } from "@/lib/intel/registry";
import {
  extractPdfText,
  stripCoverLetter,
  stripRepeatingFooters,
  detectQuarterFromFilename,
  detectDateFromHeader,
  reportingQuarterFromCallDate,
} from "@/lib/intel/transcripts";
import { extractClaimsForSymbol, claimsHash } from "@/lib/intel/extractClaims";
import { crossCheckForSymbol } from "@/lib/intel/crossCheck";
import { generateQuarterSummary } from "@/lib/intel/generateSummary";
import { buildIntelIndex } from "@/lib/intel/buildIndex";
import type { ClaimsArtifact, ChecksArtifact, SectorKey } from "@/lib/intel/types";

// ── Index rebuild debounce ────────────────────────────────────────────────────
// Multiple concurrent pipeline completions collapse into a single rebuild
// 2 seconds after the last one finishes.
let _indexRebuildTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleIndexRebuild() {
  if (_indexRebuildTimer) clearTimeout(_indexRebuildTimer);
  _indexRebuildTimer = setTimeout(() => {
    _indexRebuildTimer = null;
    buildIntelIndex().catch((e) =>
      console.error("[pipeline] index rebuild failed:", (e as Error).message),
    );
  }, 2_000);
}

// ── Data paths ───────────────────────────────────────────────────────────────

export function intelBasePath(symbol: string): string {
  return path.join(process.cwd(), "data", "intelligence", symbol);
}

export function intelPaths(symbol: string) {
  const base = intelBasePath(symbol);
  return {
    base,
    transcripts:   path.join(base, "transcripts"),
    claims:        path.join(base, "claims.json"),
    checks:        path.join(base, "checks.json"),
    summaries:     path.join(base, "summaries"),
    uploads:       path.join(base, "uploads"),
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

export type PipelineStage =
  | "extract-text"
  | "extract-claims"
  | "cross-check"
  | "summaries"
  | "complete"
  | "failed";

export interface PipelineJob {
  id: string;
  symbol: string;
  quarter: string | null;
  status: "queued" | "running" | "complete" | "failed";
  stage: PipelineStage;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  source: "upload" | "bse-scrape" | "cli";
  costUsd: number;
}

export interface IngestResult {
  quarter: string;
  chars: number;
  method: string;
  alreadyExisted: boolean;
  /** First ~2000 chars of extracted text — used for company fingerprint validation */
  textSnippet: string;
}

export interface PipelineResult {
  symbol: string;
  quarter: string;
  claimsExtracted: number;
  checksRun: number;
  summariesGenerated: number;
  totalCostUsd: number;
  warnings: string[];
}

// ── Job persistence ──────────────────────────────────────────────────────────

const JOBS_DIR = path.join(process.cwd(), "data", "intelligence", "_jobs");

export async function writeJob(job: PipelineJob): Promise<void> {
  await fs.mkdir(JOBS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(JOBS_DIR, `${job.id}.json`),
    JSON.stringify(job, null, 2),
    "utf-8",
  );
}

export async function readJob(jobId: string): Promise<PipelineJob | null> {
  try {
    const raw = await fs.readFile(path.join(JOBS_DIR, `${jobId}.json`), "utf-8");
    return JSON.parse(raw) as PipelineJob;
  } catch {
    return null;
  }
}

export async function listJobs(symbol?: string, limit = 20): Promise<PipelineJob[]> {
  try {
    await fs.mkdir(JOBS_DIR, { recursive: true });
    const files = await fs.readdir(JOBS_DIR);
    const jobs: PipelineJob[] = [];
    // Read most recent first (files are timestamped)
    for (const f of files.sort().reverse().slice(0, limit * 2)) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(JOBS_DIR, f), "utf-8");
        const job = JSON.parse(raw) as PipelineJob;
        if (!symbol || job.symbol === symbol) jobs.push(job);
        if (jobs.length >= limit) break;
      } catch { /* skip corrupt files */ }
    }
    return jobs;
  } catch {
    return [];
  }
}

// ── Stage 2: PDF → Transcript ────────────────────────────────────────────────

/**
 * Extract text from a PDF buffer, detect the quarter, and save as a transcript.
 * This is the core ingestion function used by both upload and BSE scraper.
 *
 * @param pdfBuffer - Raw PDF bytes
 * @param symbol - NSE ticker symbol (must exist in SYMBOL_SECTOR)
 * @param filename - Original filename (used for quarter detection)
 * @param quarterOverride - If provided, skip quarter auto-detection
 * @returns IngestResult with the detected quarter and char count
 */
export async function ingestPdfTranscript(
  pdfBuffer: Buffer,
  symbol: string,
  filename: string,
  quarterOverride?: string,
): Promise<IngestResult> {
  const sym = symbol.toUpperCase();
  if (!SYMBOL_SECTOR[sym]) {
    throw new Error(`Unknown symbol: ${sym}. Not in SYMBOL_SECTOR.`);
  }

  const paths = intelPaths(sym);

  // Save PDF to uploads dir for audit trail
  await fs.mkdir(paths.uploads, { recursive: true });
  const sanitizedName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uploadPath = path.join(paths.uploads, `${Date.now()}-${sanitizedName}`);
  await fs.writeFile(uploadPath, pdfBuffer);

  // Extract text from saved PDF
  const { text: rawText, method } = await extractPdfText(uploadPath);

  if (rawText.length < 500) {
    throw new Error(
      `PDF text extraction yielded only ${rawText.length} chars — likely a scanned/image PDF. ` +
      `Please upload a text-based PDF.`,
    );
  }

  // Detect quarter
  let quarter = quarterOverride ?? null;
  if (!quarter) {
    quarter = detectQuarterFromFilename(filename);
  }
  if (!quarter) {
    // Scan first 6000 chars for date headers — broader window than the 4000 in transcripts.ts
    const headerDate = detectDateFromHeader(rawText.slice(0, 6000));
    if (headerDate) {
      quarter = reportingQuarterFromCallDate(headerDate);
    }
  }
  if (!quarter) {
    // Try additional patterns common in brokerage PDFs
    quarter = detectQuarterFromContent(rawText.slice(0, 8000));
  }
  if (!quarter) {
    throw new Error(
      `Could not detect quarter from filename "${filename}" or PDF content. ` +
      `Please specify the quarter manually (e.g., "Q1-FY27").`,
    );
  }

  // Path traversal guard — quarter is used as a filename component
  if (!/^Q[1-4]-FY\d{2}$/.test(quarter)) {
    throw new Error(`Detected quarter "${quarter}" has invalid format.`);
  }

  // Clean text
  const cleaned = stripRepeatingFooters(stripCoverLetter(rawText)).trim();

  // Save transcript (dedup: keep longer version)
  await fs.mkdir(paths.transcripts, { recursive: true });
  const outFile = path.join(paths.transcripts, `${quarter}.txt`);
  let alreadyExisted = false;

  if (existsSync(outFile)) {
    const existing = await fs.readFile(outFile, "utf-8");
    if (cleaned.length <= existing.length) {
      // Existing is longer or equal — keep it
      alreadyExisted = true;
      return { quarter, chars: existing.length, method, alreadyExisted, textSnippet: existing.slice(0, 2000) };
    }
    // New version is longer — overwrite
    alreadyExisted = true;
  }

  await fs.writeFile(outFile, cleaned, "utf-8");
  return { quarter, chars: cleaned.length, method, alreadyExisted, textSnippet: cleaned.slice(0, 2000) };
}

/**
 * Additional quarter detection patterns for brokerage/BSE PDFs.
 * Handles: "Q1 FY2026", "Q1FY26", "1QFY26", "Quarter 1 FY2026",
 * "First Quarter FY2026", "Quarter ended June 30, 2025"
 */
function detectQuarterFromContent(text: string): string | null {
  // Pattern: Q1 FY2026, Q1-FY2026, Q1 FY26
  const m1 = text.match(/Q\s*([1-4])\s*[-\s]*FY\s*['"]?(\d{2,4})/i);
  if (m1) {
    const fy = m1[2].length === 4 ? m1[2].slice(2) : m1[2];
    return `Q${m1[1]}-FY${fy}`;
  }

  // Pattern: 1QFY26, 1Q FY26
  const m2 = text.match(/([1-4])\s*Q\s*[-\s]*FY\s*['"]?(\d{2,4})/i);
  if (m2) {
    const fy = m2[2].length === 4 ? m2[2].slice(2) : m2[2];
    return `Q${m2[1]}-FY${fy}`;
  }

  // Pattern: "First|Second|Third|Fourth Quarter FY2026"
  const ordinalMap: Record<string, string> = {
    first: "1", second: "2", third: "3", fourth: "4",
  };
  const m3 = text.match(/(first|second|third|fourth)\s+quarter\s+(?:of\s+)?FY\s*['"]?(\d{2,4})/i);
  if (m3) {
    const q = ordinalMap[m3[1].toLowerCase()];
    const fy = m3[2].length === 4 ? m3[2].slice(2) : m3[2];
    return `Q${q}-FY${fy}`;
  }

  // Pattern: "Quarter ended June 30, 2025" or "quarter and year ended on March 31, 2026"
  const m4 = text.match(/quarter(?:\s+and\s+year)?\s+ended?\s+(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+(\d{4})/i);
  if (m4) {
    const monthMap: Record<string, number> = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    };
    const month = monthMap[m4[1].toLowerCase()];
    const year = parseInt(m4[2]);
    // Indian FY: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
    // FY year = calendar year of March end
    let q: number, fy: number;
    if (month >= 4 && month <= 6) { q = 1; fy = year + 1; }
    else if (month >= 7 && month <= 9) { q = 2; fy = year + 1; }
    else if (month >= 10 && month <= 12) { q = 3; fy = year + 1; }
    else { q = 4; fy = year; }
    return `Q${q}-FY${String(fy).slice(2)}`;
  }

  return null;
}

// ── Stages 3-5: Full pipeline run ────────────────────────────────────────────

/**
 * Run the full LLM pipeline (Stages 3→4→5) for a single symbol.
 * Optionally scoped to a specific quarter (for single-transcript ingestion).
 *
 * This is the main entry point for both the upload API and BSE scraper.
 */
export async function runFullPipeline(
  symbol: string,
  options?: {
    /** If set, only extract claims from this quarter's transcript */
    quarter?: string;
    /** Cost cap in USD — abort if exceeded */
    costCap?: number;
    /** Progress callback for job tracking */
    onProgress?: (stage: PipelineStage) => void;
  },
): Promise<PipelineResult> {
  const sym = symbol.toUpperCase();
  const sector = SYMBOL_SECTOR[sym] as SectorKey;
  if (!sector) throw new Error(`Unknown symbol: ${sym}`);

  const paths = intelPaths(sym);
  const reg = await loadRegistryAsync(sector);
  const regHash = registryHash(reg);
  const costCap = options?.costCap ?? 50;
  const onProgress = options?.onProgress;

  let totalCostUsd = 0;
  let claimsExtracted = 0;
  let checksRun = 0;
  let summariesGenerated = 0;
  const warnings: string[] = [];

  // ── Stage 3: Extract claims ──────────────────────────────────────────────
  onProgress?.("extract-claims");

  const onlyQuarters = options?.quarter ? [options.quarter] : undefined;

  // If we already have claims.json and we're adding a single new quarter,
  // we still re-run extraction to pick up the new transcript.
  // extractClaimsForSymbol merges new quarters into the existing artifact.
  const r3 = await extractClaimsForSymbol({
    symbol: sym,
    registry: reg,
    transcriptsDir: paths.transcripts,
    outFile: paths.claims,
    registryHash: regHash,
    onlyQuarters,
  });
  totalCostUsd += r3.totalCostUsd;
  claimsExtracted = Object.values(r3.artifact.byQuarter).reduce((s, c) => s + c.length, 0);
  if (r3.artifact.warnings.length) {
    warnings.push(...r3.artifact.warnings.slice(0, 5));
  }

  if (totalCostUsd > costCap) {
    warnings.push(`Cost cap $${costCap} reached at Stage 3 ($${totalCostUsd.toFixed(3)}). Skipping Stages 4-5.`);
    return { symbol: sym, quarter: options?.quarter ?? "all", claimsExtracted, checksRun, summariesGenerated, totalCostUsd, warnings };
  }

  // ── Stage 4: Cross-check ─────────────────────────────────────────────────
  onProgress?.("cross-check");

  if (!existsSync(paths.claims)) {
    warnings.push("No claims.json after Stage 3 — skipping cross-check.");
    return { symbol: sym, quarter: options?.quarter ?? "all", claimsExtracted, checksRun, summariesGenerated, totalCostUsd, warnings };
  }

  const claims: ClaimsArtifact = JSON.parse(await fs.readFile(paths.claims, "utf-8"));
  const cHash = claimsHash(claims);

  const r4 = await crossCheckForSymbol({
    symbol: sym,
    claims,
    transcriptsDir: paths.transcripts,
    registry: reg,
    outFile: paths.checks,
    claimsHashValue: cHash,
    onlyQuarters,
  });
  totalCostUsd += r4.totalCostUsd;
  checksRun = Object.values(r4.artifact.byTargetQuarter).flat().length;

  if (totalCostUsd > costCap) {
    warnings.push(`Cost cap $${costCap} reached at Stage 4 ($${totalCostUsd.toFixed(3)}). Skipping Stage 5.`);
    return { symbol: sym, quarter: options?.quarter ?? "all", claimsExtracted, checksRun, summariesGenerated, totalCostUsd, warnings };
  }

  // ── Stage 5: Summaries ───────────────────────────────────────────────────
  onProgress?.("summaries");

  try {
    const checks: ChecksArtifact = JSON.parse(await fs.readFile(paths.checks, "utf-8"));
    await fs.mkdir(paths.summaries, { recursive: true });

    const allChecks = Object.values(checks.byTargetQuarter).flat();
    const checkById = Object.fromEntries(allChecks.map((c) => [c.claimId, c]));

    for (const sourceQ of Object.keys(claims.byQuarter).sort()) {
      // Find primary verified quarter (same logic as generate-summaries.ts)
      const verifiedQuarters = (claims.byQuarter[sourceQ] ?? [])
        .map((c) => checkById[c.id]?.verifiedInQuarter)
        .filter((q): q is string => !!q && q !== "unknown" && q !== sourceQ);
      if (verifiedQuarters.length === 0) continue;

      const freq = new Map<string, number>();
      for (const q of verifiedQuarters) freq.set(q, (freq.get(q) ?? 0) + 1);
      const verifiedIn = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];

      const srcPath = path.join(paths.transcripts, `${sourceQ}.txt`);
      const tgtPath = path.join(paths.transcripts, `${verifiedIn}.txt`);
      if (!existsSync(srcPath) || !existsSync(tgtPath)) continue;

      const outFile = path.join(paths.summaries, `${sourceQ}.json`);
      // Skip if summary already exists and we're not forcing a specific quarter
      if (existsSync(outFile) && options?.quarter && options.quarter !== sourceQ) continue;

      const sourceTranscript = await fs.readFile(srcPath, "utf-8");
      const targetTranscript = await fs.readFile(tgtPath, "utf-8");

      const { summary, costUsd } = await generateQuarterSummary({
        symbol: sym,
        sourceQuarter: sourceQ,
        verifiedInQuarter: verifiedIn,
        sourceTranscript,
        targetTranscript,
        claims,
        checks,
        registry: reg,
      });

      await fs.writeFile(outFile, JSON.stringify(summary, null, 2), "utf-8");
      totalCostUsd += costUsd;
      summariesGenerated++;
    }
  } catch (e) {
    warnings.push(`Stage 5 error: ${(e as Error).message}`);
  }

  onProgress?.("complete");

  // Rebuild the pre-computed index so the frontend reflects new data immediately.
  // Debounced: multiple concurrent pipeline completions collapse into one rebuild.
  scheduleIndexRebuild();

  return {
    symbol: sym,
    quarter: options?.quarter ?? "all",
    claimsExtracted,
    checksRun,
    summariesGenerated,
    totalCostUsd,
    warnings,
  };
}

// ── Utility: generate a unique job ID ────────────────────────────────────────

export function generateJobId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `job_${ts}_${rand}`;
}
