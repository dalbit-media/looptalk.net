const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const vm = require("node:vm");
const { PrismaClient } = require("@prisma/client");
const { resetPlan, runReset } = require("../scripts/reset");
const { seedDatabase } = require("../scripts/seed");
const { databasePath, readAppState } = require("../src/utils/appState");

const fixture = (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "looptalk-reset-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = path.join(directory, "isolated.db");
  return {
    directory, database,
    environment: {
      ...process.env, NODE_ENV: "test", DATABASE_URL: `file:${database.replace(/\\/g, "/")}`,
      UPLOAD_DIR: path.join(directory, "uploads"), REDIS_URL: "",
    },
  };
};

test("reset validates persistent SQLite and refuses unsafe upload paths before any writes", (t) => {
  const f = fixture(t);
  assert.equal(databasePath(f.environment), f.database);
  assert.equal(databasePath({ DATABASE_URL: "file:./relative.db" }),
    path.resolve(__dirname, "../prisma/relative.db"));
  assert.equal(databasePath({ DATABASE_URL: "file:./literal%20name.db?connection_limit=1" }),
    path.resolve(__dirname, "../prisma/literal%20name.db"));
  for (const value of ["", "postgresql://localhost/db", "file::memory:", "file::memory:?cache=shared", "file:"]) {
    assert.throws(() => databasePath({ DATABASE_URL: value }), /SQLite|file/);
  }
  for (const uploads of [
    os.homedir(), path.parse(f.directory).root, f.directory,
    path.resolve(__dirname, "../.."), path.resolve(__dirname, "../src"),
  ]) {
    assert.throws(() => resetPlan({ ...f.environment, UPLOAD_DIR: uploads }), /unsafe|dedicated/);
  }
  const linked = path.join(f.directory, "linked");
  fs.mkdirSync(f.environment.UPLOAD_DIR);
  fs.symlinkSync(f.environment.UPLOAD_DIR, linked, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => resetPlan({ ...f.environment, UPLOAD_DIR: linked }), /symbolic/);
  const uploadFile = path.join(f.directory, "not-an-upload-directory");
  fs.writeFileSync(uploadFile, "retain");
  assert.throws(() => resetPlan({ ...f.environment, UPLOAD_DIR: uploadFile }), /directory, not a file/);
  assert.equal(fs.existsSync(f.database), false);
  const marker = `${f.database}.app-state.json`;
  fs.writeFileSync(marker, JSON.stringify({ resetId: "-".repeat(36) }));
  assert.throws(() => readAppState(f.environment), /Invalid application reset marker/);
  fs.writeFileSync(marker, "{");
  assert.throws(() => readAppState(f.environment), SyntaxError);
});

test("npm reset scripts include confirmation while database-only reset remains explicit", () => {
  const rootPackage = require("../../package.json");
  const serverPackage = require("../package.json");
  assert.equal(rootPackage.scripts.reset, "node server/scripts/reset.js --confirm-reset");
  assert.equal(serverPackage.scripts.reset, "node scripts/reset.js --confirm-reset");
  assert.equal(serverPackage.scripts["db:reset"], "node scripts/reset.js --database-only");
});

test("missing confirmation, invalid arguments, and production safeguards never create a database", async (t) => {
  const f = fixture(t);
  await assert.rejects(runReset({ args: [], environment: f.environment }), /confirm-reset/);
  await assert.rejects(runReset({ args: ["--force"], environment: f.environment }), /Unknown/);
  await assert.rejects(runReset({
    args: ["--confirm-reset"], environment: { ...f.environment, NODE_ENV: "production" },
  }), /allow-production-reset/);
  assert.equal(fs.existsSync(f.database), false);
  assert.equal(fs.existsSync(f.environment.UPLOAD_DIR), false);
});

test("confirmed reset rebuilds schema, removes data/uploads, seeds safely and publishes a persistent client reset ID", async (t) => {
  const f = fixture(t);
  const setup = spawnSync(process.execPath, [
    require.resolve("prisma/build/index.js"), "db", "push", "--skip-generate",
    "--schema", path.resolve(__dirname, "../prisma/schema.prisma"),
  ], { env: f.environment, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr || setup.stdout);
  const prisma = new PrismaClient({ datasources: { db: { url: f.environment.DATABASE_URL } } });
  t.after(() => prisma.$disconnect());
  await prisma.user.create({ data: { id: "discard-me", username: "discard-me", displayName: "Discard me" } });
  await prisma.$executeRawUnsafe("CREATE TABLE obsolete_schema (id INTEGER PRIMARY KEY)");
  await prisma.$disconnect();
  fs.mkdirSync(path.join(f.environment.UPLOAD_DIR, "nested"), { recursive: true });
  fs.writeFileSync(path.join(f.environment.UPLOAD_DIR, "nested", "private.txt"), "discard");
  const retained = path.join(f.directory, "unrelated.txt");
  fs.writeFileSync(retained, "retain");
  const preserved = path.join(f.directory, "preserved-assets");
  fs.mkdirSync(preserved);
  fs.writeFileSync(path.join(preserved, "unrelated.txt"), "retain");
  fs.symlinkSync(preserved, path.join(f.environment.UPLOAD_DIR, "linked"),
    process.platform === "win32" ? "junction" : "dir");
  assert.deepEqual(readAppState(f.environment), { resetId: "initial" });

  const plan = await runReset({ args: ["--confirm-reset"], environment: f.environment });
  const state = readAppState(f.environment);
  assert.match(state.resetId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(JSON.parse(fs.readFileSync(plan.marker, "utf8")), state);
  assert.deepEqual(fs.readdirSync(f.environment.UPLOAD_DIR), []);
  assert.equal(fs.readFileSync(retained, "utf8"), "retain");
  assert.equal(fs.readFileSync(path.join(preserved, "unrelated.txt"), "utf8"), "retain");
  const users = await prisma.user.findMany();
  assert.equal(users.length, 1);
  assert.equal(users[0].id, "looptalk-system");
  assert.equal(users[0].status, "SYSTEM");
  assert.equal(users[0].passwordHash, null);
  assert.equal(await prisma.user.count({ where: { status: { not: "SYSTEM" } } }), 0);
  assert.equal(await prisma.conversation.count(), 0);
  assert.deepEqual(await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE name = 'obsolete_schema'"), []);
  await seedDatabase(prisma);
  await seedDatabase(prisma);
  assert.equal(await prisma.user.count(), 1);
  await prisma.$disconnect();

  fs.writeFileSync(path.join(f.environment.UPLOAD_DIR, "retained.txt"), "retain");
  await runReset({ args: ["--database-only", "--confirm-reset"], environment: f.environment });
  assert.deepEqual(readAppState(f.environment), state);
  assert.equal(fs.readFileSync(path.join(f.environment.UPLOAD_DIR, "retained.txt"), "utf8"), "retain");
  await runReset({ args: ["--confirm-reset"], environment: f.environment });
  assert.notEqual(readAppState(f.environment).resetId, state.resetId);
  assert.deepEqual(fs.readdirSync(f.environment.UPLOAD_DIR), []);

  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  const output = [];
  const child = spawn(process.execPath, [path.resolve(__dirname, "../src/server.js"), "--dev"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...f.environment, PORT: String(port), SENTRY_DSN: "", CORS_ORIGIN: "",
      USER_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  child.stdout.on("data", (value) => output.push(value.toString()));
  child.stderr.on("data", (value) => output.push(value.toString()));
  try {
    const origin = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 20000;
    let response;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        response = await fetch(`${origin}/api/app-state`, { signal: AbortSignal.timeout(1000) });
        break;
      } catch (error) {
        if (error.name !== "TimeoutError" && error.cause?.code !== "ECONNREFUSED") throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.ok(response, `Reset fixture server failed readiness: ${output.join("")}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), readAppState(f.environment));
    const bootstrap = await fetch(`${origin}/api/auth/bootstrap-status`);
    assert.equal(bootstrap.status, 200);
    assert.equal((await bootstrap.json()).bootstrapAvailable, true);
  } finally {
    if (child.exitCode === null) child.kill();
    await exited;
  }
});

test("reset removes only pending-call Redis batches and closes the connection on errors", async () => {
  const events = [];
  let fail = false;
  const client = {
    isOpen: false,
    on: () => {},
    connect: async () => { client.isOpen = true; },
    scanIterator: async function* (options) {
      assert.equal(options.MATCH, "looptalk:pending-call:*");
      yield [];
      yield ["looptalk:pending-call:user:call"];
    },
    del: async (keys) => { events.push([...keys]); if (fail) throw new Error("Redis failure"); },
    close: async () => { client.isOpen = false; events.push("close"); },
  };
  const module = { exports: {} };
  const filename = path.resolve(__dirname, "../scripts/reset.js");
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, process, console, __dirname: path.dirname(filename),
    require: Object.assign((name) => name === "redis" ? {
      createClient: (options) => {
        assert.equal(options.socket.reconnectStrategy, false);
        return client;
      },
    } : require(require.resolve(name, { paths: [path.dirname(filename)] })), { main: null }),
  }, { filename });
  await module.exports.clearPendingCalls({ REDIS_URL: "redis://test.invalid" });
  assert.deepEqual(events, [["looptalk:pending-call:user:call"], "close"]);
  fail = true;
  await assert.rejects(module.exports.clearPendingCalls({ REDIS_URL: "redis://test.invalid" }), /Redis failure/);
  assert.equal(events.at(-1), "close");
  assert.equal(client.isOpen, false);
});
