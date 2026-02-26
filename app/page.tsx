import { NewsHeadlines } from "@/components/dashboard/NewsHeadlines";
import { MacroTiles } from "@/components/dashboard/MacroTiles";
import { DashboardFilings } from "@/components/dashboard/DashboardFilings";
import { QuickLinksPreview } from "@/components/dashboard/QuickLinksPreview";

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Top 3-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* News Headlines — 6 cols */}
        <div className="lg:col-span-6 bg-surface border border-[#1E2235] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="font-display text-2xl font-semibold text-primary tracking-tight">
              Market Headlines
            </h2>
            <a
              href="/news"
              className="ml-auto text-xs font-mono text-amber hover:underline"
            >
              All news →
            </a>
          </div>
          <NewsHeadlines />
        </div>

        {/* Macro — 3 cols */}
        <div className="lg:col-span-3 bg-surface border border-[#1E2235] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="font-display text-xl font-semibold text-primary">
              Markets
            </h2>
            <a
              href="/macro"
              className="ml-auto text-xs font-mono text-amber hover:underline"
            >
              Full view →
            </a>
          </div>
          <MacroTiles />
        </div>

        {/* Filings — 3 cols */}
        <div className="lg:col-span-3 bg-surface border border-[#1E2235] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="font-display text-xl font-semibold text-primary">
              BSE Filings
            </h2>
            <span className="flex items-center gap-1 text-xs font-mono text-danger">
              <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
              LIVE
            </span>
            <a
              href="/filings"
              className="ml-auto text-xs font-mono text-amber hover:underline"
            >
              All →
            </a>
          </div>
          <DashboardFilings />
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-surface border border-[#1E2235] rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-semibold text-primary">
            Quick Links
          </h2>
          <a href="/links" className="text-xs text-amber hover:underline font-mono">
            View all →
          </a>
        </div>
        <QuickLinksPreview />
      </div>
    </div>
  );
}
