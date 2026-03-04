# Research Reports RAG + Analyst Performance — Design Document

**Date**: 2026-03-04
**Status**: Approved
**Branch**: futuristic-design (`D:\Sunidhi-Intranet-Futuristic`)

---

## Context

161 Sunidhi Capital research PDFs live in `D:\Sunidhi Intranet\Research Reports\[Analyst]\`.
The research team needs two things:

1. **RAG search** over report content using a local Ollama model
2. **Analyst performance tracking** — who covered what, at what target, and where is the stock now

---

## Architecture Overview

```
D:\Sunidhi Intranet\Research Reports\
  └── [Analyst]/
        └── CompanyName_ReportType_SunidhiDate.pdf

                    ▼  POST /api/reports/index  (one-time / on-demand)

data/reports/
  ├── metadata.json      ← ReportMeta[] (id, analyst, company, symbol, rating, cmp, tp, date, filePath)
  └── chunks.json        ← Chunk[] (id, reportId, text, pageNum)

                    ▼  POST /api/reports/search

BM25 retrieval over chunks.json  →  top-K chunks injected into prompt
  →  Ollama llama3.1:8b  →  SSE stream to client

data/
  └── analyst-coverage.json   ← manual overrides / corrections on top of auto-parsed metadata

GET /api/quote/[symbol]        ← existing Yahoo Finance proxy (live CMP)
```

---

## Data Model

### ReportMeta (data/reports/metadata.json)

```typescript
interface ReportMeta {
  id: string;                          // UUID
  analyst: string;                     // "Prashant Kumar"
  company: string;                     // "Axis Bank"
  symbol: string;                      // "AXISBANK" — inferred from filename or manual
  reportType: "IC" | "RU" | "CU" | "Technical" | "Other";
  date: string;                        // "2025-07-15" — from filename
  rating: string;                      // "Outperform", "Neutral", etc.
  cmp: number;                         // ₹ at report date, parsed from PDF
  targetPrice: number;                 // ₹, parsed from PDF
  filePath: string;                    // absolute path on disk
}
```

### Chunk (data/reports/chunks.json)

```typescript
interface Chunk {
  id: string;
  reportId: string;
  text: string;
  pageNum: number;
}
```

Chunk size: ~400 tokens, 50-token overlap. Target ~1,600 chunks total across 161 PDFs.

### AnalystCoverage override (data/analyst-coverage.json)

```typescript
interface CoverageOverride {
  reportId: string;
  symbol?: string;       // manual symbol if auto-inference wrong
  rating?: string;
  cmp?: number;
  targetPrice?: number;
}
```

---

## Metadata Extraction

### From Filename
Pattern: `CompanyName_ReportType_SunidhiDate.pdf`
Example: `AxisBank_RU_SunidhiAug25.pdf`

- `company`: join tokens before report type code
- `reportType`: one of `IC`, `RU`, `CU`, `Technical` (greedy match)
- `date`: map `SunidhiMMMYY` → ISO date (e.g. `Aug25` → `2025-08-01`)

### From PDF Text (regex)
Consistent block at report bottom:
```
Recommendation    Outperform
CMP (₹)           1099
Price Target (₹)  1,402
Upside (%)        28%
Analyst Name:     Prashant Kumar
```

Regex targets:
- Rating: `/(recommendation|rating)\s*[:\-–]?\s*([^\n]+)/i`
- CMP: `/CMP\s*\(₹\)\s*([\d,]+)/i`
- Target: `/Price\s*Target\s*\(₹\)\s*([\d,]+)/i`
- Analyst: `/Analyst\s*Name\s*[:\-–]?\s*([^\n]+)/i`

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/reports/index` | Scan PDFs, parse, write metadata + chunks JSON |
| POST | `/api/reports/search` | BM25 retrieval + Ollama SSE stream |
| GET | `/api/reports/file` | Stream PDF bytes from disk (`?p=encoded-path`) |
| GET | `/api/reports/metadata` | Return metadata.json (filterable by analyst, symbol) |
| PATCH | `/api/reports/[id]` | Override fields in analyst-coverage.json |

### POST /api/reports/search — request/response

```typescript
// Request
{ query: string; symbol?: string; analyst?: string; topK?: number }

// Response: SSE stream
data: {"type":"sources","sources":[{id, company, analyst, date, rating},...]}
data: {"type":"delta","text":"..."}
data: {"type":"done"}
```

### GET /api/reports/file

`?p=<base64url-encoded absolute path>`
Returns the PDF with `Content-Type: application/pdf`.
Security: validate path is within `D:\Sunidhi Intranet\Research Reports\` prefix before serving.

---

## BM25 Implementation

No external dependencies. Pure TypeScript BM25 over in-memory chunk array loaded at module level.

```
score(q, chunk) = Σ IDF(t) * (tf * (k+1)) / (tf + k * (1 - b + b * len/avgLen))
```

`k=1.5, b=0.75` — standard defaults.
Top-K default = 6 chunks. Inject as `<context>` block into system prompt.

---

## Ollama Integration

Model: `llama3.1:8b`
Endpoint: `http://localhost:11434/api/chat` (streaming)

System prompt pattern:
```
You are an equity research analyst assistant at Sunidhi Capital.
Answer questions based ONLY on the research reports provided below.
If the answer is not in the reports, say so clearly.

<context>
[chunk1 text — Company, Date, Analyst]
---
[chunk2 text — Company, Date, Analyst]
</context>
```

---

## Pages

### `/reports` — Research Reports Hub

**Left panel (2/3 width):** RAG chat interface
- Query input with "Ask" button
- Source badges rendered before streaming response
- Streaming answer with Ollama latency warning on first load
- Filters: Analyst dropdown, Symbol input (narrows BM25 scope)

**Right panel (1/3 width):** Report browser
- Sorted by date desc
- Filterable by analyst / report type
- Each row: company name, analyst, date, rating, TP — click to open PDF in new tab via `/api/reports/file`
- "Re-index" button triggers `POST /api/reports/index`

### `/analyst` — Analyst Performance

**Top:** Per-analyst scorecards (grid of 8 cards)
- Name, photo-initial avatar
- Total calls, hit rate (target reached vs. live CMP), avg upside at issue

**Below:** Sortable coverage table
| Company | Analyst | Date | Rating | CMP at Issue | Target | Live CMP | Upside/Downside |
|---------|---------|------|--------|-------------|--------|----------|-----------------|

- Live CMP fetched from `/api/quote/[symbol]` for each unique symbol
- Upside/Downside: `((targetPrice - liveCMP) / liveCMP * 100).toFixed(1)%`
- Color-coded: teal = upside, danger = downside
- Manage toggle: inline edit mode for overriding symbol / rating / TP

### `/research/[symbol]` — Company Reports Panel

Replace `AnalystNotesPanel` with `CompanyReportsPanel`:
- Filters metadata.json by `symbol` (exact match)
- Lists reports with analyst, date, rating, TP
- Click → PDF viewer tab
- "Ask about this company" → deep-links to `/reports?symbol=[sym]` with query pre-populated

---

## Navigation

Add to OmniCore bottom dock (after existing items):
- `Reports` — icon: `BookOpen`
- `Analyst` — icon: `BarChart2`

---

## Security Notes

- `/api/reports/file`: canonicalize path and assert it starts with the Research Reports base dir before streaming
- No user input ever reaches shell commands — all file ops use `fs` module directly
- BM25 runs entirely in-process; no external calls except Ollama (localhost only)

---

## Out of Scope

- Vector embeddings / semantic search (BM25 sufficient for internal use)
- PDF upload via UI (reports added by dropping files into directory)
- Multi-turn conversation history (stateless per query)
- Authentication (internal network only, consistent with rest of app)
