"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Brain, RefreshCw, Search, AlertCircle } from "lucide-react";
import type { CachedSignal, StreamData } from "@/lib/smart-money";
import type { InsiderDisclosure } from "@/app/api/insider/[symbol]/route";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SignalState {
  symbol: string;
  rawData: StreamData | null;
  narrative: string;
  generatedAt: string;
  streaming: boolean;
  error: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseScorecard(narrative: string): { stream: string; signal: string; fact: string }[] {
  const lines = narrative.split("\n");
  const rows: { stream: string; signal: string; fact: string }[] = [];
  let inTable = false;
  for (const line of lines) {
    if (line.includes("| Stream") || line.includes("|---")) { inTable = true; continue; }
    if (inTable && line.startsWith("|")) {
      const cols = line.split("|").map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        rows.push({ stream: cols[0], signal: cols[1], fact: cols[2] });
      }
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
  const match = text.match(/## Confidence:\s*(HIGH|MEDIUM|LOW)\n([\s\S]*?)$/i);
  if (!match) return { level: "", reason: "" };
  return { level: match[1], reason: match[2].trim() };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: string }) {
  const colours: Record<string, string> = {
    HIGH: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    MEDIUM: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    LOW: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const cls = colours[level.toUpperCase()] ?? "bg-white/5 text-white/40 border-white/10";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${cls}`}>
      {level}
    </span>
  );
}

function RawScorecard({ data }: { data: StreamData }) {
  const rows = [
    {
      label: "Insider Activity",
      value: data.insiders.length
        ? `${data.insiders.length} disclosure${data.insiders.length > 1 ? "s" : ""} — latest: ${(data.insiders[0] as InsiderDisclosure).transactionType ?? "—"}`
        : "No recent disclosures",
      signal: data.insiders.length
        ? ((data.insiders[0] as InsiderDisclosure).transactionType === "Buy" ? "🟢" : "🔴")
        : "—",
    },
    {
      label: "Bulk/Block Deals",
      value: data.bulkBlockDeals.length
        ? `${data.bulkBlockDeals.length} deal${data.bulkBlockDeals.length > 1 ? "s" : ""} — ₹${data.bulkBlockDeals.reduce((s, d) => s + d.valueCr, 0).toFixed(1)}Cr`
        : "No deals found",
      signal: data.bulkBlockDeals.length ? "⚪" : "—",
    },
    {
      label: "FII/DII Flows",
      value: data.fiiDii.length
        ? `FII ${data.fiiDii[data.fiiDii.length - 1].fiiEquityNet >= 0 ? "+" : ""}${data.fiiDii[data.fiiDii.length - 1].fiiEquityNet.toFixed(0)}Cr (latest day)`
        : "No data",
      signal: data.fiiDii.length
        ? (data.fiiDii[data.fiiDii.length - 1].fiiEquityNet >= 0 ? "🟢" : "🔴")
        : "—",
    },
    {
      label: "BSE Announcements",
      value: data.announcements.length
        ? `${data.announcements.length} recent — ${data.announcements[0]?.title?.slice(0, 40) ?? ""}…`
        : "No announcements",
      signal: data.announcements.length ? "⚪" : "—",
    },
  ];

  return (
    <table className="w-full text-[10px] font-mono mb-3">
      <thead>
        <tr className="border-b border-white/10 text-white/40 uppercase tracking-widest">
          <th className="text-left font-normal py-1.5 pr-3">Stream</th>
          <th className="text-center font-normal py-1.5 w-8">Signal</th>
          <th className="text-left font-normal py-1.5 pl-2">Key Fact</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.label} className="border-b border-white/5">
            <td className="py-1.5 pr-3 text-white/40 whitespace-nowrap">{r.label}</td>
            <td className="py-1.5 text-center">{r.signal}</td>
            <td className="py-1.5 pl-2 text-white/80 truncate max-w-[280px]">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SignalCard({
  state,
  onRefresh,
}: {
  state: SignalState;
  onRefresh: (symbol: string) => void;
}) {
  const confidence = extractConfidence(state.narrative);
  const narrativeText = extractNarrative(state.narrative);
  const scorecardRows = parseScorecard(state.narrative);

  return (
    <div className="bg-[#13151E] border border-[#1E2235] rounded-xl p-4 mb-3">
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[#F0EDE8] font-semibold text-sm font-mono">{state.symbol}</span>
          {confidence.level && <ConfidenceBadge level={confidence.level} />}
        </div>
        <div className="flex items-center gap-2">
          {state.generatedAt && (
            <span className="text-white/30 text-[10px] font-mono">
              {new Date(state.generatedAt).toLocaleTimeString("en-IN")}
            </span>
          )}
          <button
            onClick={() => onRefresh(state.symbol)}
            disabled={state.streaming}
            className="text-white/30 hover:text-white/70 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${state.streaming ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Raw scorecard — shows immediately from stream data */}
      {state.rawData && !scorecardRows.length && (
        <RawScorecard data={state.rawData} />
      )}

      {/* LLM scorecard — replaces raw once Ollama output has the table */}
      {scorecardRows.length > 0 && (
        <table className="w-full text-[10px] font-mono mb-3">
          <thead>
            <tr className="border-b border-white/10 text-white/40 uppercase tracking-widest">
              <th className="text-left font-normal py-1.5 pr-3">Stream</th>
              <th className="text-center font-normal py-1.5 w-8">Signal</th>
              <th className="text-left font-normal py-1.5 pl-2">Key Fact</th>
            </tr>
          </thead>
          <tbody>
            {scorecardRows.map(r => (
              <tr key={r.stream} className="border-b border-white/5">
                <td className="py-1.5 pr-3 text-white/40 whitespace-nowrap">{r.stream}</td>
                <td className="py-1.5 text-center">{r.signal}</td>
                <td className="py-1.5 pl-2 text-white/80">{r.fact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Narrative */}
      {state.streaming && !narrativeText && (
        <div className="flex items-center gap-2 text-white/30 text-xs font-mono py-2">
          <span className="animate-pulse">●</span> Generating insight…
        </div>
      )}
      {narrativeText && (
        <p className="text-[#F0EDE8] text-[11px] font-mono leading-relaxed">
          {narrativeText}
          {state.streaming && <span className="animate-pulse text-[#F5820D]">▋</span>}
        </p>
      )}
      {confidence.reason && !state.streaming && (
        <p className="text-white/30 text-[10px] font-mono mt-2 italic">{confidence.reason}</p>
      )}

      {/* Error */}
      {state.error && (
        <div className="flex items-center gap-2 text-red-400 text-[10px] font-mono mt-2">
          <AlertCircle className="w-3 h-3" /> {state.error}
        </div>
      )}
    </div>
  );
}

// ── Main Widget ────────────────────────────────────────────────────────────────

const DEFAULT_WATCHLIST = ["SBIN", "RELIANCE", "HDFCBANK", "INFY", "AXISBANK"];

export function SmartMoneyWidget() {
  const [signals, setSignals] = useState<Record<string, SignalState>>({});
  const [searchValue, setSearchValue] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const abortRefs = useRef<Record<string, AbortController>>({});

  const streamSignal = useCallback(async (symbol: string, isSearch = false) => {
    const upper = symbol.toUpperCase().trim();
    if (!upper) return;

    abortRefs.current[upper]?.abort();
    const ctrl = new AbortController();
    abortRefs.current[upper] = ctrl;

    setSignals(prev => ({
      ...prev,
      [upper]: {
        symbol: upper,
        rawData: null,
        narrative: "",
        generatedAt: "",
        streaming: true,
        error: "",
      },
    }));

    if (isSearch) setSearchLoading(true);

    try {
      const res = await fetch(`/api/smart-money/${upper}`, { signal: ctrl.signal });

      // Cached — plain JSON
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = await res.json() as { cached: boolean; signal: CachedSignal };
        if (json.cached && json.signal) {
          setSignals(prev => ({
            ...prev,
            [upper]: {
              symbol: upper,
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

        const lines = dec.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const msg = JSON.parse(line.slice(6)) as {
              type: string;
              data?: StreamData;
              token?: string;
              signal?: CachedSignal;
              message?: string;
            };

            if (msg.type === "raw" && msg.data) {
              setSignals(prev => ({
                ...prev,
                [upper]: { ...prev[upper], rawData: msg.data! },
              }));
            } else if (msg.type === "token" && msg.token) {
              setSignals(prev => ({
                ...prev,
                [upper]: { ...prev[upper], narrative: (prev[upper]?.narrative ?? "") + msg.token },
              }));
            } else if (msg.type === "done" && msg.signal) {
              setSignals(prev => ({
                ...prev,
                [upper]: {
                  ...prev[upper],
                  narrative: msg.signal!.narrative,
                  generatedAt: msg.signal!.generatedAt,
                  streaming: false,
                },
              }));
            } else if (msg.type === "error") {
              setSignals(prev => ({
                ...prev,
                [upper]: { ...prev[upper], streaming: false, error: msg.message ?? "Error" },
              }));
            }
          } catch { /* malformed SSE line */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setSignals(prev => ({
        ...prev,
        [upper]: {
          ...(prev[upper] ?? { symbol: upper, rawData: null, narrative: "", generatedAt: "" }),
          streaming: false,
          error: "Failed to load signal.",
        },
      }));
    } finally {
      if (isSearch) setSearchLoading(false);
    }
  }, []);

  // Load watchlist sequentially on mount
  useEffect(() => {
    let cancelled = false;
    async function loadSequentially() {
      for (const symbol of DEFAULT_WATCHLIST) {
        if (cancelled) break;
        await streamSignal(symbol);
        await new Promise(r => setTimeout(r, 500));
      }
    }
    loadSequentially();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const sym = searchValue.trim().toUpperCase();
    if (!sym) return;
    streamSignal(sym, true);
    setSearchValue("");
  }

  const watchlistSet = new Set(DEFAULT_WATCHLIST);
  const onDemandSymbols = Object.keys(signals).filter(s => !watchlistSet.has(s));
  const displayOrder = [...onDemandSymbols, ...DEFAULT_WATCHLIST];

  return (
    <div className="bg-[#13151E] border border-[#1E2235] rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-[#F5820D]" />
          <h2 className="font-serif text-lg font-semibold text-[#F0EDE8] tracking-tight">
            Smart Money Signals
          </h2>
        </div>
        <span className="text-[10px] font-mono text-white/30">Ollama · llama3.1:8b</span>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={searchValue}
            onChange={e => setSearchValue(e.target.value.toUpperCase())}
            placeholder="Analyse any symbol…"
            className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-[#0C0E14] border border-[#1E2235] rounded-lg text-[#F0EDE8] placeholder:text-white/20 focus:outline-none focus:border-[#F5820D]/50"
          />
        </div>
        <button
          type="submit"
          disabled={!searchValue.trim() || searchLoading}
          className="px-3 py-2 text-[11px] font-mono bg-[#F5820D]/10 text-[#F5820D] border border-[#F5820D]/20 rounded-lg hover:bg-[#F5820D]/20 transition-colors disabled:opacity-40"
        >
          {searchLoading ? "…" : "Go"}
        </button>
      </form>

      {/* Signal cards */}
      <div>
        {displayOrder.map(symbol =>
          signals[symbol] ? (
            <SignalCard
              key={symbol}
              state={signals[symbol]}
              onRefresh={sym => streamSignal(sym, false)}
            />
          ) : (
            <div key={symbol} className="bg-[#13151E] border border-[#1E2235]/60 rounded-xl p-4 mb-3 animate-pulse">
              <div className="h-3 bg-white/5 rounded w-24 mb-3" />
              <div className="h-2 bg-white/5 rounded w-full mb-2" />
              <div className="h-2 bg-white/5 rounded w-3/4" />
            </div>
          )
        )}
      </div>
    </div>
  );
}
