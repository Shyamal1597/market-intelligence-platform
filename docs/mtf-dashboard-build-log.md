# MTF Dashboard & PDF Report — Build Log

A detailed account of how the Margin Trading Facility (MTF) dashboard and its daily PDF report were designed and built: what the raw data actually looked like, the decisions made about it, what got implemented, and — the part that matters most for judging real engineering work — every place the first version was wrong and had to be corrected against real data or real feedback.

This is a working document, not a highlight reel. It's written so that every claim in it can be checked against the code and the data it describes.

---

## 1. The problem

The firm receives a daily "Margin Trading Volume Wise Report" as an `.xls` file — a raw broker/exchange export listing, for every stock, how much value is currently financed via margin trading, alongside that day's BHAVCOPY (the exchange's own end-of-day trade data: OHLC, volume, delivery quantity). Before this project, someone had to open the spreadsheet by hand every day to answer basic questions: which stocks is margin money flowing into or out of, which sectors are levering up, which positions look risky (leverage rising while the price falls).

The goal was to turn that raw file into (a) a live internal dashboard and (b) a same-day PDF report, both derived from the same underlying logic, so the numbers in the PDF and the numbers on screen never disagree.

## 2. Understanding the raw data first

Before writing any ingestion code, the actual `.xls` files had to be read directly (via the `@e965/xlsx` library) to see what was really in them, rather than assuming a schema. The workbook has several sheets:

- **`MTF TRADING`** — the actual margin data: `Symbol`, `Name`, `Qty Fin by all the members(No.of Shares)`, `Amt Fin by all the members(Rs. In Lakhs)`. Roughly 2,150 symbols per day.
- **`BHAVCOPY`** — the exchange's standard end-of-day dump, ~3,300 rows: `SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER`.
- **`MTF DATA POSITIVE` / `MTF DATA NEGATIVE`** — the vendor's own "which stocks moved consistently" sheets, used later for the Continuous Funders panel.

Two early findings from just reading the raw files mattered a lot later:

- Column headers and date strings carry a **leading space** (`" SERIES"`, `" 03-Jul-2026"`) — a purely cosmetic export quirk, but it breaks a naive header match if you don't trim defensively.
- The **first-draft join** between `MTF TRADING` and `BHAVCOPY` restricted the match to `SERIES === "EQ"` (regular equity), on the assumption that's the only series margin-eligible stocks trade under. That assumption was wrong: roughly 114–153 of the ~2,150 `MTF TRADING` symbols per file trade under `SERIES` `"BE"` or `"BZ"`, not `"EQ"` — and dropping the series filter entirely (joining on symbol alone) turned "hundreds of symbols missing from BHAVCOPY" into a real, small handful (7–9 per file) of genuine no-trade/suspension days. This same `BE`/`BZ` fact resurfaced much later in a completely different bug (see §5.1) — the two investigations independently confirmed each other.

## 3. Architecture decisions

- **SQLite (`better-sqlite3`), one row per `(date, symbol)`, upserted on ingest.** Re-uploading the same day's file is a no-op, not a duplicate. This matters because the source file sometimes needs re-uploading (e.g. after a parsing fix), and idempotency means that's always safe.
- **Nothing derived is stored.** Day-over-day % change, breadth counts, sector rollups, rankings — all computed on read, in `lib/mtf/queries.ts`, from the raw stored columns. The explicit reason: formulas here changed *repeatedly* over the course of this build (see §5), and recomputing on read means a formula fix applies retroactively to the whole history with no re-ingestion or backfill migration required. The only exception is the `series` column added later (§5.1), which genuinely needed backfilling because it wasn't captured by the original ingestion code at all.
- **One shared query layer for both surfaces.** The dashboard's API routes and the PDF's React-PDF document both call the exact same functions in `lib/mtf/queries.ts`. There is no separate "PDF version" of any metric — if a formula changes, both outputs change together, by construction, not by remembering to update two places.

## 4. What got built

- **Breadth tiles** — Total MTF Book, Leveraging Up / Deleveraging / Unchanged counts, Symbols w/ Data, Delivery Financed %, Avg Delivery %, Top Gainer / Top Loser.
- **Volume Movers & Price Movers** — two symmetric tables sourced from the vendor's own persistence sheets (`cont` = how many of the last ~5 days moved the same direction), sortable, with sparklines.
- **Leverage heatmap** — top 120 stocks by financed amount, box size = book size, color = day's change.
- **Sector breakdown** — book size by real BSE sector classification (not the separate ~100-stock research coverage list), with an explicit disclosed gap against the whole-universe total (materiality/NAV-peg-excluded symbols aren't silently missing, they're counted and shown).
- **Leverage vs. price divergence** — stocks where financing and price moved in opposite directions that day.
- **Continuous Funders** — stocks flagged by the vendor's own trailing-window sheets, cross-referenced with our own computed sparkline and day-over-day change.
- **Symbol drilldown** — a per-stock chart, opened from any row across the dashboard (see §5.4 for its full design history — it went through five iterations).
- **PDF export** (`react-pdf`) — a same-day snapshot: KPI tiles, sector breakdown, movers, a glossary, and a compliance/disclaimer page, generated from the same query layer as the dashboard.
- **Collapsible glossary** — every metric on the dashboard gets a plain-English definition, kept in sync with the formula docs in `docs/`.

## 5. The finer points — where the first version was wrong

This is the part worth reading closely. Several metrics went through multiple designs, and in each case the correction came from checking the actual numbers, not from guessing harder.

### 5.1 Trade-to-Trade (T2T) exclusion — the heuristic that looked validated but wasn't

T2T stocks settle under compulsory delivery (no intraday squaring off) and are structurally ineligible for margin trading. Any MTF amount attached to one in the source file is stale or wrong. The first detection heuristic was: *if a stock's delivery percentage is 100%, it must be T2T* (every traded share settled as delivery — the textbook definition of T2T). Checked against real data, this looked reasonable: exactly 8 of 2,146 symbols hit it, summing to a small ₹47.32 Cr of a ₹1,36,723 Cr book — mostly thinly-traded ETFs.

It was wrong. A specific, named counter-example (`MTARTECH`, a stock a stakeholder knew for a fact was T2T) never tripped the check. Direct inspection of the raw BHAVCOPY row showed why: `MTARTECH`'s `SERIES` is `"BE"` (the real T2T flag), but its `DELIV_QTY`/`DELIV_PER` columns are blank (`"-"`) — not `100`, not any number. The exchange simply doesn't populate a delivery split for BE-series rows, since 100% delivery is implied by the segment, not separately reported. The original "8 of 2,146" hits were an unrelated coincidence: a handful of illiquid EQ-series ETFs that happened to trade 100% delivery on that one day.

The fix: read `SERIES` directly (`BE`/`BZ`) instead of inferring anything from delivery percentage. Checked against all 9 raw files still on disk, this reclassifies **114–153 symbols per day** (not 8) as T2T — a genuinely material correction, not a rounding error. Because the raw upload isn't retained after ingestion (by design — see §6), a handful of already-ingested dates had no stored `series` to re-derive from; those fall back to a fixed list built from the union of BE/BZ symbols across the 9 retained files, which will naturally stop mattering as those dates age out.

### 5.2 "Turnover Financed %" → "Delivery Financed %" → a flow, not a level

The first version of this metric was a level ratio: today's MTF book divided by today's turnover. It needed a median instead of a mean once real data showed a handful of thinly-traded names skewing the mean to an absurd 450%+. Later, the whole comparison was reframed around delivery value instead of raw turnover (delivery being a better proxy for "real" trading than total volume, which includes intraday churn). Even that wasn't the final answer: the request was specifically for the day's *net gain or loss* in the book relative to that day's delivery value — a signed flow metric, not a bounded ratio. The final formula: `(totalAmtToday − totalAmtYesterday) / totalDeliveryValue × 100`, colored teal/red by sign like every other change metric on the dashboard.

### 5.3 "Median Financed %" → "Avg Delivery %"

A median-based tile ("Median Financed %") was flagged as not actually useful to an investor looking at the dashboard. It was replaced with the average of `DELIV_PER` (BHAVCOPY's own delivery percentage) across tradeable stocks — a market-wide read on conviction vs. speculative churn. Worth noting *why* a plain mean is safe here when it wasn't safe for the metric it replaced: `DELIV_PER` is naturally bounded 0–100, so there's no unbounded-outlier risk the way an unbounded book/turnover ratio had.

### 5.4 The symbol drilldown chart — five designs

This single chart changed shape more than anything else in the build, and each change came from a real objection:

1. **v1**: two lines (MTF book in ₹, close price in ₹) on two axes. Simple, but didn't show delivery at all.
2. **v2**: added a third axis for a computed "Delivery Financed %" ratio, rendered as bars. Visually, this was a mistake — at small scales the ratio's axis labels overlapped the price axis's labels, reading as cramped and confusing.
3. **v3**: dropped the ratio; MTF book stayed a line, Delivery Value became a bar sharing the left ₹ axis with it, so both were at least in the same unit.
4. **v4**: both series became grouped bars (MTF Financed vs. Delivery Value, both ₹) for direct day-by-day comparison. This is where a real question came up: *how can the MTF-financed bar be taller than the delivery-value bar — isn't that impossible?* It isn't, and proving that took checking the actual data (see §5.5) — but the fact that the question came up twice, from two different people looking at the same chart, was itself a signal that the comparison was confusing even when correct.
5. **v5 (current)**: dropped the cumulative ₹ book entirely. Instead: the day-over-day *change* in shares financed (signed — positive when the book grew, negative when it shrank, colored teal/red with a zero reference line) plotted against raw delivery volume (shares), both in the same unit. This sidesteps the balance-vs-flow confusion by only ever comparing two genuine same-day quantities. Also switched the window from the symbol's entire ingested history to its last 6 trading sessions, since a multi-week view wasn't what was being asked for.

### 5.5 "Delivery can't be lower than MTF volume" — checking an objection against real data instead of arguing about it

A manager's objection to design v4 was that a day's delivery value being less than the MTF-financed amount "cannot happen." Rather than assert either way, this got checked directly:

- The source column is literally named **"Amt Fin by all the members"** — standard terminology for an *outstanding financed balance* (like open interest), not a same-day transaction count.
- Pulling one stock's real daily series confirmed it: `amt_financed_lakhs` moves *smoothly* day to day (`269.75 → 271.16 → 278.41 → 275.91 → 258.59 → … → 643.90` for one symbol across four weeks) — the signature of a balance that persists and accumulates. Delivery value over the same window swings independently and far more erratically (`₹364.93L → ₹136.46L → ₹114.82L → ₹182.13L → ₹626.75L → …`) — the signature of a genuine daily flow.
- A balance is not bounded by a single day's flow. There is no accounting identity that requires it to be. The specific day flagged (book grew from ₹586L to ₹644L while that day's delivery fell from ₹199L to ₹122L) is just margin positions being added on a day when overall delivered trading happened to be lower — two independent things moving in opposite directions, not a contradiction.

A follow-up question — whether delivery volume can exceed *total daily traded volume* — is a different and genuinely valid invariant (delivered shares are by definition a subset of total traded shares). That one was checked exhaustively rather than argued: **zero violations across all 28,804 rows** in the database where both fields are populated. Two different-sounding objections, two different real answers — one false, one true and worth verifying explicitly rather than assuming.

### 5.6 A light-theme bug caught by an actual screenshot

The drilldown chart's axis text was reported as "barely visible." It turned out the chart's Y-axis tick and label colors were hardcoded to a dark-theme-only hex value (`#F0EDE8`, an off-white), which is essentially invisible against the light theme's white background — a direct violation of this project's own stated rule to use theme-aware CSS custom properties instead of literal hex for text. A sibling chart component in the same codebase (`FlowChart.tsx`) had already solved this correctly using `var(--color-muted)` / `var(--color-primary)`; the fix was to bring the drilldown chart's axis styling in line with that existing, working pattern rather than invent a new one.

### 5.7 The source report changed shape mid-project — and silently broke a hardcoded assumption

Partway through, the vendor widened the "MTF DATA POSITIVE"/"MTF DATA NEGATIVE" sheets' persistence window from 5 trading days to 20 (confirmed against the raw file: 21 date columns instead of 6, real `Cont.` values now reaching 17/20 instead of maxing at 5/5). The threshold for "persistent" scaled with it — `>= 4 of 5` (80%) became `>= 16 of 20`, the same relative bar, not a new absolute one, confirmed as the intended reading rather than assumed.

The window widening had a second-order effect the first fix missed entirely: the sheet has a second "Symbol"/"Cont." block further right, for the stock's own *price* persistence, and the original parser located it with a hardcoded column offset (`15`) calibrated for the 5-day layout. With the window at 20 days, that same offset now pointed into the middle of the *volume* block's own data — silently mislabeling volume-change percentages as price-change percentages, with no error thrown, because both are just numbers in adjacent cells. The fix replaced the hardcoded offset with a dynamic scan: find the header row's second literal `"Symbol"` cell, and derive everything else (where each block's day-over-day pairs start and end) from there. This isn't just a fix for the 5→20 change already observed — it's now correct for *any* window length, because it stopped assuming one.

That same self-validating approach caught a second, unrelated problem while backfilling 41 historical raw files into the database: one specific file's "MTF DATA NEGATIVE" sheet had a single stray garbage cell (`"A"`) appended after its real data, making that sheet's header one column longer than its own POSITIVE-sheet counterpart *in the same file*. A boundary computed from `header.length` read that garbage cell as a sixth data pair (a nonsense %-change value of 48,050%). The fix: stop trusting array length or column-count math entirely, and determine where each block's data actually ends by checking whether the header cell at that position is still literally `"% Change"` — stop as soon as it isn't. This is immune to trailing junk, a missing gap column, or the window length changing again, because it only ever trusts what the header itself says, not a position it's assumed to be at.

A third issue surfaced during the same backfill: the historical files don't all use the same date format. Every file through 2026-07-30 wrote dates as `DD.MM.YYYY`; the file that introduced the 20-day window switched to `DD-Mon-YYYY`. The date parser now tries both patterns and returns `null` (never a guess) if neither matches — and a full backfill run across all 41 files confirmed zero unparseable dates once both formats were supported.

### 5.8 "LTP" turned out to already be a different field than the one being asked for

A later instruction said to switch the chart's price line from "LTP" to "avg price." The codebase had never actually read LTP (BHAVCOPY's `LAST_PRICE` column) — it read `CLOSE_PRICE` throughout. Rather than assume the two were interchangeable, this got checked against real BHAVCOPY rows for five liquid stocks (RELIANCE, TCS, HDFCBANK, INFY, SBIN): `LAST_PRICE` and `CLOSE_PRICE` were byte-identical for every one of them, confirming the existing "close" field *was* effectively LTP under a different name. `AVG_PRICE` (the day's volume-weighted average across all trades), by contrast, was meaningfully different — TCS alone showed a ~1.8% gap between its close (₹2,473.70) and its average (₹2,429.42). So the switch was real, not cosmetic: every place the codebase read "close" now reads `AVG_PRICE` instead, and every "Close Price"/"LTP" label in the UI and PDF was reworded to "Avg Price" so the interface doesn't claim to show something it no longer computes.

### 5.9 The drilldown chart, continued: three more rounds

The chart's design history in §5.4 stopped at v5. It kept evolving:

- **v6**: widened from 6 displayed trading sessions to 20, so an actual multi-week trend is visible instead of a handful of points, and added a 20-day trailing average of delivery volume as a fourth bar — a deliberately different hue (sky blue) from the existing delivery-volume bar, so the two read as "today vs. its own recent baseline" rather than a fourth unrelated series.
- **v7**: added the MTF book's outstanding *level* (not the day's change, which was already on the chart) as its own line. This needed its own axis — checked against real data first: the book runs ~4-5x larger than the biggest bar already on the chart, so sharing an axis would have flattened every bar to look near-zero. Colored with the same CSS variable that already drives the chart's axis text (`var(--color-primary)`) rather than a new hardcoded hex, specifically so it would be provably legible in both light and dark themes without having to eyeball contrast by hand — confirmed live that it resolves to the theme's actual documented text color in both modes.
- **A layout bug from v7**: with two axes stacked on the right side, the new line's rotated axis title landed exactly on top of the existing price axis's tick numbers. The instinct was to make the axis wider; that had zero effect, confirmed by direct measurement — Recharts renders a rotated axis title outside its own axis's reserved width regardless of how large that width is declared. The actual fix was to drop the in-chart rotated titles for both right-side axes entirely; the legend already sitting above the chart already names each one, so nothing was lost, and the collision-prone code path was removed rather than tuned.

## 6. Scaling the data: a full historical backfill

Once the ingestion parser was fixed to be robust to window-length and date-format changes, it was run against every historical raw file still available (41 of 42 files in the source folder; one was missing its core data sheets entirely and was skipped rather than guessed at). That backfill:

- Extended the database's history from a partial, recently-truncated window back to 2026-05-18 — 50 distinct trading dates on record.
- Populated a new table, `mtf_mover_daily`, holding the *individual* day-over-day %-change value behind every "Cont." count, not just the collapsed number — over 320,000 rows. The existing `mtf_mover_cont` table only ever stored the summary count; this makes the underlying daily detail itself queryable, for the same reason spreadsheets get audited instead of trusted: being able to check *which specific days* drove a persistence count, not just the final tally.

One real, permanent gap surfaced during the backfill and is disclosed rather than papered over: one historical file's own `MTF TRADING` sheet only contains 493 of the usual ~2,150 symbols — a genuine truncation in the source file itself on that date, not a parsing bug, and not recoverable since no more complete copy of that file exists.

## 7. Data handling and compliance

The PDF's disclaimer page carries real regulatory disclosures — SEBI/exchange registration numbers, office address, a named compliance officer's contact. These were originally hardcoded directly in the PDF-generation JSX. They were moved into a single module (`lib/complianceInfo.ts`) that reads each value from an environment variable with a clearly-fake placeholder default, so the real values live only in a gitignored `.env.local` and never appear in source control. `data/intelligence/` (a large, separate transcript archive used by a different part of the platform) is likewise gitignored — the MTF pipeline's own raw source files are deliberately **not retained on disk after ingestion** (the upload API discards the buffer once it's parsed into SQLite), which is a deliberate space/simplicity tradeoff that later had one real cost: it's why the T2T fix in §5.1 needed a fallback symbol list for a handful of already-ingested dates whose raw file no longer exists to re-derive `series` from.

## 8. What this build actually demonstrates

Not "got it right the first time" — the opposite. Every non-trivial metric here (T2T exclusion, Delivery Financed %, Avg Delivery %, the drilldown chart) went through at least one wrong version that looked reasonable until it was checked against real numbers or a real objection. The discipline that mattered wasn't avoiding mistakes, it was:

- Reading the actual raw file instead of assuming its schema.
- Re-verifying an assumption with real data before shipping it (and re-verifying it *again* when a specific counter-example showed up).
- Distinguishing "this looks wrong" from "this is provably wrong" — checking the delivery-vs-volume invariant exhaustively rather than either dismissing or accepting the objection on vibes.
- Treating a repeated design complaint (three rounds on the same chart) as a signal to change the underlying comparison, not just the paint.
- Treating a vendor format change (§5.7) as a reason to make the parser assume less, not just patch the one broken number.

## 9. Real-world outcome

This report is in daily production use on the desk. The most direct evidence: the desk's director now checks the MTF PDF before trading — relayed back through the desk head as, in the desk head's words, one of the best pieces of feedback the team has gotten from him.

Worth being precise about who did what, since it matters more than the compliment itself: the desk head set the direction throughout — what to build, which numbers mattered, and, critically, every one of the corrections in §5 traces back to a specific real objection from someone on the desk who knew the data (the `MTARTECH` T2T counter-example in §5.1, the "delivery can't be lower than MTF volume" challenge in §5.5, the 20-day window and avg-price change in §5.7–5.8 were both requested changes to match how the analyst who builds the raw report actually thinks about it). None of that direction was mine. The implementation was: reading the raw files myself before writing code against them, finding and fixing the bugs those objections pointed at (not just patching the one number that was flagged, but the underlying assumption that produced it), building and rewiring both the dashboard and the PDF off one shared query layer, and doing the historical backfill and schema work in §6 and §5.7 without being asked to. A tool being used daily by someone with no reason to use it out of politeness is a different kind of signal than a demo going well — this is that signal.
