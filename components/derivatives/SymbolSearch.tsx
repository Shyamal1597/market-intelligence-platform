"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown } from "lucide-react";
import { clsx } from "clsx";

const PINNED = ["NIFTY", "BANKNIFTY", "FINNIFTY"];

interface Props {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

export function SymbolSearch({ symbol, onSymbolChange }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [validating, setValidating] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const validate = async (sym: string) => {
    const s = sym.toUpperCase().trim();
    if (!s) return;
    setValidating(true);
    setInvalid(false);
    try {
      const res = await fetch(`/api/option-chain/expiries?symbol=${s}`);
      const json = await res.json();
      if ((json.expiries ?? []).length > 0) {
        onSymbolChange(s);
        setOpen(false);
        setInput("");
      } else {
        setInvalid(true);
      }
    } catch {
      setInvalid(true);
    } finally {
      setValidating(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border text-primary font-mono text-sm hover:border-amber/50 transition-colors"
      >
        <Search size={14} className="text-muted" />
        <span className="font-semibold text-amber">{symbol}</span>
        <ChevronDown size={14} className="text-muted" />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 w-64 bg-surface border border-border rounded-lg shadow-2xl shadow-black/50 p-3 flex flex-col gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {PINNED.map((s) => (
              <button
                key={s}
                onClick={() => { onSymbolChange(s); setOpen(false); }}
                className={clsx(
                  "px-2.5 py-1 rounded-md text-xs font-mono transition-colors",
                  s === symbol
                    ? "bg-amber/20 text-amber border border-amber/30"
                    : "bg-surface border border-border text-muted hover:text-primary"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="border-t border-border pt-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value.toUpperCase()); setInvalid(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") validate(input); }}
              placeholder="Type symbol (e.g. RELIANCE)"
              className={clsx(
                "w-full bg-base border rounded-md px-3 py-1.5 font-mono text-xs text-primary placeholder:text-muted outline-none transition-colors",
                invalid ? "border-danger" : "border-border focus:border-amber/50"
              )}
            />
            {invalid && (
              <p className="text-danger text-[11px] mt-1 font-mono">No options found for this symbol</p>
            )}
            <button
              onClick={() => validate(input)}
              disabled={validating || !input}
              className="mt-2 w-full py-1.5 rounded-md bg-amber/15 text-amber text-xs font-mono border border-amber/30 hover:bg-amber/20 disabled:opacity-40 transition-colors"
            >
              {validating ? "Checking…" : "Load Chain →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
