const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "public", "site", "theme.js"), "utf8");

const startTheme = ({ savedTheme = null, dark = false, storageBlocked = false, metaPresent = true } = {}) => {
  const listeners = {};
  const warnings = [];
  const state = { savedTheme, storageBlocked, metaPresent, metaColor: null };
  const media = {
    matches: dark,
    addEventListener: (name, callback) => { listeners[name] = callback; },
  };
  const document = {
    documentElement: { dataset: {} },
    get body() { throw new Error("Theme initialization must not depend on the body"); },
    querySelector: () => state.metaPresent
      ? { setAttribute: (_, value) => { state.metaColor = value; } }
      : null,
    addEventListener: (name, callback) => { listeners[name] = callback; },
  };
  vm.runInNewContext(source, {
    document,
    window: {
      localStorage: {
        getItem: () => {
          if (state.storageBlocked) throw new Error("Storage access denied");
          return state.savedTheme;
        },
      },
      matchMedia: () => media,
      addEventListener: (name, callback) => { listeners[name] = callback; },
    },
    console: { warn: (...args) => warnings.push(args) },
  });
  return { document, state, media, listeners, warnings };
};

test("website resolves saved and system themes before the body exists", () => {
  for (const [savedTheme, dark, expected] of [
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["system", true, "dark"],
    ["system", false, "light"],
    [null, true, "dark"],
    [null, false, "light"],
    ["invalid", true, "dark"],
    ["invalid", false, "light"],
  ]) {
    const { document, state } = startTheme({ savedTheme, dark });
    assert.equal(document.documentElement.dataset.theme, expected);
    assert.equal(state.metaColor, expected === "dark" ? "#181a19" : "#f4f1e8");
  }
});

test("blocked preference storage explicitly warns and still follows the system theme", () => {
  for (const dark of [true, false]) {
    const { document, warnings } = startTheme({ storageBlocked: true, dark });
    assert.equal(document.documentElement.dataset.theme, dark ? "dark" : "light");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /using the system preference/);
  }
});

test("theme-color metadata is updated when the rest of the head has loaded", () => {
  const { document, state, listeners } = startTheme({ savedTheme: "dark", metaPresent: false });
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(state.metaColor, null);
  state.metaPresent = true;
  listeners.DOMContentLoaded();
  assert.equal(state.metaColor, "#181a19");
});

test("system changes respect explicit choices and storage events update or clear preferences", () => {
  const { document, state, media, listeners } = startTheme({ savedTheme: "light" });
  media.matches = true;
  listeners.change();
  assert.equal(document.documentElement.dataset.theme, "light");
  state.savedTheme = "dark";
  listeners.storage({ key: "unrelated" });
  assert.equal(document.documentElement.dataset.theme, "light");
  listeners.storage({ key: "themeMode" });
  assert.equal(document.documentElement.dataset.theme, "dark");
  state.savedTheme = "system";
  listeners.storage({ key: "themeMode" });
  media.matches = false;
  listeners.change();
  assert.equal(document.documentElement.dataset.theme, "light");
  state.savedTheme = null;
  media.matches = true;
  listeners.storage({ key: null });
  assert.equal(document.documentElement.dataset.theme, "dark");
});

test("website loads its only theme owner synchronously in the document head", () => {
  const layout = fs.readFileSync(path.join(root, "app", "layout.js"), "utf8");
  assert.match(layout, /<head>\s*<script src="\/site\/theme\.js" \/>\s*<\/head>/);
  const runtime = fs.readFileSync(path.join(root, "public", "site", "site.js"), "utf8");
  assert.doesNotMatch(runtime, /dataset\.theme|applyTheme|resolveTheme/);
});

test("website and invitation documents consume one shared light/dark palette", () => {
  const site = fs.readFileSync(path.join(root, "app", "site.css"), "utf8");
  const palette = fs.readFileSync(path.join(root, "public", "site", "theme.css"), "utf8");
  const invitations = fs.readFileSync(path.join(root, "server", "src", "routes", "invitations.js"), "utf8");
  assert.match(site, /@import "\.\.\/public\/site\/theme\.css";/);
  assert.doesNotMatch(site, /--paper:\s*#/);
  assert.match(palette, /--paper: #f4f1e8/);
  assert.match(palette, /--paper: #181a19/);
  assert.match(palette, /:root:not\(\[data-theme="light"\]\)/);
  assert.match(palette, /:root\[data-theme="dark"\]/);
  assert.match(invitations, /src="\/site\/theme\.js"/);
  assert.match(invitations, /href="\/site\/theme\.css"/);
});
