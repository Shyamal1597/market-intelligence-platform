#!/usr/bin/env python3
"""
scripts/import-fii-dii-excel.py

Imports FII/DII flow data from the analyst's Excel workbook into
data/fii-dii-history.json.

The analyst's Excel format (Sheet1):
  Left table  (cols A-G): April month data, one row per trading day (descending),
                          columns: Date | FII Buy | FII Sell | FII Net | DII Buy | DII Sell | DII Net
  Right table (cols H-M): Running cumulative from April 27 onwards, alternating
                          FII row then DII row per date:
                          Date | Buy | Sell | Net | MTD | YTD

Import strategy:
  1. Read April 1-26 data from the LEFT table.
  2. Read April 27+ data from the RIGHT table (FII/DII pairs).
  3. Deduplicate by date (first occurrence wins when a date appears twice).
  4. When consecutive right-table pairs share the same date, remap the second
     to the next business day (handles accidentally-same date entries).
  5. Load existing history; keep only pre-April entries (pre-FY27 context).
  6. Merge analyst data and save.

Usage:
  python scripts/import-fii-dii-excel.py "C:\\path\\to\\FII DII new 01.04.26.xlsx"
  python scripts/import-fii-dii-excel.py  # uses default path

The analyst runs this whenever she updates the Excel file.
YTD/MTD on the EOD export will automatically reflect the fresh data.
"""

import sys
import json
import os
from datetime import datetime, date, timedelta

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed. Run: pip install openpyxl")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEFAULT_EXCEL = os.path.join(
    os.path.expanduser("~"), "Downloads", "FII DII new 01.04.26.xlsx"
)
HISTORY_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "fii-dii-history.json"
)
FY_START = "2026-04-01"  # First day analyst's file covers (FY27 start)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_num(v) -> float:
    """Parse a cell value that may be a number or Indian-formatted text string."""
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    # Handle '14,012.52\t' or '1,10,839.50\t' (Indian number format + tab)
    s = str(v).strip().replace("\t", "").replace(",", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


def fmt_date(v) -> str | None:
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, date):
        return v.strftime("%Y-%m-%d")
    return None


def next_business_day(iso: str) -> str:
    dt = datetime.strptime(iso, "%Y-%m-%d") + timedelta(days=1)
    while dt.weekday() >= 5:  # skip Saturday (5) and Sunday (6)
        dt += timedelta(days=1)
    return dt.strftime("%Y-%m-%d")


def make_entry(d, fii_buy, fii_sell, fii_net, dii_buy, dii_sell, dii_net) -> dict:
    return {
        "date":          d,
        "fiiEquityBuy":  round(fii_buy,  2),
        "fiiEquitySell": round(fii_sell, 2),
        "fiiEquityNet":  round(fii_net,  2),
        "diiEquityBuy":  round(dii_buy,  2),
        "diiEquitySell": round(dii_sell, 2),
        "diiEquityNet":  round(dii_net,  2),
        "fiiDebtBuy":  0, "fiiDebtSell":  0, "fiiDebtNet":  0,
        "diiDebtBuy":  0, "diiDebtSell":  0, "diiDebtNet":  0,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(excel_path: str):
    print(f"Reading: {excel_path}")
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    ws = wb["Sheet1"]

    new_entries: dict[str, dict] = {}

    # ------------------------------------------------------------------
    # Left table (cols A-G, rows 4+): April 1 through April 26
    # Each row: Date | FII Buy | FII Sell | FII Net | DII Buy | DII Sell | DII Net
    # ------------------------------------------------------------------
    for row in ws.iter_rows(min_row=4, max_row=ws.max_row,
                            min_col=1, max_col=7, values_only=True):
        d = fmt_date(row[0])
        if not d:
            continue
        if d < FY_START or d >= "2026-04-27":
            continue  # out of range — right table covers Apr 27+
        new_entries[d] = make_entry(
            d,
            parse_num(row[1]), parse_num(row[2]), parse_num(row[3]),
            parse_num(row[4]), parse_num(row[5]), parse_num(row[6]),
        )

    # ------------------------------------------------------------------
    # Right table (cols H-M, rows 4+): April 27 onwards
    # Alternating FII row / DII row per date.
    # Col H=Date, I=Buy, J=Sell, K=Net, L=MTD, M=YTD (L/M not needed here)
    # ------------------------------------------------------------------
    right_rows: list[tuple] = []
    for row in ws.iter_rows(min_row=4, max_row=ws.max_row,
                            min_col=8, max_col=13, values_only=True):
        d = fmt_date(row[0])
        if not d:
            continue
        right_rows.append((d, parse_num(row[1]), parse_num(row[2]), parse_num(row[3])))

    i = 0
    while i + 1 < len(right_rows):
        d1, b1, s1, n1 = right_rows[i]
        d2, b2, s2, n2 = right_rows[i + 1]
        if d1 == d2:
            if d1 not in new_entries:
                # Normal case: first occurrence of this date
                new_entries[d1] = make_entry(d1, b1, s1, n1, b2, s2, n2)
            else:
                # Date already populated — second pair is next trading day
                nd = next_business_day(d1)
                print(f"  Remapped duplicate {d1} -> {nd} (FII net={n1:.2f})")
                new_entries[nd] = make_entry(nd, b1, s1, n1, b2, s2, n2)
            i += 2
        else:
            print(f"  WARNING: unpaired row at i={i}, date={d1} (FII net={n1:.2f}) — skipped")
            i += 1

    # ------------------------------------------------------------------
    # Load existing history; keep only pre-FY_START entries
    # ------------------------------------------------------------------
    hist_abs = os.path.abspath(HISTORY_PATH)
    old_entries: list[dict] = []
    if os.path.exists(hist_abs):
        with open(hist_abs, encoding="utf-8") as f:
            old_entries = json.load(f)
    pre_fy = [e for e in old_entries if e["date"] < FY_START]
    print(f"Existing history: {len(old_entries)} entries total, "
          f"{len(pre_fy)} pre-{FY_START} kept")

    # ------------------------------------------------------------------
    # Merge and save
    # ------------------------------------------------------------------
    merged = sorted(
        list(new_entries.values()) + pre_fy,
        key=lambda x: x["date"],
    )

    with open(hist_abs, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print(f"\nImported {len(new_entries)} analyst entries ({FY_START} to "
          f"{max(new_entries.keys())})")
    print(f"Total history: {len(merged)} entries "
          f"({merged[0]['date']} to {merged[-1]['date']})")

    fii_ytd = sum(e["fiiEquityNet"] for e in merged if e["date"] >= FY_START)
    dii_ytd = sum(e["diiEquityNet"] for e in merged if e["date"] >= FY_START)
    month   = merged[-1]["date"][:7]
    fii_mtd = sum(e["fiiEquityNet"] for e in merged if e["date"].startswith(month))
    dii_mtd = sum(e["diiEquityNet"] for e in merged if e["date"].startswith(month))

    print(f"\nFII YTD (FY27): {fii_ytd:>14,.2f} Cr")
    print(f"DII YTD (FY27): {dii_ytd:>14,.2f} Cr")
    print(f"FII MTD ({month}): {fii_mtd:>13,.2f} Cr")
    print(f"DII MTD ({month}): {dii_mtd:>13,.2f} Cr")
    print(f"\nSaved -> {hist_abs}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_EXCEL
    run(path)
