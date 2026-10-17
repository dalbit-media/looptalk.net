const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { loadEnvironment } = require("../src/config/load-environment");

loadEnvironment();

const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, ".."),
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
