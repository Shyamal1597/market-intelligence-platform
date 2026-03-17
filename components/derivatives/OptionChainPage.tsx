"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import type { DerivativesData } from "@/lib/nse-derivatives";
import { clsx } from "clsx";

export type ActiveTab = "chain" | "volatility";
export type BarMode = "oi" | "volume";

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchExpiries = useCallback(async (sym: string) => {
    const res = await fetch(`/api/option-chain/expiries?symbol=${sym}`);
    const json = await res.json();
    return (json.expiries ?? []) as string[];
  }, []);

  const fetchChain = useCallback(async (sym: string, expiry: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/option-chain?symbol=${sym}&expiry=${encodeURIComponent(expiry)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json as DerivativesData);
      setCountdown(30);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExpiries(symbol).then((exp) => {
      setExpiries(exp);
      if (exp.length > 0) {
        setSelectedExpiry(exp[0]);
        fetchChain(symbol, exp[0]);
      }
    });
  }, [symbol, fetchExpiries, fetchChain]);

  useEffect(() => {
    if (!selectedExpiry) return;
    intervalRef.current = setInterval(() => {
      if (document.hidden) return;
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

  return (
    <div className="flex flex-col p-4">
      <p className="text-muted font-mono text-xs">
        {loading ? "Loading…" : error ? `Error: ${error}` : `${data?.chain.length ?? 0} strikes · ${symbol} · ${selectedExpiry}`}
      </p>
    </div>
  );
}
