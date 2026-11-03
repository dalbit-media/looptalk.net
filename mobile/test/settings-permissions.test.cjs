const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const fixture = (platform, linking) => {
  const alerts = [];
  const errors = [];
  const states = [];
  let stateIndex = 0;
  const filename = path.join(__dirname, "..", "src", "screens", "app", "SettingsScreen.js");
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false,
    configFile: false,
    plugins: [
      ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs",
    ],
  });
  const mocks = {
    react: { useEffect: () => {}, useState: (value) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = value;
      return [states[index], (next) => { states[index] = next; }];
    } },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-native": {
      ...Object.fromEntries(["ActivityIndicator", "Switch", "TouchableOpacity", "View", "ScrollView"]
        .map((name) => [name, name])),
      Platform: { OS: platform },
      Linking: linking,
      StyleSheet: { create: (styles) => styles },
    },
    "@expo/vector-icons/Ionicons": { default: "Ionicons" },
    "../../components/UserProfileHeader": { UserProfileHeader: "UserProfileHeader" },
    "../../components/NotificationSetup": { NotificationSetup: "NotificationSetup" },
    "../../components/AppText": { AppText: "Text" },
    "../../api/auth": {},
    "../../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
    "../../store/authStore": { useAuthStore: (select) => select({ user: { id: "me" }, token: "token" }) },
    "../../store/messageStore": { useMessageStore: (select) => select({}) },
    "../../store/preferencesStore": { usePreferencesStore: (select) => select({}) },
    "../../i18n/i18n": { t: (key, params) => (params?.version ? `${key} ${params.version}` : key) },
    "../../utils/showAlert": { showAlert: (...args) => alerts.push(args) },
    "../../utils/pushRegistration": {},
    "../../utils/desktopApp": { isDesktopApp: () => false },
    "../../utils/chatTextSize": { getChatMessageFontSize: () => 16 },
    "../../config/environment": { API_URL: "https://example.test", BUILD_LABEL: "v.07" },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    console: { error: (...args) => errors.push(args) },
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename });
  const render = () => { stateIndex = 0; return module.exports.SettingsScreen({ navigation: {} }); };
  const tree = render();
  const nodes = (element) => {
    if (Array.isArray(element)) return element.flatMap(nodes);
    if (!element || typeof element !== "object") return [];
    return [element, ...nodes(element.props?.children)];
  };
  const label = platform === "web" ? "settings.browserPermissions" : "settings.devicePermissions";
  const button = nodes(tree).find((node) =>
    node.type === "TouchableOpacity" &&
    nodes(node).some((child) => child.props?.children === label));
  assert.ok(button, `Permission button for ${platform}`);
  return { press: button.props.onPress, alerts, errors, tree, nodes, render };
};

test("build numbers display as v.01, v.02 and keep growing past two digits", () => {
  const buildLabel = require("../src/config/buildLabel");
  assert.equal(buildLabel("0.0.1"), "v.01");
  assert.equal(buildLabel("0.0.12"), "v.12");
  assert.equal(buildLabel("0.0.123"), "v.123");
  assert.equal(buildLabel(undefined), "v.00");
  assert.match(buildLabel(require("../../package.json").version), /^v\.\d{2,}$/);
});

test("settings keep the original menu and show the build version in About", () => {
  const { tree, nodes } = fixture("web", {});
  const texts = nodes(tree).map((node) => [].concat(node.props?.children).join(""));
  assert.ok(texts.includes("settings.version v.07"));
  const order = ["settings.account", "settings.browserPermissions", "settings.notifications",
    "settings.about", "settings.externalLinks"].map((key) => texts.indexOf(key));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(!order.includes(-1));
});

test("web permission button explains site settings without the unavailable native method", async () => {
  const screen = fixture("web", {});
  await screen.press();
  assert.deepEqual(screen.alerts, [["settings.browserPermissions", "settings.browserPermissionsHelp"]]);
  assert.equal(screen.errors.length, 0);
});

test("web notification switch opens the guided setup before requesting any browser permissions", async () => {
  const screen = fixture("web", {});
  const toggle = screen.nodes(screen.tree).find((node) => node.type === "Switch");
  await toggle.props.onValueChange(true);
  const guide = screen.nodes(screen.render()).find((node) => node.type === "NotificationSetup");
  assert.ok(guide);
  assert.equal(screen.alerts.length, 0);
  guide.props.onClose();
  assert.equal(screen.nodes(screen.render()).some((node) => node.type === "NotificationSetup"), false);
});
for (const platform of ["ios", "android"]) {
  test(`${platform} permission button opens native settings`, async () => {
    let opens = 0;
    const screen = fixture(platform, { openSettings: async () => { opens++; } });
    await screen.press();
    assert.equal(opens, 1);
    assert.equal(screen.alerts.length, 0);
  });
}

test("native permission settings rejection is logged and shows actionable feedback", async () => {
  const failure = new Error("Settings unavailable");
  const screen = fixture("android", { openSettings: async () => { throw failure; } });
  await screen.press();
  assert.deepEqual(screen.alerts, [["common.error", "settings.permissionsOpenFailed"]]);
  assert.equal(screen.errors[0][1], failure);
});

test("permission guidance is translated in every supported locale", () => {
  const filename = path.join(__dirname, "..", "src", "i18n", "i18n.js");
  const ast = babel.parseSync(fs.readFileSync(filename, "utf8"), { babelrc: false, configFile: false });
  const translations = ast.program.body.find((node) =>
    node.type === "VariableDeclaration" && node.declarations[0].id.name === "translations")
    .declarations[0].init;
  for (const locale of translations.properties) {
    const keys = new Set(locale.value.properties.map((property) => property.key.value));
    for (const key of [
      "settings.browserPermissions", "settings.browserPermissionsDescription",
      "settings.browserPermissionsHelp", "settings.permissionsOpenFailed",
    ]) assert.ok(keys.has(key), `${locale.key.name}: ${key}`);
  }
});
