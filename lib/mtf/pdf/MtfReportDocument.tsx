import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import path from "node:path";
import { readFileSync } from "node:fs";
import type {
  Breadth, ContinuousFunderRow, SectorBreakdownRow, SymbolSnapshot, DivergenceRow, HeatmapNode,
} from "../queries";

// react-pdf's built-in "Helvetica" font family covers regular/bold/oblique
// out of the box -- no Font.register needed, no network fetch at render time.

const TEAL = "#0F9D6B";   // slightly deeper than the dashboard's #00C9A7 -- reads better on white
const DANGER = "#C4322A"; // slightly deeper than the dashboard's #E84040 -- same reason
const AMBER = "#B8600A";
const MUTED = "#6B7280";
const BORDER = "#E2E5EA";
const INK = "#1C1814";

const styles = StyleSheet.create({
  page: { paddingHorizontal: 28, paddingVertical: 24, fontSize: 9, fontFamily: "Helvetica", color: INK },
  banner: { width: "100%", marginBottom: 4 },
  updatedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  updatedText: { fontSize: 8, color: MUTED },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6, color: INK },
  sectionSubtitle: { fontSize: 7.5, color: MUTED, marginBottom: 8 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  kpiTile: { flexGrow: 1, minWidth: 110, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 8 },
  kpiLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  kpiValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 3 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  trLast: { flexDirection: "row" },
  thCell: { padding: 4, fontSize: 7, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase" },
  tdCell: { padding: 4, fontSize: 8 },
  colSymbol: { width: "22%" },
  colWide: { width: "34%" },
  colNum: { width: "17%", textAlign: "right" },
  colNumSmall: { width: "14%", textAlign: "right" },
  disclaimerTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 10 },
  disclaimerBody: { fontSize: 7.5, lineHeight: 1.5, color: INK, marginBottom: 8 },
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
  fundersUp: ContinuousFunderRow[];
  fundersDown: ContinuousFunderRow[];
  turnoverLeaders: SymbolSnapshot[];
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

function FunderTable({ title, rows }: { title: string; rows: ContinuousFunderRow[] }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>{title}</Text>
      <View style={styles.table}>
        <View style={styles.tr}>
          <Text style={[styles.thCell, styles.colSymbol]}>Symbol</Text>
          <Text style={[styles.thCell, styles.colNumSmall]}>Cont.</Text>
          <Text style={[styles.thCell, styles.colNum]}>MTF Chg%</Text>
          <Text style={[styles.thCell, styles.colNum]}>Price Chg%</Text>
          <Text style={[styles.thCell, styles.colNum]}>Book</Text>
        </View>
        {rows.map((r, i) => (
          <View key={r.symbol} style={i === rows.length - 1 ? styles.trLast : styles.tr}>
            <Text style={[styles.tdCell, styles.colSymbol]}>{r.symbol}</Text>
            <Text style={[styles.tdCell, styles.colNumSmall]}>{r.cont}/5</Text>
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

        <Text style={styles.sectionTitle}>Market Snapshot</Text>
        <View style={styles.kpiRow}>
          <KpiTile label="Total MTF Book" value={fmtCrLocal(breadth.totalAmtToday)} />
          <KpiTile label="vs Prior Day" value={bookChangePct != null ? fmtPct(bookChangePct) : "—"} color={pctColor(bookChangePct)} />
          <KpiTile label="Leveraging Up" value={String(breadth.countUp)} color={TEAL} />
          <KpiTile label="Deleveraging" value={String(breadth.countDown)} color={DANGER} />
          <KpiTile label="Unchanged" value={String(breadth.countFlat)} />
          <KpiTile label="Turnover Financed %" value={breadth.aggregateTurnoverFinancedPct != null ? `${breadth.aggregateTurnoverFinancedPct.toFixed(1)}%` : "—"} />
          <KpiTile label="Top Gainer" value={data.topGainer ? `${data.topGainer.symbol} ${fmtPct(data.topGainer.amtChangePct)}` : "—"} color={TEAL} />
          <KpiTile label="Top Loser" value={data.topLoser ? `${data.topLoser.symbol} ${fmtPct(data.topLoser.amtChangePct)}` : "—"} color={DANGER} />
        </View>

        <Text style={styles.sectionTitle}>MTF Book by Sector</Text>
        <Text style={styles.sectionSubtitle}>Where leverage money is flowing, top {data.sectors.length} sectors by book size.</Text>
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

      {/* Page 2: Continuous Funders */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Continuous Funders</Text>
        <Text style={styles.sectionSubtitle}>Stocks where 4 or more of the last 5 day-over-day MTF-financing changes were persistently positive or negative — a trend, not a one-day blip.</Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <FunderTable title="Leveraging Up" rows={data.fundersUp} />
          <FunderTable title="Deleveraging" rows={data.fundersDown} />
        </View>

        <Text style={styles.sectionTitle}>Turnover / Crowding Leaders</Text>
        <Text style={styles.sectionSubtitle}>Highest MTF book relative to today&rsquo;s traded value — a large multiple means an unwind would have nowhere to go.</Text>
        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.thCell, styles.colWide]}>Symbol</Text>
            <Text style={[styles.thCell, styles.colNum]}>Book / Turnover</Text>
            <Text style={[styles.thCell, styles.colNum]}>MTF Book</Text>
          </View>
          {data.turnoverLeaders.map((r, i) => (
            <View key={r.symbol} style={i === data.turnoverLeaders.length - 1 ? styles.trLast : styles.tr}>
              <Text style={[styles.tdCell, styles.colWide]}>{r.symbol}</Text>
              <Text style={[styles.tdCell, styles.colNum, r.turnoverFinancedPct != null && r.turnoverFinancedPct / 100 >= 30 ? { color: DANGER, fontFamily: "Helvetica-Bold" } : r.turnoverFinancedPct != null && r.turnoverFinancedPct / 100 >= 10 ? { color: AMBER, fontFamily: "Helvetica-Bold" } : {}]}>
                {r.turnoverFinancedPct != null ? `${(r.turnoverFinancedPct / 100).toFixed(1)}x` : "—"}
              </Text>
              <Text style={[styles.tdCell, styles.colNum]}>{fmtCrLocal(r.amtToday)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>Sunidhi Securities & Finance Ltd. — For private circulation. See final page for disclosures and disclaimer.</Text>
      </Page>

      {/* Page 3: Divergence + Top Movers */}
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

      {/* Page 4: Disclaimer (verbatim from the reference report) */}
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
