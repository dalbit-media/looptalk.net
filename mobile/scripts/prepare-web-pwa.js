const fs = require("node:fs");
const path = require("node:path");

const buildDirectory = path.resolve(__dirname, "../dist");
const indexPath = path.join(buildDirectory, "index.html");
const manifestPath = path.resolve(__dirname, "../manifest.json");

if (!fs.existsSync(indexPath)) {
  throw new Error(`Expo web export was not found at ${indexPath}`);
}

let indexHtml = fs.readFileSync(indexPath, "utf8");
const installMetadata = [
  ['rel="icon"', '<link rel="icon" type="image/svg+xml" href="/site/app-icon.svg" />'],
  ['rel="manifest"', '<link rel="manifest" href="/app/manifest.webmanifest" />'],
  ['rel="apple-touch-icon"', '<link rel="apple-touch-icon" href="/site/app-icon-180.png" />'],
  ['name="apple-mobile-web-app-capable"', '<meta name="apple-mobile-web-app-capable" content="yes" />'],
  ['name="apple-mobile-web-app-title"', '<meta name="apple-mobile-web-app-title" content="LoopTalk" />'],
  ['name="theme-color"', '<meta name="theme-color" content="#087bef" />'],
];
for (const [attribute, tag] of installMetadata) {
  if (!indexHtml.includes(attribute)) {
    indexHtml = indexHtml.replace("</head>", `    ${tag}\n  </head>`);
  }
}
fs.writeFileSync(indexPath, indexHtml);

fs.copyFileSync(manifestPath, path.join(buildDirectory, "manifest.webmanifest"));
