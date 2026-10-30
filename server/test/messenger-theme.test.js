const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const { transformSync } = require("@babel/core");

const loadClient = (file, mocks) => {
  const filename = path.resolve(__dirname, "../../mobile/src", file);
  const { code } = transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [
      ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs",
    ],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith(".")) throw new Error(`Missing test dependency: ${name}`);
      return require(name);
    },
  });
  return module.exports;
};

const lightNavigation = { dark: false, colors: {}, fonts: { regular: {} } };
const darkNavigation = { dark: true, colors: {}, fonts: { regular: {} } };
const getTheme = (themeMode, systemColorScheme) => {
  const { useAppTheme } = loadClient("hooks/useAppTheme.js", {
    "react-native": { useColorScheme: () => systemColorScheme },
    "@react-navigation/native": {
      DefaultTheme: lightNavigation,
      DarkTheme: darkNavigation,
    },
    "../store/preferencesStore": {
      usePreferencesStore: (select) => select({ themeMode }),
    },
  });
  return useAppTheme();
};

const luminance = (hex) => {
  const values = hex.slice(1).match(/../g).map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
};
const contrast = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

test("explicit light/dark and system preferences retain their precedence", () => {
  for (const [mode, system, expectedDark] of [
    ["light", "dark", false],
    ["dark", "light", true],
    ["system", "dark", true],
    ["system", "light", false],
    ["system", null, false],
  ]) {
    const theme = getTheme(mode, system);
    assert.equal(theme.isDark, expectedDark);
    assert.equal(theme.navigationTheme.dark, expectedDark);
    assert.equal(theme.themeMode, mode);
    assert.equal(theme.navigationTheme.fonts, (expectedDark ? darkNavigation : lightNavigation).fonts);
    assert.equal(theme.navigationTheme.colors.background, theme.colors.background);
    assert.equal(theme.navigationTheme.colors.notification, theme.colors.unreadBadge);
    assert.equal(theme.navigationTheme.colors.primary, theme.colors.navigationAccent);
  }
});

test("sample palettes have matching semantic tokens and readable text", () => {
  const light = getTheme("light").colors;
  const dark = getTheme("dark").colors;
  assert.deepEqual(Object.keys(light).sort(), Object.keys(dark).sort());
  assert.equal(light.background, "#FAFAF7");
  assert.equal(light.header, "#1C2D49");
  assert.equal(light.primary, "#186661");
  assert.equal(light.unreadBadge, "#E87355");
  assert.equal(dark.background, "#1C1F26");
  assert.equal(dark.sentBubble, "#5C9EFF");
  assert.equal(dark.receivedBubble, "#2D353D");
  assert.equal(dark.unreadBadge, "#F3B943");
  for (const colors of [light, dark]) {
    for (const [foreground, background] of [
      ["text", "surface"],
      ["text", "receivedBubble"],
      ["secondaryText", "surface"],
      ["mutedText", "surface"],
      ["headerText", "header"],
      ["headerIcon", "header"],
      ["online", "surface"],
      ["onlineOnHeader", "header"],
      ["onSentBubble", "sentBubble"],
      ["onUnreadBadge", "unreadBadge"],
    ]) {
      assert.ok(contrast(colors[foreground], colors[background]) >= 4.5,
        `${foreground} on ${background} must meet 4.5:1 contrast`);
    }
    assert.ok(contrast("#FFFFFF", colors.primary) >= 4.5);
    assert.ok(contrast(colors.onAction, colors.action) >= 4.5);
    assert.notEqual(colors.action, colors.primary);
    assert.ok(contrast(colors.navigationAccent, colors.tabBar) >= 3);
  }
});

test("all authenticated stacks and bottom tabs use the semantic navigation palette", () => {
  const navigator = () => ({ Navigator: "navigator", Screen: "screen" });
  for (const mode of ["light", "dark"]) {
    const theme = getTheme(mode);
    const mocks = {
      "react-native": { TouchableOpacity: "button", View: "div" },
      "@react-navigation/native-stack": { createNativeStackNavigator: navigator },
      "@react-navigation/bottom-tabs": { createBottomTabNavigator: navigator },
      "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
      "@expo/vector-icons/Ionicons": () => null,
      "../hooks/useTranslation": { useTranslation: () => (key) => key },
      "../hooks/useAppTheme": { useAppTheme: () => theme },
      "../store/preferencesStore": {
        usePreferencesStore: (select) => select({ chatTextSize: "standard" }),
      },
      "../utils/chatTextSize": { getAppTextScale: () => 1 },
      "../components/WebAppInstallButton": { WebAppInstallButton: () => null },
    };
    for (const name of [
      "Messages", "Chat", "Contacts", "Settings", "Profile", "AddContact",
      "MyInvitations", "CreateGroup", "GroupInfo", "MyData", "JoinNetwork",
    ]) {
      mocks[`../screens/app/${name}Screen`] = { [`${name}Screen`]: () => null };
    }
    mocks["../screens/app/ForumScreen"] = {
      ForumScreen: () => null, CreatePollScreen: () => null, PollScreen: () => null,
    };
    const { AppStack } = loadClient("navigation/AppStack.js", mocks);
    const tree = AppStack();
    const options = tree.props.screenOptions({ route: { name: "Messages" } });
    assert.equal(options.tabBarStyle.backgroundColor, theme.colors.tabBar);
    assert.equal(options.tabBarActiveTintColor, theme.colors.navigationAccent);
    for (const screen of React.Children.toArray(tree.props.children)) {
      const stack = screen.props.component();
      assert.equal(stack.props.screenOptions.headerStyle.backgroundColor, theme.colors.header);
      assert.equal(stack.props.screenOptions.headerTitleStyle.color, theme.colors.headerText);
      assert.equal(stack.props.screenOptions.headerTintColor, theme.colors.headerIcon);
      assert.equal(stack.props.screenOptions.statusBarStyle, "light");
    }
  }
});
