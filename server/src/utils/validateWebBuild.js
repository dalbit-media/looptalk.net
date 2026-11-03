const fs = require("node:fs");
const path = require("node:path");

const validateWebBuild = (directory) => {
  const assets = new Set();
  const collect = (value) => {
    if (typeof value === "string" && value.startsWith("static/")) assets.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  for (const name of ["build-manifest.json", "react-loadable-manifest.json"]) {
    collect(JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
  }
  const collectRoutes = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) collectRoutes(file);
      else if (entry.name.endsWith("_client-reference-manifest.js")) {
        const source = fs.readFileSync(file, "utf8");
        for (const match of source.matchAll(/"static\/[^"]+\.(?:js|css)"/g)) {
          collect(JSON.parse(match[0]));
        }
      }
    }
  };
  collectRoutes(path.join(directory, "server", "app"));
  const missing = [...assets].filter((asset) => !fs.existsSync(path.join(directory, decodeURIComponent(asset))));
  if (missing.length) {
    throw new Error(`Incomplete Next.js build: missing ${missing.join(", ")}. Rebuild before restarting PM2; do not build in a running server's directory.`);
  }
};

module.exports = { validateWebBuild };
