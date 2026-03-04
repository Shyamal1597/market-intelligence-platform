# Research Reports RAG + Analyst Performance — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Index 161 research PDFs into searchable JSON, expose a local Ollama RAG endpoint, and build `/reports` and `/analyst` pages plus a company-level reports panel on the existing research page.

**Architecture:** PDF indexing pipeline writes `data/reports/metadata.json` + `data/reports/chunks.json` (BM25-searchable). A streaming API hits Ollama `llama3.1:8b` at `localhost:11434`. Analyst performance is computed live by joining static metadata with the existing `/api/quote/[symbol]` endpoint for current prices.

**Tech Stack:** Next.js 16 App Router, TypeScript, `pdf-parse` (text extraction), BM25 (pure TS, no dep), Ollama REST API (SSE streaming), Lucide React, Recharts, Tailwind CSS v4

---

## Context You Need Before Starting

- **Project root**: `D:\Sunidhi-Intranet-Futuristic` (branch `futuristic-design`)
- **Research PDFs**: `D:\Sunidhi Intranet\Research Reports\[Analyst]\file.pdf` — 161 files across 8 analyst folders
- **Design doc**: `docs/plans/2026-03-04-research-rag-analyst-design.md` — read it, it has schema details and the regex patterns for metadata extraction
- **No test runner installed** — verification steps are `npm run build` (TypeScript compile) + manual curl/browser checks
- **Existing pattern for JSON persistence**: see `app/api/watchlist/route.ts` — reads/writes `data/watchlist.json` using `fs/promises`
- **Existing pattern for external fetch**: see `app/api/macro/route.ts` — fetch + proxy
- **Existing quote API**: `GET /api/quote/[symbol]` already works and returns `{ regularMarketPrice, ... }`
- **OmniCore nav**: `components/layout/OmniCore.tsx` — add entries to `NAV_ITEMS` array
- **Theme classes**: use `bg-surface`, `border-border`, `text-muted`, `text-primary`, `text-amber` — never hardcode hex colors

---

## Task 1: Install pdf-parse dependency

**Files:**
- Modify: `package.json` (auto-updated by npm)

**Step 1: Install the package**

```bash
cd D:\Sunidhi-Intranet-Futuristic
npm install pdf-parse
npm install --save-dev @types/pdf-parse
```

**Step 2: Verify TypeScript can see it**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors about `pdf-parse`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add pdf-parse for research report indexing"
```

---

## Task 2: Create data/reports directory and seed empty JSON files

**Files:**
- Create: `data/reports/metadata.json`
- Create: `data/reports/chunks.json`

**Step 1: Create the files**

`data/reports/metadata.json`:
```json
[]
```

`data/reports/chunks.json`:
```json
[]
```

**Step 2: Verify they exist**

```bash
ls D:\Sunidhi-Intranet-Futuristic\data\reports\
```

Expected: `metadata.json  chunks.json`

**Step 3: Commit**

```bash
git add data/reports/metadata.json data/reports/chunks.json
git commit -m "data: add empty reports index files"
```

---

## Task 3: Create the BM25 search utility

**Files:**
- Create: `lib/bm25.ts`

**Step 1: Write the utility**

`lib/bm25.ts`:
```typescript
// BM25 Okapi implementation — pure TypeScript, no deps
// k1=1.5, b=0.75 (standard defaults)

export interface BM25Doc {
  id: string;
  text: string;
  [key: string]: unknown;
}

interface Index {
  docs: BM25Doc[];
  tf: Map<string, Map<string, number>>; // docId -> term -> frequency
  df: Map<string, number>;              // term -> doc frequency
  avgLen: number;
  k1: number;
  b: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s₹]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function buildIndex(docs: BM25Doc[], k1 = 1.5, b = 0.75): Index {
  const tf = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();
  let totalLen = 0;

  for (const doc of docs) {
    const tokens = tokenize(doc.text);
    totalLen += tokens.length;
    const termFreq = new Map<string, number>();
    for (const t of tokens) {
      termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
    }
    tf.set(doc.id, termFreq);
    for (const t of termFreq.keys()) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }

  return { docs, tf, df, avgLen: totalLen / (docs.length || 1), k1, b };
}

export function search(index: Index, query: string, topK = 6): BM25Doc[] {
  const { docs, tf, df, avgLen, k1, b } = index;
  const N = docs.length;
  const queryTerms = tokenize(query);
  const scores = new Map<string, number>();

  for (const doc of docs) {
    let score = 0;
    const docTf = tf.get(doc.id)!;
    const docLen = Array.from(docTf.values()).reduce((a, v) => a + v, 0);

    for (const term of queryTerms) {
      const termTf = docTf.get(term) ?? 0;
      if (termTf === 0) continue;
      const docFreq = df.get(term) ?? 0;
      const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
      const tfNorm = (termTf * (k1 + 1)) / (termTf + k1 * (1 - b + b * (docLen / avgLen)));
      score += idf * tfNorm;
    }

    if (score > 0) scores.set(doc.id, score);
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id]) => docs.find((d) => d.id === id)!);
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | grep "bm25"
```

Expected: no output (no errors).

**Step 3: Commit**

```bash
git add lib/bm25.ts
git commit -m "feat: add BM25 search utility"
```

---

## Task 4: Create the PDF indexing library

**Files:**
- Create: `lib/reportIndexer.ts`

This module handles: scanning the Research Reports directory, extracting text via pdf-parse, parsing metadata from filename + text, chunking text, and writing both JSON files.

**Step 1: Write the indexer**

`lib/reportIndexer.ts`:
```typescript
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// pdf-parse types — import with require to avoid ESM issues in Next.js
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReportMeta {
  id: string;
  analyst: string;
  company: string;
  symbol: string;
  reportType: "IC" | "RU" | "CU" | "Technical" | "Other";
  date: string;          // ISO: "2025-08-01"
  rating: string;
  cmp: number;
  targetPrice: number;
  filePath: string;      // absolute path
}

export interface Chunk {
  id: string;
  reportId: string;
  text: string;
  pageNum: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const REPORTS_BASE = "D:\\Sunidhi Intranet\\Research Reports";
const DATA_DIR = path.join(process.cwd(), "data", "reports");
const METADATA_PATH = path.join(DATA_DIR, "metadata.json");
const CHUNKS_PATH = path.join(DATA_DIR, "chunks.json");

const REPORT_TYPE_CODES = ["IC", "RU", "CU", "Technical"] as const;

// Month abbreviation → zero-padded month number
const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04",
  may: "05", jun: "06", jul: "07", aug: "08",
  sep: "09", oct: "10", nov: "11", dec: "12",
};

// ── Filename parsing ─────────────────────────────────────────────────────────

function parseFilename(filename: string, analystFolder: string): Partial<ReportMeta> {
  const base = path.basename(filename, ".pdf");
  const parts = base.split("_");

  // Find report type code index
  let typeIdx = -1;
  let reportType: ReportMeta["reportType"] = "Other";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].toUpperCase();
    if ((REPORT_TYPE_CODES as readonly string[]).includes(p)) {
      typeIdx = i;
      reportType = p as ReportMeta["reportType"];
      break;
    }
    if (p.startsWith("TECHNICAL")) {
      typeIdx = i;
      reportType = "Technical";
      break;
    }
  }

  const company = typeIdx > 0 ? parts.slice(0, typeIdx).join(" ") : parts[0];

  // Parse date from last segment (e.g. "SunidhiAug25" or "SunidhiQ1FY26")
  const datePart = parts[parts.length - 1].replace(/^Sunidhi/i, "");
  let date = "";
  const monthMatch = datePart.match(/([A-Za-z]{3})(\d{2})$/);
  if (monthMatch) {
    const mon = MONTH_MAP[monthMatch[1].toLowerCase()];
    if (mon) {
      const year = parseInt(monthMatch[2], 10) + 2000;
      date = `${year}-${mon}-01`;
    }
  }
  if (!date) {
    // Fallback: today
    date = new Date().toISOString().slice(0, 10);
  }

  return {
    analyst: analystFolder,
    company,
    reportType,
    date,
  };
}

// ── PDF text extraction + metadata regex ────────────────────────────────────

function parseNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, "")) || 0;
}

function extractMetaFromText(text: string): Pick<ReportMeta, "rating" | "cmp" | "targetPrice"> {
  const ratingMatch = text.match(/(?:recommendation|rating)\s*[:\-–]?\s*([A-Za-z][^\n]{2,30})/i);
  const cmpMatch = text.match(/CMP\s*\(₹\)\s*([\d,]+(?:\.\d+)?)/i);
  const tpMatch = text.match(/Price\s*Target\s*\(₹\)\s*([\d,]+(?:\.\d+)?)/i);

  return {
    rating: ratingMatch ? ratingMatch[1].trim() : "",
    cmp: cmpMatch ? parseNumber(cmpMatch[1]) : 0,
    targetPrice: tpMatch ? parseNumber(tpMatch[1]) : 0,
  };
}

// ── Chunking ─────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 1200;   // chars (~400 tokens)
const CHUNK_OVERLAP = 150; // chars (~50 tokens)

function chunkText(text: string, reportId: string): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  let pageNum = 1;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const slice = text.slice(start, end).trim();
    if (slice.length > 50) {
      chunks.push({
        id: crypto.randomUUID(),
        reportId,
        text: slice,
        pageNum,
      });
    }
    start = end - CHUNK_OVERLAP;
    pageNum++;
  }

  return chunks;
}

// ── Main indexer ─────────────────────────────────────────────────────────────

export async function indexReports(
  onProgress?: (msg: string) => void
): Promise<{ indexed: number; skipped: number }> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const allMeta: ReportMeta[] = [];
  const allChunks: Chunk[] = [];
  let indexed = 0;
  let skipped = 0;

  // Walk analyst folders
  const analystFolders = await fs.readdir(REPORTS_BASE);

  for (const folder of analystFolders) {
    const folderPath = path.join(REPORTS_BASE, folder);
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) continue;

    const files = await fs.readdir(folderPath);
    const pdfs = files.filter((f) => f.toLowerCase().endsWith(".pdf"));

    for (const pdf of pdfs) {
      const filePath = path.join(folderPath, pdf);
      onProgress?.(`Indexing: ${folder}/${pdf}`);

      try {
        const buffer = await fs.readFile(filePath);
        const parsed = await pdfParse(buffer);
        const text: string = parsed.text ?? "";

        if (!text || text.length < 100) {
          skipped++;
          continue;
        }

        const id = crypto.randomUUID();
        const fromFilename = parseFilename(pdf, folder);
        const fromText = extractMetaFromText(text);

        const meta: ReportMeta = {
          id,
          analyst: fromFilename.analyst ?? folder,
          company: fromFilename.company ?? pdf,
          symbol: "",  // populated manually via management UI or future symbol-map
          reportType: fromFilename.reportType ?? "Other",
          date: fromFilename.date ?? new Date().toISOString().slice(0, 10),
          rating: fromText.rating,
          cmp: fromText.cmp,
          targetPrice: fromText.targetPrice,
          filePath,
        };

        allMeta.push(meta);
        allChunks.push(...chunkText(text, id));
        indexed++;
      } catch (err) {
        onProgress?.(`  SKIP (parse error): ${pdf} — ${err}`);
        skipped++;
      }
    }
  }

  await fs.writeFile(METADATA_PATH, JSON.stringify(allMeta, null, 2));
  await fs.writeFile(CHUNKS_PATH, JSON.stringify(allChunks, null, 2));

  return { indexed, skipped };
}

// ── Read helpers ─────────────────────────────────────────────────────────────

export async function readMetadata(): Promise<ReportMeta[]> {
  try {
    return JSON.parse(await fs.readFile(METADATA_PATH, "utf-8")) as ReportMeta[];
  } catch {
    return [];
  }
}

export async function readChunks(): Promise<Chunk[]> {
  try {
    return JSON.parse(await fs.readFile(CHUNKS_PATH, "utf-8")) as Chunk[];
  } catch {
    return [];
  }
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: no errors from `lib/reportIndexer.ts`.

**Step 3: Commit**

```bash
git add lib/reportIndexer.ts
git commit -m "feat: add PDF indexing library with BM25 chunker"
```

---

## Task 5: Create the indexing API route

**Files:**
- Create: `app/api/reports/index/route.ts`

**Step 1: Write the route**

`app/api/reports/index/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { indexReports } from "@/lib/reportIndexer";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — 161 PDFs take time

export async function POST() {
  try {
    const result = await indexReports((msg) => console.log("[index]", msg));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[index] fatal:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
```

**Step 2: Verify build**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | grep "reports/index" | head -5
```

Expected: no output.

**Step 3: Test the endpoint manually** (server must be running first: `npm run dev`)

```bash
curl -X POST http://localhost:3001/api/reports/index
```

Expected JSON (takes 1-3 min for 161 PDFs):
```json
{"ok":true,"indexed":161,"skipped":0}
```

After running, verify data files were written:
```bash
ls -lh D:\Sunidhi-Intranet-Futuristic\data\reports\
```

Expected: `metadata.json` and `chunks.json` with non-zero sizes.

**Step 4: Commit**

```bash
git add app/api/reports/index/route.ts
git commit -m "feat: add POST /api/reports/index endpoint"
```

---

## Task 6: Create the metadata API route

**Files:**
- Create: `app/api/reports/metadata/route.ts`

**Step 1: Write the route**

`app/api/reports/metadata/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { readMetadata } from "@/lib/reportIndexer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const analyst = searchParams.get("analyst")?.toLowerCase();
  const symbol = searchParams.get("symbol")?.toUpperCase();

  let meta = await readMetadata();

  if (analyst) meta = meta.filter((m) => m.analyst.toLowerCase().includes(analyst));
  if (symbol) meta = meta.filter((m) => m.symbol === symbol);

  // Sort newest first
  meta = meta.sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json(meta);
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json() as Partial<{ symbol: string; rating: string; cmp: number; targetPrice: number }>;
  const meta = await readMetadata();
  const idx = meta.findIndex((m) => m.id === id);
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 });

  meta[idx] = { ...meta[idx], ...body };

  const { promises: fs } = await import("fs");
  const path = await import("path");
  const dataPath = path.join(process.cwd(), "data", "reports", "metadata.json");
  await fs.writeFile(dataPath, JSON.stringify(meta, null, 2));

  return NextResponse.json(meta[idx]);
}
```

**Step 2: Verify compile**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | grep "reports/metadata" | head -5
```

**Step 3: Test**

```bash
curl http://localhost:3001/api/reports/metadata | head -c 200
```

Expected: JSON array of report objects (after indexing ran in Task 5).

**Step 4: Commit**

```bash
git add app/api/reports/metadata/route.ts
git commit -m "feat: add GET/PATCH /api/reports/metadata endpoint"
```

---

## Task 7: Create the PDF file-server API route

**Files:**
- Create: `app/api/reports/file/route.ts`

Security requirement: validate the requested path is inside the Research Reports base directory before streaming.

**Step 1: Write the route**

`app/api/reports/file/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const REPORTS_BASE = path.resolve("D:\\Sunidhi Intranet\\Research Reports");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const encodedPath = searchParams.get("p");
  if (!encodedPath) {
    return NextResponse.json({ error: "p param required" }, { status: 400 });
  }

  let filePath: string;
  try {
    filePath = Buffer.from(encodedPath, "base64url").toString("utf-8");
  } catch {
    return NextResponse.json({ error: "invalid path encoding" }, { status: 400 });
  }

  // Security: canonicalize and assert within allowed base
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(REPORTS_BASE)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const buffer = await fs.readFile(resolved);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${path.basename(resolved)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
```

**Step 2: Add helper to encode paths (used by frontend components)**

Add to `lib/reportIndexer.ts` (append at bottom):
```typescript
export function encodePdfPath(filePath: string): string {
  return Buffer.from(filePath, "utf-8").toString("base64url");
}
```

**Step 3: Verify compile**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | grep "reports/file\|reportIndexer" | head -5
```

**Step 4: Test with curl** (using a real file path from metadata.json)

```bash
# Grab a filePath from metadata.json, encode it, then request
node -e "const p=require('./data/reports/metadata.json')[0].filePath; console.log(Buffer.from(p).toString('base64url'))"
# Use that output as ?p= value:
curl "http://localhost:3001/api/reports/file?p=<output>" -o /tmp/test.pdf && echo "OK"
```

Expected: `/tmp/test.pdf` is a valid PDF.

**Step 5: Commit**

```bash
git add app/api/reports/file/route.ts lib/reportIndexer.ts
git commit -m "feat: add secure PDF file-server API"
```

---

## Task 8: Create the RAG search API with Ollama SSE streaming

**Files:**
- Create: `app/api/reports/search/route.ts`

This endpoint:
1. Accepts `{ query, symbol?, analyst?, topK? }`
2. Loads chunks from disk (cached in module scope after first load)
3. Builds BM25 index, retrieves top-K matching chunks
4. Streams to Ollama `llama3.1:8b` at `localhost:11434/api/chat`
5. Returns SSE: `sources` event first, then `delta` events, then `done`

**Step 1: Write the route**

`app/api/reports/search/route.ts`:
```typescript
import { NextRequest } from "next/server";
import { readChunks, readMetadata, type Chunk, type ReportMeta } from "@/lib/reportIndexer";
import { buildIndex, search, type BM25Doc } from "@/lib/bm25";

export const dynamic = "force-dynamic";

// Module-level cache — reload on server restart
let chunkCache: Chunk[] | null = null;
let metaCache: ReportMeta[] | null = null;
let indexCache: ReturnType<typeof buildIndex> | null = null;

async function getIndex(symbol?: string, analyst?: string) {
  if (!chunkCache) chunkCache = await readChunks();
  if (!metaCache) metaCache = await readMetadata();

  let chunks = chunkCache;

  // Scope BM25 to filtered set if filters provided
  if (symbol || analyst) {
    const validIds = new Set(
      metaCache
        .filter(
          (m) =>
            (!symbol || m.symbol === symbol.toUpperCase()) &&
            (!analyst || m.analyst.toLowerCase().includes(analyst.toLowerCase()))
        )
        .map((m) => m.id)
    );
    chunks = chunks.filter((c) => validIds.has(c.reportId));
  }

  // Only cache unfiltered index
  if (!symbol && !analyst) {
    if (!indexCache) indexCache = buildIndex(chunks as BM25Doc[]);
    return { index: indexCache, meta: metaCache };
  }

  return { index: buildIndex(chunks as BM25Doc[]), meta: metaCache };
}

function makeSSE(encoder: TextEncoder, payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

const OLLAMA_URL = "http://localhost:11434/api/chat";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    query: string;
    symbol?: string;
    analyst?: string;
    topK?: number;
  };

  const { query, symbol, analyst, topK = 6 } = body;

  if (!query?.trim()) {
    return new Response("query required", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { index, meta } = await getIndex(symbol, analyst);

        // BM25 retrieval
        const hits = search(index, query, topK) as (BM25Doc & { reportId: string; pageNum: number })[];

        const sources = hits
          .map((h) => meta.find((m) => m.id === h.reportId))
          .filter(Boolean) as ReportMeta[];

        const uniqueSources = sources.filter(
          (s, i, arr) => arr.findIndex((x) => x.id === s.id) === i
        );

        // Send sources first
        controller.enqueue(makeSSE(encoder, { type: "sources", sources: uniqueSources }));

        if (hits.length === 0) {
          controller.enqueue(
            makeSSE(encoder, { type: "delta", text: "No relevant reports found for this query." })
          );
          controller.enqueue(makeSSE(encoder, { type: "done" }));
          controller.close();
          return;
        }

        // Build context block
        const contextBlock = hits
          .map((h) => {
            const m = meta.find((x) => x.id === h.reportId);
            const header = m
              ? `[${m.company} — ${m.analyst}, ${m.date}, ${m.rating}]`
              : `[report ${h.reportId}]`;
            return `${header}\n${h.text}`;
          })
          .join("\n---\n");

        const systemPrompt = `You are an equity research analyst assistant at Sunidhi Capital.
Answer questions based ONLY on the research reports provided below.
If the answer is not in the reports, say so clearly.
Be concise. Cite the company and analyst name when referencing a report.

<context>
${contextBlock}
</context>`;

        // Stream from Ollama
        const ollamaRes = await fetch(OLLAMA_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3.1:8b",
            stream: true,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: query },
            ],
          }),
        });

        if (!ollamaRes.ok || !ollamaRes.body) {
          controller.enqueue(
            makeSSE(encoder, {
              type: "delta",
              text: `Ollama error: ${ollamaRes.status} — is llama3.1:8b running?`,
            })
          );
          controller.enqueue(makeSSE(encoder, { type: "done" }));
          controller.close();
          return;
        }

        const reader = ollamaRes.body.getReader();
        const dec = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const lines = dec.decode(value).split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
              if (parsed.message?.content) {
                controller.enqueue(makeSSE(encoder, { type: "delta", text: parsed.message.content }));
              }
            } catch {
              // partial JSON line, skip
            }
          }
        }

        controller.enqueue(makeSSE(encoder, { type: "done" }));
        controller.close();
      } catch (err) {
        controller.enqueue(makeSSE(encoder, { type: "error", message: String(err) }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

**Step 2: Verify compile**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | grep "reports/search\|bm25\|reportIndexer" | head -10
```

**Step 3: Test with curl** (Ollama must be running)

```bash
curl -X POST http://localhost:3001/api/reports/search \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the target price for Axis Bank?","topK":3}' \
  --no-buffer
```

Expected: SSE stream with `sources` event followed by delta text events.

**Step 4: Commit**

```bash
git add app/api/reports/search/route.ts
git commit -m "feat: add RAG search API with Ollama SSE streaming"
```

---

## Task 9: Create the `/reports` page

**Files:**
- Create: `app/reports/page.tsx`
- Create: `components/reports/ReportsBrowser.tsx`
- Create: `components/reports/RagChat.tsx`

### 9a: ReportsBrowser component

`components/reports/ReportsBrowser.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import type { ReportMeta } from "@/lib/reportIndexer";
import { encodePdfPath } from "@/lib/reportIndexer";

interface Props {
  onFilterChange: (symbol: string, analyst: string) => void;
}

export function ReportsBrowser({ onFilterChange }: Props) {
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [analystFilter, setAnalystFilter] = useState("");
  const [symbolFilter, setSymbolFilter] = useState("");

  async function loadReports() {
    setLoading(true);
    const params = new URLSearchParams();
    if (analystFilter) params.set("analyst", analystFilter);
    if (symbolFilter) params.set("symbol", symbolFilter);
    const data = await fetch(`/api/reports/metadata?${params}`).then((r) => r.json());
    setReports(data);
    setLoading(false);
  }

  async function reindex() {
    setIndexing(true);
    await fetch("/api/reports/index", { method: "POST" });
    setIndexing(false);
    loadReports();
  }

  useEffect(() => { loadReports(); }, [analystFilter, symbolFilter]); // eslint-disable-line

  const analysts = [...new Set(reports.map((r) => r.analyst))].sort();

  return (
    <div className="border border-border rounded-xl bg-surface flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-xs font-mono text-muted tracking-widest uppercase">Report Library</h2>
        <button
          onClick={reindex}
          disabled={indexing}
          className="flex items-center gap-1.5 text-[10px] font-mono text-amber hover:bg-amber/10 px-2 py-1 rounded transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${indexing ? "animate-spin" : ""}`} />
          {indexing ? "Indexing…" : "Re-index"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-4 py-2 border-b border-border">
        <select
          value={analystFilter}
          onChange={(e) => { setAnalystFilter(e.target.value); onFilterChange(symbolFilter, e.target.value); }}
          className="flex-1 text-xs font-mono bg-background border border-border rounded px-2 py-1 text-primary focus:outline-none focus:border-amber/60"
        >
          <option value="">All Analysts</option>
          {analysts.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          value={symbolFilter}
          onChange={(e) => { setSymbolFilter(e.target.value.toUpperCase()); onFilterChange(e.target.value.toUpperCase(), analystFilter); }}
          placeholder="SYMBOL"
          className="w-24 text-xs font-mono bg-background border border-border rounded px-2 py-1 text-primary placeholder-muted focus:outline-none focus:border-amber/60"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {loading ? (
          <div className="p-4 text-xs font-mono text-muted animate-pulse">Loading…</div>
        ) : reports.length === 0 ? (
          <div className="p-4 text-xs font-mono text-muted">
            No reports indexed. Click Re-index to scan PDFs.
          </div>
        ) : (
          reports.map((r) => (
            <a
              key={r.id}
              href={`/api/reports/file?p=${encodePdfPath(r.filePath)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors group"
            >
              <FileText className="w-3.5 h-3.5 text-muted group-hover:text-amber mt-0.5 shrink-0 transition-colors" />
              <div className="min-w-0">
                <div className="text-xs font-mono text-primary truncate">{r.company}</div>
                <div className="text-[10px] font-mono text-muted">
                  {r.analyst} · {r.date} · {r.reportType}
                  {r.rating && <> · <span className="text-amber">{r.rating}</span></>}
                  {r.targetPrice > 0 && <> · TP ₹{r.targetPrice.toLocaleString("en-IN")}</>}
                </div>
              </div>
            </a>
          ))
        )}
      </div>

      <div className="px-4 py-2 border-t border-border text-[10px] font-mono text-muted">
        {reports.length} reports
      </div>
    </div>
  );
}
```

### 9b: RagChat component

`components/reports/RagChat.tsx`:
```typescript
"use client";

import { useRef, useState } from "react";
import { Send, Bot } from "lucide-react";
import type { ReportMeta } from "@/lib/reportIndexer";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: ReportMeta[];
}

interface Props {
  symbol?: string;
  analyst?: string;
}

export function RagChat({ symbol, analyst }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send() {
    const query = input.trim();
    if (!query || streaming) return;
    setInput("");

    const userMsg: Message = { role: "user", content: query };
    setMessages((prev) => [...prev, userMsg]);

    const assistantMsg: Message = { role: "assistant", content: "", sources: [] };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreaming(true);

    try {
      const res = await fetch("/api/reports/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, symbol, analyst, topK: 6 }),
      });

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6)) as {
            type: string;
            text?: string;
            sources?: ReportMeta[];
          };

          if (payload.type === "sources") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { ...updated[updated.length - 1], sources: payload.sources };
              return updated;
            });
          } else if (payload.type === "delta" && payload.text) {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: updated[updated.length - 1].content + payload.text,
              };
              return updated;
            });
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }
        }
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="border border-border rounded-xl bg-surface flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Bot className="w-4 h-4 text-amber" />
        <h2 className="text-xs font-mono text-muted tracking-widest uppercase">Ask the Reports</h2>
        {(symbol || analyst) && (
          <span className="ml-auto text-[10px] font-mono text-amber/70">
            {[symbol, analyst].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-xs font-mono text-muted">
            Ask anything about the research reports — target prices, investment thesis, risk factors, sector views…
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "text-right" : ""}>
            {msg.sources && msg.sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {msg.sources.map((s) => (
                  <span key={s.id} className="text-[9px] font-mono bg-amber/10 text-amber px-1.5 py-0.5 rounded">
                    {s.company} · {s.analyst}
                  </span>
                ))}
              </div>
            )}
            <div
              className={`inline-block text-xs font-sans leading-relaxed px-3 py-2 rounded-lg max-w-[85%] text-left whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-amber/15 text-primary"
                  : "bg-border text-primary"
              }`}
            >
              {msg.content || (streaming && i === messages.length - 1 ? "▌" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 px-4 py-3 border-t border-border">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about target prices, thesis, risks…"
          disabled={streaming}
          className="flex-1 text-xs font-mono bg-background border border-border rounded px-3 py-2 text-primary placeholder-muted focus:outline-none focus:border-amber/60 disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={streaming || !input.trim()}
          className="p-2 text-amber hover:bg-amber/10 rounded transition-colors disabled:opacity-30"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```

### 9c: The `/reports` page

`app/reports/page.tsx`:
```typescript
"use client";

import { useState } from "react";
import { RagChat } from "@/components/reports/RagChat";
import { ReportsBrowser } from "@/components/reports/ReportsBrowser";

export default function ReportsPage() {
  const [symbol, setSymbol] = useState("");
  const [analyst, setAnalyst] = useState("");

  return (
    <div className="p-6 max-w-[1600px]">
      <div className="mb-5">
        <h1 className="text-2xl font-display text-primary">Research Reports</h1>
        <p className="text-xs font-mono text-muted mt-1">
          RAG search over {" "}
          <span className="text-amber">161 Sunidhi Capital research PDFs</span>
          {" "}· powered by llama3.1:8b
        </p>
      </div>

      <div className="flex gap-5 h-[calc(100vh-180px)]">
        {/* Left: RAG Chat */}
        <div className="flex-1 min-w-0">
          <RagChat symbol={symbol} analyst={analyst} />
        </div>

        {/* Right: Report Browser */}
        <div className="w-80 shrink-0">
          <ReportsBrowser onFilterChange={(sym, ana) => { setSymbol(sym); setAnalyst(ana); }} />
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify compile**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

**Step 3: Verify in browser**

Navigate to `http://localhost:3001/reports`. Expected:
- Left panel: empty chat with placeholder text
- Right panel: list of indexed reports (must have run indexer first)
- Filters work (selecting an analyst scopes the report list and the RAG query)

**Step 4: Commit**

```bash
git add app/reports/page.tsx components/reports/ReportsBrowser.tsx components/reports/RagChat.tsx
git commit -m "feat: add /reports page with RAG chat and report browser"
```

---

## Task 10: Create the `/analyst` page

**Files:**
- Create: `app/analyst/page.tsx`
- Create: `components/analyst/AnalystScorecard.tsx`
- Create: `components/analyst/CoverageTable.tsx`

### 10a: AnalystScorecard component

`components/analyst/AnalystScorecard.tsx`:
```typescript
"use client";

import type { ReportMeta } from "@/lib/reportIndexer";

interface Props {
  analyst: string;
  reports: ReportMeta[];
  livePrices: Record<string, number>;
}

export function AnalystScorecard({ analyst, reports, livePrices }: Props) {
  const calls = reports.length;

  // A "hit" = live CMP reached or exceeded target price
  const reportsWithLive = reports.filter((r) => r.symbol && livePrices[r.symbol]);
  const hits = reportsWithLive.filter((r) => {
    const live = livePrices[r.symbol];
    if (!live || !r.targetPrice) return false;
    return r.rating.toLowerCase().includes("outperform") || r.rating.toLowerCase().includes("buy")
      ? live >= r.targetPrice
      : live <= r.targetPrice;
  });

  const hitRate = reportsWithLive.length > 0
    ? ((hits.length / reportsWithLive.length) * 100).toFixed(0)
    : "—";

  const avgUpside = reportsWithLive.length > 0
    ? (
        reportsWithLive.reduce((sum, r) => {
          const live = livePrices[r.symbol];
          if (!live || !r.targetPrice) return sum;
          return sum + ((r.targetPrice - live) / live) * 100;
        }, 0) / reportsWithLive.length
      ).toFixed(1)
    : "—";

  const initials = analyst
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="border border-border rounded-xl bg-surface p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-amber/20 flex items-center justify-center text-amber text-sm font-mono font-bold shrink-0">
          {initials}
        </div>
        <div>
          <div className="text-sm font-mono text-primary leading-tight">{analyst}</div>
          <div className="text-[10px] font-mono text-muted">{calls} reports</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-background rounded-lg p-2 text-center">
          <div className="text-lg font-mono text-primary">{hitRate}{hitRate !== "—" ? "%" : ""}</div>
          <div className="text-[9px] font-mono text-muted tracking-wider uppercase">Hit Rate</div>
        </div>
        <div className="bg-background rounded-lg p-2 text-center">
          <div className={`text-lg font-mono ${parseFloat(avgUpside) > 0 ? "text-teal" : parseFloat(avgUpside) < 0 ? "text-danger" : "text-primary"}`}>
            {avgUpside !== "—" ? `${parseFloat(avgUpside) > 0 ? "+" : ""}${avgUpside}%` : "—"}
          </div>
          <div className="text-[9px] font-mono text-muted tracking-wider uppercase">Avg Upside</div>
        </div>
      </div>
    </div>
  );
}
```

### 10b: CoverageTable component

`components/analyst/CoverageTable.tsx`:
```typescript
"use client";

import { useState } from "react";
import type { ReportMeta } from "@/lib/reportIndexer";
import { encodePdfPath } from "@/lib/reportIndexer";
import { FileText, ChevronUp, ChevronDown } from "lucide-react";

interface Props {
  reports: ReportMeta[];
  livePrices: Record<string, number>;
}

type SortKey = "company" | "analyst" | "date" | "rating" | "cmp" | "targetPrice" | "upside";

export function CoverageTable({ reports, livePrices }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function upside(r: ReportMeta): number | null {
    const live = r.symbol ? livePrices[r.symbol] : null;
    if (!live || !r.targetPrice) return null;
    return ((r.targetPrice - live) / live) * 100;
  }

  const sorted = [...reports].sort((a, b) => {
    let av: string | number = 0;
    let bv: string | number = 0;
    if (sortKey === "upside") {
      av = upside(a) ?? -Infinity;
      bv = upside(b) ?? -Infinity;
    } else if (sortKey === "date" || sortKey === "company" || sortKey === "analyst" || sortKey === "rating") {
      av = a[sortKey];
      bv = b[sortKey];
    } else {
      av = a[sortKey] ?? 0;
      bv = b[sortKey] ?? 0;
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  function ColHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th
        className="text-left px-3 py-2 text-[10px] font-mono text-muted tracking-widest uppercase cursor-pointer hover:text-primary select-none"
        onClick={() => toggleSort(k)}
      >
        <span className="flex items-center gap-1">
          {label}
          {active ? (
            sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          ) : null}
        </span>
      </th>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-surface overflow-hidden">
      <table className="w-full">
        <thead className="border-b border-border bg-background/50">
          <tr>
            <ColHeader label="Company" k="company" />
            <ColHeader label="Analyst" k="analyst" />
            <ColHeader label="Date" k="date" />
            <ColHeader label="Rating" k="rating" />
            <ColHeader label="CMP at Issue" k="cmp" />
            <ColHeader label="Target ₹" k="targetPrice" />
            <th className="text-left px-3 py-2 text-[10px] font-mono text-muted tracking-widest uppercase">Live CMP</th>
            <ColHeader label="Upside" k="upside" />
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((r) => {
            const live = r.symbol ? livePrices[r.symbol] : null;
            const up = upside(r);
            return (
              <tr key={r.id} className="hover:bg-white/5 transition-colors">
                <td className="px-3 py-2 text-xs font-mono text-primary">{r.company}</td>
                <td className="px-3 py-2 text-xs font-mono text-muted">{r.analyst}</td>
                <td className="px-3 py-2 text-xs font-mono text-muted">{r.date}</td>
                <td className="px-3 py-2 text-xs font-mono text-amber">{r.rating || "—"}</td>
                <td className="px-3 py-2 text-xs font-mono text-primary">
                  {r.cmp > 0 ? `₹${r.cmp.toLocaleString("en-IN")}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-primary">
                  {r.targetPrice > 0 ? `₹${r.targetPrice.toLocaleString("en-IN")}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-primary">
                  {live ? `₹${live.toLocaleString("en-IN")}` : <span className="text-muted">—</span>}
                </td>
                <td className="px-3 py-2 text-xs font-mono font-bold">
                  {up !== null ? (
                    <span className={up >= 0 ? "text-teal" : "text-danger"}>
                      {up >= 0 ? "+" : ""}{up.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <a
                    href={`/api/reports/file?p=${encodePdfPath(r.filePath)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-amber transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

### 10c: The `/analyst` page

`app/analyst/page.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import type { ReportMeta } from "@/lib/reportIndexer";
import { AnalystScorecard } from "@/components/analyst/AnalystScorecard";
import { CoverageTable } from "@/components/analyst/CoverageTable";

export default function AnalystPage() {
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const meta: ReportMeta[] = await fetch("/api/reports/metadata").then((r) => r.json());
      setReports(meta);

      // Fetch live prices for all unique symbols that have one
      const symbols = [...new Set(meta.map((m) => m.symbol).filter(Boolean))];
      const prices: Record<string, number> = {};
      await Promise.allSettled(
        symbols.map(async (sym) => {
          try {
            const data = await fetch(`/api/quote/${sym}`).then((r) => r.json());
            if (data?.regularMarketPrice) prices[sym] = data.regularMarketPrice;
          } catch {
            // ignore
          }
        })
      );
      setLivePrices(prices);
      setLoading(false);
    }
    load();
  }, []);

  const analysts = [...new Set(reports.map((r) => r.analyst))].sort();

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-border rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <div key={i} className="h-24 bg-surface border border-border rounded-xl" />)}
          </div>
          <div className="h-64 bg-surface border border-border rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px]">
      <div className="mb-5">
        <h1 className="text-2xl font-display text-primary">Analyst Performance</h1>
        <p className="text-xs font-mono text-muted mt-1">
          {reports.length} reports across {analysts.length} analysts · live upside calculated from current market price
        </p>
      </div>

      {/* Scorecards grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {analysts.map((analyst) => (
          <AnalystScorecard
            key={analyst}
            analyst={analyst}
            reports={reports.filter((r) => r.analyst === analyst)}
            livePrices={livePrices}
          />
        ))}
      </div>

      {/* Full coverage table */}
      <CoverageTable reports={reports} livePrices={livePrices} />
    </div>
  );
}
```

**Step 2: Verify compile**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

**Step 3: Verify in browser**

Navigate to `http://localhost:3001/analyst`. Expected:
- 8 analyst scorecards with hit rate and avg upside
- Full sortable coverage table below
- Upside column in teal (positive) or danger (negative)

**Step 4: Commit**

```bash
git add app/analyst/page.tsx components/analyst/AnalystScorecard.tsx components/analyst/CoverageTable.tsx
git commit -m "feat: add /analyst page with scorecards and coverage table"
```

---

## Task 11: Add CompanyReportsPanel to research page

**Files:**
- Create: `components/research/CompanyReportsPanel.tsx`
- Modify: `app/research/[symbol]/page.tsx`

### 11a: CompanyReportsPanel component

`components/research/CompanyReportsPanel.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import type { ReportMeta } from "@/lib/reportIndexer";
import { encodePdfPath } from "@/lib/reportIndexer";
import Link from "next/link";

interface Props {
  symbol: string;
}

export function CompanyReportsPanel({ symbol }: Props) {
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/reports/metadata?symbol=${symbol}`)
      .then((r) => r.json())
      .then((data: ReportMeta[]) => { setReports(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [symbol]);

  if (loading) return <div className="animate-pulse h-20 bg-border rounded-xl" />;

  return (
    <div className="border border-border rounded-xl bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-mono text-muted tracking-widest uppercase">Research Reports</h3>
        <Link
          href={`/reports?symbol=${symbol}`}
          className="flex items-center gap-1 text-[10px] font-mono text-amber hover:bg-amber/10 px-2 py-1 rounded transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Ask RAG
        </Link>
      </div>

      {reports.length === 0 ? (
        <p className="text-muted text-xs font-mono">
          No indexed reports for {symbol}. Set the symbol via Coverage Details and re-index.
        </p>
      ) : (
        <div className="space-y-1.5">
          {reports.map((r) => (
            <a
              key={r.id}
              href={`/api/reports/file?p=${encodePdfPath(r.filePath)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs font-mono text-primary hover:text-amber transition-colors group"
            >
              <FileText className="w-3.5 h-3.5 text-muted group-hover:text-amber transition-colors shrink-0" />
              <span className="flex-1 truncate">{r.company} — {r.reportType}</span>
              <span className="text-[10px] text-muted">{r.date}</span>
              {r.rating && <span className="text-[10px] text-amber">{r.rating}</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 11b: Swap AnalystNotesPanel for CompanyReportsPanel in research page

In `app/research/[symbol]/page.tsx`:

**Find this import:**
```typescript
import { AnalystNotesPanel } from "@/components/research/AnalystNotesPanel";
```

**Replace with:**
```typescript
import { CompanyReportsPanel } from "@/components/research/CompanyReportsPanel";
```

**Find this JSX:**
```tsx
<AnalystNotesPanel symbol={sym} />
```

**Replace with:**
```tsx
<CompanyReportsPanel symbol={sym} />
```

**Step 2: Verify compile**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

**Step 3: Verify in browser**

Navigate to any research page e.g. `http://localhost:3001/research/ICICIBANK`. Expected:
- Left column shows "Research Reports" panel instead of old "Analyst Notes" panel
- If ICICIBANK symbol is set on reports, they appear; otherwise shows "no indexed reports" message
- "Ask RAG" link opens `/reports?symbol=ICICIBANK`

**Step 4: Commit**

```bash
git add components/research/CompanyReportsPanel.tsx app/research/[symbol]/page.tsx
git commit -m "feat: replace AnalystNotesPanel with CompanyReportsPanel in research page"
```

---

## Task 12: Add Reports and Analyst to OmniCore navigation

**Files:**
- Modify: `components/layout/OmniCore.tsx`

**Step 1: Add the imports and nav entries**

In `components/layout/OmniCore.tsx`, find the import block:
```typescript
import {
  LayoutDashboard,
  Newspaper,
  TrendingUp,
  FileText,
  CalendarDays,
  LayoutGrid,
  Activity,
  BarChart2,
  BookMarked,
  Search,
  Sparkles,
  Settings
} from "lucide-react";
```

Replace with (add `BookOpen` and `Users`):
```typescript
import {
  LayoutDashboard,
  Newspaper,
  TrendingUp,
  FileText,
  CalendarDays,
  LayoutGrid,
  Activity,
  BarChart2,
  BookMarked,
  BookOpen,
  Users,
  Search,
  Sparkles,
  Settings
} from "lucide-react";
```

**Then find `NAV_ITEMS` and append two entries:**

Find:
```typescript
  { href: "/links", label: "Quick Links", icon: BookMarked },
];
```

Replace with:
```typescript
  { href: "/links", label: "Quick Links", icon: BookMarked },
  { href: "/reports", label: "Reports", icon: BookOpen },
  { href: "/analyst", label: "Analyst", icon: Users },
];
```

**Step 2: Verify compile**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -10
```

**Step 3: Verify in browser**

Reload any page. Expected: OmniCore bottom dock shows two new items: "Reports" and "Analyst" — clicking navigates to the correct pages.

**Step 4: Commit**

```bash
git add components/layout/OmniCore.tsx
git commit -m "feat: add Reports and Analyst nav items to OmniCore"
```

---

## Task 13: Full build verification

**Step 1: Run TypeScript check**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npx tsc --noEmit
```

Expected: zero errors.

**Step 2: Run production build**

```bash
cd D:\Sunidhi-Intranet-Futuristic && npm run build
```

Expected: successful build with no type errors. Note any warnings (warnings are OK, errors are not).

**Step 3: Run the indexer**

With dev server running:
```bash
curl -X POST http://localhost:3001/api/reports/index
```

Expected: `{"ok":true,"indexed":161,"skipped":0}` (skipped count may be > 0 if some PDFs have no extractable text).

**Step 4: Smoke test the RAG**

```bash
curl -X POST http://localhost:3001/api/reports/search \
  -H "Content-Type: application/json" \
  -d '{"query":"What are the top recommendations this quarter?","topK":5}' \
  --no-buffer | head -20
```

Expected: SSE stream with sources event and delta text.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete research RAG + analyst performance feature"
```

---

## Symbol Mapping Note

After indexing, `symbol` will be empty string for all reports (auto-inference from filename is complex and error-prone). The management workflow is:

1. Go to `/analyst` page
2. Identify a report row (company name visible)
3. Use `PATCH /api/reports/metadata?id=<uuid>` with `{"symbol":"AXISBANK"}` to set the symbol
4. This unlocks live CMP lookup and enables filtering in CompanyReportsPanel

A future enhancement can add an inline edit UI on the analyst page, but the PATCH endpoint is already in place (Task 6).
