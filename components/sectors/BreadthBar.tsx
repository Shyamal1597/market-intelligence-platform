"use client";

interface BreadthBarProps {
  advancing: number;
  declining: number;
}

export function BreadthBar({ advancing, declining }: BreadthBarProps) {
  const total = advancing + declining;
  if (total === 0) return null;

  const advPct = (advancing / total) * 100;
  const decPct = (declining / total) * 100;
  const neutralPct = 100 - advPct - decPct;

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex w-full h-2 rounded-full overflow-hidden">
        <div className="bg-teal" style={{ width: `${advPct}%` }} />
        {neutralPct > 0 && (
          <div className="bg-[#1E2235]" style={{ width: `${neutralPct}%` }} />
        )}
        <div className="bg-danger" style={{ width: `${decPct}%` }} />
      </div>
      <div className="flex justify-between">
        <span className="font-mono text-xs text-teal">{advancing} UP</span>
        <span className="font-mono text-xs text-danger">{declining} DOWN</span>
      </div>
    </div>
  );
}
