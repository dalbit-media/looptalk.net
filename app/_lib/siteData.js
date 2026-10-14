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
  const legalPage = legalPages[page];
  const title = isAdmin
    ? "Admin · LoopTalk"
    : legalPage
      ? `${legalPage.title} · LoopTalk`
      : "LoopTalk · Private conversations, thoughtfully connected";
  const description = isAdmin
    ? "LoopTalk service administration and health overview."
    : legalPage?.description ||
      "LoopTalk is an invitation-only messenger for private conversations, smart contact groups, and rich sharing across mobile and web.";

  return {
    bodyClass: isAdmin ? "admin-page" : legalPage ? "legal-page" : "landing-page",
    canonicalPath: isAdmin ? "/admin" : legalPage ? `/${page}` : "/",
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
