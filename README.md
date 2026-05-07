This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## /intel — Promise tracker

Per-company dashboard surfacing every forward-looking claim management has made on concalls plus a hit/miss/partial verdict against actual quarterly fundamentals.

### Add a new company
1. Place its concall transcripts (PDF) in `Concall Data/` (any naming).
2. Place its Bloomberg/CIQ Excel in `Concall Data/Fundamental data/`.
3. Add the symbol → sector mapping to `lib/intel/types.ts` `SYMBOL_SECTOR`.
4. Add the Excel path to `EXCEL_PATHS` in `scripts/intel-rebuild.ts`.
5. Run: `npm run intel:rebuild SYMBOL`.

### Rebuild a single stage
Stage flags use numbers: `--stage=1|2|3|4`
- `--stage=1` — Excel → fundamentals.json
- `--stage=2` — PDFs → text/ (transcripts)
- `--stage=3` — extractClaims (LLM: Haiku or Ollama qwen2.5:7b)
- `--stage=4` — crossCheck (LLM: Sonnet or Ollama qwen2.5:7b)

### One-off quarter re-extraction
When a single quarter fails (truncated JSON, transient error), re-run it and merge results:
```
npx tsx scripts/_one-off-extract.ts SYMBOL --quarters=Q3-FY26 [--maxTranscriptChars=30000]
```
Use `--maxTranscriptChars=30000` for transcripts >50KB — Ollama's grammar sampler can stall when
the prompt approaches its context ceiling, generating only a handful of tokens before stopping.
Truncating to ~30K chars keeps the total prompt under ~10K tokens and leaves ample output budget.

### Data source notes
Bloomberg/CIQ standard exports contain generic financials (PAT, ROA, ROE, Revenue).
Bank-specific KPIs (NIM, GNPA, CASA, advance growth, etc.) and insurance KPIs (combined ratio,
VNB margin, GWP growth) are NOT in these exports — cross-checks for those metrics will show
`no-data`, which is correct. Add custom JSON data or a supplementary data source to enable
verdict scoring for segment-level metrics.

### Secrets
`ANTHROPIC_API_KEY` in `.env.local` (required for Anthropic backend).
`OLLAMA_BASE_URL` in `.env.local` (optional; default `http://localhost:11434`).
Set `LLM_BACKEND=ollama` env var to use local inference instead of Anthropic.
