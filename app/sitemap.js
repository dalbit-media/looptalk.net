export default function sitemap() {
  const origin = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
  return ["", "invitations", "privacy", "terms", "support", "account-deletion"].map((path) => ({
    url: `${origin}/${path}`,
    changeFrequency: "monthly",
  }));
}