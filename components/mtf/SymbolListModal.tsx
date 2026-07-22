"use client";

import { useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import { fmtCr } from "@/lib/mtf/format";
import { SortHeader, compareNullable, type SortDir } from "./SortHeader";

interface Row {
  symbol: string;
  name: string | null;
  amtToday: number | null;
  amtChangePct: number | null;
  priceChangePct: number | null;
}

type SortField = "symbol" | "amtChangePct" | "priceChangePct" | "amtToday";

// Words that don't contribute a letter to a company's common short-form --
// e.g. "State Bank OF India" -> S,B,I -> "SBI", not "SBOI".
const NAME_STOPWORDS = new Set([
  "OF", "THE", "AND", "LTD", "LIMITED", "CO", "CORP", "CORPORATION",
  "PVT", "PRIVATE", "INC", "PLC", "&",
]);

/** First letter of each significant word in the company name, e.g.
 * "State Bank of India" -> "SBI" -- lets a search for "SBI" find a symbol
 * whose name never literally contains those three letters together. */
function acronym(name: string): string {
  return name
    .toUpperCase()
    .split(/[\s.,]+/)
    .filter((w) => w && !NAME_STOPWORDS.has(w))
    .map((w) => w[0])
    .join("");
}

function matchesSearch(row: Row, query: string): boolean {
  if (!query) return true;
  if (row.symbol.toUpperCase().includes(query)) return true;
  const name = (row.name ?? "").toUpperCase();
  if (name.includes(query)) return true;
  if (row.name && acronym(row.name).includes(query)) return true;
  return false;
}

export function SymbolListModal({
  title, caption, rows, loading, onClose, onSelectSymbol,
}: {
  title: string;
  caption?: string;
  rows: Row[] | null;
  loading: boolean;
  onClose: () => void;
  onSelectSymbol: (symbol: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("amtToday");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const displayRows = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toUpperCase();
    const filtered = q ? rows.filter((r) => matchesSearch(r, q)) : rows;
    return [...filtered].sort((a, b) => {
      if (sortField === "symbol") {
        const cmp = a.symbol.localeCompare(b.symbol);
        return sortDir === "asc" ? cmp : -cmp;
      }
      return compareNullable(a[sortField], b[sortField], sortDir);
    });
  }, [rows, query, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "symbol" ? "asc" : "desc");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl shadow-black/50 p-6 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1 shrink-0">
          <h2 className="text-sm font-mono text-primary tracking-wider uppercase">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-primary"><X size={16} /></button>
        </div>
        {caption && <p className="text-[10px] text-muted/70 mb-3 shrink-0">{caption}</p>}

        {loading || !rows ? (
          <div className="py-16 text-center text-muted font-mono text-sm animate-pulse">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-muted font-mono text-sm">No symbols in this bucket.</div>
        ) : (
          <>
            <div className="relative mb-2 shrink-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search symbol or company name (e.g. SBI, Reliance)…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-base/40 border border-border text-[11px] font-mono text-primary placeholder:text-muted/60 focus:outline-none focus:border-amber/40"
              />
            </div>
            {displayRows && displayRows.length !== rows.length && (
              <p className="text-[10px] text-muted/60 mb-1.5 shrink-0">
                {displayRows.length} of {rows.length} match{query ? ` "${query}"` : ""}
              </p>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full text-[11px] font-mono border-collapse">
                <thead className="sticky top-0 bg-surface z-10">
                  <tr className="text-muted text-[9px] uppercase tracking-wider border-b border-border">
                    <SortHeader label="Symbol" field="symbol" active={sortField === "symbol"} dir={sortDir} onClick={toggleSort} align="left" />
                    <th className="text-left font-normal px-2 py-1.5">Name</th>
                    <SortHeader label="MTF Chg %" field="amtChangePct" active={sortField === "amtChangePct"} dir={sortDir} onClick={toggleSort} />
                    <SortHeader label="Price Chg %" field="priceChangePct" active={sortField === "priceChangePct"} dir={sortDir} onClick={toggleSort} />
                    <SortHeader label="MTF Book" field="amtToday" active={sortField === "amtToday"} dir={sortDir} onClick={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {displayRows && displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-8 text-center text-muted">
                        No matches for &ldquo;{query}&rdquo;.
                      </td>
                    </tr>
                  ) : (
                    displayRows?.map((r) => (
                      <tr
                        key={r.symbol}
                        onClick={() => onSelectSymbol(r.symbol)}
                        className="border-b border-border/40 hover:bg-white/[0.02] transition-colors cursor-pointer"
                      >
                        <td className="px-2 py-1.5 text-primary">{r.symbol}</td>
                        <td className="px-2 py-1.5 text-muted truncate max-w-[220px]">{r.name ?? "—"}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${(r.amtChangePct ?? 0) >= 0 ? "text-teal" : "text-danger"}`}>
                          {r.amtChangePct != null ? `${r.amtChangePct >= 0 ? "+" : ""}${r.amtChangePct.toFixed(2)}%` : "—"}
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${(r.priceChangePct ?? 0) >= 0 ? "text-teal" : "text-danger"}`}>
                          {r.priceChangePct != null ? `${r.priceChangePct >= 0 ? "+" : ""}${r.priceChangePct.toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted tabular-nums">{fmtCr(r.amtToday)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
