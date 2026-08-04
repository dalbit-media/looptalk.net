const { spawnSync } = require("node:child_process");

const prismaCli = require.resolve("prisma/build/index.js");
const migration = spawnSync(
  process.execPath,
  [prismaCli, "db", "push", "--skip-generate", "--accept-data-loss", "--schema", "prisma/schema.prisma"],
  { cwd: require("node:path").resolve(__dirname, ".."), stdio: "inherit", env: process.env }
);
if (migration.status !== 0) process.exit(migration.status || 1);

require("../src/server");