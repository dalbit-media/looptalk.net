import SitePage, { buildMetadata } from "../_components/SitePage";

export const metadata = buildMetadata("admin");

export default function AdminPage() {
  return <SitePage page="admin" />;
}