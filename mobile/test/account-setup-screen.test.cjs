const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const render = (accountSetup) => {
  const filename = path.join(__dirname, "..", "src", "screens", "app", "AccountSetupScreen.js");
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false,
    configFile: false,
    plugins: [
      ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs",
    ],
  });
  const state = { accountSetup, user: { username: "alice" }, changeCredentials: async () => {} };
  const mocks = {
    react: { useState: (value) => [value, () => {}] },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-native": {
      ...Object.fromEntries(["ActivityIndicator", "KeyboardAvoidingView", "ScrollView", "TouchableOpacity", "View"]
        .map((name) => [name, name])),
      Platform: { OS: "web" },
      StyleSheet: { create: (styles) => styles },
    },
    "@expo/vector-icons/Ionicons": { default: "Ionicons" },
    "../../components/AppText": { AppText: "Text" },
    "../../components/AppTextInput": { AppTextInput: "TextInput" },
    "../../components/SocialAuthButtons": { SocialAuthButtons: "SocialAuthButtons" },
    "../../store/authStore": { useAuthStore: (select) => select(state) },
    "../../hooks/useTranslation": { useTranslation: () => (key) => key },
    "../../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
    "../../hooks/useAppInstall": { useAppInstall: () => ({ available: false }) },
    "../../utils/accountPrivacy": { isUsername: () => true, normalizeIdentifier: (value) => value },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename });
  const nodes = (element) => {
    if (Array.isArray(element)) return element.flatMap(nodes);
    if (!element || typeof element !== "object") return [];
    return [element, ...nodes(element.props?.children)];
  };
  const tree = nodes(module.exports.AccountSetupScreen());
  return { texts: tree.map((node) => [].concat(node.props?.children).join("")), tree };
};

test("password-keyed accounts see their sign-in and why it cannot change instead of an empty page", () => {
  const { texts, tree } = render(null);
  for (const key of ["setup.signInTitle", "@alice", "setup.signInFixed"]) assert.ok(texts.includes(key), key);
  assert.ok(!texts.includes("setup.chooseTitle"));
  const social = tree.find((node) => node.type === "SocialAuthButtons");
  assert.equal(social.props.mode, "link");
  assert.ok(social.props.style, "the social section owns its card so it disappears when no provider is available");
});

test("invitation accounts can change their generated username and password", () => {
  const { texts } = render({ generated: { username: "brave-otter-1", password: "p" }, wrapped: true });
  for (const key of ["setup.generatedTitle", "setup.chooseTitle"]) assert.ok(texts.includes(key), key);
  assert.ok(!texts.includes("setup.signInFixed"));
});
