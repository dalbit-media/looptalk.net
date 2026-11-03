// Canonical public origin for metadata, robots and sitemap; PUBLIC_URL overrides it.
export const siteOrigin = () => (
  process.env.PUBLIC_URL?.trim() ||
  (process.env.NODE_ENV === "production" ? "https://looptalk.net" : "http://localhost:3000")
).replace(/\/+$/, "");
