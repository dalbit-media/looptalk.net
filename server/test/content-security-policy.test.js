const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const helmet = require("helmet");
const { createContentSecurityPolicy } = require("../src/utils/contentSecurityPolicy");

for (const isDevelopment of [true, false]) {
  test(`${isDevelopment ? "development" : "production"} CSP permits private attachment blobs only in messenger documents`, async (t) => {
    const app = express();
    app.use((req, res, next) => {
      res.locals.cspNonce = "isolated-test-nonce";
      next();
    });
    app.use(helmet({
      contentSecurityPolicy: createContentSecurityPolicy({ isDevelopment, webClientOrigin: "'self'" }),
    }));
    app.use((req, res) => res.send("test document"));
    const server = await new Promise((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const path of ["/app", "/app/", "/app/chat/fixture", "/", "/privacy", "/application"]) {
      const response = await fetch(`${origin}${path}`);
      await response.text();
      const directives = new Map(response.headers.get("content-security-policy").split(";").map((directive) => {
        const [name, ...sources] = directive.trim().split(/\s+/);
        return [name, sources];
      }));
      const messenger = path === "/app" || path.startsWith("/app/");
      assert.deepEqual(directives.get("default-src"), ["'self'"]);
      assert.deepEqual(directives.get("connect-src"), ["'self'", ...(messenger ? ["blob:"] : [])]);
      assert.deepEqual(directives.get("img-src"), ["'self'", "data:", ...(messenger ? ["blob:"] : [])]);
      assert.deepEqual(directives.get("media-src"), ["'self'", ...(messenger ? ["blob:"] : [])]);
      assert.equal(directives.get("script-src").includes("blob:"), false);
      assert.equal(directives.get("frame-src").includes("blob:"), false);
      assert.equal(directives.get("script-src").includes("'unsafe-eval'"), isDevelopment);
      assert.ok(directives.get("script-src").includes("'nonce-isolated-test-nonce'"));
      for (const name of ["connect-src", "img-src", "media-src", "script-src", "frame-src"]) {
        const sources = directives.get(name);
        assert.equal(sources.includes("*"), false);
        assert.equal(sources.includes("http:"), false);
        assert.equal(sources.includes("https:"), false);
      }
    }
  });
}
