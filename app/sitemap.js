import { siteOrigin } from "./_lib/siteOrigin";

export default function sitemap() {
  const origin = siteOrigin();
  return ["", "invitations", "privacy", "terms", "support", "account-deletion"].map((path) => ({
    url: `${origin}/${path}`,
    changeFrequency: "monthly",
  }));
}