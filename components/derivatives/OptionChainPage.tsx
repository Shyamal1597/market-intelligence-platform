"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import type { DerivativesData } from "@/lib/nse-derivatives";
import { SymbolSearch } from "./SymbolSearch";
import { ExpiryStrip } from "./ExpiryStrip";
import { ChainSummary } from "./ChainSummary";
import { ColumnToggle, useColumnConfig } from "./ColumnToggle";
import { OptionChainTable } from "./OptionChainTable";
import { VolatilityChart } from "./VolatilityChart";
import { clsx } from "clsx";

export type ActiveTab = "chain" | "volatility";
export type BarMode = "oi" | "volume";

function isMarketOpen(): boolean {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

export function OptionChainPage() {
  const [symbol, setSymbol] = useState("NIFTY");
  const [expiries, setExpiries] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [data, setData] = useState<DerivativesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ActiveTab>("chain");
  const [barMode, setBarMode] = useState<BarMode>("oi");
  const [countdown, setCountdown] = useState(30);
  const [columns, setColumns] = useColumnConfig();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingRef = useRef(false);

  const fetchExpiriesFn = useCallback(async (sym: string) => {
    const res = await fetch(`/api/option-chain/expiries?symbol=${sym}`);
    const json = await res.json();
    return (json.expiries ?? []) as string[];
  }, []);

  const fetchChain = useCallback(async (sym: string, expiry: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/option-chain?symbol=${sym}&expiry=${encodeURIComponent(expiry)}`
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json as DerivativesData);
      setCountdown(30);
    } catch (e) {
      setError(String(e));
      setData(null);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchExpiriesFn(symbol)
      .then((exp) => {
        setExpiries(exp);
        if (exp.length > 0) {
          setSelectedExpiry(exp[0]);
          return fetchChain(symbol, exp[0]);
        } else {
          setLoading(false);
          setError("No option chain available for this symbol");
        }
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [symbol, fetchExpiriesFn, fetchChain]);

  useEffect(() => {
    if (!selectedExpiry) return;
    // Don't start polling when market is closed -- NSE data is frozen after 15:30 IST
    if (!isMarketOpen()) return;

    intervalRef.current = setInterval(() => {
      if (document.hidden) return;
      // Stop polling if market closes mid-session
      if (!isMarketOpen()) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        return;
      }
      setCountdown((c) => {
        if (c <= 1) {
          fetchChain(symbol, selectedExpiry);
          return 30;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [symbol, selectedExpiry, fetchChain]);

  const manualRefresh = () => {
    setCountdown(30);
    if (selectedExpiry) fetchChain(symbol, selectedExpiry);
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>

      {/* -- Top bar ---------------------------------------------------- */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border flex-wrap gap-y-2">
        <SymbolSearch symbol={symbol} onSymbolChange={setSymbol} />

        {/* Tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["chain", "volatility"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "px-4 py-1.5 text-xs font-mono capitalize transition-colors",
                tab === t
                  ? "bg-amber/15 text-amber"
                  : "text-muted hover:text-primary"
              )}
            >
              {t === "volatility" ? "IV Skew" : "Chain"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* OI / Volume toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-mono">
            {(["oi", "volume"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setBarMode(m)}
                className={clsx(
                  "px-3 py-1.5 transition-colors uppercase tracking-wider",
                  barMode === m
                    ? "bg-surface text-primary"
                    : "text-muted hover:text-primary"
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <ColumnToggle config={columns} onChange={setColumns} />

          {/* Countdown + refresh */}
          <button
            onClick={manualRefresh}
            title="Refresh now"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted hover:text-primary text-xs font-mono transition-colors"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {loading ? "…" : isMarketOpen() ? `${countdown}s` : "EOD"}
          </button>
        </div>
      </div>

      {/* -- Expiry strip ----------------------------------------------- */}
      <div className="px-4 py-2.5 border-b border-border overflow-x-auto">
        <ExpiryStrip
          expiries={expiries}
          selected={selectedExpiry}
          onSelect={(e) => {
            setSelectedExpiry(e);
            fetchChain(symbol, e);
          }}
        />
      </div>

      {/* -- Summary strip ---------------------------------------------- */}
      {data && <ChainSummary data={data} />}

      {/* -- Loading / error states ------------------------------------- */}
      {!data && loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted font-mono text-sm animate-pulse">Loading option chain…</p>
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center gap-2">
          <p className="text-danger font-mono text-sm">
            {error.includes("NSE_SESSION_REQUIRED")
              ? "NSE session expired"
              : `Error: ${error}`}
          </p>
          <button
            onClick={manualRefresh}
            className="text-amber text-xs font-mono underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* -- Main content ----------------------------------------------- */}
      {!error && data && tab === "chain" && (
        <OptionChainTable data={data} barMode={barMode} columns={columns} />
      )}

      {!error && data && tab === "volatility" && (
        <VolatilityChart data={data} />
      )}
    </div>
  );
}
