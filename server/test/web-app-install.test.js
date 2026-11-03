const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const loadInstaller = ({
  platform = "web", standalone = false, stored = {}, relatedApps = [],
  secure = true, userAgent = "", navigatorPlatform = "", maxTouchPoints = 0,
  userAgentData, desktopBridge,
} = {}) => {
  const navigations = [];
  const storage = new Map(Object.entries(stored));
  const handlers = new Map();
  const displayHandlers = new Map();
  const media = {
    matches: standalone,
    addEventListener: (event, handler) => displayHandlers.set(event, handler),
  };
  const context = {
    Platform: { OS: platform },
    isDesktopApp: () => Boolean(desktopBridge),
    console,
    URL,
    window: {
      isSecureContext: secure,
      addEventListener: (event, handler) => handlers.set(event, handler),
      matchMedia: () => media,
      navigator: {
        getInstalledRelatedApps: async () => relatedApps,
        userAgent, platform: navigatorPlatform, maxTouchPoints, userAgentData,
      },
      looptalkDesktop: desktopBridge,
      location: { origin: "https://looptalk.example", assign: (url) => navigations.push(url) },
      crypto: { randomUUID: () => "test-installation-0001" },
      localStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
    },
    document: { querySelector: () => true },
  };
  const source = fs.readFileSync(path.resolve(
    __dirname, "..", "..", "mobile", "src", "utils", "webAppInstall.js"
  ), "utf8");
  vm.runInNewContext(
    source.replace('import { Platform } from "react-native";', "")
      .replace('import { isDesktopApp } from "./desktopApp";', "")
      .replaceAll("export const ", "const ") +
      "\nthis.installer = { installWebApp, isWebAppInstalled, subscribeWebAppInstallation, detectRelatedWebApp, getWebAppInstallationId, getWebAppInstallHelp, getDesktopDownloadPlatform };",
    context
  );
  return { ...context.installer, storage, handlers, displayHandlers, navigations };
};

test("native platforms do not register install events or offer installation", async () => {
  for (const platform of ["ios", "android"]) {
    const installer = loadInstaller({ platform });
    assert.equal(installer.handlers.size, 0);
    assert.equal(await installer.installWebApp(), "unavailable");
  }
});

test("standalone and previously installed browsers are detected", () => {
  const standalone = loadInstaller({ standalone: true });
  assert.equal(standalone.isWebAppInstalled(), true);
  assert.equal(standalone.storage.get("looptalk.webAppInstalled"), "true");
  const prior = loadInstaller({ stored: { "looptalk.webAppInstalled": "true" } });
  assert.equal(prior.isWebAppInstalled(), true);
  assert.equal(prior.getWebAppInstallationId(), prior.getWebAppInstallationId());
});

test("manual installation remains available without a browser prompt", async () => {
  const installer = loadInstaller();
  assert.equal(await installer.installWebApp(), "manual");
  assert.equal(installer.isWebAppInstalled(), false);
});

test("dismissed or accepted prompts are not treated as confirmed installations", async () => {
  for (const outcome of ["dismissed", "accepted"]) {
    const installer = loadInstaller();
    let prompts = 0;
    installer.handlers.get("beforeinstallprompt")({
      preventDefault() {},
      prompt: async () => { prompts += 1; },
      userChoice: Promise.resolve({ outcome }),
    });
    assert.equal(await installer.installWebApp(), outcome);
    assert.equal(prompts, 1);
    assert.equal(installer.isWebAppInstalled(), false);
    assert.equal(await installer.installWebApp(), "manual");
  }
});

test("confirmed installation persists state, notifies listeners, and has stable ID across reloads", () => {
  const installer = loadInstaller();
  let notifications = 0;
  const unsubscribe = installer.subscribeWebAppInstallation(() => { notifications += 1; });
  installer.handlers.get("appinstalled")();
  assert.equal(installer.isWebAppInstalled(), true);
  assert.equal(notifications, 1);
  const id = installer.getWebAppInstallationId();
  const reload = loadInstaller({ stored: Object.fromEntries(installer.storage) });
  assert.equal(reload.getWebAppInstallationId(), id);
  unsubscribe();
  installer.handlers.get("appinstalled")();
  assert.equal(notifications, 1);
});

test("standalone mode changes and installation in another tab update visibility", () => {
  const installer = loadInstaller();
  installer.displayHandlers.get("change")({ matches: true });
  assert.equal(installer.isWebAppInstalled(), true);
  const otherTab = loadInstaller();
  otherTab.handlers.get("storage")({ key: "looptalk.webAppInstalled", newValue: "true" });
  assert.equal(otherTab.isWebAppInstalled(), true);
});

test("related apps detection only recognizes this app's manifest", async () => {
  const unrelated = loadInstaller({ relatedApps: [{ platform: "webapp", url: "https://other.example/manifest.json" }] });
  await unrelated.detectRelatedWebApp();
  assert.equal(unrelated.isWebAppInstalled(), false);
  const installer = loadInstaller({
    relatedApps: [{ platform: "webapp", url: "https://looptalk.example/app/manifest.webmanifest" }],
  });
  await installer.detectRelatedWebApp();
  assert.equal(installer.isWebAppInstalled(), true);
});

test("prompt failures propagate instead of reporting installation success", async () => {
  const installer = loadInstaller();
  installer.handlers.get("beforeinstallprompt")({
    preventDefault() {},
    prompt: async () => { throw new Error("prompt unavailable"); },
  });
  await assert.rejects(installer.installWebApp(), /prompt unavailable/);
  assert.equal(installer.isWebAppInstalled(), false);
});

test("a fresh install offer resets a previous install marker after uninstall", () => {
  const installer = loadInstaller({ stored: {
    "looptalk.webAppInstalled": "true",
    "looptalk.webAppInstallationId": "previous-install-0001",
  } });
  installer.handlers.get("beforeinstallprompt")({ preventDefault() {} });
  assert.equal(installer.isWebAppInstalled(), false);
  assert.equal(installer.storage.has("looptalk.webAppInstallationId"), false);
});

test("modern prompt results are supported without relying on userChoice", async () => {
  const installer = loadInstaller();
  installer.handlers.get("beforeinstallprompt")({
    preventDefault() {},
    prompt: async () => ({ outcome: "accepted", platform: "web" }),
  });
  assert.equal(await installer.installWebApp(), "accepted");
  assert.equal(installer.isWebAppInstalled(), false);
});

test("invalid browser outcomes are surfaced as errors", async () => {
  const installer = loadInstaller();
  installer.handlers.get("beforeinstallprompt")({
    preventDefault() {},
    prompt: async () => ({}),
  });
  await assert.rejects(installer.installWebApp(), /valid installation outcome/);
});

test("installation help handles HTTPS, iOS, iPad desktop mode and other browsers", () => {
  assert.equal(loadInstaller({ secure: false }).getWebAppInstallHelp(), "https");
  assert.equal(loadInstaller({ userAgent: "Mozilla/5.0 (iPhone)" }).getWebAppInstallHelp(), "ios");
  assert.equal(loadInstaller({
    navigatorPlatform: "MacIntel", maxTouchPoints: 5,
  }).getWebAppInstallHelp(), "ios");
  assert.equal(loadInstaller({ userAgent: "Chrome" }).getWebAppInstallHelp(), "browser");
});

test("desktop browsers download the packaged app for their operating system", async () => {
  const cases = [
    [{ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140", navigatorPlatform: "Win32" }, "windows"],
    [{ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605", navigatorPlatform: "MacIntel" }, "mac"],
    [{ userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/140", navigatorPlatform: "Linux x86_64" }, "linux"],
    [{ userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel) Mobile", navigatorPlatform: "Linux armv8l" }, null],
    [{ userAgent: "Mozilla/5.0 (iPhone)", navigatorPlatform: "iPhone" }, null],
    [{ userAgent: "Mozilla/5.0 (Macintosh)", navigatorPlatform: "MacIntel", maxTouchPoints: 5 }, null],
    [{ userAgent: "Mozilla/5.0 (X11; CrOS x86_64)", navigatorPlatform: "Linux x86_64" }, null],
    [{ userAgent: "Chrome", userAgentData: { mobile: true, platform: "Android" } }, null],
  ];
  for (const [options, expected] of cases) {
    const installer = loadInstaller(options);
    assert.equal(installer.getDesktopDownloadPlatform(), expected, options.userAgent);
    if (expected) assert.equal(await installer.installWebApp(), "download");
    assert.deepEqual(installer.navigations, expected ? [`/download/desktop/${expected}`] : []);
  }
});

test("the packaged desktop app counts as installed and never offers another download", async () => {
  const installer = loadInstaller({
    userAgent: "Mozilla/5.0 (Windows NT 10.0) Electron/45", navigatorPlatform: "Win32",
    desktopBridge: { notify: async () => true },
  });
  assert.equal(installer.isWebAppInstalled(), true);
  assert.equal(installer.handlers.size, 0);
  assert.equal(installer.getDesktopDownloadPlatform(), null);
  assert.equal(await installer.installWebApp(), "unavailable");
  assert.equal(installer.getWebAppInstallationId(), "test-installation-0001");
});
