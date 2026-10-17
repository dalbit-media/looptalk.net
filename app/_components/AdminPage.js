import AdminDashboard from "./AdminDashboard";
import { t } from "../../public/site/site-i18n";

export default function AdminPage({ publicView = false }) {
  return (
    <main className="admin-main site-container" id="main-content">
      <header className="admin-heading">
        <div>
          <p className="eyebrow" data-i18n="admin.stats.pageEyebrow">{t("admin.stats.pageEyebrow")}</p>
          <h1 data-i18n="admin.stats.pageTitle">{t("admin.stats.pageTitle")}</h1>
          <p data-i18n="admin.stats.pageDescription">{t("admin.stats.pageDescription")}</p>
        </div>
        <span className="admin-live-label"><i /> <span data-i18n="admin.stats.liveData">{t("admin.stats.liveData")}</span></span>
      </header>
      <AdminDashboard publicView={publicView} />
    </main>
  );
}
