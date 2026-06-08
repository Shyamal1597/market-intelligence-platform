"use client";

import { useState } from "react";
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp } from "lucide-react";
import type { DataQuality, DataQualityNote, DataQualitySeverity } from "@/app/api/intel/companies/route";

const SEVERITY_CONFIG: Record<DataQualitySeverity, {
  icon: React.ComponentType<{ className?: string }>;
  textClass: string;
  borderClass: string;
  bgClass: string;
}> = {
  error: {
    icon: AlertCircle,
    textClass: "text-danger",
    borderClass: "border-danger/30",
    bgClass:    "bg-danger/5",
  },
  warn: {
    icon: AlertTriangle,
    textClass: "text-amber",
    borderClass: "border-amber/30",
    bgClass:    "bg-amber/5",
  },
  info: {
    icon: Info,
    textClass: "text-muted",
    borderClass: "border-border/40",
    bgClass:    "bg-surface/40",
  },
};

function NoteRow({ note }: { note: DataQualityNote }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[note.severity];
  const Icon = cfg.icon;

  return (
    <div className={`rounded border ${cfg.borderClass} ${cfg.bgClass} px-3 py-2`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.textClass}`} />
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-mono ${cfg.textClass}`}>{note.message}</span>
          {note.detail && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="ml-2 text-[10px] font-mono text-muted hover:text-primary transition-colors inline-flex items-center gap-0.5"
            >
              {expanded ? "less" : "details"}
              {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </button>
          )}
          {expanded && note.detail && (
            <p className="mt-1.5 text-[11px] font-mono text-muted leading-relaxed">
              {note.detail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DataQualityBanner({
  symbol,
  quality,
}: {
  symbol: string;
  quality: DataQuality;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Dismiss resets when symbol changes
  if (dismissed !== symbol && dismissed !== null) setDismissed(null);

  if (!quality.hasIssues || dismissed === symbol) return null;

  const errorCount  = quality.notes.filter(n => n.severity === "error").length;
  const warnCount   = quality.notes.filter(n => n.severity === "warn").length;

  // Derive header border/text from worst severity
  const hasError = errorCount > 0;
  const headerText = hasError ? "text-danger" : "text-amber";
  const headerBorder = hasError ? "border-danger/25 bg-danger/5" : "border-amber/25 bg-amber/5";

  const summaryParts: string[] = [];
  if (errorCount > 0) summaryParts.push(`${errorCount} error${errorCount !== 1 ? "s" : ""}`);
  if (warnCount  > 0) summaryParts.push(`${warnCount} warning${warnCount !== 1 ? "s" : ""}`);

  return (
    <div className={`rounded-xl border ${headerBorder} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${headerText}`} />
          <span className={`text-xs font-mono font-semibold ${headerText}`}>
            Data completeness — {symbol}
          </span>
          <span className="text-[10px] font-mono text-muted">
            {summaryParts.join(", ")}
          </span>
        </div>
        <button
          onClick={() => setDismissed(symbol)}
          className="text-[10px] font-mono text-muted hover:text-primary transition-colors px-1.5 py-0.5 rounded hover:bg-white/5"
        >
          dismiss
        </button>
      </div>

      {/* Notes */}
      <div className="p-3 space-y-2">
        {quality.notes.map((note, i) => (
          <NoteRow key={i} note={note} />
        ))}
      </div>

      {/* Footer — transcript count */}
      <div className="px-3 py-1.5 border-t border-border/20 flex items-center gap-3 text-[10px] font-mono text-muted">
        <span>{quality.transcriptCount} transcript{quality.transcriptCount !== 1 ? "s" : ""} on disk</span>
        <span>·</span>
        <span>{quality.claimCount} claim{quality.claimCount !== 1 ? "s" : ""} extracted</span>
      </div>
    </div>
  );
}
