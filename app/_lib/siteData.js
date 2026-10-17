export const legalPages = {
  privacy: {
    title: "Privacy Policy",
    description: "How LoopTalk collects, uses, protects, and deletes personal information.",
  },
  terms: {
    title: "Terms of Service",
    description: "The terms governing use of LoopTalk messaging services.",
  },
  support: {
    title: "Support & Safety",
    description: "Get help with LoopTalk accounts, messaging, calls, safety, and privacy.",
  },
  "account-deletion": {
    title: "Delete Your LoopTalk Account",
    description: "How to permanently delete a LoopTalk account and associated personal data.",
  },
};

export const getPageView = (page = "landing") => {
  const isAdmin = page === "admin";
  const isStatistics = page === "statistics";
  const isInvitations = page === "invitations";
  const legalPage = legalPages[page];
  const title = isInvitations
    ? t("meta.invitationsTitle")
    : isStatistics
    ? t("meta.statisticsTitle")
    : isAdmin
    ? t("meta.adminTitle")
    : legalPage
      ? `${legalPage.title} · LoopTalk`
      : t("meta.landingTitle");
  const description = isInvitations
    ? t("meta.invitationsDescription")
    : isStatistics
    ? t("meta.statisticsDescription")
    : isAdmin
    ? t("meta.adminDescription")
    : legalPage?.description ||
      t("meta.landingDescription");

  return {
    bodyClass: isInvitations
      ? "invitations-page"
      : isAdmin
      ? "admin-page"
      : isStatistics
        ? "admin-page statistics-page"
        : legalPage ? "legal-page" : "landing-page",
    canonicalPath: isAdmin ? "/admin" : isStatistics ? "/statistics" : isInvitations ? "/invitations" : legalPage ? `/${page}` : "/",
    description,
    legalPage,
    noIndex: isAdmin,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "LoopTalk",
      applicationCategory: "CommunicationApplication",
      operatingSystem: "iOS, Android, Web",
      description,
    },
    title,
  };
};
import { t } from "../../public/site/site-i18n";
