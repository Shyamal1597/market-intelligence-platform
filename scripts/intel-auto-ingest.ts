/**
 * scripts/intel-auto-ingest.ts
 *
 * Scheduled auto-ingest script -- calls the running Next.js server's
 * /api/intel/auto-ingest endpoint to pull new BSE/Screener transcripts
 * and trigger Stage 3+4 for any newly found symbols.
 *
 * Designed to run as a Windows Task Scheduler job every 6 hours.
 *
 * Setup (run once as Administrator):
 *   schtasks /create /tn "Sunidhi Intel Auto-Ingest" /tr "npx tsx D:\Sunidhi-Intranet-Futuristic\scripts\intel-auto-ingest.ts" /sc hourly /mo 6 /st 06:00
 *
 * Or via npm: npm run intel:auto-ingest
 *
 * Environment:
 *   INTRANET_URL -- base URL of the Next.js server (default: http://localhost:3000)
 */

import https from "node:https";
import http from "node:http";

const BASE_URL = process.env.INTRANET_URL ?? "http://localhost:3000";

async function post(url: string, body: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      },
    );
    req.setTimeout(120_000, () => {
      req.destroy(new Error("Request timed out after 120s"));
    });
    req.on("error", (e) => { reject(e); process.exit(1); });
    req.write(payload);
    req.end();
  });
}

async function main() {
  const now = new Date().toISOString();
  console.log(`[${now}] Intel auto-ingest starting…`);

  try {
    const result = await post(`${BASE_URL}/api/intel/auto-ingest`, {
      lookbackDays: 7,   // check last 7 days of BSE filings
      runPipeline: true, // trigger Stage 3+4 for any newly ingested transcripts
      screenerFallback: true,
    }) as { ingested: number; skipped: number; errors: number; pipelineTriggered: string[] };

    console.log(`  Ingested:  ${result.ingested} new transcripts`);
    console.log(`  Skipped:   ${result.skipped} (already existed)`);
    console.log(`  Errors:    ${result.errors}`);
    if (result.pipelineTriggered?.length) {
      console.log(`  Pipeline triggered for: ${result.pipelineTriggered.join(", ")}`);
    } else {
      console.log(`  No new transcripts -- nothing to process`);
    }
  } catch (e) {
    console.error(`  Failed: ${(e as Error).message}`);
    console.error(`  Is the server running at ${BASE_URL}?`);
    process.exit(1);
  }
}

main();
