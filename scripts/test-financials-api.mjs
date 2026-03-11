/**
 * Quick test: hit the financials API and report what was parsed.
 * Usage: node scripts/test-financials-api.mjs [SYMBOL]
 */
const symbol = process.argv[2] || 'JASH';
const url = `http://localhost:3001/api/coverage/${symbol}/financials`;

const res = await fetch(url);
if (!res.ok) {
  console.error(`HTTP ${res.status}:`, await res.text());
  process.exit(1);
}

const d = await res.json();

console.log(`\n=== ${d.company || symbol} (${d.reportType} ${d.date}) ===`);
console.log(`Analyst: ${d.analyst}`);

console.log(`\n── Annual (${d.annual?.length ?? 0} rows) ──`);
for (const r of d.annual ?? []) {
  const est = r.isEstimate ? 'E' : ' ';
  console.log(
    `  ${r.fy}${est}  Rev=${r.rev}  EBITDA=${r.ebitda}  EBITDA%=${r.ebitdaPct}  PAT=${r.pat}  EPS=${r.eps}  P/E=${r.pe}  EV/EBITDA=${r.evEbitda}  ROE=${r.roe}`
  );
}

console.log(`\n── Quarterly (${d.quarterly?.length ?? 0} quarters) ──`);
for (const q of (d.quarterly ?? []).slice(-6)) {
  console.log(
    `  ${q.quarter}  Rev=${q.revenues}  EBITDA=${q.ebitda}  EBITDA%=${q.ebitdaPct}  PAT=${q.netProfit}`
  );
}

if (d.ratios) {
  console.log(`\n── Ratios (years: ${d.ratios.years.join(', ')}) ──`);
  console.log(`  EPS:      ${d.ratios.eps.join('  ')}`);
  console.log(`  P/E:      ${d.ratios.pe.join('  ')}`);
  console.log(`  EV/EBITDA:${d.ratios.evEbitda.join('  ')}`);
  console.log(`  EBITDA%:  ${d.ratios.ebitdaPct.join('  ')}`);
  console.log(`  ROE:      ${d.ratios.roe.join('  ')}`);
} else {
  console.log('\n── Ratios: null ──');
}

if (d.balanceSheet) {
  console.log(`\n── Balance Sheet (years: ${d.balanceSheet.years.join(', ')}) ──`);
  console.log(`  Equity:     ${d.balanceSheet.equity.join('  ')}`);
  console.log(`  TotalDebt:  ${d.balanceSheet.totalDebt.join('  ')}`);
  console.log(`  TotalAssets:${d.balanceSheet.totalAssets.join('  ')}`);
} else {
  console.log('\n── Balance Sheet: null ──');
}
