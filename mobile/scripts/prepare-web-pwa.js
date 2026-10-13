const fs = require("node:fs");
const path = require("node:path");

const buildDirectory = path.resolve(__dirname, "../dist");
const indexPath = path.join(buildDirectory, "index.html");
const manifestPath = path.resolve(__dirname, "../manifest.json");

if (!fs.existsSync(indexPath)) {
  throw new Error(`Expo web export was not found at ${indexPath}`);
}

const indexHtml = fs.readFileSync(indexPath, "utf8");
const manifestLink = '<link rel="manifest" href="/app/manifest.webmanifest" />';
if (!indexHtml.includes('rel="manifest"')) {
  fs.writeFileSync(
    indexPath,
    indexHtml.replace("</head>", `    ${manifestLink}\n  </head>`)
  );
}

fs.copyFileSync(manifestPath, path.join(buildDirectory, "manifest.webmanifest"));
