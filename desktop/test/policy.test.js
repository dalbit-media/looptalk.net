const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isAllowedPermission, isAppOrigin, isExternalWebUrl, linuxAutostartEntry, resolveAppUrl, sanitizeNotification,
} = require("../src/policy");

test("the messenger URL must be HTTPS except on loopback development hosts", () => {
  assert.equal(resolveAppUrl("https://looptalk.net/app").href, "https://looptalk.net/app/");
  assert.equal(resolveAppUrl("https://looptalk.net/app/", "http://localhost:3001/app/?x=1#y").href,
    "http://localhost:3001/app/");
  assert.throws(() => resolveAppUrl("http://looptalk.net/app/"), /HTTPS/);
  assert.throws(() => resolveAppUrl("file:///tmp/index.html"), /HTTPS/);
});

test("only the messenger origin may navigate in-app or receive permissions", () => {
  const appUrl = resolveAppUrl("https://looptalk.net/app/");
  assert.equal(isAppOrigin("https://looptalk.net/app/chat", appUrl), true);
  assert.equal(isAppOrigin("https://looptalk.net.evil.example/app/", appUrl), false);
  assert.equal(isAppOrigin("not a url", appUrl), false);
  for (const permission of ["notifications", "media", "display-capture"]) {
    assert.equal(isAllowedPermission(permission, "https://looptalk.net/app/", appUrl), true);
    assert.equal(isAllowedPermission(permission, "https://evil.example/", appUrl), false);
  }
  assert.equal(isAllowedPermission("geolocation", "https://looptalk.net/app/", appUrl), false);
  assert.equal(isExternalWebUrl("https://example.com"), true);
  assert.equal(isExternalWebUrl("mailto:admin@looptalk.net"), true);
  assert.equal(isExternalWebUrl("file:///etc/passwd"), false);
  assert.equal(isExternalWebUrl("javascript:alert(1)"), false);
});

test("renderer notification requests are bounded and stripped of unexpected data", () => {
  assert.deepEqual(sanitizeNotification({
    title: "x".repeat(500), body: 42, tag: "conversation-room-1", requireInteraction: "yes",
    data: { type: "message", conversationId: "room-1", callId: "../../bad id", extra: "secret" },
  }), {
    title: "x".repeat(120), body: "", tag: "conversation-room-1", silent: false, requireInteraction: false,
    data: { type: "message", conversationId: "room-1", callId: undefined },
  });
  assert.equal(sanitizeNotification().title, "LoopTalk");
});

test("Linux autostart entries quote the executable and start hidden", () => {
  const entry = linuxAutostartEntry({ name: "LoopTalk", execPath: "/opt/Loop Talk/looptalk", args: ["--hidden"] });
  assert.match(entry, /^\[Desktop Entry\]\nType=Application\nName=LoopTalk\n/);
  assert.match(entry, /\nExec="\/opt\/Loop Talk\/looptalk" "--hidden"\n/);
  assert.match(entry, /\nX-GNOME-Autostart-enabled=true\n/);
});
