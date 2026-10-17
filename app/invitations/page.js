import SitePage, { buildMetadata } from "../_components/SitePage";

export const metadata = buildMetadata("invitations");

export default function InvitationNetworkPage() {
  return <SitePage page="invitations" />;
}
