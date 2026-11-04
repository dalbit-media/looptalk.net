#!/usr/bin/env node
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const buildLabel = require("../mobile/src/config/buildLabel");

const root = path.resolve(__dirname, "..");
const version = execSync("npm version patch --no-git-tag-version", { cwd: root, stdio: ["ignore", "pipe", "inherit"] })
  .toString().trim().replace(/^v/, "");
// The first two lockfile versions belong to the desktop package, not dependencies.
for (const [file, count] of [["package.json", 1], ["package-lock.json", 2]]) {
  const target = path.join(root, "desktop", file);
  let remaining = count;
  fs.writeFileSync(target, fs.readFileSync(target, "utf8").replace(/("version":\s*")[^"]+"/g,
    (match, prefix) => (remaining-- > 0 ? `${prefix}${version}"` : match)));
}
console.log(`LoopTalk build ${buildLabel(version)} (${version})`);
