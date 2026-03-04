"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";

interface ThesisData {
  bull: string;
  bear: string;
  updatedAt: string;
}

interface Props {
  symbol: string;
}

export function ThesisEditor({ symbol }: Props) {
  const [thesis, setThesis] = useState<ThesisData>({
    bull: "",
    bear: "",
    updatedAt: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/thesis/${symbol}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ThesisData | null) => {
        if (d) setThesis(d);
      });
  }, [symbol]);

  async function save() {
    setSaving(true);
    await fetch(`/api/thesis/${symbol}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bull: thesis.bull, bear: thesis.bear }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="border border-[#1E2235] rounded-xl bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-mono text-muted tracking-widest uppercase">
          Bull / Bear Thesis
        </h3>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono text-amber hover:bg-amber/10 rounded transition-colors disabled:opacity-40"
        >
          <Save className="w-3 h-3" />
          {saved ? "Saved" : saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-mono text-teal tracking-wider block mb-1">
            BULL CASE
          </label>
          <textarea
            value={thesis.bull}
            onChange={(e) =>
              setThesis((t) => ({ ...t, bull: e.target.value }))
            }
            rows={4}
            placeholder="What makes this a buy…"
            className="w-full bg-background border border-[#1E2235] rounded px-3 py-2 text-xs font-sans text-primary placeholder-[#3A4060] focus:outline-none focus:border-teal/40 resize-none transition-colors"
          />
        </div>
        <div>
          <label className="text-[10px] font-mono text-danger tracking-wider block mb-1">
            BEAR CASE
          </label>
          <textarea
            value={thesis.bear}
            onChange={(e) =>
              setThesis((t) => ({ ...t, bear: e.target.value }))
            }
            rows={4}
            placeholder="Key risks and red flags…"
            className="w-full bg-background border border-[#1E2235] rounded px-3 py-2 text-xs font-sans text-primary placeholder-[#3A4060] focus:outline-none focus:border-danger/40 resize-none transition-colors"
          />
        </div>
      </div>

      {thesis.updatedAt && (
        <p className="text-[10px] font-mono text-muted mt-2">
          Last saved {new Date(thesis.updatedAt).toLocaleString("en-IN")}
        </p>
      )}
    </div>
  );
}
