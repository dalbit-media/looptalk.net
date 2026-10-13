import AdminDashboard from "./AdminDashboard";

export default function AdminPage({ publicView = false }) {
  return (
    <main className="admin-main" id="main-content">
      <header className="admin-heading">
        <div>
          <p className="eyebrow" data-i18n="admin.stats.pageEyebrow">SYSTEM STATISTICS</p>
          <h1 data-i18n="admin.stats.pageTitle">LoopTalk system statistics</h1>
          <p data-i18n="admin.stats.pageDescription">Track invitation growth, message data, and what the service can measure.</p>
        </div>
        <span className="admin-live-label"><i /> <span data-i18n="admin.stats.liveData">LIVE SERVICE DATA</span></span>
      </header>
      <AdminDashboard publicView={publicView} />
    </main>
  );
}
