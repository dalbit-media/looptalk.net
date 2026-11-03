import { siteOrigin } from "./_lib/siteOrigin";

export default function robots() {
  const origin = siteOrigin();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: `${origin}/sitemap.xml`,
  };
}