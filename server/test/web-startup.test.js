const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");
const express = require("express");
const { validateWebBuild } = require("../src/utils/validateWebBuild");
const { checkWebStartup } = require("../scripts/web-smoke");

test("production rejects missing bootstrap and lazy application chunks", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "looptalk-web-build-"));
  try {
    fs.mkdirSync(path.join(directory, "static"));
    fs.mkdirSync(path.join(directory, "server", "app"), { recursive: true });
    fs.writeFileSync(path.join(directory, "build-manifest.json"),
      JSON.stringify({ rootMainFiles: ["static/runtime.js"] }));
    fs.writeFileSync(path.join(directory, "react-loadable-manifest.json"),
      JSON.stringify({ app: { files: ["static/app.js"] } }));
    assert.throws(() => validateWebBuild(directory), /static\/runtime\.js.*static\/app\.js/);
    fs.writeFileSync(path.join(directory, "static", "runtime.js"), "runtime");
    assert.throws(() => validateWebBuild(directory), /static\/app\.js/);
    fs.writeFileSync(path.join(directory, "static", "app.js"), "app");
    assert.doesNotThrow(() => validateWebBuild(directory));
    fs.writeFileSync(path.join(directory, "server", "app", "page_client-reference-manifest.js"),
      'globalThis.__RSC_MANIFEST = {"chunks":["static/%5Broute%5D.js"]};');
    assert.throws(() => validateWebBuild(directory), /static\/%5Broute%5D\.js/);
    fs.writeFileSync(path.join(directory, "static", "[route].js"), "route");
    assert.doesNotThrow(() => validateWebBuild(directory));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("exported app entry points cannot cache references to a replaced build", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "looptalk-web-cache-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [file, body] of [
    ["index.html", "<html>messenger</html>"], ["chunk.js", "/* app */"],
    ["push-sw.js", "/* worker */"], ["manifest.webmanifest", "{}"],
  ]) fs.writeFileSync(path.join(directory, file), body);
  const app = express();
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
  vm.runInNewContext(source.slice(source.indexOf("if (hasExpoWebBuild) {"), source.indexOf("// Rate limiting")), {
    app, express, path, console, hasExpoWebBuild: true, isDevelopment: false,
    expoWebBuildDirectory: directory, expoWebIndexFile: path.join(directory, "index.html"),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const route of ["/app", "/app/", "/app/index.html", "/app/register"]) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store", route);
  }
  for (const file of ["push-sw.js", "manifest.webmanifest"]) {
    assert.equal((await fetch(`${origin}/app/${file}`)).headers.get("cache-control"), "no-cache");
  }
  assert.match((await fetch(`${origin}/app/chunk.js`)).headers.get("cache-control"), /immutable/);
});

test("web smoke catches the production blank-page failure even when HTML returns 200", async (t) => {
  let status = 200;
  let type = "application/javascript";
  let body = "/* bootstrap */";
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/app") {
      res.setHeader("Content-Type", "text/html");
      res.end('<script src="/runtime.js"></script><script src="/app.js"></script>');
    } else {
      res.writeHead(status, { "Content-Type": type });
      res.end(body);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await checkWebStartup(origin), 2);
  status = 500;
  await assert.rejects(checkWebStartup(origin), /HTTP 500/);
  status = 200;
  type = "text/html";
  await assert.rejects(checkWebStartup(origin), /unexpected content type/);
  type = "application/javascript";
  body = "";
  await assert.rejects(checkWebStartup(origin), /empty asset/);
});
