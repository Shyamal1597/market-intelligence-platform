"use client";

import { useState } from "react";
import { snippetQuote, quarterDisplay } from "@/lib/intel/uiHelpers";
import type { EnrichedClaim } from "./ClaimRow";
import type { Verdict } from "@/lib/intel/types";

interface Props {
  claim: EnrichedClaim;
}

const BORDER_COLOR: Record<string, string> = {
  met:       "border-l-teal/60",
  moving:    "border-l-amber/60",
  miss:      "border-l-danger/60",
  pending:   "border-l-border/40",
  ambiguous: "border-l-border/20",
};

const VERDICT_PILL: Record<string, string> = {
  met:       "text-teal bg-teal/10 border-teal/30",
  moving:    "text-amber bg-amber/10 border-amber/30",
  miss:      "text-danger bg-danger/10 border-danger/30",
  pending:   "text-muted bg-surface border-border",
  ambiguous: "text-muted/50 bg-surface border-border/30",
};

export function GuidanceClaimCard({ claim }: Props) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [actualsOpen, setActualsOpen] = useState(false);

  const verdict: Verdict =
    claim.check?.verdict ?? (claim.resolvedTargetQuarter ? "pending" : "ambiguous");

  const borderClass = BORDER_COLOR[verdict] ?? "border-l-border/20";
  const pillClass   = VERDICT_PILL[verdict] ?? "text-muted border-border";

  return (
    <div className={`border-l-2 ${borderClass} pl-4 py-3 rounded-sm`}>

      {/* -- Row 1: verdict badge + metric label -- */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase border shrink-0 ${pillClass}`}
        >
          {verdict}
        </span>
        <span className="text-sm font-sans font-semibold text-primary">
          {claim.metricLabel}
        </span>
      </div>

      {/* -- Row 2: guided target -- */}
      {claim.targetText && (
        <p className="text-xs font-mono text-primary/70 mb-2 leading-snug">
          ↗ {claim.targetText}
        </p>
      )}

      {/* -- Row 3: guidance quote -- */}
      <blockquote className="text-sm font-sans text-primary/65 italic leading-relaxed mb-1">
        &ldquo;{snippetQuote(claim.quote)}&rdquo;
      </blockquote>
      {claim.speaker && (
        <p className="text-[11px] font-mono text-muted/45 mb-2">-- {claim.speaker}</p>
      )}

      {/* -- Verification block (decisive/moving claims only) -- */}
      {claim.check ? (
        <div className="mt-3 pt-3 border-t border-border/25 space-y-2">
          <span className="text-[10px] font-mono text-muted/50 uppercase tracking-wider block">
            Verified in {quarterDisplay(claim.check.verifiedInQuarter)}
          </span>

          {(claim.check.actualText ?? claim.check.quote) && (
            <p className="text-sm font-sans text-primary/55 leading-relaxed">
              {snippetQuote(claim.check.actualText ?? claim.check.quote ?? "", 240)}
            </p>
          )}

          {claim.check.reasoning && (
            <>
              {reasoningOpen && (
                <p className="text-[11px] font-sans text-muted/60 leading-relaxed border-t border-border/20 pt-2">
                  {claim.check.reasoning}
                </p>
              )}
              <button
                onClick={() => setReasoningOpen((p) => !p)}
                className="text-[10px] font-mono text-muted/40 hover:text-muted transition-colors"
              >
                {reasoningOpen ? "hide reasoning ▲" : "show reasoning ▾"}
              </button>
            </>
          )}
        </div>
      ) : claim.resolvedTargetQuarter ? (
        <div className="mt-3 pt-3 border-t border-border/25">
          <span className="text-[11px] font-mono text-muted/40">
            Awaiting {quarterDisplay(claim.resolvedTargetQuarter)} transcript
          </span>
        </div>
      ) : null}

      {/* -- Actuals: transcript evidence from target quarter (zero-cost keyword search) -- */}
      {claim.actuals && claim.actuals.snippets.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/25">
          <button
            onClick={() => setActualsOpen(p => !p)}
            className="flex items-center gap-1.5 text-[10px] font-mono text-muted/60 hover:text-teal/70 transition-colors w-full text-left"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal/50 shrink-0" />
            <span>
              {quarterDisplay(claim.actuals.targetQuarter)} transcript mention
              {claim.actuals.snippets.length > 1 ? `s (${claim.actuals.snippets.length})` : ""}
            </span>
            <span className="ml-1 text-muted/30">{actualsOpen ? "▲" : "▾"}</span>
          </button>
          {actualsOpen && (
            <div className="mt-2 space-y-2">
              {claim.actuals.snippets.map((s, i) => (
                <p key={i} className="text-[11px] font-sans text-muted/70 leading-relaxed pl-3 border-l border-teal/20 italic">
                  {s.length > 220 ? s.slice(0, 220) + "…" : s}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

