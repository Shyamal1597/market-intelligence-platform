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
  noData?: boolean;     // true when no symbol-specific streams have data
}

// ── Parsing helpers ────────────────────────────────────────────────────────────

function parseScorecard(narrative: string): { label: string; signal: string; fact: string }[] {
  const rows: { label: string; signal: string; fact: string }[] = [];
  let inTable = false;
  for (const line of narrative.split("\n")) {
    // Detect header row (contains "Stream" or "---|") and separator rows
    if (line.includes("| Stream") || /\|[-\s]+\|/.test(line)) {
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
  const levelMatch = text.match(/## Confidence:\s*(HIGH|MEDIUM|LOW)/i);
  const reasonMatch = text.match(/Reason:\s*([^\n]+)/i);
  if (!levelMatch) return { level: "", reason: "" };
  return {
    level: levelMatch[1],
    reason: reasonMatch ? reasonMatch[1].trim() : "",
  };
}

/** Extract { label → { signal, fact } } map from parsed scorecard rows */
function scorecardFactMap(rows: { label: string; signal: string; fact: string }[]): Record<string, { signal: string; fact: string }> {
  const map: Record<string, { signal: string; fact: string }> = {};
  for (const r of rows) {
    map[r.label.trim().toLowerCase()] = { signal: r.signal, fact: r.fact };
  }
  return map;
}

/**
 * Parse the ## Stream Insights block emitted by the new prompt format.
 * Returns a map of lowercased label → insight sentence.
 * e.g. "fii/dii flows" → "DII absorbed ₹8,593Cr net on Apr 8..."
 */
function parseStreamInsights(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  const block = text.match(/## Stream Insights\n([\s\S]*?)(?=##|$)/);
  if (!block) return map;
  for (const line of block[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const label = line.slice(0, colon).trim().toLowerCase();
    const insight = line.slice(colon + 1).trim();
    if (label && insight) map[label] = insight;
  }
  return map;
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

function StreamHeader({
  label,
  signal,
  llmSignal,
}: {
  label: string;
  signal: string;
  llmSignal?: string;
}) {
  const sigEmoji = signal.match(/^(🟢|🔴|⚪|—)/)?.[0] ?? signal;
  const badgeCls: Record<string, string> = {
    Bullish: "text-teal border-teal/30 bg-teal/10",
    Bearish: "text-danger border-danger/30 bg-danger/10",
    Neutral: "text-muted border-border bg-surface",
  };
  const badge = llmSignal?.match(/Bullish|Bearish|Neutral/i)?.[0];
  return (
    <div className="flex items-center justify-between mb-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-base leading-none">{sigEmoji}</span>
        <span className="text-[10px] font-mono font-semibold text-muted uppercase tracking-widest">{label}</span>
      </div>
      {badge && (
        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badgeCls[badge] ?? "text-muted border-border"}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

function StreamFact({ fact, streaming }: { fact?: string; streaming: boolean }) {
  if (!fact && !streaming) return null;
  return (
    <div className="mt-1.5 pt-1.5 border-t border-border/30 text-[10px] font-mono text-primary/70 leading-relaxed min-h-[1.2rem]">
      {fact
        ? <span>▸ {fact}</span>
        : <span className="text-muted animate-pulse">▸ …</span>
      }
    </div>
  );
}

function FiiDiiSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: MarketStreamData | SymbolStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  const fiiDii = data.fiiDii;
  const latest = fiiDii.at(-1);
  const rawSignal = latest ? (latest.fiiEquityNet >= 0 ? "🟢" : "🔴") : "—";
  const cumFii = fiiDii.reduce((s, d) => s + d.fiiEquityNet, 0);
  const cumDii = fiiDii.reduce((s, d) => s + d.diiEquityNet, 0);

  return (
    <div className="mb-3 pb-3 border-b border-border/40">
      <StreamHeader label="FII / DII Flows" signal={rawSignal} llmSignal={llmRawSignal} />
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="text-muted">
            <th className="text-left font-normal pb-1 pr-2 w-20">Date</th>
            <th className="text-right font-normal pb-1 pr-2">FII Net</th>
            <th className="text-right font-normal pb-1">DII Net</th>
          </tr>
        </thead>
        <tbody>
          {fiiDii.slice(-2).map(d => (
            <tr key={d.date}>
              <td className="pr-2 py-0.5 text-muted">{d.date.slice(5)}</td>
              <td className={`text-right pr-2 py-0.5 ${d.fiiEquityNet >= 0 ? "text-teal" : "text-danger"}`}>
                {d.fiiEquityNet >= 0 ? "+" : ""}{d.fiiEquityNet.toFixed(0)}Cr
              </td>
              <td className={`text-right py-0.5 ${d.diiEquityNet >= 0 ? "text-teal" : "text-danger"}`}>
                {d.diiEquityNet >= 0 ? "+" : ""}{d.diiEquityNet.toFixed(0)}Cr
              </td>
            </tr>
          ))}
          {fiiDii.length > 1 && (
            <tr className="border-t border-border/40 font-semibold text-primary/80">
              <td className="pr-2 py-0.5 text-muted text-[9px]">7d total</td>
              <td className={`text-right pr-2 py-0.5 ${cumFii >= 0 ? "text-teal" : "text-danger"}`}>
                {cumFii >= 0 ? "+" : ""}{(cumFii / 100).toFixed(1)}kCr
              </td>
              <td className={`text-right py-0.5 ${cumDii >= 0 ? "text-teal" : "text-danger"}`}>
                {cumDii >= 0 ? "+" : ""}{(cumDii / 100).toFixed(1)}kCr
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
  );
}

function DealFlowSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: MarketStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  const { dealFlow } = data;
  const rawSignal = dealFlow.totalDeals > 0 ? (dealFlow.netCr >= 0 ? "🟢" : "🔴") : "—";

  return (
    <div className="mb-3 pb-3 border-b border-border/40">
      <StreamHeader label="Institutional Deal Flow" signal={rawSignal} llmSignal={llmRawSignal} />
      {dealFlow.totalDeals === 0 ? (
        <p className="text-muted text-[10px] font-mono">No bulk/block deals today</p>
      ) : (
        <>
          <div className="flex gap-4 text-[10px] font-mono mb-1.5">
            <span className="text-muted">{dealFlow.totalDeals} deals</span>
            <span className="text-teal">Buy ₹{dealFlow.totalBuyCr.toFixed(0)}Cr</span>
            <span className="text-danger">Sell ₹{dealFlow.totalSellCr.toFixed(0)}Cr</span>
            <span className={`font-semibold ${dealFlow.netCr >= 0 ? "text-teal" : "text-danger"}`}>
              Net {dealFlow.netCr >= 0 ? "+" : ""}{dealFlow.netCr.toFixed(0)}Cr
            </span>
          </div>
          {dealFlow.topDeals?.slice(0, 5).map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-mono py-0.5">
              <span className={`px-1 py-px rounded text-[9px] font-bold ${d.side === "BUY" ? "bg-teal/10 text-teal" : "bg-danger/10 text-danger"}`}>
                {d.side}
              </span>
              <span className="text-primary/70 truncate flex-1">{d.institution || "—"}</span>
              <span className="text-muted shrink-0">{d.symbol}</span>
              <span className="text-primary/80 shrink-0">₹{d.valueCr.toFixed(1)}Cr</span>
            </div>
          ))}
        </>
      )}
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
  );
}

function NewsSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: MarketStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  const rawSignal = data.newsHeadlines.length > 0 ? "⚪" : "—";

  return (
    <div className="mb-3 pb-3 border-b border-border/40">
      <StreamHeader label="Market News Sentiment" signal={rawSignal} llmSignal={llmRawSignal} />
      {data.newsHeadlines.length === 0 ? (
        <p className="text-muted text-[10px] font-mono">No headlines</p>
      ) : (
        <div className="space-y-1.5">
          {data.newsHeadlines.slice(0, 5).map((n, i) => (
            <div key={i} className="text-[10px] font-mono">
              <div className="flex items-start gap-1.5">
                <span className="text-amber/70 shrink-0 text-[9px] mt-px">[{n.source}]</span>
                <span className="text-primary/80 leading-snug">{n.title}</span>
              </div>
              {n.content && (
                <p className="text-muted ml-0 mt-0.5 leading-snug text-[9px] line-clamp-2">{n.content}</p>
              )}
            </div>
          ))}
          {data.newsHeadlines.length > 5 && (
            <p className="text-muted text-[9px] font-mono">+{data.newsHeadlines.length - 5} more headlines</p>
          )}
        </div>
      )}
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
  );
}

function FilingsSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: MarketStreamData | SymbolStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  const filings = data.mode === "market"
    ? (data as MarketStreamData).keyFilings
    : (data as SymbolStreamData).announcements.map(a => ({ date: a.date, company: "", title: a.title }));
  const rawSignal = filings.length > 0 ? "⚪" : "—";

  return (
    <div className="mb-2">
      <StreamHeader label="Corporate Filings" signal={rawSignal} llmSignal={llmRawSignal} />
      {filings.length === 0 ? (
        <p className="text-muted text-[10px] font-mono">No recent filings</p>
      ) : (
        <div className="space-y-1">
          {filings.slice(0, 6).map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px] font-mono">
              <span className="text-muted shrink-0">{f.date ? f.date.slice(0, 10) : "—"}</span>
              {f.company && <span className="text-amber/80 shrink-0 max-w-[80px] truncate">{f.company}</span>}
              <span className="text-primary/70 leading-snug">{f.title || "Filing"}</span>
            </div>
          ))}
          {filings.length > 6 && (
            <p className="text-muted text-[9px] font-mono">+{filings.length - 6} more filings</p>
          )}
        </div>
      )}
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
  );
}

function InsiderSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: SymbolStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  // Filter out 0-share "Other" disclosure filings — only show actual buy/sell/pledge transactions
  const insiders = data.insiders.filter(i => i.sharesTransacted > 0);
  const first = insiders[0];
  const rawSignal = first
    ? (first.transactionType === "Buy" ? "🟢" : first.transactionType === "Sell" ? "🔴" : "⚪")
    : "—";

  return (
    <div className="mb-3 pb-3 border-b border-border/40">
      <StreamHeader label="Insider Activity" signal={rawSignal} llmSignal={llmRawSignal} />
      {insiders.length === 0 ? (
        <p className="text-muted text-[10px] font-mono">No insider transactions in last 90 days</p>
      ) : (
        <div className="space-y-1">
          {insiders.slice(0, 5).map((ins, i) => (
            <div key={i} className="text-[10px] font-mono">
              <div className="flex items-center gap-2">
                <span className="text-muted shrink-0">{ins.date}</span>
                <span className={`px-1 py-px rounded text-[9px] font-bold shrink-0 ${ins.transactionType === "Buy" ? "bg-teal/10 text-teal" : ins.transactionType === "Sell" ? "bg-danger/10 text-danger" : "bg-border text-muted"}`}>
                  {ins.transactionType}
                </span>
                <span className="text-primary/80 truncate">{ins.name}</span>
              </div>
              <div className="text-muted ml-0 text-[9px]">
                {ins.sharesTransacted.toLocaleString()} shares · {ins.beforePct.toFixed(2)}% → {ins.afterPct.toFixed(2)}% · {ins.category}
              </div>
            </div>
          ))}
          {insiders.length > 5 && (
            <p className="text-muted text-[9px] font-mono">+{insiders.length - 5} more transactions</p>
          )}
        </div>
      )}
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
  );
}

function StockNewsSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: SymbolStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  const { stockNews, symbol } = data;
  const rawSignal = stockNews.length > 0 ? "⚪" : "—";

  return (
    <div className="mb-3 pb-3 border-b border-border/40">
      <StreamHeader label="Stock News" signal={rawSignal} llmSignal={llmRawSignal} />
      {stockNews.length === 0 ? (
        <p className="text-muted text-[10px] font-mono">No recent news mentioning {symbol}</p>
      ) : (
        <div className="space-y-1.5">
          {stockNews.slice(0, 5).map((n, i) => (
            <div key={i} className="text-[10px] font-mono">
              <div className="flex items-start gap-1.5">
                <span className="text-amber/70 shrink-0 text-[9px] mt-px">[{n.source}]</span>
                <span className="text-primary/80 leading-snug">{n.title}</span>
              </div>
              {n.content && (
                <p className="text-muted mt-0.5 leading-snug text-[9px] line-clamp-2">{n.content}</p>
              )}
            </div>
          ))}
          {stockNews.length > 5 && (
            <p className="text-muted text-[9px] font-mono">+{stockNews.length - 5} more articles</p>
          )}
        </div>
      )}
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
  );
}

function BulkBlockSection({
  data,
  llmFact,
  llmRawSignal,
  streaming,
}: {
  data: SymbolStreamData;
  llmFact?: string;
  llmRawSignal?: string;
  streaming: boolean;
}) {
  const { bulkBlockDeals } = data;
  const rawSignal = bulkBlockDeals.length > 0 ? "⚪" : "—";

  return (
    <div className="mb-3 pb-3 border-b border-border/40">
      <StreamHeader label="Bulk / Block Deals" signal={rawSignal} llmSignal={llmRawSignal} />
      {bulkBlockDeals.length === 0 ? (
        <p className="text-muted text-[10px] font-mono">No deals today</p>
      ) : (
        <div className="space-y-1">
          {bulkBlockDeals.slice(0, 10).map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
              <span className={`px-1 py-px rounded text-[9px] font-bold ${d.side === "BUY" ? "bg-teal/10 text-teal" : "bg-danger/10 text-danger"}`}>
                {d.side}
              </span>
              <span className="text-primary/70 truncate flex-1">{d.client}</span>
              <span className="text-primary/80 shrink-0">₹{d.valueCr.toFixed(1)}Cr</span>
            </div>
          ))}
          {bulkBlockDeals.length > 10 && (
            <p className="text-muted text-[9px] font-mono">+{bulkBlockDeals.length - 10} more deals</p>
          )}
        </div>
      )}
      <StreamFact fact={llmFact} streaming={streaming} />
    </div>
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
  const isMarket = state.symbol === "MARKET";

  const scorecardRows = parseScorecard(state.narrative);
  const factMap = scorecardFactMap(scorecardRows);
  const insightMap = parseStreamInsights(state.narrative);

  function getLlmEntry(key: string) {
    // Check stream insights first (richer per-stream sentences), fallback to scorecard key fact
    const insightEntry = Object.entries(insightMap).find(([k]) => k.includes(key));
    const scorecardEntry = Object.entries(factMap).find(([k]) => k.includes(key));
    const fact = insightEntry?.[1] ?? scorecardEntry?.[1]?.fact;
    const signal = scorecardEntry?.[1]?.signal;
    if (!fact && !signal) return undefined;
    return { signal: signal ?? "", fact: fact ?? "" };
  }

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

      {/* No data — symbol not found in any stream */}
      {state.noData && (
        <div className="flex items-center gap-2 text-muted text-xs font-mono py-3">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          No actionable data found for <span className="text-primary">{state.symbol}</span> — no insider disclosures, bulk/block deals, or filings in NSE/BSE feeds.
        </div>
      )}

      {/* Stream sections */}
      {!state.noData && state.rawData && (
        <div>
          {state.rawData.mode === "market" && (
            <>
              <FiiDiiSection
                data={state.rawData}
                llmFact={getLlmEntry("fii")?.fact}
                llmRawSignal={getLlmEntry("fii")?.signal}
                streaming={state.streaming}
              />
              <DealFlowSection
                data={state.rawData as MarketStreamData}
                llmFact={getLlmEntry("deal")?.fact}
                llmRawSignal={getLlmEntry("deal")?.signal}
                streaming={state.streaming}
              />
              <NewsSection
                data={state.rawData as MarketStreamData}
                llmFact={getLlmEntry("news")?.fact}
                llmRawSignal={getLlmEntry("news")?.signal}
                streaming={state.streaming}
              />
              <FilingsSection
                data={state.rawData}
                llmFact={getLlmEntry("corporate")?.fact ?? getLlmEntry("filing")?.fact}
                llmRawSignal={getLlmEntry("corporate")?.signal ?? getLlmEntry("filing")?.signal}
                streaming={state.streaming}
              />
            </>
          )}
          {state.rawData.mode === "symbol" && (
            <>
              <InsiderSection
                data={state.rawData as SymbolStreamData}
                llmFact={getLlmEntry("insider")?.fact}
                llmRawSignal={getLlmEntry("insider")?.signal}
                streaming={state.streaming}
              />
              <BulkBlockSection
                data={state.rawData as SymbolStreamData}
                llmFact={getLlmEntry("bulk")?.fact}
                llmRawSignal={getLlmEntry("bulk")?.signal}
                streaming={state.streaming}
              />
              <StockNewsSection
                data={state.rawData as SymbolStreamData}
                llmFact={getLlmEntry("stock news")?.fact ?? getLlmEntry("news")?.fact}
                llmRawSignal={getLlmEntry("stock news")?.signal ?? getLlmEntry("news")?.signal}
                streaming={state.streaming}
              />
              <FilingsSection
                data={state.rawData}
                llmFact={getLlmEntry("bse")?.fact ?? getLlmEntry("announce")?.fact ?? getLlmEntry("filing")?.fact}
                llmRawSignal={getLlmEntry("bse")?.signal ?? getLlmEntry("announce")?.signal ?? getLlmEntry("filing")?.signal}
                streaming={state.streaming}
              />
            </>
          )}
        </div>
      )}

      {/* Narrative */}
      {!state.noData && state.streaming && !narrativeText && (
        <div className="flex items-center gap-2 text-muted text-xs font-mono py-2">
          <span className="animate-pulse text-amber">●</span> Generating insight…
        </div>
      )}
      {!state.noData && narrativeText && (
        <p className="text-primary text-[11px] font-mono leading-relaxed">
          {narrativeText}
          {state.streaming && <span className="animate-pulse text-amber">▋</span>}
        </p>
      )}
      {!state.noData && confidence.reason && !state.streaming && (
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
  const [dropdownResults, setDropdownResults] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownIdx, setDropdownIdx] = useState(-1);
  const abortRefs = useRef<Record<string, AbortController>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      // Plain JSON responses: cached signal or no-data
      if (contentType.includes("application/json")) {
        const json = await res.json() as { cached: boolean; signal: CachedSignal; noData?: boolean };

        // No symbol-specific data found — block hallucination
        if (json.noData) {
          setSignals(prev => ({
            ...prev,
            [key]: { ...prev[key], streaming: false, noData: true },
          }));
          return;
        }

        // Cached signal
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

  // Debounced autocomplete fetch
  useEffect(() => {
    const q = searchValue.trim();
    if (!q) { setDropdownResults([]); setShowDropdown(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nse-symbols?q=${encodeURIComponent(q)}`);
        const json = await res.json() as { symbols: string[] };
        setDropdownResults(json.symbols ?? []);
        setShowDropdown((json.symbols ?? []).length > 0);
        setDropdownIdx(-1);
      } catch { /* ignore */ }
    }, 120);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchValue]);

  // Close dropdown on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (
        !searchRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) setShowDropdown(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function selectSymbol(sym: string) {
    setSearchValue("");
    setShowDropdown(false);
    setDropdownResults([]);
    streamSignal(sym, true);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const sym = searchValue.trim().toUpperCase();
    if (!sym || sym === "MARKET") return;
    selectSymbol(sym);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || dropdownResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDropdownIdx(i => Math.min(i + 1, dropdownResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDropdownIdx(i => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && dropdownIdx >= 0) {
      e.preventDefault();
      selectSymbol(dropdownResults[dropdownIdx]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
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

      {/* Search with autocomplete */}
      <form onSubmit={handleSearch} className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={searchValue}
            onChange={e => setSearchValue(e.target.value.toUpperCase())}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => dropdownResults.length > 0 && setShowDropdown(true)}
            placeholder="Analyse a stock symbol…"
            autoComplete="off"
            spellCheck={false}
            className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-surface border border-border rounded-lg text-primary placeholder:text-muted focus:outline-none focus:border-amber/50 transition-colors"
          />
          {/* Dropdown */}
          {showDropdown && dropdownResults.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-1 bg-[#13151E] border border-border rounded-lg shadow-xl z-50 overflow-hidden"
            >
              {dropdownResults.map((sym, i) => (
                <button
                  key={sym}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); selectSymbol(sym); }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-mono transition-colors ${
                    i === dropdownIdx
                      ? "bg-amber/10 text-amber"
                      : "text-primary/80 hover:bg-border/30 hover:text-primary"
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          )}
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
