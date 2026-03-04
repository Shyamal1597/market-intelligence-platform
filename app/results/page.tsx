"use client";

import { EarningsSplitView } from "@/components/results/EarningsSplitView";

export default function ResultsPage() {
  return (
    <div className="p-6 max-w-[1600px]">
      <div className="mb-5">
        <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
          Earnings Intelligence
        </h1>
        <p className="text-muted text-sm font-sans mt-1">
          Coverage universe · quarterly P&amp;L · YoY analysis
        </p>
      </div>
      <EarningsSplitView />
    </div>
  );
}
