// components/portfolio/PortfolioSidebar.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X, Plus, Loader2, AlertCircle } from "lucide-react";

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
  } catch {
    return [];
  }
}

function savePortfolio(entries: PortfolioEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

interface Props {
  selected: string | null;
  onSelect: (symbol: string, name: string) => void;
}

export function PortfolioSidebar({ selected, onSelect }: Props) {
  const [portfolio, setPortfolio] = useState<PortfolioEntry[]>([]);
  const [search, setSearch] = useState("");
  const [dropdown, setDropdown] = useState<string[]>([]);
  const [dropdownIdx, setDropdownIdx] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPortfolio(loadPortfolio());
  }, []);

  useEffect(() => {
    savePortfolio(portfolio);
  }, [portfolio]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = search.trim();
    if (!q) {
      setDropdown([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nse-symbols?q=${encodeURIComponent(q)}`);
        const data = await res.json() as { symbols: string[] };
        setDropdown(data.symbols ?? []);
        setShowDropdown((data.symbols ?? []).length > 0);
        setDropdownIdx(-1);
      } catch {
        setDropdown([]);
      }
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        !searchRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
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
      setError(`${upper} is already in your portfolio`);
      setSearch("");
      setShowDropdown(false);
      return;
    }

    setValidating(true);
    setError(null);
    setSearch("");
    setShowDropdown(false);

    try {
      const res = await fetch(`/api/quote/${upper}`);
      if (!res.ok) {
        setError(`${upper} not found on NSE`);
        return;
      }
      const entry: PortfolioEntry = {
        symbol: upper,
        name: upper,
        addedAt: new Date().toISOString(),
      };
      setPortfolio((prev) => [...prev, entry]);
      onSelect(upper, upper);
    } catch {
      setError("Failed to validate symbol. Try again.");
    } finally {
      setValidating(false);
    }
  }, [portfolio, onSelect]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || dropdown.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDropdownIdx((i) => Math.min(i + 1, dropdown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDropdownIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (dropdownIdx >= 0) {
        addSymbol(dropdown[dropdownIdx]);
      } else if (search.trim()) {
        addSymbol(search.trim());
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  function remove(symbol: string) {
    setPortfolio((prev) => prev.filter((e) => e.symbol !== symbol));
  }

  return (
    <div
      className="flex flex-col h-full border-r border-[#1E2235] shrink-0"
      style={{ width: "15rem", background: "rgba(255,255,255,0.015)" }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1E2235] shrink-0">
        <span
          className="text-[10px] font-mono font-bold uppercase tracking-widest"
          style={{ color: "#F5820D" }}
        >
          My Portfolio
        </span>
        <p className="text-[9px] font-mono mt-0.5" style={{ color: "#6B7280" }}>
          {portfolio.length} symbol{portfolio.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Add symbol search */}
      <div className="px-3 py-2.5 border-b border-[#1E2235] shrink-0">
        <div className="relative">
          <div className="relative">
            {validating ? (
              <Loader2
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin"
                style={{ color: "#F5820D" }}
              />
            ) : (
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: "#6B7280" }}
              />
            )}
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value.toUpperCase());
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => dropdown.length > 0 && setShowDropdown(true)}
              placeholder="Add symbol…"
              autoComplete="off"
              spellCheck={false}
              disabled={validating}
              className="w-full pl-8 pr-8 py-1.5 text-[11px] font-mono rounded-lg focus:outline-none transition-colors disabled:opacity-50"
              style={{
                background: "#13151E",
                border: "1px solid #1E2235",
                color: "#F0EDE8",
              }}
            />
            {search && !validating && (
              <button
                type="button"
                onClick={() => { setSearch(""); setShowDropdown(false); setError(null); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "#6B7280" }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {showDropdown && dropdown.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg overflow-hidden shadow-2xl"
              style={{
                background: "#13151E",
                border: "1px solid #1E2235",
                maxHeight: "12rem",
                overflowY: "auto",
              }}
            >
              {dropdown.map((sym, i) => (
                <button
                  key={sym}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); addSymbol(sym); }}
                  className="w-full text-left px-3 py-2 text-[11px] font-mono flex items-center gap-2 transition-colors"
                  style={{
                    background: i === dropdownIdx ? "rgba(245,130,13,0.1)" : "transparent",
                    color: i === dropdownIdx ? "#F5820D" : "#F0EDE8",
                  }}
                >
                  <Plus className="w-3 h-3 shrink-0 opacity-50" />
                  {sym}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Validation error */}
        {error && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <AlertCircle className="w-3 h-3 shrink-0" style={{ color: "#E84040" }} />
            <span className="text-[9px] font-mono" style={{ color: "#E84040" }}>
              {error}
            </span>
          </div>
        )}
      </div>

      {/* Stock list */}
      <div className="flex-1 overflow-y-auto py-1">
        {portfolio.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <span className="text-2xl opacity-20">📋</span>
            <span className="text-[10px] font-mono" style={{ color: "#6B7280" }}>
              Add symbols above to build your portfolio
            </span>
          </div>
        )}
        {portfolio.map((entry) => {
          const active = selected === entry.symbol;
          return (
            <div
              key={entry.symbol}
              className="relative flex items-center group px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors"
              style={{
                background: active ? "rgba(245,130,13,0.1)" : "transparent",
                border: active ? "1px solid rgba(245,130,13,0.2)" : "1px solid transparent",
              }}
              onClick={() => onSelect(entry.symbol, entry.name)}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                  style={{ background: "#F5820D" }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className="text-[11px] font-mono font-semibold truncate"
                  style={{ color: active ? "#F5820D" : "#F0EDE8" }}
                >
                  {entry.symbol}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(entry.symbol); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0"
                style={{ color: "#6B7280" }}
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
