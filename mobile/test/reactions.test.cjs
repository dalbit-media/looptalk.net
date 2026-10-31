const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");

const load = () => {
  const filename = path.join(__dirname, "..", "src", "components", "ReactionPicker.js");
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false,
    configFile: false,
    plugins: [
      ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs",
    ],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => {
      if (name === "react") return React;
      if (name === "react-native") return {
        ActivityIndicator: "ActivityIndicator", Modal: "Modal", StyleSheet: { create: (styles) => styles },
        TouchableOpacity: "TouchableOpacity", View: "View",
      };
      if (name === "@expo/vector-icons/Ionicons") return { default: "Ionicons" };
      if (name === "./AppText") return { AppText: "Text" };
      return require(name);
    },
  }, { filename });
  return module.exports;
};
const nodes = (element) => {
  if (!element || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  return [element, ...nodes(element.props?.children)];
};
const find = (tree, predicate) => nodes(tree).find(predicate);

test("reaction chips show counts and selected state and remain directly toggleable", () => {
  const { ReactionBar } = load();
  const selected = [];
  let stopped = false;
  const tree = ReactionBar({
    reactions: [
      { emoji: "❤️", count: 3, reactedByMe: true },
      { emoji: "🔥", userId: "me" },
    ],
    userId: "me",
    colors: { border: "#ddd", surface: "#fff", primarySoft: "#eef", navigationAccent: "#369", input: "#eee", secondaryText: "#555" },
    addLabel: "Add reaction",
    onSelect: (emoji) => selected.push(emoji),
    onAdd: () => selected.push("add"),
  });
  const heart = find(tree, (node) => node.props?.accessibilityLabel === "❤️, 3");
  const fire = find(tree, (node) => node.props?.accessibilityLabel === "🔥, 1");
  assert.equal(heart.props.accessibilityState.selected, true);
  assert.equal(fire.props.accessibilityState.selected, true);
  heart.props.onPress({ stopPropagation: () => { stopped = true; } });
  assert.deepEqual(selected, ["❤️"]);
  assert.equal(stopped, true);
  find(tree, (node) => node.props?.accessibilityLabel === "Add reaction").props.onPress();
  assert.deepEqual(selected, ["❤️", "add"]);
});

test("reaction picker exposes accessible options, selected state and close behavior", () => {
  const { ReactionPicker, REACTION_EMOJIS } = load();
  const selected = [];
  let closed = false;
  const colors = {
    border: "#ddd", surface: "#fff", primarySoft: "#eef", navigationAccent: "#369",
    input: "#eee", text: "#222", secondaryText: "#555",
  };
  const tree = ReactionPicker({
    visible: true, title: "React", hint: "Pick one", closeLabel: "Close",
    selected: ["❤️"], colors, onClose: () => { closed = true; },
    onSelect: (emoji) => selected.push(emoji),
  });
  const modal = find(tree, (node) => node.type === "Modal");
  assert.equal(modal.props.visible, true);
  const heart = find(tree, (node) => node.props?.accessibilityLabel === "❤️");
  assert.equal(heart.props.accessibilityState.selected, true);
  heart.props.onPress();
  assert.deepEqual(selected, ["❤️"]);
  find(tree, (node) => node.props?.accessibilityLabel === "Close").props.onPress();
  assert.equal(closed, true);
  assert.equal(REACTION_EMOJIS.length, 8);
});
