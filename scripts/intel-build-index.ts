/**
 * scripts/intel-build-index.ts
 *
 * Pre-builds data/intelligence/_index.json from claims + checks JSON files.
 * The /api/intel/companies route reads this file for instant response instead
 * of scanning all 100 stock directories on every request.
 *
 * Usage:
 *   npx tsx scripts/intel-build-index.ts
 *   npm run intel:index
 *
 * Run after any pipeline stage that produces claims.json or checks.json.
 */

import { buildIntelIndex } from "@/lib/intel/buildIndex";

async function main() {
  console.log("Building _index.json…");
  const { total, withData } = await buildIntelIndex();
  console.log(`✓ _index.json written: ${total} symbols (${withData} with data)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
