import { ArrowIcon, PulseIcon } from "./SiteChrome";

export default function AdminPage() {
  return (
    <main className="admin-main" id="main-content">
      <header className="admin-heading reveal">
        <div><p className="eyebrow" data-i18n="admin.operations">Operations</p><h1 data-i18n="admin.title">LoopTalk Admin</h1><p data-i18n="admin.description">Service visibility and workspace controls.</p></div>
        <div className="status-chip" data-server-status=""><span /><b data-health-status="" data-i18n="health.checkingServer">Checking server</b></div>
      </header>
      <section className="metric-grid reveal" aria-label="Service summary" data-i18n-aria-label="admin.serviceSummary">
        <article className="metric metric-dark"><span data-i18n="admin.apiStatus">API status</span><strong data-health-label="" data-i18n="health.checking">Checking</strong><small data-health-time="" data-i18n="health.waiting">Waiting for response</small></article>
        <article className="metric"><span data-i18n="admin.environment">Environment</span><strong>Node.js {process.version}</strong><small data-i18n="admin.runtime">Current server runtime</small></article>
        <article className="metric"><span data-i18n="admin.webClient">Web client</span><strong data-i18n="admin.ready">Ready</strong><small data-i18n="admin.sidePanel">Available in the side panel</small></article>
      </section>
      <section className="admin-grid">
        <article className="admin-panel reveal">
          <div className="panel-heading"><div><p className="eyebrow" data-i18n="admin.system">System</p><h2 data-i18n="admin.serviceHealth">Service health</h2></div><PulseIcon /></div>
          <div className="service-row"><span><i data-health-dot="" /><b>Next.js API</b></span><strong data-health-label="" data-i18n="health.checking">Checking</strong></div>
          <div className="service-row"><span><i /><b>Socket.io</b></span><strong data-i18n="admin.configured">Configured</strong></div>
          <div className="service-row"><span><i /><b data-i18n="admin.clientFrame">Web client frame</b></span><strong data-i18n="admin.configured">Configured</strong></div>
        </article>
        <article className="admin-panel reveal">
          <div className="panel-heading"><div><p className="eyebrow" data-i18n="admin.quickAccess">Quick access</p><h2 data-i18n="admin.workspace">Workspace</h2></div></div>
          <a className="admin-link" href="/health"><span><strong data-i18n="admin.healthResponse">Health response</strong><small data-i18n="admin.healthResponseDetail">Inspect the live JSON endpoint</small></span><ArrowIcon /></a>
          <button className="admin-link" type="button" data-open-client=""><span><strong data-i18n="admin.webClient">Web client</strong><small data-i18n="admin.openWorkspace">Open the mobile-sized workspace</small></span><ArrowIcon /></button>
          <a className="admin-link" href="/"><span><strong data-i18n="admin.publicWebsite">Public website</strong><small data-i18n="admin.returnLanding">Return to the landing page</small></span><ArrowIcon /></a>
        </article>
      </section>
      <section className="endpoint-panel reveal">
        <div><p className="eyebrow" data-i18n="admin.apiSurface">API surface</p><h2 data-i18n="admin.coreServices">Core services</h2></div>
        <div className="endpoint-list"><span data-i18n="admin.authentication">Authentication</span><span data-i18n="admin.conversations">Conversations</span><span data-i18n="admin.messages">Messages</span><span data-i18n="admin.contacts">Contacts</span><span data-i18n="admin.invitations">Invitations</span><span data-i18n="admin.media">Media</span></div>
      </section>
    </main>
  );
}
