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
