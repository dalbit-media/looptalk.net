const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const load = (relative, mocks) => {
  const filename = path.join(__dirname, "..", "src", relative);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false,
    plugins: [["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs"],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name]
      : name === "react" || name === "react/jsx-runtime" ? require(name)
        : new Proxy({}, { get: (_target, key) => key }),
  });
  return module.exports;
};

const theme = { useAppTheme: () => ({ colors: { surface: "#fff" } }) };
const auth = (member) => ({ useAuthStore: (select) => select({ user: { member } }) });

test("all tab homes share a fixed banner before content; child screens have no banner", () => {
  const navigator = () => ({ Navigator: "Navigator", Screen: "Screen" });
  const { AppStack } = load("navigation/AppStack.js", {
    "@react-navigation/native-stack": { createNativeStackNavigator: navigator },
    "@react-navigation/bottom-tabs": { createBottomTabNavigator: navigator },
    "react-native": { View: "View", TouchableOpacity: "TouchableOpacity" },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 0 }) },
    "../hooks/useTranslation": { useTranslation: () => (key) => key },
    "../hooks/useAppTheme": theme,
    "../store/preferencesStore": { usePreferencesStore: (select) => select({ chatTextSize: "standard" }) },
    "../store/authStore": auth(false),
    "../utils/chatTextSize": { getAppTextScale: () => 1 },
    "../components/GuestJoinBanner": { GuestJoinBanner: "GuestJoinBanner" },
  });
  const tabs = AppStack().props.children;
  const homes = { Forum: "ForumHome", Messages: "MessagesList", Contacts: "ContactsList",
    MyData: "MyDataHome", Settings: "SettingsHome" };
  for (const tab of tabs) {
    const stack = tab.props.component();
    const navigations = [];
    const props = { children: "content", route: { name: homes[tab.props.name] },
      navigation: { navigate: (...args) => navigations.push(args) } };
    const wrapper = stack.props.screenLayout(props);
    const layout = wrapper.type(wrapper.props);
    assert.equal(layout.type, "View");
    const [banner, content] = layout.props.children;
    assert.equal(banner.type, "GuestJoinBanner");
    assert.equal(content, "content");
    banner.props.onPress();
    assert.deepEqual(JSON.parse(JSON.stringify(navigations)), tab.props.name === "Forum" ? [["JoinNetwork"]]
      : [["Forum", { screen: "JoinNetwork" }]]);
    const detail = stack.props.screenLayout({ ...props, route: { name: "JoinNetwork" } });
    assert.equal(detail.type(detail.props), "content");
  }
});

test("banner hides for members and limits guest title/body to one line", () => {
  const mocks = {
    "react-native": { TouchableOpacity: "TouchableOpacity", View: "View", StyleSheet: { create: (value) => value } },
    "@expo/vector-icons/Ionicons": { default: "Ionicons" },
    "./AppText": { AppText: "Text" },
    "../hooks/useTranslation": { useTranslation: () => (key) => key },
    "../hooks/useAppTheme": theme,
    "../store/authStore": auth(true),
  };
  assert.equal(load("components/GuestJoinBanner.js", mocks).GuestJoinBanner({}), null);
  const banner = load("components/GuestJoinBanner.js", {
    ...mocks, "../store/authStore": auth(false),
  }).GuestJoinBanner({});
  const copy = banner.props.children[1];
  for (const text of copy.props.children) assert.equal(text.props.numberOfLines, 1);
  assert.equal(copy.props.children[1].props.ellipsizeMode, "tail");
  assert.equal(banner.props.accessibilityHint, "join.bannerBody");
  assert.equal(banner.props.style.marginTop, 8);
  assert.equal(banner.props.style.marginHorizontal, 16);
});

const nodes = (element) => {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (!element || typeof element !== "object") return [];
  return [element, ...nodes(element.props?.children)];
};

test("Contacts and Chats keep aligned search controls; guest contacts never load or expose actions", () => {
  for (const member of [false, true]) {
    let loads = 0;
    const effects = [];
    const mocks = {
      react: {
        useState: (value) => [value, () => {}],
        useMemo: (callback) => callback(),
        useEffect: (callback) => effects.push(callback),
      },
      "react-native": {
        View: "View", TouchableOpacity: "TouchableOpacity", SectionList: "SectionList",
        FlatList: "FlatList", ActivityIndicator: "ActivityIndicator",
        StyleSheet: { create: (styles) => styles },
      },
      "../../components/SearchBar": { SearchBar: "SearchBar" },
      "../../components/FilterDropdown": { FilterDropdown: "FilterDropdown" },
      "../../components/EmptyState": { EmptyState: "EmptyState" },
      "../../hooks/useTranslation": { useTranslation: () => (key) => key },
      "../../hooks/useAppTheme": theme,
      "../../store/authStore": { useAuthStore: (select) => select({ token: "token", user: { id: "me", member } }) },
      "../../store/contactStore": { useContactStore: (select) => select({
        contacts: {}, loadContacts: () => { loads++; }, loading: false,
      }) },
      "../../store/messageStore": { useMessageStore: (select) => select({
        onlineUsers: new Set(), conversations: [], loading: false,
      }) },
      "../../utils/contactDisplayName": { contactDisplayNames: () => new Map() },
    };
    const contacts = load("screens/app/ContactsScreen.js", mocks).ContactsScreen({
      navigation: { setOptions() {} },
    });
    effects.forEach((effect) => effect());
    assert.equal(loads, member ? 1 : 0);
    const chats = load("screens/app/MessagesScreen.js", mocks).MessagesScreen({ navigation: {} });
    const contactSearch = nodes(contacts).find((node) => node.type === "SearchBar");
    const chatSearch = nodes(chats).find((node) => node.type === "SearchBar");
    assert.ok(contactSearch);
    assert.ok(chatSearch);
    assert.equal(contactSearch.props.disabled, !member);
    assert.equal(chatSearch.props.disabled, !member);
    assert.equal(nodes(chats).find((node) => node.type === "FilterDropdown").props.disabled, !member);
    if (!member) assert.equal(chatSearch.props.accessibilityHint, "memberAccess.chatSearch");
    assert.equal(nodes(contacts).find((node) => node.type === "FilterDropdown").props.disabled, !member);
    for (const key of ["marginTop", "marginHorizontal", "gap"]) {
      assert.equal(contacts.props.children[0].props.style[key], chats.props.children[0].props.style[key]);
    }
    if (!member) {
      assert.ok(nodes(contacts).find((node) => node.props?.title === "memberAccess.title"));
      assert.equal(nodes(contacts).some((node) => node.type === "TouchableOpacity"), false);
      assert.equal(nodes(contacts).some((node) => node.type === "SectionList"), false);
    }
  }
});

test("disabled search and filter controls cannot edit, clear or open menus", () => {
  let clears = 0;
  let measures = 0;
  const mocks = {
    react: { useState: (value) => [value, () => {}], useRef: () => ({
      current: { measureInWindow: () => { measures++; } },
    }) },
    "react-native": {
      View: "View", TouchableOpacity: "TouchableOpacity", Modal: "Modal",
      StyleSheet: { create: (styles) => styles },
      Dimensions: { get: () => ({ width: 320, height: 640 }) },
    },
    "./AppTextInput": { AppTextInput: "TextInput" },
  };
  const search = load("components/SearchBar.js", mocks).SearchBar({
    value: "query", onChangeText: () => { clears++; }, colors: {},
    disabled: true, autoFocus: true,
  });
  const input = nodes(search).find((node) => node.type === "TextInput");
  assert.equal(input.props.editable, false);
  assert.equal(input.props.autoFocus, false);
  assert.equal(nodes(search).find((node) => node.type === "TouchableOpacity").props.disabled, true);
  assert.equal(clears, 0);
  const filter = load("components/FilterDropdown.js", mocks).FilterDropdown({
    options: [{ key: "all" }], selectedKey: "all", colors: {}, disabled: true,
  });
  const button = nodes(filter).find((node) => node.type === "TouchableOpacity");
  button.props.onPress();
  assert.equal(button.props.disabled, true);
  assert.equal(measures, 0);
  assert.equal(nodes(filter).find((node) => node.type === "Modal").props.visible, false);
});
