"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X, Plus, Loader2, AlertCircle, Upload, CheckCircle2 } from "lucide-react";

const STORAGE_KEY = "portfolio_v1";

export interface PortfolioEntry {
  symbol: string;
  name: string;
  addedAt: string;
}

function loadPortfolio(): PortfolioEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PortfolioEntry[]) : [];
  } catch { return []; }
}

function savePortfolio(entries: PortfolioEntry[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch {}
}

function parseCsvSymbols(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const splitLine = (l: string) => l.split(",").map((c) => c.replace(/^["']|["']$/g, "").trim());
  const HEADER_RE = /^(symbol|ticker|scrip[t]?|nse|stock|equity|isin)$/i;
  let colIndex = 0;
  let startRow = 0;
  const firstCols = splitLine(lines[0]);
  const headerIdx = firstCols.findIndex((c) => HEADER_RE.test(c));
  if (headerIdx !== -1) { colIndex = headerIdx; startRow = 1; }
  else if (firstCols.some((c) => /[a-zA-Z]{2,}/.test(c) && !/^\d/.test(c))) { startRow = 1; }
  const symbols: string[] = [];
  for (let i = startRow; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const raw = (cols[colIndex] ?? "").toUpperCase().trim();
    if (raw && /^[A-Z][A-Z0-9&-]{0,19}$/.test(raw)) symbols.push(raw);
  }
  return [...new Set(symbols)];
}

async function validateSymbols(
  symbols: string[],
  existing: Set<string>,
  onProgress: (done: number) => void
): Promise<{ added: PortfolioEntry[]; dupes: number; invalid: string[] }> {
  const added: PortfolioEntry[] = [];
  const invalid: string[] = [];
  let dupes = 0;
  let done = 0;
  const CONCURRENCY = 5;
  const queue = [...symbols];
  async function worker() {
    while (queue.length > 0) {
      const sym = queue.shift()!;
      if (existing.has(sym)) { dupes++; }
      else {
        try {
          const res = await fetch(`/api/quote/${sym}`);
          if (res.ok) { added.push({ symbol: sym, name: sym, addedAt: new Date().toISOString() }); existing.add(sym); }
          else { invalid.push(sym); }
        } catch { invalid.push(sym); }
      }
      done++;
      onProgress(done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, worker));
  return { added, dupes, invalid };
}

interface CsvResult { added: number; dupes: number; invalid: number; invalidList: string[] }

interface Props {
  selected: string | null;
  onSelect: (symbol: string, name: string) => void;
  onSearchFocusChange?: (focused: boolean) => void;
}

export function PortfolioSidebar({ selected, onSelect, onSearchFocusChange }: Props) {
  const [portfolio, setPortfolio] = useState<PortfolioEntry[]>([]);
  const [search, setSearch] = useState("");
  const [dropdown, setDropdown] = useState<string[]>([]);
  const [dropdownIdx, setDropdownIdx] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvProgress, setCsvProgress] = useState<{ done: number; total: number } | null>(null);
  const [csvResult, setCsvResult] = useState<CsvResult | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setPortfolio(loadPortfolio()); }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = search.trim();
    if (!q) { setDropdown([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nse-symbols?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { symbols: string[] };
        setDropdown(data.symbols ?? []);
        setShowDropdown((data.symbols ?? []).length > 0);
        setDropdownIdx(-1);
      } catch { setDropdown([]); }
    }, 120);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!searchRef.current?.contains(e.target as Node) && !dropdownRef.current?.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addSymbol = useCallback(async (sym: string) => {
    const upper = sym.toUpperCase().trim();
    if (!upper) return;
    if (portfolio.some((e) => e.symbol === upper)) {
      setError(`${upper} is already in your portfolio`); setSearch(""); setShowDropdown(false); return;
    }
    setValidating(true); setError(null); setSearch(""); setShowDropdown(false);
    try {
      const res = await fetch(`/api/quote/${upper}`);
      if (!res.ok) { setError(`${upper} not found on NSE`); return; }
      const entry: PortfolioEntry = { symbol: upper, name: upper, addedAt: new Date().toISOString() };
      setPortfolio((prev) => { const next = [...prev, entry]; savePortfolio(next); return next; });
      onSearchFocusChange?.(false);
      onSelect(upper, upper);
    } catch { setError("Failed to validate symbol. Try again."); }
    finally { setValidating(false); }
  }, [portfolio, onSelect]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || dropdown.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setDropdownIdx((i) => Math.min(i + 1, dropdown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setDropdownIdx((i) => Math.max(i - 1, -1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (dropdownIdx >= 0) addSymbol(dropdown[dropdownIdx]); else if (search.trim()) addSymbol(search.trim()); }
    else if (e.key === "Escape") { setShowDropdown(false); }
  }

  function remove(symbol: string) {
    setPortfolio((prev) => { const next = prev.filter((e) => e.symbol !== symbol); savePortfolio(next); return next; });
  }

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setCsvResult(null); setCsvImporting(true); setError(null);
    try {
      const text = await file.text();
      const symbols = parseCsvSymbols(text);
      if (symbols.length === 0) { setError("No valid NSE symbols found in CSV"); setCsvImporting(false); return; }
      const existing = new Set(portfolio.map((e) => e.symbol));
      setCsvProgress({ done: 0, total: symbols.length });
      const { added, dupes, invalid } = await validateSymbols(symbols, existing, (done) => setCsvProgress({ done, total: symbols.length }));
      if (added.length > 0) { setPortfolio((prev) => { const next = [...prev, ...added]; savePortfolio(next); return next; }); }
      const result: CsvResult = { added: added.length, dupes, invalid: invalid.length, invalidList: invalid };
      setCsvResult(result);
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      resultTimerRef.current = setTimeout(() => setCsvResult(null), 8000);
    } catch { setError("Failed to read CSV file"); }
    finally { setCsvImporting(false); setCsvProgress(null); }
  }

  return (
    <div
      className="flex flex-col h-full border-r border-border shrink-0 bg-base"
      style={{ width: "15rem" }}
    >
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />

      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0 flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber">
            My Portfolio
          </span>
          <p className="text-[9px] font-mono mt-0.5 text-muted">
            {portfolio.length} symbol{portfolio.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={csvImporting}
          title="Import CSV"
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono transition-colors disabled:opacity-40 text-amber border border-amber/20"
          style={{ background: "color-mix(in srgb, var(--color-amber) 8%, transparent)" }}
        >
          <Upload className="w-3 h-3" />
          CSV
        </button>
      </div>

      {/* CSV progress */}
      {csvImporting && csvProgress && (
        <div className="px-4 py-2.5 border-b border-border shrink-0 bg-surface">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-mono text-amber">Validating symbols…</span>
            <span className="text-[9px] font-mono text-muted">{csvProgress.done}/{csvProgress.total}</span>
          </div>
          <div className="w-full h-1 rounded-full overflow-hidden bg-border">
            <div
              className="h-full rounded-full transition-all duration-200 bg-amber"
              style={{ width: `${Math.round((csvProgress.done / csvProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* CSV result */}
      {csvResult && !csvImporting && (
        <div className="px-3 py-2.5 border-b border-border shrink-0 bg-surface">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-teal" />
              <span className="text-[9px] font-mono font-semibold text-teal">Import complete</span>
            </div>
            <button type="button" onClick={() => setCsvResult(null)} className="text-muted">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="text-[9px] font-mono text-teal">+{csvResult.added} added</span>
            {csvResult.dupes > 0 && <span className="text-[9px] font-mono text-muted">{csvResult.dupes} skipped</span>}
            {csvResult.invalid > 0 && <span className="text-[9px] font-mono text-danger">{csvResult.invalid} invalid</span>}
          </div>
          {csvResult.invalidList.length > 0 && csvResult.invalidList.length <= 8 && (
            <p className="text-[8px] font-mono mt-1 leading-relaxed text-muted">{csvResult.invalidList.join(", ")}</p>
          )}
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <div className="relative">
          <div className="relative">
            {validating
              ? <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-amber" />
              : <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
            }
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value.toUpperCase()); setError(null); }}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (dropdown.length > 0) setShowDropdown(true); onSearchFocusChange?.(true); }}
              onBlur={() => onSearchFocusChange?.(false)}
              placeholder="Add symbol…"
              autoComplete="off"
              spellCheck={false}
              disabled={validating || csvImporting}
              className="w-full pl-8 pr-8 py-1.5 text-[11px] font-mono rounded-lg focus:outline-none transition-colors disabled:opacity-50 bg-surface border border-border text-primary placeholder:text-muted"
            />
            {search && !validating && (
              <button type="button" onClick={() => { setSearch(""); setShowDropdown(false); setError(null); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {showDropdown && dropdown.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg overflow-hidden shadow-2xl bg-surface border border-border"
              style={{ maxHeight: "12rem", overflowY: "auto" }}
            >
              {dropdown.map((sym, i) => (
                <button
                  key={sym}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); addSymbol(sym); }}
                  className="w-full text-left px-3 py-2 text-[11px] font-mono flex items-center gap-2 transition-colors"
                  style={{
                    background: i === dropdownIdx ? "color-mix(in srgb, var(--color-amber) 10%, transparent)" : "transparent",
                    color: i === dropdownIdx ? "var(--color-amber)" : "var(--color-primary)",
                  }}
                >
                  <Plus className="w-3 h-3 shrink-0 opacity-50" />
                  {sym}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <AlertCircle className="w-3 h-3 shrink-0 text-danger" />
            <span className="text-[9px] font-mono text-danger">{error}</span>
          </div>
        )}
      </div>

      {/* Stock list */}
      <div className="flex-1 overflow-y-auto py-1">
        {portfolio.length === 0 && !csvImporting && (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <span className="text-2xl opacity-20">📋</span>
            <span className="text-[10px] font-mono text-muted">Add symbols above to build your portfolio</span>
          </div>
        )}
        {portfolio.map((entry) => {
          const active = selected === entry.symbol;
          return (
            <div
              key={entry.symbol}
              className="relative flex items-center group px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors"
              style={{
                background: active ? "color-mix(in srgb, var(--color-amber) 10%, transparent)" : "transparent",
                border: active ? "1px solid color-mix(in srgb, var(--color-amber) 20%, transparent)" : "1px solid transparent",
              }}
              onClick={() => onSelect(entry.symbol, entry.name)}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-amber" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-mono font-semibold truncate" style={{ color: active ? "var(--color-amber)" : "var(--color-primary)" }}>
                  {entry.symbol}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(entry.symbol); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0 text-muted"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
