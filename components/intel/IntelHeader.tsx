"use client";

import type { CompanySummary } from "@/app/api/intel/companies/route";

interface Props {
  company: CompanySummary | null;
  symbol: string;
}

function Stat({ label, value, valueClass = "text-primary" }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-mono text-muted uppercase tracking-widest">{label}</span>
      <span className={`text-xl font-mono font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

export function IntelHeader({ company, symbol }: Props) {
  if (!company) {
    return (
      <div className="mb-6">
        <h2 className="font-display text-3xl font-semibold text-primary">{symbol}</h2>
        <p className="text-muted text-sm mt-1">No intel data available — run <code className="text-amber font-mono">npm run intel:rebuild {symbol}</code></p>
      </div>
    );
  }

  const accuracy = company.checkedClaims > 0
    ? Math.round((company.hitCount / company.checkedClaims) * 100)
    : null;

  return (
    <div className="mb-6 flex flex-wrap items-start gap-8">
      <div className="flex-1 min-w-0">
        <h2 className="font-display text-3xl font-semibold text-primary">{symbol}</h2>
        <p className="text-muted text-sm mt-0.5 font-mono">{company.sector} · {company.quarters.length} quarters tracked</p>
      </div>
      <div className="flex gap-6 shrink-0">
        <Stat label="Total Claims"  value={company.totalClaims} />
        <Stat label="Verified"      value={company.checkedClaims} />
        <Stat label="Hits"          value={company.hitCount}    valueClass="text-teal" />
        <Stat label="Misses"        value={company.missCount}   valueClass="text-danger" />
        <Stat label="Partials"      value={company.partialCount} valueClass="text-amber" />
        {accuracy !== null && (
          <Stat
            label="Accuracy"
            value={`${accuracy}%`}
            valueClass={accuracy >= 60 ? "text-teal" : accuracy >= 40 ? "text-amber" : "text-danger"}
          />
        )}
      </div>
    </div>
  );
}
