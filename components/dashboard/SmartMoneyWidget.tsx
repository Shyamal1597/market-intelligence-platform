"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Brain, RefreshCw, Search, AlertCircle, X } from "lucide-react";
import type { CachedSignal, MarketStreamData, SymbolStreamData } from "@/lib/smart-money";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SignalState {
  symbol: string;       // "MARKET" or NSE symbol
  rawData: MarketStreamData | SymbolStreamData | null;
  narrative: string;
  generatedAt: string;
  streaming: boolean;
  error: string;
}

// ── Parsing helpers ────────────────────────────────────────────────────────────

function parseScorecard(narrative: string): { label: string; signal: string; fact: string }[] {
  const rows: { label: string; signal: string; fact: string }[] = [];
  let inTable = false;
  for (const line of narrative.split("\n")) {
    if (line.includes("| Stream") || line.includes("| FII/DII") || line.includes("|---")) {
      inTable = true; continue;
    }
    if (inTable && line.startsWith("|")) {
      const cols = line.split("|").map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3) rows.push({ label: cols[0], signal: cols[1], fact: cols[2] });
    } else if (inTable && !line.startsWith("|")) {
      break;
    }
  }
  return rows;
}

function extractNarrative(text: string): string {
  const match = text.match(/## Smart Money Signal\n([\s\S]*?)(?=## Confidence|$)/);
  return match ? match[1].trim() : "";
}

function extractConfidence(text: string): { level: string; reason: string } {
  const match = text.match(/## Confidence:\s*(HIGH|MEDIUM|LOW)\n?([\s\S]*?)$/i);
  if (!match) return { level: "", reason: "" };
  const reason = match[2].replace(/^Reason:\s*/i, "").trim();
  return { level: match[1], reason };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: string }) {
  const cls: Record<string, string> = {
    HIGH: "text-teal border-teal/30 bg-teal/10",
    MEDIUM: "text-amber border-amber/30 bg-amber/10",
    LOW: "text-danger border-danger/30 bg-danger/10",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${cls[level.toUpperCase()] ?? "text-muted border-border"}`}>
      {level}
    </span>
  );
}

function RawMarketScorecard({ data }: { data: MarketStreamData }) {
  const latestFii = data.fiiDii.at(-1);
  const rows = [
    {
      label: "FII/DII Flows",
      signal: latestFii ? (latestFii.fiiEquityNet >= 0 ? "🟢" : "🔴") : "—",
      fact: latestFii
        ? `FII ${latestFii.fiiEquityNet >= 0 ? "+" : ""}${latestFii.fiiEquityNet.toFixed(0)}Cr | DII ${latestFii.diiEquityNet >= 0 ? "+" : ""}${latestFii.diiEquityNet.toFixed(0)}Cr (${latestFii.date})`
        : "No data",
    },
    {
      label: "Deal Flow",
      signal: data.dealFlow.totalDeals > 0 ? (data.dealFlow.netCr >= 0 ? "🟢" : "🔴") : "—",
      fact: data.dealFlow.totalDeals > 0
        ? `${data.dealFlow.totalDeals} deals | Net ${data.dealFlow.netCr >= 0 ? "+" : ""}${data.dealFlow.netCr.toFixed(0)}Cr`
        : "No institutional deals today",
    },
    {
      label: "News",
      signal: data.newsHeadlines.length > 0 ? "⚪" : "—",
      fact: data.newsHeadlines.length > 0
        ? `${data.newsHeadlines.length} headlines — ${data.newsHeadlines[0]?.title?.slice(0, 50)}…`
        : "No headlines",
    },
    {
      label: "Filings",
      signal: data.keyFilings.length > 0 ? "⚪" : "—",
      fact: data.keyFilings.length > 0
        ? `${data.keyFilings.length} filings — ${data.keyFilings[0]?.company}: ${data.keyFilings[0]?.title?.slice(0, 40)}…`
        : "No recent filings",
    },
  ];
  return <ScorecardTable rows={rows} />;
}

function RawSymbolScorecard({ data }: { data: SymbolStreamData }) {
  const latestFii = data.fiiDii.at(-1);
  const firstInsider = data.insiders[0];
  const rows = [
    {
      label: "Insiders",
      signal: firstInsider
        ? (firstInsider.transactionType === "Buy" ? "🟢" : firstInsider.transactionType === "Sell" ? "🔴" : "⚪")
        : "—",
      fact: firstInsider
        ? `${firstInsider.name} ${firstInsider.transactionType} ${firstInsider.sharesTransacted.toLocaleString()} shares`
        : "No disclosures (90d)",
    },
    {
      label: "Bulk/Block",
      signal: data.bulkBlockDeals.length > 0 ? "⚪" : "—",
      fact: data.bulkBlockDeals.length > 0
        ? `${data.bulkBlockDeals.length} deal(s) — ₹${data.bulkBlockDeals.reduce((s, d) => s + d.valueCr, 0).toFixed(1)}Cr today`
        : "No deals today",
    },
    {
      label: "FII/DII",
      signal: latestFii ? (latestFii.fiiEquityNet >= 0 ? "🟢" : "🔴") : "—",
      fact: latestFii
        ? `FII ${latestFii.fiiEquityNet >= 0 ? "+" : ""}${latestFii.fiiEquityNet.toFixed(0)}Cr (market-wide, ${latestFii.date})`
        : "No data",
    },
    {
      label: "Filings",
      signal: data.announcements.length > 0 ? "⚪" : "—",
      fact: data.announcements.length > 0
        ? `${data.announcements.length} recent — ${data.announcements[0]?.title?.slice(0, 45)}…`
        : "No announcements",
    },
  ];
  return <ScorecardTable rows={rows} />;
}

function ScorecardTable({ rows }: { rows: { label: string; signal: string; fact: string }[] }) {
  return (
    <table className="w-full text-[10px] font-mono mb-3">
      <thead>
        <tr className="border-b border-border text-muted uppercase tracking-widest">
          <th className="text-left font-normal py-1.5 pr-3 w-28">Stream</th>
          <th className="text-center font-normal py-1.5 w-6">Sig</th>
          <th className="text-left font-normal py-1.5 pl-2">Key Fact</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.label} className="border-b border-border/40">
            <td className="py-1.5 pr-3 text-muted whitespace-nowrap">{r.label}</td>
            <td className="py-1.5 text-center">{r.signal}</td>
            <td className="py-1.5 pl-2 text-primary/80 truncate max-w-[300px]">{r.fact}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SignalCard({
  state,
  onRefresh,
  onRemove,
}: {
  state: SignalState;
  onRefresh: (symbol: string) => void;
  onRemove?: (symbol: string) => void;
}) {
  const confidence = extractConfidence(state.narrative);
  const narrativeText = extractNarrative(state.narrative);
  const scorecardRows = parseScorecard(state.narrative);
  const isMarket = state.symbol === "MARKET";

  return (
    <div className="glass-panel rounded-xl p-4 mb-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-primary font-semibold text-sm font-mono">
            {isMarket ? "NIFTY · SENSEX · MARKET" : state.symbol}
          </span>
          {confidence.level && <ConfidenceBadge level={confidence.level} />}
        </div>
        <div className="flex items-center gap-2">
          {state.generatedAt && (
            <span className="text-muted text-[10px] font-mono">
              {new Date(state.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => onRefresh(state.symbol)}
            disabled={state.streaming}
            className="text-muted hover:text-primary transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-3 h-3 ${state.streaming ? "animate-spin" : ""}`} />
          </button>
          {!isMarket && onRemove && (
            <button
              onClick={() => onRemove(state.symbol)}
              className="text-muted hover:text-danger transition-colors"
              title="Remove"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Raw scorecard — renders immediately */}
      {state.rawData && !scorecardRows.length && (
        state.rawData.mode === "market"
          ? <RawMarketScorecard data={state.rawData as MarketStreamData} />
          : <RawSymbolScorecard data={state.rawData as SymbolStreamData} />
      )}

      {/* LLM scorecard — replaces raw once Ollama has the table */}
      {scorecardRows.length > 0 && <ScorecardTable rows={scorecardRows} />}

      {/* Narrative */}
      {state.streaming && !narrativeText && (
        <div className="flex items-center gap-2 text-muted text-xs font-mono py-2">
          <span className="animate-pulse text-amber">●</span> Generating insight…
        </div>
      )}
      {narrativeText && (
        <p className="text-primary text-[11px] font-mono leading-relaxed">
          {narrativeText}
          {state.streaming && <span className="animate-pulse text-amber">▋</span>}
        </p>
      )}
      {confidence.reason && !state.streaming && (
        <p className="text-muted text-[10px] font-mono mt-2 italic">{confidence.reason}</p>
      )}

      {state.error && (
        <div className="flex items-center gap-2 text-danger text-[10px] font-mono mt-2">
          <AlertCircle className="w-3 h-3" /> {state.error}
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="glass-panel rounded-xl p-4 mb-3 animate-pulse">
      <div className="h-3 bg-border rounded w-40 mb-3" />
      <div className="h-2 bg-border rounded w-full mb-2" />
      <div className="h-2 bg-border rounded w-3/4 mb-2" />
      <div className="h-2 bg-border rounded w-1/2" />
    </div>
  );
}

// ── Main Widget ────────────────────────────────────────────────────────────────

export function SmartMoneyWidget() {
  const [signals, setSignals] = useState<Record<string, SignalState>>({});
  const [searchValue, setSearchValue] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [symbolOrder, setSymbolOrder] = useState<string[]>([]);
  const abortRefs = useRef<Record<string, AbortController>>({});

  const streamSignal = useCallback(async (symbol: string, isSearch = false) => {
    const key = symbol.toUpperCase().trim();
    if (!key) return;

    abortRefs.current[key]?.abort();
    const ctrl = new AbortController();
    abortRefs.current[key] = ctrl;

    setSignals(prev => ({
      ...prev,
      [key]: { symbol: key, rawData: null, narrative: "", generatedAt: "", streaming: true, error: "" },
    }));

    if (isSearch) {
      setSearchLoading(true);
      setSymbolOrder(prev => prev.includes(key) ? prev : [key, ...prev]);
    }

    try {
      const res = await fetch(`/api/smart-money/${key}`, { signal: ctrl.signal });
      const contentType = res.headers.get("content-type") ?? "";

      // Cached — plain JSON
      if (contentType.includes("application/json")) {
        const json = await res.json() as { cached: boolean; signal: CachedSignal };
        if (json.cached && json.signal) {
          setSignals(prev => ({
            ...prev,
            [key]: {
              symbol: key,
              rawData: json.signal.rawData,
              narrative: json.signal.narrative,
              generatedAt: json.signal.generatedAt,
              streaming: false,
              error: "",
            },
          }));
        }
        return;
      }

      // SSE stream
      if (!res.body) throw new Error("No stream body");
      const reader = res.body.getReader();
      const dec = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const msg = JSON.parse(line.slice(6)) as {
              type: string;
              data?: MarketStreamData | SymbolStreamData;
              token?: string;
              signal?: CachedSignal;
              message?: string;
            };
            if (msg.type === "raw" && msg.data) {
              setSignals(prev => ({ ...prev, [key]: { ...prev[key], rawData: msg.data! } }));
            } else if (msg.type === "token" && msg.token) {
              setSignals(prev => ({ ...prev, [key]: { ...prev[key], narrative: (prev[key]?.narrative ?? "") + msg.token } }));
            } else if (msg.type === "done" && msg.signal) {
              setSignals(prev => ({
                ...prev,
                [key]: { ...prev[key], narrative: msg.signal!.narrative, generatedAt: msg.signal!.generatedAt, streaming: false },
              }));
            } else if (msg.type === "error") {
              setSignals(prev => ({ ...prev, [key]: { ...prev[key], streaming: false, error: msg.message ?? "Error" } }));
            }
          } catch { /* malformed SSE */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setSignals(prev => ({
        ...prev,
        [key]: { ...(prev[key] ?? { symbol: key, rawData: null, narrative: "", generatedAt: "" }), streaming: false, error: "Failed to load." },
      }));
    } finally {
      if (isSearch) setSearchLoading(false);
    }
  }, []);

  // Load market overview on mount
  useEffect(() => {
    streamSignal("MARKET");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const sym = searchValue.trim().toUpperCase();
    if (!sym || sym === "MARKET") return;
    streamSignal(sym, true);
    setSearchValue("");
  }

  function removeSymbol(symbol: string) {
    abortRefs.current[symbol]?.abort();
    setSignals(prev => { const n = { ...prev }; delete n[symbol]; return n; });
    setSymbolOrder(prev => prev.filter(s => s !== symbol));
  }

  // Market card first, then searched symbols newest-first
  const displayOrder = ["MARKET", ...symbolOrder.filter(s => s !== "MARKET")];

  return (
    <div className="glass-panel rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-amber" />
          <h2 className="font-display text-base font-semibold text-primary tracking-tight">
            Smart Money Signals
          </h2>
        </div>
        <span className="text-[10px] font-mono text-muted">llama3.1:8b</span>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input
            type="text"
            value={searchValue}
            onChange={e => setSearchValue(e.target.value.toUpperCase())}
            placeholder="Analyse a stock symbol…"
            className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-surface border border-border rounded-lg text-primary placeholder:text-muted focus:outline-none focus:border-amber/50 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={!searchValue.trim() || searchLoading}
          className="px-3 py-2 text-[11px] font-mono bg-amber/10 text-amber border border-amber/20 rounded-lg hover:bg-amber/20 transition-colors disabled:opacity-40"
        >
          {searchLoading ? "…" : "Go"}
        </button>
      </form>

      {/* Cards */}
      <div>
        {displayOrder.map(symbol => {
          const state = signals[symbol];
          if (!state) return <SkeletonCard key={symbol} />;
          return (
            <SignalCard
              key={symbol}
              state={state}
              onRefresh={sym => streamSignal(sym, sym !== "MARKET")}
              onRemove={symbol !== "MARKET" ? removeSymbol : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
