const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const express = require("express");
const jwt = require("jsonwebtoken");

test("installation telemetry persists unique confirmed browser installs", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "looptalk-installs-"));
  process.env.DATABASE_URL = `file:${path.join(directory, "test.db")}`;
  process.env.UPLOAD_DIR = path.join(directory, "uploads");
  process.env.JWT_SECRET = "installation-test-secret-not-for-production";
  const prisma = require("../src/db/client");
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const setup = spawnSync(process.execPath, [
    require.resolve("prisma/build/index.js"), "db", "push",
    "--schema", path.resolve(__dirname, "..", "prisma", "schema.prisma"), "--skip-generate",
  ], { env: process.env, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.error?.message || setup.stderr || setup.stdout);
  const user = await prisma.user.create({ data: { username: "installtest", displayName: "Install test" } });
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
  process.env.ADMIN_USER_IDS = user.id;
  const app = express();
  app.use(express.json());
  app.use("/api/telemetry", require("../src/routes/telemetry"));
  app.use("/api/admin", require("../src/routes/admin"));
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = async (body, authorization = token) => fetch(`${origin}/api/telemetry/web-app-install`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
    },
    body: JSON.stringify(body),
  });

  assert.equal((await post({ installationId: "browser-install-0001" }, null)).status, 401);
  for (const body of [{}, { installationId: "" }, { installationId: 10 }, { installationId: [] },
    { installationId: "short" }, { installationId: "x".repeat(101) }, { installationId: "../invalid/id0001" }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal(await prisma.webAppInstallation.count(), 0);
  const responses = await Promise.all(
    Array.from({ length: 5 }, () => post({ installationId: "browser-install-0001" }))
  );
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(await prisma.webAppInstallation.count(), 1);
  assert.equal((await post({ installationId: "browser-install-0002" })).status, 200);
  assert.equal(await prisma.webAppInstallation.count(), 2);
  await prisma.$disconnect();
  assert.equal(await prisma.webAppInstallation.count(), 2);
  const overview = await fetch(`${origin}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(overview.status, 200);
  assert.equal((await overview.json()).counts.webAppInstalls, 2);
  await prisma.user.delete({ where: { id: user.id } });
  assert.equal((await post({ installationId: "browser-install-0003" })).status, 401);
  assert.equal(await prisma.webAppInstallation.count(), 2);
});
