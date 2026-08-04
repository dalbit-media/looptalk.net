export default function robots() {
  const origin = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: `${origin}/sitemap.xml`,
  };
}