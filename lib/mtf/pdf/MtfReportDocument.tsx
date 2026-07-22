import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import path from "node:path";
import { readFileSync } from "node:fs";
import type {
  Breadth, ContinuousFunderRow, PriceMoverRow, SectorBreakdownRow, DivergenceRow, HeatmapNode,
} from "../queries";

// react-pdf's built-in "Helvetica" font family covers regular/bold/oblique
// out of the box -- no Font.register needed, no network fetch at render time.

const TEAL = "#0F9D6B";   // slightly deeper than the dashboard's #00C9A7 -- reads better on white
const DANGER = "#C4322A"; // slightly deeper than the dashboard's #E84040 -- same reason
const MUTED = "#6B7280";
const BORDER = "#E2E5EA";
const INK = "#1C1814";

const styles = StyleSheet.create({
  page: { paddingHorizontal: 26, paddingVertical: 22, fontSize: 9, fontFamily: "Helvetica", color: INK },
  banner: { width: "100%", marginBottom: 3 },
  updatedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  updatedText: { fontSize: 7.5, color: MUTED },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 9, marginBottom: 4, color: INK },
  sectionSubtitle: { fontSize: 7.5, color: MUTED, marginBottom: 5 },
  // Two explicit rows of 4 fixed-width tiles, rather than a single flexWrap row -- flexWrap
  // wraps based on each tile's natural minWidth vs available space, which reliably produces an
  // uneven 4/3/1 split for 8 tiles. Fixed widths guarantee an even 4x2 grid regardless of label length.
  kpiGrid: { gap: 6, marginBottom: 2 },
  kpiRow: { flexDirection: "row", gap: 6 },
  kpiTile: { width: "23%", borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 6 },
  kpiLabel: { fontSize: 6.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  kpiValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 3 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  trLast: { flexDirection: "row" },
  thCell: { padding: 4, fontSize: 7, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase" },
  tdCell: { padding: 4, fontSize: 8 },
  colRank: { width: "5%", textAlign: "center", color: MUTED },
  colSymbol: { width: "22%" },
  colSymbolNarrow: { width: "16%" },
  colSymbolFunder: { width: "19%" },
  colWide: { width: "34%" },
  colNum: { width: "17%", textAlign: "right" },
  colNumSmall: { width: "14%", textAlign: "right" },
  colContTiny: { width: "12%", textAlign: "right" },
  colTerm: { width: "20%", fontFamily: "Helvetica-Bold" },
  colDefinition: { width: "80%" },
  disclaimerTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 8 },
  disclaimerBody: { fontSize: 7.5, lineHeight: 1.4, color: INK, marginBottom: 6 },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, fontSize: 6.5, color: MUTED, textAlign: "center" },
});

function pctColor(v: number | null | undefined): string {
  if (v == null) return MUTED;
  return v >= 0 ? TEAL : DANGER;
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
// Deliberately not reusing lib/mtf/format.ts's fmtCr: it emits "₹" (U+20B9), which renders as a
// garbled glyph under react-pdf's built-in Helvetica (WinAnsiEncoding has no rupee-sign glyph, and
// no custom font is registered here).
function fmtCrLocal(lakhs: number | null | undefined): string {
  if (lakhs == null) return "—";
  return `Rs ${(lakhs / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`;
}

// Read into a Buffer (not passed as a path string): @react-pdf/renderer's image resolver runs
// url.parse() on string src values, and on Windows a raw filesystem path like
// "C:\Users\...\mtf-pulse-banner.png" gets misread as a URL with protocol "c:", so it falls
// through to a fetch() on an invalid URL. That failure is swallowed per-image internally, so the
// PDF still renders -- just silently without the banner. A Buffer sidesteps URL parsing entirely.
const BANNER_PATH = path.join(process.cwd(), "public", "images", "mtf-pulse-banner.png");
const BANNER_BUFFER = readFileSync(BANNER_PATH);

export interface MtfReportData {
  date: string;
  breadth: Breadth;
  topGainer: { symbol: string; amtChangePct: number | null } | null;
  topLoser: { symbol: string; amtChangePct: number | null } | null;
  sectors: SectorBreakdownRow[];
  unclassifiedAmt: number;
  unclassifiedCount: number;
  excludedAmt: number;
  excludedCount: number;
  fundersUp: ContinuousFunderRow[];
  fundersDown: ContinuousFunderRow[];
  priceMoversUp: PriceMoverRow[];
  priceMoversDown: PriceMoverRow[];
  divergence: DivergenceRow[];
  topMovers: HeatmapNode[];
}

function KpiTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.kpiTile}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

function sortByBookDesc(rows: ContinuousFunderRow[]): ContinuousFunderRow[] {
  return [...rows].sort((a, b) => (b.amtToday ?? 0) - (a.amtToday ?? 0));
}

const GLOSSARY: { term: string; def: string }[] = [
  { term: "Total MTF Book", def: "Total value of shares currently bought on margin (borrowed money) across every tracked stock, as of today." },
  { term: "vs Prior Day", def: "% change in the Total MTF Book compared to the previous trading day." },
  { term: "Leveraging Up / Deleveraging", def: "Number of stocks where margin financing increased / decreased today." },
  { term: "Unchanged", def: "Number of stocks where margin financing stayed flat today, or has no comparable prior-day figure." },
  { term: "Turnover Financed %", def: "Share of today's total market trading value that was done using margin financing -- a market-wide average, not any single stock." },
  { term: "Top Gainer / Top Loser", def: "The single stock with the largest % increase / decrease in MTF financing today -- this is a change in margin financing, not in the stock's share price." },
  { term: "MTF Cont.", def: "How many of the last 5 trading days that stock's margin financing moved in the same direction. \"5/5\" = every one of the last 5 days." },
  { term: "Price Cont.", def: "The SAME stock's own price-persistence count -- how many of the last 5 trading days its share price (not its financing) moved in the same direction. Independent of MTF Cont.: financing can be persistent while price isn't, or vice versa." },
  { term: "MTF Chg % / Chg %", def: "Day-over-day % change in that stock's (or sector's) margin-financed amount." },
  { term: "Price Chg %", def: "Day-over-day % change in that stock's share price." },
  { term: "Book", def: "The MTF-financed amount for that stock, shown in Rs Crores." },
  { term: "Leverage up/down, price up/down", def: "Flags days where margin financing and the share price moved in OPPOSITE directions -- financing added to a falling stock, or pulled from a rising one." },
];

function Glossary() {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.sectionTitle}>Glossary</Text>
      <Text style={styles.sectionSubtitle}>What each term on this report means.</Text>
      <View style={styles.table}>
        {GLOSSARY.map((g, i) => (
          <View key={g.term} style={i === GLOSSARY.length - 1 ? styles.trLast : styles.tr}>
            <Text style={[styles.tdCell, styles.colTerm]}>{g.term}</Text>
            <Text style={[styles.tdCell, styles.colDefinition]}>{g.def}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Shared shape between ContinuousFunderRow and PriceMoverRow -- both carry
// exactly these fields, just with a different column driving the ranking/
// filter upstream. Letting FunderTable accept either means the Price Movers
// pages reuse the identical table markup/styling, not a parallel copy of it.
interface FunderTableRow {
  symbol: string;
  cont: number | null;
  priceCont: number | null;
  amtChangePct: number | null;
  priceChangePct: number | null;
  amtToday: number | null;
}

function FunderTable({ rows }: { rows: FunderTableRow[] }) {
  return (
    <View>
      <View style={styles.table}>
        <View style={styles.tr}>
          <Text style={[styles.thCell, styles.colRank]}>#</Text>
          <Text style={[styles.thCell, styles.colSymbolFunder]}>Symbol</Text>
          <Text style={[styles.thCell, styles.colContTiny]}>MTF Cont.</Text>
          <Text style={[styles.thCell, styles.colContTiny]}>Price Cont.</Text>
          <Text style={[styles.thCell, styles.colNum]}>MTF Chg%</Text>
          <Text style={[styles.thCell, styles.colNum]}>Price Chg%</Text>
          <Text style={[styles.thCell, styles.colNum]}>Book</Text>
        </View>
        {rows.map((r, i) => (
          <View key={r.symbol} style={i === rows.length - 1 ? styles.trLast : styles.tr}>
            <Text style={[styles.tdCell, styles.colRank]}>{i + 1}</Text>
            <Text style={[styles.tdCell, styles.colSymbolFunder]}>{r.symbol}</Text>
            <Text style={[styles.tdCell, styles.colContTiny]}>{r.cont != null ? `${r.cont}/5` : "—"}</Text>
            <Text style={[styles.tdCell, styles.colContTiny]}>{r.priceCont != null ? `${r.priceCont}/5` : "—"}</Text>
            <Text style={[styles.tdCell, styles.colNum, { color: pctColor(r.amtChangePct) }]}>{fmtPct(r.amtChangePct)}</Text>
            <Text style={[styles.tdCell, styles.colNum, { color: pctColor(r.priceChangePct) }]}>{fmtPct(r.priceChangePct)}</Text>
            <Text style={[styles.tdCell, styles.colNum]}>{fmtCrLocal(r.amtToday)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function MtfReportDocument({ data }: { data: MtfReportData }) {
  const { breadth } = data;
  const bookChangePct = breadth.totalAmtYesterday && breadth.totalAmtYesterday > 0
    ? ((breadth.totalAmtToday - breadth.totalAmtYesterday) / breadth.totalAmtYesterday) * 100
    : null;

  return (
    <Document title="MTF Market Pulse" author="Sunidhi Securities & Finance Ltd.">
      {/* Page 1: Banner, KPIs, Sector Flow */}
      <Page size="A4" style={styles.page}>
        <Image src={BANNER_BUFFER} style={styles.banner} />
        <View style={styles.updatedRow}>
          <Text style={styles.updatedText}>MTF Market Pulse — a curated summary. Full symbol-level data lives on the live MTF dashboard.</Text>
          <Text style={styles.updatedText}>Last updated: {data.date}</Text>
        </View>

        <Glossary />

        <Text style={styles.sectionTitle}>Market Snapshot</Text>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiRow}>
            <KpiTile label="Total MTF Book" value={fmtCrLocal(breadth.totalAmtToday)} />
            <KpiTile label="vs Prior Day" value={bookChangePct != null ? fmtPct(bookChangePct) : "—"} color={pctColor(bookChangePct)} />
            <KpiTile label="Leveraging Up" value={String(breadth.countUp)} color={TEAL} />
            <KpiTile label="Deleveraging" value={String(breadth.countDown)} color={DANGER} />
          </View>
          <View style={styles.kpiRow}>
            <KpiTile label="Unchanged" value={String(breadth.countFlat)} />
            <KpiTile label="Turnover Financed %" value={breadth.aggregateTurnoverFinancedPct != null ? `${breadth.aggregateTurnoverFinancedPct.toFixed(1)}%` : "—"} />
            <KpiTile label="Top Gainer (MTF Chg%)" value={data.topGainer ? `${data.topGainer.symbol} ${fmtPct(data.topGainer.amtChangePct)}` : "—"} color={TEAL} />
            <KpiTile label="Top Loser (MTF Chg%)" value={data.topLoser ? `${data.topLoser.symbol} ${fmtPct(data.topLoser.amtChangePct)}` : "—"} color={DANGER} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>MTF Book by Sector</Text>
        <Text style={styles.sectionSubtitle}>
          Where leverage money is flowing, top {data.sectors.length} sectors by book size.
          {data.excludedCount > 0 && ` Excludes ${data.excludedCount} immaterial/NAV-pegged symbols (${fmtCrLocal(data.excludedAmt)}) -- that's why this table won't sum to "Total MTF Book" above, which counts the whole universe.`}
        </Text>
        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.thCell, styles.colWide]}>Sector</Text>
            <Text style={[styles.thCell, styles.colNum]}>Book</Text>
            <Text style={[styles.thCell, styles.colNum]}>Chg %</Text>
            <Text style={[styles.thCell, styles.colNumSmall]}>Stocks</Text>
          </View>
          {data.sectors.map((s, i) => (
            <View key={s.sector} style={i === data.sectors.length - 1 && data.unclassifiedCount === 0 ? styles.trLast : styles.tr}>
              <Text style={[styles.tdCell, styles.colWide]}>{s.sector}</Text>
              <Text style={[styles.tdCell, styles.colNum]}>{fmtCrLocal(s.amtToday)}</Text>
              <Text style={[styles.tdCell, styles.colNum, { color: pctColor(s.amtChangePct) }]}>{fmtPct(s.amtChangePct)}</Text>
              <Text style={[styles.tdCell, styles.colNumSmall]}>{s.symbolCount}</Text>
            </View>
          ))}
          {data.unclassifiedCount > 0 && (
            <View style={styles.trLast}>
              <Text style={[styles.tdCell, styles.colWide, { color: MUTED }]}>Unclassified</Text>
              <Text style={[styles.tdCell, styles.colNum, { color: MUTED }]}>{fmtCrLocal(data.unclassifiedAmt)}</Text>
              <Text style={[styles.tdCell, styles.colNum]}></Text>
              <Text style={[styles.tdCell, styles.colNumSmall, { color: MUTED }]}>{data.unclassifiedCount}</Text>
            </View>
          )}
        </View>

        <Text style={styles.footer}>Sunidhi Securities & Finance Ltd. — For private circulation. See final page for disclosures and disclaimer.</Text>
      </Page>

      {/* Page 2: Continuous Funders -- Leveraging Up. Own page (not side-by-side) because this
          list runs to 100+ rows -- react-pdf auto-continues overflowing content onto additional
          A4 pages cloned from this one, so the table just flows across as many physical pages as
          it needs. Two tables: the first ranked by persistence (cont) then magnitude, the second
          the SAME row set re-ranked by book size -- "which of these has the most money behind it." */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Continuous Funders — Leveraging Up</Text>
        <Text style={styles.sectionSubtitle}>Stocks where 4 or more of the last 5 day-over-day MTF-financing changes were persistently positive — a trend, not a one-day blip. Price Cont. is the same stock&rsquo;s own price-persistence count, independent of MTF Cont. {data.fundersUp.length} of up to 100 shown, ranked by persistence then magnitude.</Text>
        <FunderTable rows={data.fundersUp} />

        <Text style={styles.sectionTitle}>Same list, ranked by book size</Text>
        <Text style={styles.sectionSubtitle}>The same {data.fundersUp.length} stocks above, re-sorted by MTF book size (highest first) instead of persistence -- which of these persistent movers has the most money behind it.</Text>
        <FunderTable rows={sortByBookDesc(data.fundersUp)} />

        <Text style={styles.footer}>Sunidhi Securities & Finance Ltd. — For private circulation. See final page for disclosures and disclaimer.</Text>
      </Page>

      {/* Page 3: Continuous Funders -- Deleveraging. Same auto-pagination note as above. */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Continuous Funders — Deleveraging</Text>
        <Text style={styles.sectionSubtitle}>Stocks where 4 or more of the last 5 day-over-day MTF-financing changes were persistently negative — a trend, not a one-day blip. {data.fundersDown.length} of up to 100 shown, ranked by persistence then magnitude.</Text>
        <FunderTable rows={data.fundersDown} />

        <Text style={styles.sectionTitle}>Same list, ranked by book size</Text>
        <Text style={styles.sectionSubtitle}>The same {data.fundersDown.length} stocks above, re-sorted by MTF book size (highest first) instead of persistence -- which of these persistent movers has the most money behind it.</Text>
        <FunderTable rows={sortByBookDesc(data.fundersDown)} />

        <Text style={styles.footer}>Sunidhi Securities & Finance Ltd. — For private circulation. See final page for disclosures and disclaimer.</Text>
      </Page>

      {/* Page 4: Price Movers -- Price Up. Symmetric counterpart to Continuous Funders
          (pages 2-3), ranked by the report's own PRICE-persistence count instead of its
          financing-persistence count. Reuses the same FunderTable markup/styling --
          content only, no new table format. */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Price Movers — Price Up</Text>
        <Text style={styles.sectionSubtitle}>Stocks where 4 or more of the last 5 day-over-day PRICE changes were persistently positive — independent of the stock&rsquo;s own MTF-financing trend (shown alongside as MTF Cont. for comparison). {data.priceMoversUp.length} of up to 100 shown, ranked by price persistence then magnitude.</Text>
        <FunderTable rows={data.priceMoversUp} />

        <Text style={styles.footer}>Sunidhi Securities & Finance Ltd. — For private circulation. See final page for disclosures and disclaimer.</Text>
      </Page>

      {/* Page 5: Price Movers -- Price Down. Same auto-pagination note as pages 2-3. */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Price Movers — Price Down</Text>
        <Text style={styles.sectionSubtitle}>Stocks where 4 or more of the last 5 day-over-day PRICE changes were persistently negative — independent of the stock&rsquo;s own MTF-financing trend (shown alongside as MTF Cont. for comparison). {data.priceMoversDown.length} of up to 100 shown, ranked by price persistence then magnitude.</Text>
        <FunderTable rows={data.priceMoversDown} />

        <Text style={styles.footer}>Sunidhi Securities & Finance Ltd. — For private circulation. See final page for disclosures and disclaimer.</Text>
      </Page>

      {/* Page 6: Divergence + Top Movers */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Leverage vs Price Divergence</Text>
        <Text style={styles.sectionSubtitle}>Stocks where margin financing and price moved in opposite directions today — a signal a plain movers list won&rsquo;t surface.</Text>
        {data.divergence.length === 0 ? (
          <Text style={{ fontSize: 8, color: MUTED }}>No notable divergences today.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tr}>
              <Text style={[styles.thCell, styles.colWide]}>Symbol</Text>
              <Text style={[styles.thCell, styles.colNum]}>MTF Chg%</Text>
              <Text style={[styles.thCell, styles.colNum]}>Price Chg%</Text>
              <Text style={[styles.thCell, styles.colWide]}>Pattern</Text>
            </View>
            {data.divergence.map((r, i) => (
              <View key={r.symbol} style={i === data.divergence.length - 1 ? styles.trLast : styles.tr}>
                <Text style={[styles.tdCell, styles.colWide]}>{r.symbol}</Text>
                <Text style={[styles.tdCell, styles.colNum, { color: pctColor(r.amtChangePct) }]}>{fmtPct(r.amtChangePct)}</Text>
                <Text style={[styles.tdCell, styles.colNum, { color: pctColor(r.priceChangePct) }]}>{fmtPct(r.priceChangePct)}</Text>
                <Text style={[styles.tdCell, styles.colWide, { fontSize: 7, color: MUTED }]}>
                  {r.pattern === "leverage-up-price-down" ? "Leverage up, price down" : "Leverage down, price up"}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Top Leverage Movers</Text>
        <Text style={styles.sectionSubtitle}>Most materially-financed stocks, ranked by today&rsquo;s MTF book size (the dashboard&rsquo;s heatmap, in table form).</Text>
        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.thCell, styles.colWide]}>Symbol</Text>
            <Text style={[styles.thCell, styles.colNum]}>Book</Text>
            <Text style={[styles.thCell, styles.colNum]}>MTF Chg%</Text>
            <Text style={[styles.thCell, styles.colNum]}>Price Chg%</Text>
          </View>
          {data.topMovers.map((r, i) => (
            <View key={r.symbol} style={i === data.topMovers.length - 1 ? styles.trLast : styles.tr}>
              <Text style={[styles.tdCell, styles.colWide]}>{r.symbol}</Text>
              <Text style={[styles.tdCell, styles.colNum]}>{fmtCrLocal(r.amtToday)}</Text>
              <Text style={[styles.tdCell, styles.colNum, { color: pctColor(r.amtChangePct) }]}>{fmtPct(r.amtChangePct)}</Text>
              <Text style={[styles.tdCell, styles.colNum, { color: pctColor(r.priceChangePct) }]}>{fmtPct(r.priceChangePct)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>Sunidhi Securities & Finance Ltd. — For private circulation. See final page for disclosures and disclaimer.</Text>
      </Page>

      {/* Page 7: Disclaimer (verbatim from the reference report) */}
      <Page size="A4" style={styles.page}>
        <Image src={BANNER_BUFFER} style={[styles.banner, { height: 40 }]} />
        <Text style={styles.disclaimerTitle}>Disclosures and Disclaimer</Text>
        <Text style={styles.disclaimerBody}>
          Disclosures and Disclaimers: This Report is published by Sunidhi Securities & Finance Limited (hereinafter referred to as “Sunidhi”) SEBI Research Analyst
          Registration Number: INH000000000 for private circulation. Sunidhi is a registered Stock Broker with National Stock Exchange of India Limited, BSE Limited and
          Metropolitan Stock Exchange of India Limited in cash, derivatives and currency derivatives segments. It is also having registration as a Depository Participant
          with CDSL.
        </Text>
        <Text style={styles.disclaimerBody}>
          Sunidhi has other business divisions with independent research teams separated by Chinese walls, and therefore may, at times, have different or contrary views
          on stocks and markets.
        </Text>
        <Text style={styles.disclaimerBody}>
          Sunidhi or its associates has not been debarred / suspended by SEBI or any other regulatory authority for accessing / dealing in securities Market. Sunidhi or
          analyst or his relatives do not hold any financial interest in the subject company. Associates may have such interest in its ordinary course of business as a distinct
          and independent body. Sunidhi or its associates or Analyst do not have any conflict or material conflict of interest at the time of publication of the research
          report with the company covered by Analyst.
        </Text>
        <Text style={styles.disclaimerBody}>
          Sunidhi or its associates / analyst has not received any compensation / managed or co-managed public offering of securities of the company covered by Analyst
          during the past twelve months. Sunidhi or its associates has not received any compensation or other benefits from the company covered by Analyst or third
          party in connection with the research report. Analyst has not served as an officer, director or employee of subject company and Sunidhi
          / analyst has not been engaged in market making activity of the subject company.
        </Text>
        <Text style={styles.disclaimerBody}>
          Analyst or his relatives do not hold beneficial ownership of 1% or more in the subject company at the end of the month immediately preceding the date of
          publication of this research report. Sunidhi or its associates may have investment positions in the stocks recommended in this report, which may have beneficial
          ownership of 1% or more in the subject company at the end of the month immediately preceding the date of publication of this research report. However, Sunidhi
          is maintaining Chinese wall between other business divisions or activities. Analyst has exercised due diligence in checking correctness of details and opinion
          expressed herein is unbiased.
        </Text>
        <Text style={styles.disclaimerBody}>
          This report is meant for personal informational purposes and is not be construed as a solicitation or financial advice or an offer to buy or sell any securities or
          related financial instruments. While utmost care has been taken in preparing this report, we claim no responsibility for its accuracy. Recipients should not regard
          the report as a substitute for the exercise of their own judgment. Any opinions expressed in this report are subject to change without any notice and this report
          is not under any obligation to update or keep current the information contained herein. Past performance is not necessarily indicative of future results. This report
          accepts no liability whatsoever for any loss or damage of any kind arising out of the use of all or any part of this report.
        </Text>
        <Text style={styles.disclaimerBody}>
          Each recipient of this document should make such investigations as they deem necessary to arrive at an independent evaluation of an investment in the securities
          of the companies referred to in this document (including the merits and risks involved), and should consult their own advisors to determine the merits and risks
          of such an investment.
        </Text>
        <Text style={styles.disclaimerBody}>
          The information in this document has been printed on the basis of publicly available information, internal data and other reliable sources believed to be true,
          but we do not represent that it is accurate or complete and it should not be relied on as such, as this document is for general guidance only. Sunidhi or any of its
          affiliates/ group companies shall not be in any way responsible for any loss or damage that may arise to any person from any inadvertent error in the information
          contained in this report. Sunidhi has not independently verified all the information contained within this document. Accordingly, we cannot testify, nor make any
          representation or warranty, express or implied, to the accuracy, contents or data contained within this document. While Sunidhi endeavors to update on a
          reasonable basis the information discussed in this material, there may be regulatory, compliance, or other reasons that prevent us from doing so. Neither Sunidhi
          nor its directors, employees or affiliates shall be liable for any loss or damage that may arise from or in connection with the use of this information.
        </Text>
        <Text style={[styles.disclaimerBody, { fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 6 }]}>
          Sunidhi Securities & Finance Ltd. – Research Analyst – INH000000000
        </Text>
        <Text style={[styles.disclaimerBody, { textAlign: "center" }]}>
          Registered office address (configure via MTF_COMPLIANCE_ADDRESS)
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6 }}>
          <Text style={{ fontSize: 7, color: MUTED }}>BSE Registration no. INZ000000000</Text>
          <Text style={{ fontSize: 7, color: MUTED }}>NSE Registration no. INZ000000000</Text>
          <Text style={{ fontSize: 7, color: MUTED }}>MSEI Registration no. INZ000000000</Text>
        </View>
        <Text style={{ fontSize: 7, color: MUTED, marginTop: 4 }}>Compliance Officer: Compliance Officer Name — Phone: +91-00000-00000</Text>
      </Page>
    </Document>
  );
}
