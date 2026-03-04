import { MetricsRow } from "@/components/dashboard/MetricsRow";
import { NewsHeadlines } from "@/components/dashboard/NewsHeadlines";
import { DashboardFilings } from "@/components/dashboard/DashboardFilings";
import { DashboardDataPreview } from "@/components/dashboard/DashboardDataPreview";
import { SectorLeadersPreview } from "@/components/dashboard/SectorLeadersPreview";

export default function DashboardPage() {
  return (
    <div className="p-2 space-y-6">
      {/* Hero: live market metrics with sparklines */}
      <MetricsRow />

      {/* Two-column body: news (60%) + filings (40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
        <div className="lg:col-span-3 w-full">
          <NewsHeadlines />
        </div>
        <div className="lg:col-span-2 w-full">
          <DashboardFilings />
        </div>
      </div>

      {/* Sector Leaders Full Width */}
      <div className="w-full">
        <SectorLeadersPreview />
      </div>

      {/* Lower grid: Mini data preview cards for tabs */}
      <DashboardDataPreview />
    </div>
  );
}
