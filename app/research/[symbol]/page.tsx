"use client";

import { use, useEffect, useState } from "react";
import { CompanyHeader } from "@/components/research/CompanyHeader";
import { QuarterlyResultsPanel } from "@/components/research/QuarterlyResultsPanel";
import { ShareholdingPanel } from "@/components/research/ShareholdingPanel";
import { ThesisEditor } from "@/components/research/ThesisEditor";
import { CompanyNewsPanel } from "@/components/research/CompanyNewsPanel";
import { CompanyFilingsPanel } from "@/components/research/CompanyFilingsPanel";
import { CompanyReportsPanel } from "@/components/research/CompanyReportsPanel";
import type { WatchlistEntry } from "@/lib/watchlist";

interface Props {
  params: Promise<{ symbol: string }>;
}

export default function ResearchPage({ params }: Props) {
  const { symbol } = use(params);
  const sym = symbol.toUpperCase();

  const [entry, setEntry] = useState<WatchlistEntry | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((list: WatchlistEntry[]) => {
        const found = list.find((e) => e.symbol === sym);
        if (found) {
          setEntry(found);
        } else {
          setEntry({
            symbol: sym,
            bseCode: "",
            name: sym,
            sector: "",
            yahooTicker: `${sym}.NS`,
            marketCapBucket: "largecap",
            analyst: "",
            rating: "",
            targetPrice: null,
            addedAt: "",
          });
          setNotFound(true);
        }
      });
  }, [sym]);

  if (!entry) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-16 bg-surface rounded-xl border border-border" />
          <div className="flex gap-5">
            <div className="flex-1 h-96 bg-surface rounded-xl border border-border" />
            <div className="w-80 h-96 bg-surface rounded-xl border border-border" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px]">
      {notFound && (
        <div className="mb-4 px-4 py-2 rounded border border-amber/20 bg-amber/5 text-amber text-xs font-mono">
          {sym} is not in your watchlist. Add it via the Results page to save coverage metadata.
        </div>
      )}

      {/* Page header */}
      <CompanyHeader entry={entry} />

      {/* Two-column layout: flex-1 / w-80 */}
      <div className="flex gap-5">
        {/* Left column */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          <QuarterlyResultsPanel entry={entry} />
          <CompanyNewsPanel companyName={entry.name} symbol={sym} />
          <CompanyFilingsPanel symbol={sym} />
          <CompanyReportsPanel symbol={sym} />
        </div>

        {/* Right column */}
        <div className="w-80 shrink-0 flex flex-col gap-5">
          <ShareholdingPanel symbol={sym} bseCode={entry.bseCode} />
          <ThesisEditor symbol={sym} />
          <CoverageDetails entry={entry} />
        </div>
      </div>
    </div>
  );
}

// -- Inline Coverage Details widget --------------------------------------------

function CoverageDetails({ entry }: { entry: WatchlistEntry }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    analyst: entry.analyst,
    rating: entry.rating,
    targetPrice: entry.targetPrice?.toString() ?? "",
    bseCode: entry.bseCode,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/watchlist/${entry.symbol}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analyst: form.analyst,
        rating: form.rating,
        targetPrice: form.targetPrice ? parseFloat(form.targetPrice) : null,
        bseCode: form.bseCode,
      }),
    });
    setSaving(false);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="border border-border rounded-xl bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-mono text-muted tracking-widest uppercase">
          Coverage Details
        </h3>
        <button
          onClick={() => (editing ? save() : setEditing(true))}
          disabled={saving}
          className="text-[10px] font-mono text-amber hover:bg-amber/10 px-2 py-1 rounded transition-colors disabled:opacity-40"
        >
          {saving ? "Saving…" : saved ? "Saved" : editing ? "Save" : "Edit"}
        </button>
      </div>

      <div className="space-y-2.5">
        {(
          [
            ["Analyst", "analyst"],
            ["Rating", "rating"],
            ["Target Price", "targetPrice"],
            ["BSE Code", "bseCode"],
          ] as [string, keyof typeof form][]
        ).map(([label, key]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted">{label}</span>
            {editing ? (
              <input
                value={form[key]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [key]: e.target.value }))
                }
                className="w-32 px-2 py-0.5 text-xs font-mono bg-background border border-border rounded text-primary focus:outline-none focus:border-amber/60 text-right"
              />
            ) : (
              <span className="text-xs font-mono text-primary">
                {key === "targetPrice" && form[key]
                  ? `₹${form[key]}`
                  : form[key] || "--"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
