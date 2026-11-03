const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const load = (relative, mocks = {}, globals = {}) => {
  const filename = path.resolve(__dirname, "..", "src", relative);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false,
    plugins: [["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs"],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console, setTimeout, clearTimeout, Uint8Array, atob, ...globals,
    require: (name) => {
      if (name === "react/jsx-runtime") return require(name);
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename });
  return module.exports;
};
const hooks = () => {
  const states = [];
  let index = 0;
  return {
    reset: () => { index = 0; },
    react: {
      useState: (initial) => {
        const key = index++;
        if (!(key in states)) states[key] = typeof initial === "function" ? initial() : initial;
        return [states[key], (value) => { states[key] = value; }];
      },
      useRef: (initial) => {
        const key = index++;
        if (!(key in states)) states[key] = { current: initial };
        return states[key];
      },
    },
  };
};
const nodes = (element) => {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (!element || typeof element !== "object") return [];
  return [element, ...nodes(element.props?.children)];
};
const native = {
  ...Object.fromEntries(["ActivityIndicator", "Modal", "ScrollView", "TouchableOpacity", "View"].map((name) => [name, name])),
  Platform: { OS: "web" }, StyleSheet: { create: (styles) => styles },
};

test("notification support explains HTTPS, iOS Home Screen and unsupported browsers", () => {
  const support = (window) => load("utils/webNotificationSupport.js", {}, { window }).webNotificationSupport();
  const browser = { isSecureContext: true, navigator: { serviceWorker: {} }, PushManager: {}, Notification: {} };
  assert.equal(support(browser), "ready");
  assert.equal(support({ ...browser, isSecureContext: false }), "https");
  assert.equal(support({ ...browser, navigator: { userAgent: "iPhone" } }), "ios");
  assert.equal(support({ ...browser, navigator: { ...browser.navigator, userAgent: "iPhone", standalone: true } }), "ready");
  assert.equal(support({ ...browser, navigator: { platform: "MacIntel", maxTouchPoints: 5 } }), "ios");
  assert.equal(support({ navigator: {} }), "unsupported");
  assert.equal(support(undefined), "unsupported");
});

const pushFixture = ({ registration = { active: {} }, subscription, getKey, support = "ready" } = {}) => {
  const calls = [];
  const sub = subscription || { toJSON: () => ({ endpoint: "https://push.example/abc", keys: {} }) };
  registration.pushManager = {
    getSubscription: async () => subscription || null,
    subscribe: async () => { calls.push("subscribe"); return sub; },
  };
  const api = load("utils/callNotifications.web.js", {
    "../api/auth": { getWebPushKey: getKey || (async () => ({ publicKey: "AQID" })) },
    "./desktopApp": { getDesktopBridge: () => null, isDesktopApp: () => false },
    "./webNotificationSupport": { webNotificationSupport: () => support },
  }, {
    Notification: { requestPermission: async () => { calls.push("permission"); return "granted"; } },
    navigator: { serviceWorker: {
      register: async (url, options) => { calls.push([url, options.scope]); return registration; },
      get ready() { assert.fail("Must wait for the registered push worker, not a different scope"); },
    } },
  });
  return { api, calls };
};

test("web notifications register the app-scoped worker and create or reuse push subscriptions", async () => {
  const f = pushFixture();
  const permission = f.api.requestPushPermission();
  assert.equal(f.calls[0], "permission", "Permission prompt starts during the tap");
  assert.equal(await permission, "granted");
  assert.equal(JSON.parse(await f.api.getCallPushToken()).endpoint, "https://push.example/abc");
  assert.deepEqual(f.calls, ["permission", ["/app/push-sw.js", "/app/"], "subscribe"]);
  const existing = pushFixture({ subscription: { toJSON: () => ({ endpoint: "https://push.example/existing" }) } });
  assert.equal(JSON.parse(await existing.api.getCallPushToken()).endpoint, "https://push.example/existing");
  assert.equal(existing.calls.includes("subscribe"), false);
  assert.equal(await pushFixture({ support: "ios" }).api.requestPushPermission(), "ios");
});

test("web notifications wait for their own worker activation and surface installation failures", async () => {
  let changed;
  const worker = {
    state: "installing",
    addEventListener: (_event, callback) => {
      changed = callback;
      queueMicrotask(() => { worker.state = "activated"; changed(); });
    },
    removeEventListener() {},
  };
  assert.ok(await pushFixture({ registration: { installing: worker } }).api.getCallPushToken());
  await assert.rejects(pushFixture({ registration: {} }).api.getCallPushToken(), /activate the notification service worker/);
  await assert.rejects(pushFixture({ getKey: async () => { throw new Error("Server unavailable"); } }).api.getCallPushToken(),
    /Server unavailable/);
});

test("notification preference is enabled only after a real subscription is saved", async () => {
  const calls = [];
  let enabled = false;
  let fail = false;
  const preferences = { get notificationsEnabled() { return enabled; }, setNotificationsEnabled: async () => { enabled = true; } };
  const api = load("utils/pushRegistration.js", {
    "react-native": native,
    "../api/auth": { registerDeviceToken: async (...args) => { calls.push(args); if (fail) throw new Error("Offline"); } },
    "../store/authStore": { useAuthStore: { getState: () => ({ token: "auth-token" }) } },
    "../store/preferencesStore": { usePreferencesStore: { getState: () => preferences } },
    "./callNotifications": { requestPushPermission: async () => "granted", getCallPushToken: async () => "subscription" },
    "./desktopApp": { isDesktopApp: () => false },
  });
  let permissionGranted = false;
  assert.equal(await api.enablePushNotifications({ onPermissionGranted: () => { permissionGranted = true; } }), "granted");
  assert.equal(permissionGranted, true);
  assert.equal(enabled, true);
  assert.deepEqual(calls, [["subscription", "web", "auth-token"]]);
  enabled = false;
  fail = true;
  await assert.rejects(api.enablePushNotifications(), /Offline/);
  assert.equal(enabled, false);
});

const setupFixture = ({ support = "ready", initialPermission = "default", enable } = {}) => {
  const state = hooks();
  let permission = initialPermission;
  let closed = 0;
  const errors = [];
  const { NotificationSetup } = load("components/NotificationSetup.js", {
    react: state.react, "react-native": native,
    "./AppText": { AppText: "Text" },
    "../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
    "../hooks/useTranslation": { useTranslation: () => (key) => key },
    "../utils/pushRegistration": {
      browserNotificationPermission: () => permission,
      enablePushNotifications: enable || (async ({ onPermissionGranted }) => {
        permission = "granted"; onPermissionGranted(); return "granted";
      }),
    },
    "../utils/webNotificationSupport": { webNotificationSupport: () => support },
  }, { console: { error: (...args) => errors.push(args) } });
  const render = () => { state.reset(); return NotificationSetup({ onClose: () => { closed++; } }); };
  const button = () => nodes(render()).find((node) => node.props?.accessibilityLabel === "notificationSetup.enable");
  return { render, button, errors, closed: () => closed };
};

test("guided setup shows numbered steps, connects on explicit tap and confirms completion", async () => {
  const f = setupFixture();
  const texts = nodes(f.render()).map((node) => node.props?.children);
  for (const step of ["prepare", "permission", "register"]) assert.ok(texts.includes(`notificationSetup.${step}`));
  await f.button().props.onPress();
  assert.ok(nodes(f.render()).some((node) => node.props?.children === "notificationSetup.success"));
  assert.equal(f.button(), undefined);
});

test("guided setup handles blocked permission, dismissal, unsupported environments and retryable failures", async () => {
  for (const [result, help] of [["denied", "blocked"], ["default", "dismissed"]]) {
    const f = setupFixture({ enable: async () => result });
    await f.button().props.onPress();
    assert.ok(nodes(f.render()).some((node) => node.props?.children === `notificationSetup.${help}`));
  }
  for (const support of ["ios", "https", "unsupported"]) {
    const f = setupFixture({ support });
    assert.equal(f.button(), undefined);
    assert.ok(nodes(f.render()).some((node) => node.props?.children === `notificationSetup.${support}`));
  }
  const failure = setupFixture({ enable: async () => { throw new Error("Worker not served"); } });
  await failure.button().props.onPress();
  assert.ok(nodes(failure.render()).some((node) => node.props?.children === "notificationSetup.failed"));
  assert.equal(failure.errors.length, 1);
  assert.equal(failure.button().props.disabled, false);
});

test("notification setup prevents duplicate requests and closing during registration", async () => {
  let finish;
  let calls = 0;
  const f = setupFixture({ enable: () => { calls++; return new Promise((resolve) => { finish = resolve; }); } });
  const button = f.button();
  const pending = button.props.onPress();
  await button.props.onPress();
  assert.equal(calls, 1);
  f.render().props.onRequestClose();
  assert.equal(f.closed(), 0);
  assert.equal(f.button().props.disabled, true);
  finish("granted");
  await pending;
  f.render().props.onRequestClose();
  assert.equal(f.closed(), 1);
});

test("notification and installation actions share one row and installation does not open account settings", () => {
  const state = hooks();
  let installed = 0;
  let notificationsEnabled = false;
  const { AccountSetupBanner } = load("components/AccountSetupBanner.js", {
    react: state.react, "react-native": native,
    "@expo/vector-icons/Ionicons": { default: "Icon" },
    "./AppText": { AppText: "Text" },
    "../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
    "../store/preferencesStore": { usePreferencesStore: (select) => select({ notificationsEnabled }) },
    "../store/authStore": { useAuthStore: (select) => select({ user: { member: true }, accountSetup: {}, dismissSetupBanner() {} }) },
    "../hooks/useTranslation": { useTranslation: () => (key) => key },
    "../hooks/useAppInstall": { useAppInstall: () => ({ available: true, label: "Install", install: () => { installed++; } }) },
    "./GuestJoinBanner": { Banner: "Banner" },
    "../utils/desktopApp": { isDesktopApp: () => false },
    "./NotificationSetup": { NotificationSetup: "NotificationSetup" },
  });
  const render = () => { state.reset(); return AccountSetupBanner({ onPress: () => assert.fail("Account settings are not installation") }); };
  const tree = render();
  const row = tree.props.children[0];
  assert.equal(row.props.style.flexDirection, "row");
  const buttons = nodes(row).filter((node) => node.type === "TouchableOpacity");
  assert.equal(buttons.length, 3);
  buttons[1].props.onPress();
  assert.equal(installed, 1);
  buttons[0].props.onPress();
  assert.ok(nodes(render()).some((node) => node.type === "NotificationSetup"));
  notificationsEnabled = true;
  assert.ok(nodes(render()).some((node) => node.type === "NotificationSetup"), "Completion remains visible after enabling");
});

test("every supported locale includes all notification setup steps and recovery guidance", () => {
  const filename = path.resolve(__dirname, "..", "src", "i18n", "i18n.js");
  const ast = babel.parseSync(fs.readFileSync(filename, "utf8"), { babelrc: false, configFile: false });
  const translations = ast.program.body.find((node) => node.type === "VariableDeclaration" &&
    node.declarations[0].id.name === "translations").declarations[0].init;
  for (const locale of translations.properties) {
    const keys = new Set(locale.value.properties.map((property) => property.key.value));
    for (const key of ["intro", "prepare", "permission", "register", "enable", "waiting", "connecting",
      "success", "blocked", "dismissed", "https", "ios", "unsupported", "failed"]) {
      assert.ok(keys.has(`notificationSetup.${key}`), `${locale.key.name}: ${key}`);
    }
  }
});
