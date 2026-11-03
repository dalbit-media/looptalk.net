const test = require("node:test");
const assert = require("node:assert/strict");

test("web push parsing and configuration", () => {
  const { parseSubscription, webPushConfigured } = require("../src/utils/pushNotifications");
  assert.equal(parseSubscription("not json"), null);
  const subscription = { endpoint: "https://push.example/abc", keys: { p256dh: "a", auth: "b" } };
  assert.equal(parseSubscription(JSON.stringify(subscription)).endpoint, subscription.endpoint);
  assert.equal(typeof webPushConfigured(), "boolean");
});

test("service worker handles push and click events", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../../mobile/web/push-sw.js"), "utf8");
  assert.match(source, /addEventListener\("push"/);
  assert.match(source, /addEventListener\("notificationclick"/);
});

test("Next.js fallback serves real JavaScript at the browser push worker URL without an Expo export", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const vm = require("node:vm");
  const root = path.resolve(__dirname, "..", "..");
  const filename = path.join(root, "app", "app", "push-sw.js", "route.js");
  const { code } = require("@babel/core").transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-modules-commonjs"],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Response,
    require: (name) => {
      assert.equal(name, "../../../mobile/web/push-sw.js?raw");
      return fs.readFileSync(path.join(root, "mobile", "web", "push-sw.js"), "utf8");
    },
    process: { cwd: () => { throw new Error("Worker must not depend on deployment working directory"); } },
  }, { filename });
  const response = await module.exports.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/javascript/);
  assert.equal(response.headers.get("cache-control"), "no-cache");
  assert.equal(response.headers.get("service-worker-allowed"), "/app/");
  assert.equal(await response.text(), fs.readFileSync(path.join(root, "mobile", "web", "push-sw.js"), "utf8"));
});
