const { spawnSync } = require("node:child_process");
const path = require("node:path");

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
if (!isDevelopment) prismaArgs.push("--accept-data-loss");
const migration = spawnSync(
  process.execPath,
  prismaArgs,
  { cwd: serverDirectory, stdio: "inherit", env: process.env }
);
if (migration.status !== 0) process.exit(migration.status || 1);

if (isWatch) {
  const watcher = spawnSync(
    process.execPath,
    ["--watch", "src/server.js", ...(isDevelopment ? ["--dev"] : [])],
    { cwd: serverDirectory, stdio: "inherit", env: process.env }
  );
  process.exit(watcher.status || 0);
}

require("../src/server");