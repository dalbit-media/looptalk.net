import SitePage, { buildMetadata } from "../_components/SitePage";

export const metadata = buildMetadata("account-deletion");

export default function AccountDeletionPage() {
  return <SitePage page="account-deletion" />;
}