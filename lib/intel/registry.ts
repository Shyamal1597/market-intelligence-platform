import { promises as fs } from "node:fs";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SectorKey, SectorRegistry, RegistryMetric } from "./types";

const REG_DIR = path.join(process.cwd(), "data", "intelligence", "registries");

export function loadRegistry(sector: SectorKey): SectorRegistry {
  const file = path.join(REG_DIR, `${sector}.json`);
  const raw = fsSync.readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw) as SectorRegistry;
  validateRegistry(parsed);
  return parsed;
}

export async function loadRegistryAsync(sector: SectorKey): Promise<SectorRegistry> {
  const file = path.join(REG_DIR, `${sector}.json`);
  const raw = await fs.readFile(file, "utf-8");
  const parsed = JSON.parse(raw) as SectorRegistry;
  validateRegistry(parsed);
  return parsed;
}

export function validateRegistry(r: SectorRegistry): void {
  if (!r.sector) throw new Error("registry missing sector");
  if (!Array.isArray(r.metrics)) throw new Error("registry missing metrics array");
  const seen = new Set<string>();
  for (const m of r.metrics) {
    if (!m.key) throw new Error("metric missing key");
    if (seen.has(m.key)) throw new Error(`duplicate key in registry: ${m.key}`);
    seen.add(m.key);
    if (!m.excel?.sheet) throw new Error(`metric ${m.key} missing excel.sheet`);
  }
}

export function registryHash(r: SectorRegistry): string {
  const stable = JSON.stringify(r, Object.keys(r).sort());
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

export function metricByKey(r: SectorRegistry, key: string): RegistryMetric | null {
  return r.metrics.find((m) => m.key === key) ?? null;
}
