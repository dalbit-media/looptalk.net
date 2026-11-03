const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createDesktopDownloadRouter, DESKTOP_INSTALLERS } = require("../src/routes/desktopDownload");

const withServer = async (router, run) => {
  const app = express();
  app.use("/download/desktop", router);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("desktop downloads redirect to the packaged installer for each platform", async () => {
  await withServer(createDesktopDownloadRouter({ baseUrl: "https://downloads.example/desktop/" }), async (origin) => {
    for (const [platform, installer] of Object.entries(DESKTOP_INSTALLERS)) {
      const response = await fetch(`${origin}/download/desktop/${platform}`, { redirect: "manual" });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), `https://downloads.example/desktop/${installer}`);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    for (const platform of ["android", "constructor", "__proto__"]) {
      const response = await fetch(`${origin}/download/desktop/${platform}`, { redirect: "manual" });
      assert.equal(response.status, 404);
    }
  });
});

test("without an installer host, desktop download links open the web app; overrides require HTTPS", async () => {
  await withServer(createDesktopDownloadRouter({ baseUrl: "" }), async (origin) => {
    for (const platform of Object.keys(DESKTOP_INSTALLERS)) {
      const response = await fetch(`${origin}/download/desktop/${platform}`, { redirect: "manual" });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), "/app/");
    }
  });
  assert.throws(() => createDesktopDownloadRouter({ baseUrl: "http://downloads.example" }), /HTTPS/);
});

test("installer names match the desktop packaging configuration", () => {
  const { build } = require("../../desktop/package.json");
  const names = (config) => config.artifactName.replace("${ext}", "");
  assert.equal(DESKTOP_INSTALLERS.windows, `${names(build.win)}exe`);
  assert.equal(DESKTOP_INSTALLERS.mac, `${names(build.mac)}dmg`);
  assert.equal(DESKTOP_INSTALLERS.linux, `${names(build.linux)}AppImage`);
  assert.equal(DESKTOP_INSTALLERS["linux-deb"], `${names(build.linux)}deb`);
});
