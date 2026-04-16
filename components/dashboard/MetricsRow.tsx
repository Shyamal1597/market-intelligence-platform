"use client";

import { useEffect, useRef, useState } from "react";
import { TrendingUp, TrendingDown, Settings, X, Check } from "lucide-react";
import { Sparkline } from "@/components/macro/Sparkline";

interface Quote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  history: number[];
}

// ── All selectable symbols ─────────────────────────────────────────────────────
const ALL_SYMBOLS = [
  { symbol: "^NSEI", label: "Nifty 50", group: "India" },
  { symbol: "^BSESN", label: "Sensex", group: "India" },
  { symbol: "^NSEBANK", label: "Bank Nifty", group: "India" },
  { symbol: "BZ=F", label: "Brent Crude", group: "Commodities" },
  { symbol: "GOLD_INR", label: "Gold \u20B9/10g", group: "Commodities" },
  { symbol: "SILVER_INR", label: "Silver \u20B9/kg", group: "Commodities" },
  { symbol: "INR=X", label: "USD/INR", group: "FX" },
  { symbol: "^DJI", label: "DJIA", group: "US" },
  { symbol: "^IXIC", label: "NASDAQ", group: "US" },
  { symbol: "^GSPC", label: "S&P 500", group: "US" },
  { symbol: "^FTSE", label: "FTSE", group: "Europe" },
  { symbol: "^FCHI", label: "CAC 40", group: "Europe" },
  { symbol: "^GDAXI", label: "DAX", group: "Europe" },
  { symbol: "^N225", label: "Nikkei", group: "Asia Pacific" },
  { symbol: "^HSI", label: "Hang Seng", group: "Asia Pacific" },
  { symbol: "000001.SS", label: "Shanghai", group: "Asia Pacific" },
  { symbol: "^KS11", label: "KOSPI", group: "Asia Pacific" },
  { symbol: "^AXJO", label: "ASX 200", group: "Asia Pacific" },
  { symbol: "^JKSE", label: "Jakarta", group: "Asia Pacific" },
  { symbol: "^KLSE", label: "KLSE", group: "Asia Pacific" },
  { symbol: "^STI", label: "Straits", group: "Asia Pacific" },
  { symbol: "^TWII", label: "Taiwan", group: "Asia Pacific" },
  { symbol: "^SET.BK", label: "Thailand", group: "Asia Pacific" },
  { symbol: "^BVSP", label: "BOVESPA", group: "Latin America" },
  { symbol: "^MXX", label: "BOLSA", group: "Latin America" },
  { symbol: "^TNX", label: "US 10yr", group: "Others" },
  { symbol: "^INBY10", label: "India 10yr", group: "Others" },
  { symbol: "DX-Y.NYB", label: "$ Index", group: "Others" },
  { symbol: "^VIX", label: "VIX", group: "Others" },
  { symbol: "CL=F", label: "Nymex Crude", group: "Others" },
];

const DEFAULT_SYMBOLS = ["^NSEI", "^BSESN", "^NSEBANK", "BZ=F", "INR=X", "GOLD_INR", "SILVER_INR"];
const MAX_TILES = 10;
const STORAGE_KEY = "dashboard_metrics_symbols_v1";
const GROUPS = ["India", "Commodities", "FX", "US", "Europe", "Asia Pacific", "Latin America", "Others"];

function loadSelectedSymbols(): string[] {
  if (typeof window === "undefined") return DEFAULT_SYMBOLS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_SYMBOLS;
  } catch { return DEFAULT_SYMBOLS; }
}

function saveSelectedSymbols(symbols: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols)); } catch { }
}

function formatPrice(price: number, symbol: string): string {
  if (symbol === "INR=X") return price.toFixed(2);
  if (["^TNX", "^INBY10", "^VIX"].includes(symbol)) return price.toFixed(2) + "%";
  if (["BZ=F", "CL=F"].includes(symbol)) return "$" + price.toFixed(2);
  if (symbol === "DX-Y.NYB") return price.toFixed(2);
  if (["GOLD_INR", "SILVER_INR"].includes(symbol))
    return "\u20B9" + Math.round(price).toLocaleString("en-IN");
  if (price > 10000) return price.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  if (price > 1000) return price.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return price.toFixed(2);
}

// ── Metric tile ───────────────────────────────────────────────────────────────
function MetricTile({ quote }: { quote: Quote }) {
  const up = quote.changePercent >= 0;
  return (
    <div className={`glass-panel rounded-xl p-4 border-l-2 flex flex-col gap-2 min-w-0 ${up ? "border-l-teal" : "border-l-danger"}`}>
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted truncate">{quote.label}</span>
        {up ? <TrendingUp className="w-3 h-3 text-teal shrink-0" /> : <TrendingDown className="w-3 h-3 text-danger shrink-0" />}
      </div>
      <span className="font-mono text-xl font-semibold text-primary leading-none">
        {formatPrice(quote.price, quote.symbol)}
      </span>
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-mono ${up ? "text-teal" : "text-danger"}`}>
          {up ? "+" : ""}{quote.changePercent.toFixed(2)}%
        </span>
        <span className={`text-[10px] font-mono ${up ? "text-teal/60" : "text-danger/60"}`}>
          {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)}
        </span>
      </div>
      {quote.history?.length > 1 && (
        <div className="h-8 w-full">
          <Sparkline data={quote.history} positive={up} />
        </div>
      )}
    </div>
  );
}

function SkeletonTile() {
  return (
    <div className="glass-panel rounded-xl p-4 border-l-2 border-l-[#1E2235] flex flex-col gap-2 animate-pulse">
      <div className="h-2.5 bg-[#1E2235] rounded w-2/3" />
      <div className="h-5 bg-[#1E2235] rounded w-1/2 mt-1" />
      <div className="h-2 bg-[#1E2235] rounded w-1/3" />
      <div className="h-8 bg-[#1E2235] rounded mt-1" />
    </div>
  );
}

// ── Customize panel ───────────────────────────────────────────────────────────
interface CustomizePanelProps {
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}

function CustomizePanel({ selected, onChange, onClose }: CustomizePanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  function toggle(symbol: string) {
    if (selected.includes(symbol)) {
      if (selected.length <= 1) return; // keep at least one
      onChange(selected.filter((s) => s !== symbol));
    } else {
      if (selected.length >= MAX_TILES) return; // enforce max
      onChange([...selected, symbol]);
    }
  }

  const atMax = selected.length >= MAX_TILES;

  return (
    <div
      ref={ref}
      className="absolute top-8 right-0 z-30 w-60 bg-[#13151E] border border-[#1E2235] rounded-xl shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1E2235]">
        <span className="text-[10px] font-mono uppercase tracking-widest text-amber">Customize Metrics</span>
        <button onClick={onClose} className="text-muted hover:text-primary transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {atMax && (
        <div className="px-3 py-1.5 bg-amber/5 border-b border-amber/20">
          <p className="text-[9px] font-mono text-amber">Max {MAX_TILES} tiles. Deselect one to add another.</p>
        </div>
      )}
      <div className="max-h-[60vh] overflow-y-auto p-2 space-y-3">
        {GROUPS.map((group) => {
          const groupSymbols = ALL_SYMBOLS.filter((s) => s.group === group);
          if (groupSymbols.length === 0) return null;
          return (
            <div key={group}>
              <p className="text-[9px] font-mono uppercase tracking-widest text-muted px-2 mb-1">{group}</p>
              {groupSymbols.map((sym) => {
                const active = selected.includes(sym.symbol);
                const disabled = !active && atMax;
                return (
                  <button
                    key={sym.symbol}
                    onClick={() => toggle(sym.symbol)}
                    disabled={disabled}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-left ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-white/5"
                      }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${active ? "bg-amber/20 border-amber" : "border-[#3A4060]"
                      }`}>
                      {active && <Check className="w-2.5 h-2.5 text-amber" />}
                    </span>
                    <span className={`text-[11px] font-mono ${active ? "text-primary" : "text-muted"}`}>
                      {sym.label}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="px-3 py-2 border-t border-[#1E2235]">
        <p className="text-[9px] font-mono text-muted">{selected.length}/{MAX_TILES} selected · saved automatically</p>
      </div>
    </div>
  );
}

// ── MetricsRow ────────────────────────────────────────────────────────────────
export function MetricsRow() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [showCustomize, setShowCustomize] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSelectedSymbols(loadSelectedSymbols());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) saveSelectedSymbols(selectedSymbols);
  }, [selectedSymbols, mounted]);

  // Fetch both APIs independently — one failure must not block the other
  useEffect(() => {
    let alive = true;

    async function load() {
      const [macroQuotes, globalQuotes] = await Promise.all([
        fetch("/api/macro")
          .then((r) => r.json())
          .then((d) => (d.quotes ?? []) as Quote[])
          .catch(() => [] as Quote[]),
        fetch("/api/macro/global")
          .then((r) => r.json())
          .then((d) => (d.quotes ?? []) as Quote[])
          .catch(() => [] as Quote[]),
      ]);

      if (!alive) return;

      // Macro data takes priority (has BankNifty, GOLD_INR, SILVER_INR, better sparklines)
      const macroSet = new Set(macroQuotes.map((q) => q.symbol));
      const merged = [
        ...macroQuotes,
        ...globalQuotes.filter((q) => !macroSet.has(q.symbol)),
      ];

      setQuotes(merged);
      setLoading(false);
    }

    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Preserve selection order; only show symbols that loaded
  const ordered = selectedSymbols
    .map((s) => quotes.find((q) => q.symbol === s))
    .filter((q): q is Quote => q !== undefined);

  // Responsive columns: up to 5 per row, wrap to 2 rows if needed
  const cols = Math.min(ordered.length, 5);

  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted">Live Market Metrics</span>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowCustomize((v) => !v)}
            className={`p-1 rounded transition-colors ${showCustomize ? "text-amber" : "text-muted hover:text-primary"}`}
            title="Customize metrics"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          {showCustomize && (
            <CustomizePanel
              selected={selectedSymbols}
              onChange={setSelectedSymbols}
              onClose={() => setShowCustomize(false)}
            />
          )}
        </div>
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {loading
          ? [...Array(DEFAULT_SYMBOLS.length)].map((_, i) => <SkeletonTile key={i} />)
          : ordered.map((q) => <MetricTile key={q.symbol} quote={q} />)
        }
      </div>
    </div>
  );
}
