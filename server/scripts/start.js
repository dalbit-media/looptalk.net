const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { loadEnvironment } = require("../src/config/load-environment");
const { performance } = require("node:perf_hooks");

loadEnvironment();
const prismaCli = require.resolve("prisma/build/index.js");
const isDevelopment = process.argv.includes("--dev");
const isWatch = process.argv.includes("--watch");
const serverDirectory = path.resolve(__dirname, "..");
const prismaArgs = [
  prismaCli,
  "db",
  "push",
  "--skip-generate",
  "--schema",
  "prisma/schema.prisma",
];
const migration = spawnSync(
  process.execPath,
  prismaArgs,
  { cwd: serverDirectory, stdio: "inherit", env: process.env }
);
if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status || 1);
console.log(`Database schema ready (${(performance.now() / 1000).toFixed(2)}s elapsed).`);

if (isWatch) {
  const watcher = spawnSync(
    process.execPath,
    ["--watch", "src/server.js", ...(isDevelopment ? ["--dev"] : [])],
    { cwd: serverDirectory, stdio: "inherit", env: process.env }
  );
  process.exit(watcher.status || 0);
}

require("../src/server");