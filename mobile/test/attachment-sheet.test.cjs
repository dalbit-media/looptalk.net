const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const load = () => {
  const filename = path.resolve(__dirname, "..", "src", "components", "AttachmentSheet.js");
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false,
    plugins: [["@babel/plugin-transform-react-jsx", { runtime: "automatic" }], "@babel/plugin-transform-modules-commonjs"],
  });
  const mocks = {
    react: require("react"), "react/jsx-runtime": require("react/jsx-runtime"),
    "react-native": { View: "View", TouchableOpacity: "Button", Modal: "Modal", Pressable: "Pressable",
      StyleSheet: { create: (styles) => styles } },
    "./AppText": { AppText: "Text" },
    "@expo/vector-icons/Ionicons": { default: "Icon" },
    "../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
    "../hooks/useTranslation": { useTranslation: () => (key) => key },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
    assert.ok(Object.hasOwn(mocks, name), name);
    return mocks[name];
  } });
  return module.exports.AttachmentSheet;
};
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];

test("attachment menu fills two four-column rows including audio, video and screen-share actions", () => {
  const selected = [];
  const tree = load()({ visible: true, canCall: true, canVideoCall: true, canScreenShare: true,
    onSelect: (key) => selected.push(key) });
  const buttons = nodes(tree).filter((node) => node.type === "Button");
  assert.equal(buttons.length, 8);
  for (const button of buttons) assert.equal(button.props.style[0].width, "25%");
  for (const button of buttons.slice(5)) {
    assert.equal(button.props.disabled, false);
    button.props.onPress();
  }
  assert.deepEqual(selected, ["audio", "video", "screen"]);
});

test("unsupported call actions remain visible but disabled without disabling media or drawing", () => {
  const buttons = nodes(load()({ visible: true })).filter((node) => node.type === "Button");
  assert.equal(buttons.length, 8);
  assert.ok(buttons.slice(0, 5).every((node) => !node.props.disabled));
  assert.ok(buttons.slice(5).every((node) => node.props.disabled && node.props.accessibilityState.disabled));
});
