import SitePage, { buildMetadata } from "../_components/SitePage";

export const metadata = buildMetadata("privacy");

export default function PrivacyPage() {
  return <SitePage page="privacy" />;
}