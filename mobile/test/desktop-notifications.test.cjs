const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const compile = (relative, mocks, globals = {}) => {
  const filename = path.join(__dirname, "..", "src", relative);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false,
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console, ...globals,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename });
  return module.exports;
};

const load = ({ bridge, enabled = true, focused = false } = {}) => compile("utils/desktopNotifications.js", {
  "../i18n/i18n": { t: (key) => key },
  "../store/preferencesStore": { usePreferencesStore: { getState: () => ({ notificationsEnabled: enabled }) } },
  "./desktopApp": { getDesktopBridge: () => bridge || null },
  "./messagePreview": compile("utils/messagePreview.js", {}),
}, { document: { visibilityState: focused ? "visible" : "hidden", hasFocus: () => focused } });

const recordingBridge = () => {
  const shown = [];
  const closed = [];
  return {
    shown, closed,
    notify: async (notification) => { shown.push(JSON.parse(JSON.stringify(notification))); return true; },
    closeNotification: async (tag) => { closed.push(tag); },
  };
};

const message = {
  id: "m1", conversationId: "room-1", senderId: "bob", messageType: "TEXT", content: "Hello there",
  sender: { displayName: "Bob" },
};

test("browsers and native apps never raise desktop notifications", () => {
  const notifications = load();
  notifications.notifyDesktopMessage(message);
  notifications.notifyDesktopIncomingCall({ callId: "c1", caller: { username: "bob" } });
  notifications.closeDesktopCallNotification("c1");
});

test("the desktop app notifies new messages unless that conversation is open and focused", () => {
  const bridge = recordingBridge();
  load({ bridge }).notifyDesktopMessage(message, { isOpenConversation: true });
  assert.deepEqual(bridge.shown, [{
    title: "Bob", body: "Hello there", tag: "conversation-room-1",
    data: { type: "message", conversationId: "room-1" },
  }]);
  const focused = recordingBridge();
  const notifications = load({ bridge: focused, focused: true });
  notifications.notifyDesktopMessage(message, { isOpenConversation: true });
  assert.equal(focused.shown.length, 0);
  notifications.notifyDesktopMessage({ ...message, messageType: "IMAGE", content: "" });
  notifications.notifyDesktopMessage({ ...message, messageType: "UNKNOWN", content: "" });
  assert.deepEqual(focused.shown.map((shown) => shown.body), ["messages.imageCaption", "notifications.newMessage"]);
});

test("the desktop notification preference silences messages and calls", () => {
  const bridge = recordingBridge();
  const notifications = load({ bridge, enabled: false });
  notifications.notifyDesktopMessage(message);
  notifications.notifyDesktopIncomingCall({ callId: "c1", callType: "video", caller: { username: "bob" } });
  assert.equal(bridge.shown.length, 0);
});

test("incoming calls stay on screen until the call is answered, declined or ended", () => {
  const bridge = recordingBridge();
  const notifications = load({ bridge });
  notifications.notifyDesktopIncomingCall({
    callId: "c1", conversationId: "room-1", callType: "video", caller: { username: "bob" },
  });
  assert.deepEqual(bridge.shown, [{
    title: "bob", body: "calls.incomingVideoCall", tag: "call-c1", requireInteraction: true,
    data: { type: "incoming_call", callId: "c1", conversationId: "room-1" },
  }]);
  notifications.closeDesktopCallNotification("c1");
  notifications.closeDesktopCallNotification(undefined);
  assert.deepEqual(bridge.closed, ["call-c1"]);
});

test("the desktop app uses the standard permission prompt and never subscribes to Web Push", async () => {
  let asked = 0;
  const notifications = compile("utils/callNotifications.web.js", {
    "../api/auth": { getWebPushKey: async () => assert.fail("desktop must not use Web Push") },
    "./desktopApp": { getDesktopBridge: () => recordingBridge(), isDesktopApp: () => true },
    "./webNotificationSupport": { webNotificationSupport: () => "ready" },
  }, {
    window: { PushManager: class {}, Notification: {} },
    navigator: { serviceWorker: {} },
    Notification: { requestPermission: async () => { asked++; return "granted"; } },
  });
  assert.equal(await notifications.requestPushPermission(), "granted");
  assert.equal(asked, 1);
  assert.equal(await notifications.getCallPushToken(), null);
});
