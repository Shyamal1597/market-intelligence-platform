import { MetricsRow } from "@/components/dashboard/MetricsRow";
import { NewsHeadlines } from "@/components/dashboard/NewsHeadlines";
import { DashboardFilings } from "@/components/dashboard/DashboardFilings";
import { DashboardDataPreview } from "@/components/dashboard/DashboardDataPreview";
import { SectorLeadersPreview } from "@/components/dashboard/SectorLeadersPreview";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function DashboardPage() {
  return (
    <div className="p-2 pt-8">
      <DashboardShell>
        {{
          metrics:  <MetricsRow />,
          news:     <NewsHeadlines />,
          filings:  <DashboardFilings />,
          sectors:  <SectorLeadersPreview />,
          preview:  <DashboardDataPreview />,
        }}
      </DashboardShell>
    </div>
  );
}
