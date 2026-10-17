const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");

const renderScreen = (bottom = 0) => {
  const filename = path.join(__dirname, "..", "src", "screens", "auth", "OnboardingScreen.js");
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false,
    plugins: [
      ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs",
    ],
  });
  const hooks = { ...React, useRef: () => ({ current: null }), useState: () => [0, () => {}] };
  const mocks = {
    react: hooks,
    "react-native": {
      ...Object.fromEntries(["FlatList", "ScrollView", "TouchableOpacity", "View"].map((name) => [name, name])),
      StyleSheet: { create: (styles) => styles },
      useWindowDimensions: () => ({ width: 375, height: 500 }),
    },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 24, bottom }) },
    "../../components/AppText": { AppText: "Text" },
    "@expo/vector-icons/Ionicons": "Icon",
    "../../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
    "../../hooks/useTranslation": { useTranslation: () => (key) => key },
    "../../components/BrandMark": { BrandMark: "Brand" },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  }, { filename });
  return module.exports.OnboardingScreen({ navigation: { navigate() {} } });
};

test("onboarding reserves bottom clearance and honors larger device safe areas", () => {
  for (const inset of [0, 10, 34]) {
    const tree = renderScreen(inset);
    const controls = tree.props.children[2];
    assert.equal(tree.props.style[0].minHeight, 0);
    assert.equal(tree.props.style[1].paddingTop, 24);
    assert.equal(controls.props.style[0].flexShrink, 0);
    assert.equal(controls.props.style[1].paddingBottom, Math.max(inset, 20));
    assert.equal(controls.props.children[1].props.accessibilityRole, "button");
  }
});

test("slides scroll vertically while the horizontal slider yields space to fixed controls", () => {
  const tree = renderScreen();
  const slider = tree.props.children[1];
  assert.equal(slider.type, "FlatList");
  assert.equal(slider.props.horizontal, true);
  assert.equal(slider.props.pagingEnabled, true);
  assert.equal(slider.props.style.flex, 1);
  assert.equal(slider.props.style.minHeight, 0);
  assert.equal(typeof slider.props.onLayout, "function");
  assert.equal(slider.props.data.length, 5);
  const slide = slider.props.renderItem({ item: slider.props.data[0] });
  assert.equal(slide.type, "ScrollView");
  assert.equal(slide.props.style.width, 375);
  assert.equal(slide.props.style.height, 0, "Slide viewport uses the measured slider height");
  assert.equal(slide.props.contentContainerStyle.flexGrow, 1);
  assert.equal(slide.props.contentContainerStyle.flex, undefined);
  assert.ok(slide.props.contentContainerStyle.paddingVertical >= 16);
});
