"use client";

import type { CompanySummary } from "@/app/api/intel/companies/route";

interface Props {
  company: CompanySummary | null;
  symbol: string;
}

export function IntelHeader({ company, symbol }: Props) {
  if (!company) {
    return (
      <div className="mb-2">
        <h2 className="font-display text-3xl font-semibold text-primary">
          {symbol}
        </h2>
        <p className="text-muted text-sm mt-1">
          No intel data available — run{" "}
          <code className="text-amber font-mono">
            npm run intel:rebuild {symbol}
          </code>
        </p>
      </div>
    );
  }

  const decisive = company.checkedClaims; // metCount + movingCount + missCount
  const onTrack = company.metCount + company.movingCount;
  const onTrackPct = decisive > 0 ? Math.round((onTrack / decisive) * 100) : null;

  const onTrackColor =
    onTrackPct === null
      ? "text-muted"
      : onTrackPct >= 70
        ? "text-teal"
        : onTrackPct >= 40
          ? "text-amber"
          : "text-danger";

  return (
    <div className="mb-2">
      {/* Top row — company name + meta */}
      <div className="flex flex-wrap items-baseline gap-3 mb-4">
        <h2 className="font-display text-3xl font-semibold text-primary">
          {symbol}
        </h2>
        <span className="text-muted text-sm font-mono">
          {company.sector} · {company.quarters.length} quarter
          {company.quarters.length !== 1 ? "s" : ""} tracked
        </span>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-end gap-6">
        {/* Number stats */}
        <div className="flex gap-5">
          <StatCell label="Total Claims" value={company.totalClaims} />
          <StatCell label="Verified" value={company.checkedClaims} />
        </div>

        {/* Verdict breakdown — colored */}
        <div className="flex gap-5">
          <StatCell
            label="Met"
            value={company.metCount}
            valueClass="text-teal"
          />
          <StatCell
            label="Moving"
            value={company.movingCount}
            valueClass="text-amber"
          />
          <StatCell
            label="Miss"
            value={company.missCount}
            valueClass="text-danger"
          />
        </div>

        {/* On-track percentage + progress bar */}
        {onTrackPct !== null && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-mono text-muted uppercase tracking-widest">
                On Track
              </span>
              <span className={`text-xl font-mono font-semibold ${onTrackColor}`}>
                {onTrackPct}%
              </span>
            </div>
            {/* Stacked progress bar */}
            <div className="w-36 h-1.5 bg-surface rounded-full overflow-hidden flex">
              <div
                className="h-full bg-teal transition-all"
                style={{ width: `${(company.metCount / decisive) * 100}%` }}
              />
              <div
                className="h-full bg-amber transition-all"
                style={{ width: `${(company.movingCount / decisive) * 100}%` }}
              />
              <div
                className="h-full bg-danger transition-all"
                style={{ width: `${(company.missCount / decisive) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  valueClass = "text-primary",
}: {
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-mono text-muted uppercase tracking-widest">
        {label}
      </span>
      <span className={`text-xl font-mono font-semibold ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
