"use client";

import { IntelDashboard } from "@/components/intel/IntelDashboard";

export default function IntelPage() {
  return (
    <div className="p-6 max-w-[1600px]">
      <div className="mb-6">
        <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
          Management Guidance Tracker
        </h1>
        <p className="text-muted text-sm font-sans mt-1">
          Forward-looking claims from earnings concalls · verified against reported actuals
        </p>
      </div>
      <IntelDashboard />
    </div>
  );
}
