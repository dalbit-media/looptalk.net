#!/usr/bin/env node
// Each local build takes the next build number from the root npm package version.
// CI, EAS and server deploys reuse the committed number so every environment agrees.
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const buildLabel = require("../mobile/src/config/buildLabel");

const root = path.resolve(__dirname, "..");
let { version } = require(path.join(root, "package.json"));

if (!process.env.CI && !process.env.EAS_BUILD) {
  version = execSync("npm version patch --no-git-tag-version", { cwd: root, stdio: ["ignore", "pipe", "inherit"] })
    .toString().trim().replace(/^v/, "");
  // The desktop installer carries the same number; set in place to keep the files' formatting.
  // In package-lock.json the first two "version" fields belong to the desktop package itself.
  for (const [file, count] of [["package.json", 1], ["package-lock.json", 2]]) {
    const target = path.join(root, "desktop", file);
    let remaining = count;
    fs.writeFileSync(target, fs.readFileSync(target, "utf8").replace(/("version":\s*")[^"]+"/g,
      (match, prefix) => (remaining-- > 0 ? `${prefix}${version}"` : match)));
  }
}
console.log(`LoopTalk build ${buildLabel(version)} (${version})`);
