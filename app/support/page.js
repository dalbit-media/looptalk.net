import SitePage, { buildMetadata } from "../_components/SitePage";

export const metadata = buildMetadata("support");

export default function SupportPage() {
  return <SitePage page="support" />;
}