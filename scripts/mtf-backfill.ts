/**
 * scripts/mtf-backfill.ts
 * One-off: ingest every .xls already sitting in the source folder.
 * Safe to re-run -- ingestion upserts, never duplicates.
 *
 * Usage: npx tsx scripts/mtf-backfill.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ingestMtfWorkbook } from "@/lib/mtf/ingest";

const SOURCE_DIR = path.join(
  process.cwd(), "data", "Fw_ MARGIN TRADING VOLUME WISE REPORT",
);

async function main() {
  const files = readdirSync(SOURCE_DIR).filter((f) => f.toLowerCase().endsWith(".xls"));
  console.log(`Found ${files.length} .xls file(s).`);

  for (const file of files) {
    const buf = readFileSync(path.join(SOURCE_DIR, file));
    try {
      const summary = await ingestMtfWorkbook(buf);
      console.log(`${file} -> date=${summary.date} rows=${summary.rowsIngested} warnings=${summary.warnings.length}`);
      for (const w of summary.warnings) console.log(`  ${w}`);
    } catch (e) {
      console.error(`${file} FAILED: ${(e as Error).message}`);
    }
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
