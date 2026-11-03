const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../App.js"), "utf8");
const start = source.indexOf("async function initialize() {");
const end = source.indexOf("\n    initialize();", start);

test("startup dismisses its placeholder immediately after required initialization without a timer", async () => {
  const events = [];
  let releaseAuth;
  const authReady = new Promise((resolve) => { releaseAuth = resolve; });
  const context = {
    mounted: true, initialized: false,
    loadI18n: () => events.push("language"),
    checkReset: async () => events.push("reset"),
    usePreferencesStore: { getState: () => ({ initialize: async () => events.push("preferences") }) },
    useAuthStore: {
      getState: () => ({ initialize: async () => { events.push("auth"); await authReady; } }),
      setState: () => assert.fail("Initialization should succeed"),
    },
    SplashScreen: { hideAsync: async () => events.push("hideNative") },
    setShowSplash: (value) => events.push(`splash:${value}`),
    setResetError: () => assert.fail("Initialization should succeed"),
    setTimeout: () => assert.fail("No artificial startup delay allowed"),
    console,
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + "\nthis.startup = initialize();", context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["language", "reset", "preferences", "hideNative", "auth"]);
  assert.equal(events.includes("splash:false"), false, "Never bypass auth to reduce loading time");
  releaseAuth();
  await context.startup;
  assert.equal(events.at(-1), "splash:false");
  assert.equal(context.initialized, true);
});
