"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { CalendarEntry, EarningsEntry } from "@/components/calendar/CalendarEntry";

type FilterKey = "all" | "Results" | "Dividend" | "Bonus";

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: "all",      label: "All"       },
  { key: "Results",  label: "Results"   },
  { key: "Dividend", label: "Dividends" },
  { key: "Bonus",    label: "Bonus"     },
];

function formatDateLabel(dateStr: string): string {
  const today    = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  // Parse without timezone shift
  const [y, m, d] = dateStr.split("-").map(Number);
  const entryDate = new Date(y, m - 1, d);

  const fmt = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    year:    "numeric",
    month:   "long",
    day:     "numeric",
  });

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate();

  const formatted = fmt.format(entryDate);

  if (sameDay(entryDate, today))    return `Today — ${formatted}`;
  if (sameDay(entryDate, tomorrow)) return `Tomorrow — ${formatted}`;
  return formatted;
}

interface DateGroup {
  date:    string;
  label:   string;
  entries: EarningsEntry[];
}

function groupByDate(entries: EarningsEntry[]): DateGroup[] {
  const map = new Map<string, EarningsEntry[]>();

  for (const entry of entries) {
    const bucket = map.get(entry.date) ?? [];
    bucket.push(entry);
    map.set(entry.date, bucket);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      label:   formatDateLabel(date),
      entries: items,
    }));
}

export default function CalendarPage() {
  const [entries, setEntries] = useState<EarningsEntry[]>([]);
  const [filter,  setFilter]  = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = () => {
      fetch("/api/calendar")
        .then(r => r.json())
        .then(data => {
          setEntries(data.entries ?? []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };

    fetchData();

    const intervalId = setInterval(fetchData, 60 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  const filtered =
    filter === "all"
      ? entries
      : entries.filter(e => e.category === filter);

  const dateGroups = groupByDate(filtered);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
            Earnings Calendar
          </h1>
          <span className="flex items-center gap-1.5 text-xs font-mono text-teal border border-teal/30 px-2 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
            LIVE
          </span>
        </div>
        <p className="text-muted text-sm font-sans">
          BSE board meetings &amp; result dates · 30-day forward view · auto-polls every hour
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded text-xs font-mono tracking-wide border transition-all ${
              filter === tab.key
                ? "bg-amber/10 text-amber border-amber/40"
                : "bg-surface text-muted border-[#1E2235] hover:text-primary hover:border-[#2A2D42]"
            }`}
          >
            {tab.label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        /* Loading skeleton */
        <div className="space-y-8">
          {[0, 1, 2].map(g => (
            <div key={g}>
              <div className="animate-pulse h-4 w-48 bg-surface-raised rounded mb-3" />
              <div className="space-y-2">
                {[0, 1, 2].map(r => (
                  <div
                    key={r}
                    className="animate-pulse h-14 bg-surface rounded-xl border border-[#1E2235] mb-2"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : dateGroups.length === 0 ? (
        /* Empty state */
        <div className="text-center py-24 text-muted">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-display text-2xl">No upcoming events</p>
          <p className="text-sm mt-1">Try a different filter or check back later</p>
        </div>
      ) : (
        /* Date-grouped list */
        dateGroups.map(({ label, entries: groupEntries }) => (
          <div key={label} className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-mono text-xs tracking-widest uppercase text-muted">
                {label}
              </h2>
              <div className="flex-1 h-px bg-[#1E2235]" />
              <span className="font-mono text-xs text-muted/50">
                {groupEntries.length} event{groupEntries.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-2">
              {groupEntries.map((e, i) => (
                <CalendarEntry key={`${e.bseCode}-${i}`} entry={e} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
