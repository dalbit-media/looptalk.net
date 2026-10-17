import InvitationMap from "./InvitationMap";
import { t } from "../../public/site/site-i18n";

export default function InvitationsPage() {
  return (
    <main className="invitation-main site-container" id="main-content">
      <header className="invitation-heading">
        <p className="eyebrow" data-i18n="invitations.eyebrow">{t("invitations.eyebrow")}</p>
        <h1 data-i18n="invitations.title">{t("invitations.title")}</h1>
        <p data-i18n="invitations.description">{t("invitations.description")}</p>
      </header>
      <InvitationMap />
    </main>
  );
}
