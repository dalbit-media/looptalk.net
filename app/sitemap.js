export default function sitemap() {
  const origin = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
  return ["", "privacy", "terms", "support", "account-deletion"].map((path) => ({
    url: `${origin}/${path}`,
    changeFrequency: "monthly",
  }));
}