const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { loadEnvironment } = require("../src/config/load-environment");
const { databasePath, appStatePath } = require("../src/utils/appState");

const serverRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(serverRoot, "..");
const contains = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

const resetPlan = (environment, databaseOnly = false) => {
  const database = databasePath(environment);
  const uploads = path.resolve(environment.UPLOAD_DIR || path.join(serverRoot, "uploads"));
  if (!databaseOnly) {
    const forbidden = [repositoryRoot, os.homedir(), path.parse(uploads).root];
    if (forbidden.some((directory) => contains(uploads, directory)) || contains(uploads, database)) {
      throw new Error("Refusing to clear an unsafe upload directory");
    }
    if (contains(repositoryRoot, uploads) && uploads !== path.join(serverRoot, "uploads")) {
      throw new Error("Repository uploads must use the dedicated server/uploads directory");
    }
    let current = uploads;
    while (true) {
      const info = fs.lstatSync(current, { throwIfNoEntry: false });
      if (info?.isSymbolicLink()) {
        throw new Error("Refusing to clear uploads through a symbolic link");
      }
      if (current === uploads && info && !info.isDirectory()) {
        throw new Error("UPLOAD_DIR must be a dedicated directory, not a file");
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return { database, uploads: databaseOnly ? null : uploads, marker: databaseOnly ? null : appStatePath(environment) };
};

const clearUploads = (directory) => {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    fs.rmSync(target, { recursive: entry.isDirectory() && !entry.isSymbolicLink(), force: true });
  }
};

const clearPendingCalls = async (environment) => {
  if (!environment.REDIS_URL?.trim()) return;
  const { createClient } = require("redis");
  const client = createClient({
    url: environment.REDIS_URL,
    socket: { connectTimeout: 10000, reconnectStrategy: false },
  });
  client.on("error", (error) => console.error("Reset Redis error:", error));
  try {
    await client.connect();
    for await (const keys of client.scanIterator({ MATCH: "looptalk:pending-call:*", COUNT: 100 })) {
      if (keys.length) await client.del(keys);
    }
  } finally {
    if (client.isOpen) await client.close();
  }
};

const runReset = async ({ args = process.argv.slice(2), environment = process.env } = {}) => {
  const allowed = new Set(["--confirm-reset", "--database-only", "--allow-production-reset"]);
  if (args.some((argument) => !allowed.has(argument))) throw new Error("Unknown reset argument");
  const plan = resetPlan(environment, args.includes("--database-only"));
  console.log(`Database: ${plan.database}`);
  if (plan.uploads) console.log(`Uploads: ${plan.uploads}\nUpdated clients will erase app-owned local data on their next connection.`);
  if (!args.includes("--confirm-reset")) {
    throw new Error("Reset not performed. Stop all app servers and back up data, then rerun with --confirm-reset.");
  }
  if (environment.NODE_ENV === "production" && !args.includes("--allow-production-reset")) {
    throw new Error("Production reset requires both --confirm-reset and --allow-production-reset.");
  }
  const run = (script, scriptArgs = []) => {
    const result = spawnSync(process.execPath, [script, ...scriptArgs], {
      cwd: serverRoot, env: environment, stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Reset step failed: ${path.basename(script)} (exit ${result.status})`);
  };
  console.log("DESTRUCTIVE RESET: recreating the schema and deleting all database rows.");
  run(require.resolve("prisma/build/index.js"), ["db", "push", "--force-reset", "--skip-generate", "--schema", "prisma/schema.prisma"]);
  if (plan.uploads) {
    clearUploads(plan.uploads);
    await clearPendingCalls(environment);
  }
  run(path.join(__dirname, "seed.js"));
  if (plan.marker) {
    const temporary = `${plan.marker}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ resetId: crypto.randomUUID() }), { mode: 0o600, flag: "wx" });
      fs.renameSync(temporary, plan.marker);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  console.log("Reset complete. Restart the server. Offline/older clients still require manual app-data clearing.");
  return plan;
};

if (require.main === module) {
  loadEnvironment();
  runReset().catch((error) => {
    console.error("Application reset failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { resetPlan, runReset, clearPendingCalls };
