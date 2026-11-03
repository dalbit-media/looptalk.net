const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
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

const generation = spawnSync(
  process.execPath,
  [prismaCli, "generate", "--schema", "prisma/schema.prisma"],
  { cwd: serverDirectory, stdio: "inherit", env: process.env }
);
if (generation.error) throw generation.error;
if (generation.status !== 0) process.exit(generation.status || 1);
console.log(`Prisma client ready (${(performance.now() / 1000).toFixed(2)}s elapsed).`);

const sqliteFile = () => {
  const url = process.env.DATABASE_URL || "";
  if (!url.startsWith("file:")) return null;
  const raw = decodeURIComponent(url.slice(5).split("?")[0]);
  const file = path.isAbsolute(raw) ? raw : path.resolve(serverDirectory, "prisma", raw);
  return fs.existsSync(file) && fs.statSync(file).size > 0 ? file : null;
};

// Snapshot the SQLite file before `db push` so a failed upgrade can be rolled back.
const backupDatabase = () => {
  const file = sqliteFile();
  if (!file) return;
  const directory = path.dirname(file);
  const base = path.basename(file);
  const target = path.join(directory, `${base}.pre-migrate-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  try {
    try {
      const { DatabaseSync } = require("node:sqlite");
      const database = new DatabaseSync(file);
      try { database.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`); } finally { database.close(); }
    } catch {
      fs.copyFileSync(file, target);
    }
    const old = fs.readdirSync(directory).filter((name) => name.startsWith(`${base}.pre-migrate-`)).sort().slice(0, -3);
    for (const name of old) fs.rmSync(path.join(directory, name), { force: true });
    console.log(`Database snapshot saved to ${target}`);
  } catch (error) {
    console.warn(`Database snapshot skipped: ${error.message}`);
  }
};
if (process.env.SKIP_DB_SNAPSHOT !== "1") backupDatabase();

const prepareSchema = () => {
  const file = sqliteFile();
  if (!file) return;
  const { DatabaseSync } = require("node:sqlite");
  const { addNullableUniqueColumns } = require("./prepare-schema");
  const database = new DatabaseSync(file);
  try {
    const schema = fs.readFileSync(path.join(serverDirectory, "prisma", "schema.prisma"), "utf8");
    const added = addNullableUniqueColumns(database, schema);
    if (added.length) console.log(`Added empty unique columns: ${added.join(", ")}`);
  } finally {
    database.close();
  }
};
prepareSchema();

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