import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SYMBOL_SECTOR } from "@/lib/intel/types";
import type { ClaimsArtifact, ChecksArtifact, Fundamentals, SectorRegistry } from "@/lib/intel/types";
import { loadRegistry } from "@/lib/intel/registry";
import { resolveClaimTarget } from "@/lib/intel/targetResolver";

export const dynamic = "force-dynamic";

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** Enrich claims with resolved target quarter and check status from checks.json */
function enrichClaims(
  claims: ClaimsArtifact,
  checks: ChecksArtifact | null,
  registry: SectorRegistry,
) {
  // Build a quick lookup: claimId → check
  const checkById: Record<string, ChecksArtifact["byTargetQuarter"][string][number]> = {};
  if (checks) {
    for (const batch of Object.values(checks.byTargetQuarter)) {
      for (const c of batch) checkById[c.claimId] = c;
    }
  }

  const result: Record<string, unknown[]> = {};

  for (const [sourceQ, rawClaims] of Object.entries(claims.byQuarter)) {
    result[sourceQ] = rawClaims.map((claim) => {
      const resolved = resolveClaimTarget(claim.targetQuarter, claim.targetText, sourceQ);
      const check = checkById[claim.id] ?? null;
      const metric = registry.metrics.find((m) => m.key === claim.metricKey);
      return {
        ...claim,
        resolvedTargetQuarter: resolved.quarter,
        targetResolutionConfidence: resolved.confidence,
        metricLabel: metric?.label ?? claim.metricKey,
        metricUnit: metric?.unit ?? "",
        check: check
          ? {
              status:           check.status,
              actualValue:      check.actualValue,
              actualUnit:       check.actualUnit,
              deltaText:        check.deltaText,
              reasoning:        check.reasoning,
              conditionalApplied: check.conditionalApplied,
              conditionalNote:  check.conditionalNote,
            }
          : null,
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
  const fund     = await readJson<Fundamentals>(path.join(base, "fundamentals.json"));
  const registry = loadRegistry(SYMBOL_SECTOR[symbol]);

  if (!claims) {
    return NextResponse.json(
      { error: "no claims data — run intel:rebuild first" },
      { status: 404 },
    );
  }

  const enriched = enrichClaims(claims, checks, registry);

  return NextResponse.json({
    symbol,
    sector:           SYMBOL_SECTOR[symbol],
    model:            claims.model,
    generatedAt:      claims.generatedAt,
    registryHash:     claims.registryHash,
    hasChecks:        !!checks,
    hasFundamentals:  !!fund,
    registry:         registry.metrics.map((m) => ({
      key: m.key, label: m.label, unit: m.unit, segment: m.segment,
    })),
    byQuarter:        enriched,
    fundamentalsByQuarter: fund?.quarters ?? {},
    warnings:         [
      ...claims.warnings,
      ...(checks?.warnings ?? []),
    ],
  });
}
