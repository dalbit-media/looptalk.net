const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const babel = require("@babel/core");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const load = (relative, mocks) => {
  const filename = path.resolve(__dirname, "../", relative);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename, configFile: false, babelrc: false,
    plugins: [
      ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs",
    ],
  });
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  } }, { filename });
  return exports;
};

test("browser credentials and tokens survive fresh module loads and logout removes both", async () => {
  const values = new Map();
  const storage = {
    getItem: async (key) => values.get(key) || null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  const mocks = { "@react-native-async-storage/async-storage": storage };
  let tokens = load("src/utils/tokenStorage.web.js", mocks);
  let identity = load("src/storage/ownerIdentityStorage.web.js", mocks);
  await tokens.setItemAsync("token", "saved-session");
  await identity.saveOwnerIdentity("derived-key-not-password");
  tokens = load("src/utils/tokenStorage.web.js", mocks);
  identity = load("src/storage/ownerIdentityStorage.web.js", mocks);
  assert.equal(await tokens.getItemAsync("token"), "saved-session");
  assert.equal(await identity.readOwnerIdentity(), "derived-key-not-password");
  await tokens.deleteItemAsync("token");
  await identity.removeOwnerIdentity();
  assert.equal(values.size, 0);
  assert.equal(await tokens.getItemAsync("token"), null);
  assert.equal(await identity.readOwnerIdentity(), null);
});

test("blocked browser storage surfaces errors rather than pretending sign-in persisted", async () => {
  const storage = {
    getItem: async () => { throw new Error("Storage blocked"); },
    setItem: async () => { throw new Error("Storage blocked"); },
  };
  const mocks = { "@react-native-async-storage/async-storage": storage };
  const tokens = load("src/utils/tokenStorage.web.js", mocks);
  const identity = load("src/storage/ownerIdentityStorage.web.js", mocks);
  await assert.rejects(tokens.setItemAsync("token", "session"), /Storage blocked/);
  await assert.rejects(identity.saveOwnerIdentity("key"), /Storage blocked/);
  await assert.rejects(identity.readOwnerIdentity(), /Storage blocked/);
});

test("shared logo resolves Next static imports, Expo URI assets, and native asset IDs", () => {
  for (const [asset, expected] of [
    [{ default: { src: "/_next/static/media/logo.hash.png", width: 512, height: 512 } }, "/_next/static/media/logo.hash.png"],
    [{ src: "/_next/static/media/logo.png" }, "/_next/static/media/logo.png"],
    [{ uri: "/assets/logo.png" }, "/assets/logo.png"],
    [42, "native:42"],
  ]) {
    const { BrandMark } = load("src/components/BrandMark.js", {
      react: React, "react/jsx-runtime": require("react/jsx-runtime"),
      "react-native": { Image: ({ source, style, accessibilityLabel }) =>
        React.createElement("img", {
          src: typeof source === "number" ? `native:${source}` : source.uri,
          width: style.width, height: style.height, alt: accessibilityLabel,
        }) },
      "../../assets/logo.png": asset,
    });
    const html = renderToStaticMarkup(React.createElement(BrandMark, { size: 88 }));
    assert.ok(html.includes(`src="${expected}"`), html);
    assert.match(html, /width="88"/);
    assert.match(html, /alt="LoopTalk"/);
  }
});

test("splash and login use the shared logo and native splash uses the generated brand asset", () => {
  for (const relative of ["src/components/AppSplash.js", "src/screens/auth/LoginScreen.js"]) {
    const source = fs.readFileSync(path.resolve(__dirname, "../", relative), "utf8");
    assert.match(source, /<BrandMark size=\{\d+\}/);
  }
  const configuration = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../app.json"), "utf8"));
  const [, splash] = configuration.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen");
  const logo = fs.readFileSync(path.resolve(__dirname, "../assets/logo.png"));
  const splashLogo = fs.readFileSync(path.resolve(__dirname, "../", splash.image));
  assert.deepEqual(splashLogo, logo);
  const { isAppStorageKey } = load("src/storage/resetKeys.js", {});
  assert.equal(isAppStorageKey("token"), true);
  assert.equal(isAppStorageKey("looptalk.owner-recovery.v1"), true);
});
