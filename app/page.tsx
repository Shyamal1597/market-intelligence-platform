import { MetricsRow } from "@/components/dashboard/MetricsRow";
import { NewsHeadlines } from "@/components/dashboard/NewsHeadlines";
import { DashboardFilings } from "@/components/dashboard/DashboardFilings";

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-4">
      {/* Hero: live market metrics with sparklines */}
      <MetricsRow />

      {/* Two-column body: news (60%) + filings (40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Market Headlines */}
        <div className="lg:col-span-3 bg-surface-raised border border-[#1E2235] rounded-xl p-4">
          <NewsHeadlines />
        </div>

        {/* NSE Filings */}
        <div className="lg:col-span-2 bg-surface-raised border border-[#1E2235] rounded-xl p-4">
          <DashboardFilings />
        </div>
      </div>
    </div>
  );
}
