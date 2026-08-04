import SitePage, { buildMetadata } from "../_components/SitePage";

export const metadata = buildMetadata("terms");

export default function TermsPage() {
  return <SitePage page="terms" />;
}