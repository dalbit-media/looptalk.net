const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");

test("invitation entry is neutral without a code and explains how to request an invite", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "i18n", "i18n.js"), "utf8");
  const ast = babel.parseSync(source, { babelrc: false, configFile: false });
  const locales = ast.program.body.find((node) =>
    node.type === "VariableDeclaration" && node.declarations[0].id.name === "translations"
  ).declarations[0].init.properties;
  const filename = path.join(__dirname, "..", "src", "screens", "auth", "InvitationScreen.js");
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false,
    plugins: [
      ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs",
    ],
  });
  const nodes = (node) => {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  };
  for (const locale of locales) {
    const dictionary = Object.fromEntries(locale.value.properties.map((item) => [item.key.value, item.value.value]));
    const mocks = {
      react: { ...React, useState: (value) => [value, () => {}], useEffect: () => {}, useRef: () => ({ current: 0 }) },
      "react-native": {
        ...Object.fromEntries(["View", "TouchableOpacity", "ActivityIndicator", "KeyboardAvoidingView", "ScrollView"].map((name) => [name, name])),
        Platform: { OS: "web" }, StyleSheet: { create: (styles) => styles },
      },
      "../../components/AppTextInput": { AppTextInput: "TextInput" },
      "../../components/AppText": { AppText: "Text" },
      "../../api/invitations": {},
      "../../hooks/useTranslation": { useTranslation: () => (key) => dictionary[key] },
      "../../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
      "../../utils/showAlert": { showAlert() {} },
      "../../utils/invitationCode": require("../../server/src/utils/invitationCode"),
    };
    const module = { exports: {} };
    vm.runInNewContext(code, {
      module, exports: module.exports,
      require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    });
    for (const params of [undefined, { code: "ABCDEFGH" }]) {
      const tree = module.exports.InvitationScreen({ route: { params }, navigation: {} });
      const rendered = nodes(tree);
      const text = rendered.filter((node) => node.type === "Text").map((node) => node.props.children);
      assert.ok(text.includes(dictionary["auth.invitedTitle"]));
      assert.ok(text.includes(dictionary["auth.noInvitationHelp"]));
      assert.ok(dictionary["auth.noInvitationHelp"].length > 50);
      assert.doesNotMatch(text.join(" "), /초대받으셨습니다|You're Invited!|招待されました/);
      if (!params) {
        assert.equal(rendered.find((node) => node.type === "TextInput").props.value, "");
        assert.ok(rendered.find((node) => node.type === "TouchableOpacity" && node.props.disabled));
      }
    }
  }
});
