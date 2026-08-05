# Case Study: Margin Trading Facility (MTF) Dashboard

*One module of Project NEBULA, an internal research-intelligence platform for an equity research desk. Built solo, AI-assisted, over the course of a single extended build cycle.*

## The problem

Every trading day, the desk receives a raw spreadsheet: how much value is currently financed via margin trading, per stock, across every broker member — joined against the exchange's own end-of-day trade data. Before this existed, someone opened that file by hand each day to answer basic questions: which stocks is margin money flowing into, which sectors are levering up, which positions look risky (leverage rising while the price falls). That doesn't scale, and it produces no historical record to check trends against.

The brief was to turn that raw file into two things that always agree with each other: a live internal dashboard, and a same-day PDF report suitable for distribution.

## Why this case study, specifically

Most of what I could show you is "feature built, feature works." This one is more useful because it isn't that — it's a record of getting several non-trivial things *wrong first*, catching it, and fixing it against real evidence rather than guessing harder. That loop — build something, verify it against the actual data or a real objection, and be willing to throw away a design that looked fine but wasn't — is the part of working with an AI-assisted build process that actually matters. Anyone can get an LLM to write a chart component. Catching that the chart is quietly comparing the wrong two things, because you checked the underlying numbers instead of trusting the first version that compiled and looked reasonable, is the actual skill.

## Approach

**Read the raw file before writing a schema.** The source workbook has four sheets — the margin data itself, the exchange's raw end-of-day dump (BHAVCOPY), and two vendor-computed "which stocks moved consistently" sheets. All four were parsed directly and inspected before any ingestion code was written, rather than assuming a shape. That paid off almost immediately: an early join between the margin sheet and BHAVCOPY, restricted to regular-equity-series stocks on the (reasonable-sounding) assumption that's the only series margin-eligible stocks trade under, was silently dropping over a hundred legitimately-financed stocks that trade under other exchange series codes. Reading the raw rows directly — not the assumption — showed the fix: join on symbol alone.

**One source of truth for every number.** SQLite, one row per date-and-symbol, upserted on ingest so re-processing a day is always idempotent. Every derived figure — day-over-day change, breadth counts, sector rollups, rankings — is computed on read from those raw columns, in a single query module. Both the live dashboard and the PDF generator call that same module. There is no second, PDF-specific copy of any formula to accidentally let drift out of sync — which matters a lot in a domain (financial reporting) where two different numbers for the same day is a real, not cosmetic, problem.

## The hard part: getting it wrong, then proving it wrong

**Trade-to-Trade exclusion.** Certain stocks are restricted to compulsory-delivery settlement and can't legally be margin-financed; any financing value attached to one in the raw feed is stale data, not a real position. The first detection rule — "a stock reporting 100% same-day delivery must be Trade-to-Trade, since that's the literal definition" — passed its own sanity check against real data (it flagged a small, plausible-looking handful of symbols). It was still wrong: a stock a stakeholder specifically knew to be Trade-to-Trade never got flagged, because the exchange's real feed reports *blank* delivery data for that settlement type, not the number 100. The actual signal was sitting in a different column the whole time (the exchange's own settlement-type code), and reading it directly instead of inferring it from delivery percentage went from catching 8 stocks to catching the correct 130+.

**A chart that kept getting rejected, for a good reason each time.** A per-stock chart comparing the outstanding margin-financed value against that day's delivered trading value went through five design iterations. Two different people, independently, looked at it and asked a version of the same question: how can the financed-amount bar be taller than the delivery-value bar — isn't that impossible? The honest answer required checking, not asserting: pulling one real stock's day-by-day numbers showed the financed figure moves *smoothly*, like an accumulating balance carried across weeks, while delivery value swings independently and far more erratically, like the same-day-only transaction figure it actually is. A balance isn't bounded by a single day's flow — there's no accounting rule that requires it, and the raw data confirmed it. The chart's final form sidesteps the whole ambiguity: it stopped comparing a balance to a flow at all, and instead shows two genuine same-day quantities (the day's *change* in financed shares, signed; and raw delivered shares) in the same unit. A separate, genuinely-required invariant — that delivered volume can never exceed total traded volume — was checked exhaustively against the full dataset (zero violations across every stored row) rather than assumed, because "sounds right" and "verified against every row" are different claims and only one of them should go in a report someone else relies on.

**A light-theme bug from an actual screenshot.** Chart axis text was reported as barely visible. The cause: axis colors were hardcoded to a value tuned for the dark theme, invisible against the light theme's background — a direct instance of a rule the project's own conventions already stated (use theme-aware color tokens, not literal hex) that got missed in one component. Fixed by matching the pattern an adjacent, already-correct chart component in the same codebase used.

## What this demonstrates

- Reading and validating a real, messy external data source before writing code against it, instead of coding to an assumed schema.
- Recognizing when a plausible-looking heuristic needs an actual counter-example to disprove, and going and finding one in the raw data rather than trusting that "it passed a spot check."
- Distinguishing a genuinely-required data invariant from a false one, and treating "I checked every row" as a different, stronger claim than "this looks right" — worth making the distinction explicit rather than blurring it.
- Designing for one source of truth across two output surfaces (dashboard + PDF) specifically because financial reporting can't tolerate two different numbers for the same fact.
- Iterating a design honestly: this chart's *fifth* version is the one that shipped, and the earlier four aren't hidden from this account.

## Stack

Next.js (App Router) + TypeScript, SQLite (`better-sqlite3`), Recharts, `react-pdf` for the PDF surface, `@e965/xlsx` for source parsing.

## Full technical account

Every claim above — the exact column names, the exact real numbers, the exact iteration history — is written up in detail in this repository's `docs/mtf-dashboard-build-log.md`. Nothing here is asserted without something to point to.
