import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import type { ClaimsArtifact, ChecksArtifact, SectorRegistry } from "@/lib/intel/types";
import { loadRegistry } from "@/lib/intel/registry";
import { resolveClaimTarget } from "@/lib/intel/targetResolver";
interface ActualsArtifact {
  symbol: string;
  generatedAt: string;
  byQuarter: Record<string, Array<{
    claimId: string;
    metricKey: string;
    targetQuarter: string;
    snippets: string[];
  }>>;
}

export const dynamic = "force-dynamic";

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** Enrich claims with resolved target quarter, check verdict, and actuals snippets */
function enrichClaims(
  claims: ClaimsArtifact,
  checks: ChecksArtifact | null,
  registry: SectorRegistry,
  actuals: ActualsArtifact | null,
) {
  // Build lookup: claimId → check
  const checkById: Record<string, ChecksArtifact["byTargetQuarter"][string][number]> = {};
  if (checks) {
    for (const batch of Object.values(checks.byTargetQuarter)) {
      for (const c of batch) checkById[c.claimId] = c;
    }
  }

  // Build lookup: claimId → { targetQuarter, snippets }
  const actualsById: Record<string, { targetQuarter: string; snippets: string[] }> = {};
  if (actuals) {
    for (const entries of Object.values(actuals.byQuarter)) {
      for (const e of entries) {
        actualsById[e.claimId] = { targetQuarter: e.targetQuarter, snippets: e.snippets };
      }
    }
  }

  const result: Record<string, unknown[]> = {};

  for (const [sourceQ, rawClaims] of Object.entries(claims.byQuarter)) {
    result[sourceQ] = rawClaims.map((claim) => {
      const resolved = resolveClaimTarget(claim.targetQuarter, claim.targetText, sourceQ);
      const check = checkById[claim.id] ?? null;
      const metric = registry.metrics.find((m) => m.key === claim.metricKey);
      // If the claim was "verified" against its own source quarter transcript,
      // that's a self-referencing check -- treat it as pending (no real verification).
      const isSelfRef = check && check.verifiedInQuarter === sourceQ;

      return {
        ...claim,
        resolvedTargetQuarter: resolved.quarter,
        targetResolutionConfidence: resolved.confidence,
        metricLabel: metric?.label ?? claim.metricKey,
        metricUnit: metric?.unit ?? "",
        check: check && !isSelfRef
          ? {
              verdict:           check.verdict,
              verifiedInQuarter: check.verifiedInQuarter,
              actualText:        check.actualText,
              quote:             check.quote,
              reasoning:         check.reasoning,
            }
          : null,
        actuals: actualsById[claim.id] ?? null,
      };
    });
  }

  return result;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();

  if (!SYMBOL_SECTOR[symbol]) {
    return NextResponse.json({ error: "unknown symbol" }, { status: 404 });
  }

  const base     = path.join("data/intelligence", symbol);
  const claims   = await readJson<ClaimsArtifact>(path.join(base, "claims.json"));
  const checks   = await readJson<ChecksArtifact>(path.join(base, "checks.json"));
  const actuals  = await readJson<ActualsArtifact>(path.join(base, "actuals.json"));
  const registry = loadRegistry(SYMBOL_SECTOR[symbol]);

  if (!claims) {
    return NextResponse.json(
      { error: "no claims data -- run intel:rebuild first" },
      { status: 404 },
    );
  }

  const enriched = enrichClaims(claims, checks, registry, actuals);

  return NextResponse.json({
    symbol,
    sector:       SYMBOL_SECTOR[symbol],
    model:        claims.model,
    generatedAt:  claims.generatedAt,
    registryHash: claims.registryHash,
    hasChecks:    !!checks,
    registry:     registry.metrics.map((m) => ({
      key: m.key, label: m.label, unit: m.unit, segment: m.segment,
    })),
    segmentDescriptions: registry.segmentDescriptions ?? {},
    byQuarter:    enriched,
    warnings:     [
      ...claims.warnings,
      ...(checks?.warnings ?? []),
    ],
  });
}
