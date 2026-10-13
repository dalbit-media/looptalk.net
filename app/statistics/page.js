import SitePage, { buildMetadata } from "../_components/SitePage";

export const metadata = buildMetadata("statistics");

export default function StatisticsPage() {
  return <SitePage page="statistics" />;
}
