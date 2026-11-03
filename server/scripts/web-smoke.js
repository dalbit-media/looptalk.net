const { load } = require("cheerio");

const checkWebStartup = async (origin) => {
  const base = new URL(origin);
  const assets = new Set();
  for (const route of ["/", "/app"]) {
    const response = await fetch(new URL(route, base), { cache: "no-store" });
    if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
    const $ = load(await response.text());
    if (!$("script[src]").length) throw new Error(`${route}: no application scripts found`);
    $("script[src], link[rel=stylesheet]").each((_index, element) => {
      const url = new URL($(element).attr("src") || $(element).attr("href"), base);
      if (url.origin === base.origin) assets.add(url.href);
    });
  }
  for (const url of assets) {
    const response = await fetch(url, { cache: "no-store" });
    const type = response.headers.get("content-type") || "";
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    if (!/javascript|text\/css/i.test(type)) throw new Error(`${url}: unexpected content type ${type}`);
    if (!(await response.text()).trim()) throw new Error(`${url}: empty asset`);
  }
  return assets.size;
};

if (require.main === module) {
  checkWebStartup(process.argv[2] || process.env.SMOKE_API_URL || "http://localhost:3001")
    .then((count) => console.log(`Web startup OK: ${count} scripts/styles available`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { checkWebStartup };
