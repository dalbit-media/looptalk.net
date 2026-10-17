import AdminPage from "./AdminPage";
import LandingPage from "./LandingPage";
import InvitationsPage from "./InvitationsPage";
import LegalPage from "./LegalPage";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { getPageView } from "../_lib/siteData";

export const buildMetadata = (page = "landing") => {
  const view = getPageView(page);
  return {
    title: view.title,
    description: view.description,
    alternates: { canonical: view.canonicalPath },
    robots: view.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true, maxImagePreview: "large" },
    openGraph: {
      type: "website",
      siteName: "LoopTalk",
      title: view.title,
      description: view.description,
      url: view.canonicalPath,
    },
    twitter: { card: "summary_large_image" },
  };
};

export default function SitePage({ page = "landing" }) {
  const view = getPageView(page);
  const structuredData = JSON.stringify(view.structuredData).replaceAll("<", "\\u003c");
  const content = page === "admin" || page === "statistics"
    ? <AdminPage publicView={page === "statistics"} />
    : page === "invitations"
      ? <InvitationsPage />
      : view.legalPage
      ? <LegalPage page={page} {...view.legalPage} />
      : <LandingPage />;

  return (
    <div className={`site-page ${view.bodyClass}`}>
      <SiteHeader />
      {content}
      <SiteFooter showAdminAccess={page === "statistics"} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredData }}
      />
    </div>
  );
}