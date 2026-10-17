const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { transformSync } = require("@babel/core");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const loadClient = (name, mocks = {}, globals = {}) => {
  const filename = path.resolve(__dirname, "..", "..", "mobile", "src", name);
  const { code } = transformSync(fs.readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    plugins: [
      ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs",
    ],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console, setInterval, clearInterval,
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith(".")) throw new Error(`Missing test dependency: ${name}`);
      return require(name);
    },
    ...globals,
  });
  return module.exports;
};
const { t: translate } = loadClient("i18n/i18n.js");
const colors = { text: "#000000", mutedText: "#777777", primary: "#0000ff" };
const host = (tag) => ({ children, accessibilityLabel }) =>
  React.createElement(tag, { "aria-label": accessibilityLabel }, children);
const native = {
  View: host("div"), Image: () => null, TouchableOpacity: host("button"),
  ActivityIndicator: () => null, ScrollView: host("div"), Switch: () => null,
  Modal: ({ visible, children }) => visible ? React.createElement("div", null, children) : null,
  StyleSheet: { create: (styles) => styles }, Platform: { OS: "web" }, Linking: {},
};
const basicMocks = {
  "react-native": native,
  "@expo/vector-icons/Ionicons": () => null,
  "../hooks/useTranslation": { useTranslation: () => translate },
  "../hooks/useAppTheme": { useAppTheme: () => ({ colors }) },
  "./AppText": { AppText: host("span") },
  "./AppTextInput": { AppTextInput: host("input") },
  "../config/environment": { API_URL: "https://localhost" },
};
const allElements = (element) => {
  if (Array.isArray(element)) return element.flatMap(allElements);
  if (!element || typeof element !== "object") return [];
  return [element, ...allElements(element.props?.children)];
};

test("presence labels ignore account status and show offline last-active time or connection uncertainty", () => {
  const state = { presenceConnected: true, onlineUsers: new Set(), presenceByUser: {} };
  const { UserPresence } = loadClient("components/UserPresence.js", {
    ...basicMocks, "../store/messageStore": { useMessageStore: (select) => select(state) },
  });

  const user = { id: "alice", status: "ACTIVE", lastActiveAt: "2026-10-14T00:00:00Z" };
  const render = () => renderToStaticMarkup(React.createElement(UserPresence, { user }));
  assert.match(render(), /마지막 활동:/);
  assert.doesNotMatch(render(), /온라인/);
  state.onlineUsers.add(user.id);
  assert.match(render(), /온라인/);
  state.presenceConnected = false;
  assert.match(render(), /연결 확인 중.*마지막 활동:/);
  assert.doesNotMatch(render(), /온라인/);
  state.presenceConnected = true;
  state.onlineUsers.clear();
  assert.match(renderToStaticMarkup(React.createElement(UserPresence, {
    user: { id: "never-active", status: "ACTIVE" },
  })), /오프라인/);
});

test("peer profiles can add a private contact once and surface save failures", async () => {
    let contacts = {}, own = false, fail = false;
    const calls = [], alerts = [], states = [null, false, false];
    let index = 0;
    const peer = { id: "peer", username: "public-peer", displayName: "Peer" };
    const { ProfileScreen } = loadClient("screens/app/ProfileScreen.js", {
      react: { ...React, useEffect: () => {}, useState: () => {
        const slot = index++;
        return [states[slot], (value) => { states[slot] = value; }];
      } },
      "react-native": native,
      "../../components/AppText": { AppText: host("span") },
      "../../components/UserProfileHeader": { UserProfileHeader: () => null },
      "@expo/vector-icons/Ionicons": () => null,
      "../../store/authStore": { useAuthStore: (select) => select({ token: "token", user: { id: "owner" } }) },
      "../../store/callStore": { useCallStore: (select) => select({}) },
      "../../store/contactStore": { useContactStore: (select) => select({
        contacts, addContact: async (...args) => {
          calls.push(args);
          if (fail) throw new Error("Vault unavailable");
          contacts = { "All Contacts 1": [{ contactUserId: "peer" }] };
        },
      }) },
      "../../api/users": {}, "../../api/messages": {}, "../../api/reports": {},
      "../../hooks/useTranslation": { useTranslation: () => translate },
      "../../hooks/useAppTheme": { useAppTheme: () => ({ colors }) },
      "../../utils/showAlert": { showAlert: (...args) => alerts.push(args) },
    });
    const render = () => {
      index = 0;
      states[0] = own ? { id: "owner" } : peer;
      return ProfileScreen({ route: { params: { userId: own ? "owner" : "peer" } }, navigation: {} });
    };
    const addButton = (tree) => allElements(tree).find(
      (element) => element.props?.accessibilityLabel === translate("contacts.addContact")
    );
    await addButton(render()).props.onPress();
    assert.deepEqual(calls, [["peer", "All Contacts 1", null, "token", "Peer"]]);
    assert.equal(alerts.at(-1)[1], translate("contacts.added"));
    assert.equal(addButton(render()), undefined);
    contacts = {};
    fail = true;
    await addButton(render()).props.onPress();
    assert.equal(alerts.at(-1)[1], translate("contacts.addFailed"));
    assert.equal(states[2], false);
    own = true;
    assert.equal(addButton(render()), undefined);
});

test("contact display-name resolution preserves nicknames, fallbacks and ID-only senders", () => {
  const { contactDisplayNames, resolveDisplayName } = loadClient("utils/contactDisplayName.js");
  const contacts = {
    Friends: [{ contactUserId: "peer", contactUser: { displayName: "Shared" } }],
    Work: [{ contactUserId: "other", nickname: "Nickname", contactUser: { displayName: "Other" } }],
  };
  const names = contactDisplayNames(contacts);
  assert.equal(resolveDisplayName(names, { id: "peer", username: "handle", displayName: "handle" }), "Shared");
  assert.equal(resolveDisplayName(names, { id: "peer", username: "handle", displayName: "Public Name" }), "Public Name");
  assert.equal(resolveDisplayName(names, undefined, "other"), "Nickname");
  assert.equal(resolveDisplayName(names, { id: "unknown", displayName: "Visible" }), "Visible");
  assert.equal(resolveDisplayName(names, { username: "handle" }), "handle");
  assert.equal(resolveDisplayName(names, undefined), undefined);
  assert.equal(contactDisplayNames({}).size, 0);
});

test("inbox titles and navigation react to saved contact display names without replacing custom chat names", () => {
  let contacts = { "All Contacts 1": [{
    contactUserId: "peer", contactUser: { id: "peer", displayName: "Shared Name" },
  }] };
  const peer = { id: "peer", displayName: "public_handle", username: "public_handle" };
  const conversation = { id: "room", participants: [
    { userId: "self", user: { id: "self" } }, { userId: "peer", user: peer },
  ], messages: [] };
  const FlatList = () => null;
  const calls = [];
  let searchQuery = "";
  const { MessagesScreen } = loadClient("screens/app/MessagesScreen.js", {
    react: { ...React, useEffect: () => {}, useMemo: (compute) => compute(),
      useState: (initial) => [initial === "" ? searchQuery : initial, () => {}] },
    "react-native": { ...native, FlatList, RefreshControl: () => null },
    "../../components/AppText": { AppText: host("span") },
    "@expo/vector-icons/Ionicons": () => null,
    ...Object.fromEntries(["EmptyState", "SearchBar", "FilterDropdown", "UserPresence"].map(
      (name) => [`../../components/${name}`, { [name]: () => null }]
    )),
    "../../components/HighlightText": { HighlightText: ({ text }) => React.createElement("span", null, text) },
    "../../store/authStore": { useAuthStore: (select) => select({ user: { id: "self" }, token: "token" }) },
    "../../store/messageStore": { useMessageStore: (select) => select({
      conversations: [conversation], onlineUsers: new Set(), presenceConnected: true,
    }) },
    "../../store/contactStore": { useContactStore: (select) => select({ contacts }) },
    "../../utils/contactDisplayName": loadClient("utils/contactDisplayName.js"),
    "../../hooks/useTranslation": { useTranslation: () => translate },
    "../../hooks/useAppTheme": { useAppTheme: () => ({ colors }) },
    "../../config/environment": { API_URL: "https://localhost" },
  });
  const render = () => {
    const tree = MessagesScreen({ navigation: { navigate: (...args) => calls.push(args) } });
    const list = allElements(tree).find((element) => element.type === FlatList);
    assert.equal(list.props.data.length, 1);
    return list.props.renderItem({ item: conversation });
  };
  let row = render();
  assert.match(renderToStaticMarkup(row), /Shared Name/);
  allElements(row).find((element) => element.props?.activeOpacity === 0.7).props.onPress();
  assert.equal(calls[0][1].name, "Shared Name");
  contacts = { "Work 1": [{ contactUserId: "peer", nickname: "My Friend", contactUser: peer }] };
  searchQuery = "my friend";
  assert.match(renderToStaticMarkup(render()), /My Friend/);
  searchQuery = "public_handle";
  assert.match(renderToStaticMarkup(render()), /My Friend/);
  searchQuery = "";
  conversation.name = "Custom Chat";
  assert.match(renderToStaticMarkup(render()), /Custom Chat/);
  conversation.name = null;
  contacts = {};
  assert.match(renderToStaticMarkup(render()), /public_handle/);
  assert.equal(peer.displayName, "public_handle", "Do not mutate server identity");
});

test("Settings begins with an editable profile, unlabeled bio under username, and presence before other settings", () => {
  const user = { id: "alice", displayName: "Alice", username: "alice", bio: "Plain bio text" };
  const useAuthStore = (select) => select({ user, token: "token", updateUser() {} });
  useAuthStore.getState = () => ({ user });
  const { UserProfileHeader } = loadClient("components/UserProfileHeader.js", {
    ...basicMocks,
    "../store/authStore": { useAuthStore },
    "../api/users": {}, "expo-image-picker": {},
    "../utils/showAlert": { showAlert() {} },
    "./UserPresence": { UserPresence: () => React.createElement("span", null, "presence-marker") },
  });
  const header = renderToStaticMarkup(React.createElement(UserProfileHeader, { user, editable: true }));
  assert.ok(header.indexOf("@alice") < header.indexOf(user.bio));
  assert.ok(header.indexOf(user.bio) < header.indexOf("presence-marker"));
  assert.doesNotMatch(header, />소개<|가입일|등록일/);
  assert.ok(header.includes(translate("profile.changePhoto")));
  assert.ok(header.includes(translate("profile.changeDisplayName")));
  const { SettingsScreen } = loadClient("screens/app/SettingsScreen.js", {
    "react-native": native,
    "../../components/UserProfileHeader": { UserProfileHeader },
    "../../components/AppText": { AppText: host("span") },
    "@expo/vector-icons/Ionicons": () => null,
    "../../api/auth": {},
    "../../hooks/useAppTheme": { useAppTheme: () => ({ colors }) },
    "../../store/authStore": { useAuthStore },
    "../../store/messageStore": { useMessageStore: (select) => select({ cleanup() {} }) },
    "../../store/preferencesStore": {
      usePreferencesStore: (select) => select({ themeMode: "system", chatTextSize: "standard", notificationsEnabled: false }),
    },
    "../../i18n/i18n": { t: translate },
    "../../utils/showAlert": { showAlert() {} },
    "../../utils/callNotifications": {},
    "../../utils/chatTextSize": { getChatMessageFontSize: () => 16 },
    "../../config/environment": { API_URL: "https://localhost" },
  });
  const html = renderToStaticMarkup(React.createElement(SettingsScreen, { navigation: {} }));
  assert.ok(html.indexOf("presence-marker") < html.indexOf(translate("settings.account")));
  assert.doesNotMatch(html, new RegExp(translate("settings.myProfile")));
  assert.ok(html.indexOf(translate("settings.notifications")) < html.indexOf(translate("settings.chatTextSize")));
});

test("private profile edits trim vault data and public username reservation surfaces conflicts", async () => {
  const state = [];
  let cursor = 0;
  const alerts = [];
  const updates = [];
  const user = {
    id: "alice", displayName: "Alice", username: "alice", bio: "Old bio",
    lastActiveAt: "2026-10-14T00:00:00Z",
  };
  let currentUser = user;
  const useAuthStore = (select) => select({
    user: currentUser, token: "token", updateUser: (updated) => { currentUser = updated; },
  });
  useAuthStore.getState = () => ({ user: currentUser });
  let conflict = false;
  const { UserProfileHeader } = loadClient("components/UserProfileHeader.js", {
    ...basicMocks,
    react: {
      ...React,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = value; }];
      },
    },
    "../store/authStore": { useAuthStore },
    "../api/users": {
      updateProfile: async (changes) => {
        if (conflict) throw { response: { status: 409 } };
        updates.push(changes);
        return { ...currentUser, ...changes };
      },
    },
    "expo-image-picker": {},
    "../utils/showAlert": { showAlert: (...args) => alerts.push(args) },
    "./UserPresence": { UserPresence: () => null },
  });
  const render = () => {
    cursor = 0;
    return allElements(UserProfileHeader({ user: currentUser, editable: true }));
  };
  const edit = (label, value) => {
    render().find((element) => element.props?.accessibilityLabel === translate(label)).props.onPress();
    render().find((element) => element.type === basicMocks["./AppTextInput"].AppTextInput).props.onChangeText(value);
  };
  const save = async () => {
    const elements = render();
    const input = elements.find((element) => element.type === basicMocks["./AppTextInput"].AppTextInput);
    if (input.props.onSubmitEditing) return input.props.onSubmitEditing();
    const button = elements.find((element) =>
      element.type === native.TouchableOpacity &&
      allElements(element).some((child) => child.props?.children === translate("common.save"))
    );
    return button.props.onPress();
  };
  edit("profile.editBio", "  New bio  ");
  await save();
  assert.equal(updates[0].bio, "New bio");
  assert.equal(currentUser.lastActiveAt, user.lastActiveAt);
  edit("profile.editBio", "Conflicting vault edit");
  const alertCount = alerts.length;
  conflict = true;
  await save();
  assert.equal(alerts.length, alertCount + 1);
  assert.equal(updates.length, 1);
  assert.equal(currentUser.bio, "New bio");
  conflict = false;
  render().find((element) => element.type === basicMocks["./AppTextInput"].AppTextInput).props.onChangeText("   ");
  await save();
  assert.equal(updates[1].bio, "");
  assert.equal(render().some((element) =>
    element.props?.accessibilityLabel === translate("settings.changeUsername")), true,
  "Public username reservation must be explicitly available separately from private profile edits");
  assert.equal(currentUser.username, user.username);
  assert.equal(updates.some((changes) => Object.hasOwn(changes, "username")), false);
  edit("settings.changeUsername", "Public_Alice");
  await save();
  assert.equal(updates[2].username, "Public_Alice");
  assert.equal(currentUser.id, user.id);
  edit("settings.changeUsername", "AlreadyTaken");
  conflict = true;
  await save();
  assert.equal(alerts.at(-1)[1], translate("settings.usernameTaken"));
  assert.equal(currentUser.username, "Public_Alice");
});

test("foreground lifecycle updates reconnect authentication, sends heartbeats only while active, and cleans up", () => {
  for (const platform of ["web", "android"]) {
    const handlers = new Map();
    const appState = {
      currentState: "active",
      addEventListener: (event, handler) => {
        handlers.set("app", handler);
        return { remove: () => handlers.delete("app") };
      },
    };
    const document = {
      visibilityState: "visible",
      addEventListener: (event, handler) => handlers.set("web", handler),
      removeEventListener: () => handlers.delete("web"),
    };
    let heartbeat;
    let cleared = false;
    const lifecycle = loadClient("utils/presenceLifecycle.js", {
      "react-native": { AppState: appState, Platform: { OS: platform } },
    }, {
      document,
      setInterval: (handler) => { heartbeat = handler; return 1; },
      clearInterval: () => { cleared = true; },
    });
    const emitted = [];
    const socket = { connected: true, auth: { token: "token" }, emit: (...args) => emitted.push(args) };
    const cleanup = lifecycle.attachPresenceLifecycle(socket);
    heartbeat();
    assert.equal(emitted.at(-1)[1].status, "online");
    document.visibilityState = "hidden";
    appState.currentState = "background";
    handlers.get(platform === "web" ? "web" : "app")();
    assert.equal(emitted.at(-1)[1].status, "offline");
    assert.equal(socket.auth.presenceActive, false);
    const count = emitted.length;
    heartbeat();
    assert.equal(emitted.length, count);
    socket.connected = false;
    document.visibilityState = "visible";
    appState.currentState = "active";
    handlers.get(platform === "web" ? "web" : "app")();
    assert.equal(socket.auth.presenceActive, true);
    assert.equal(socket.auth.token, "token");
    assert.equal(emitted.length, count);
    cleanup();
    assert.equal(handlers.size, 0);
    assert.equal(cleared, true);
  }
});

test("socket snapshots preserve newer live events, clear stale online users on disconnect, and reset on reconnect", async () => {
  const handlers = new Map();
  const socket = {
    connected: false, auth: {},
    on: (event, handler) => handlers.set(event, handler), emit() {},
    disconnect: () => { socket.connected = false; handlers.get("disconnect")?.(); },
  };
  const { useMessageStore } = loadClient("store/messageStore.js", {
    "socket.io-client": { io: () => socket },
    "expo-crypto": { randomUUID: crypto.randomUUID },
    "../api/messages": {},
    "../config/environment": { API_URL: "https://localhost" },
    "./callStore": { useCallStore: { getState: () => ({
      attachSocket() {}, detachSocket() {}, _handleSocketConnect() {}, _handleSocketDisconnect() {},
    }) } },
    "../storage/conversationStorage": {
      readMessageOutbox: async () => [],
      updateMessageOutbox: async (userId, update) => update([]),
    },
    "./authStore": { useAuthStore: { getState: () => ({ user: { id: "self" }, token: "token" }) } },
    "../utils/presenceLifecycle": { isPresenceActive: () => true, attachPresenceLifecycle: () => () => {} },
    "../utils/secureMessaging": {
      syncSecureInbox: async () => {},
      hydratePrivateMedia: async (userId, messages) => messages,
      clearSecureSession: () => {},
    },
    "../utils/privateMedia": { removePrivateMedia: async () => {} },
    "../utils/showAlert": { showAlert() {} },
    "../i18n/i18n": { t: (key) => key },
  }, { setInterval: () => 1, clearInterval() {} });
  useMessageStore.getState().initSocket("token", "self");
  socket.connected = true;
  handlers.get("connect")();
  handlers.get("user_status_changed")({ userId: "alice", status: "offline", lastActiveAt: "2026-10-14T00:00:00Z" });
  handlers.get("presence_snapshot")({ users: [{ userId: "alice", status: "online" }, { userId: "bob", status: "online" }] });
  assert.equal(useMessageStore.getState().onlineUsers.has("alice"), false);
  assert.equal(useMessageStore.getState().onlineUsers.has("bob"), true);
  assert.equal(useMessageStore.getState().presenceConnected, true);
  socket.disconnect();
  assert.equal(useMessageStore.getState().onlineUsers.size, 0);
  assert.equal(useMessageStore.getState().presenceConnected, false);
  socket.connected = true;
  handlers.get("connect")();
  handlers.get("presence_snapshot")({ users: [] });
  assert.equal(useMessageStore.getState().onlineUsers.size, 0);
  assert.equal(useMessageStore.getState().presenceByUser.alice.lastActiveAt, "2026-10-14T00:00:00Z");
  await useMessageStore.getState().flushOutbox("token");
  useMessageStore.getState().cleanup();
  assert.deepEqual(Object.keys(useMessageStore.getState().presenceByUser), []);
});

test("first chat open preserves early layout events and reveals fresh, cached and empty history", async () => {
  const welcome = {
    id: "welcome-message", senderId: "looptalk-system",
    sender: { id: "looptalk-system", displayName: "LoopTalk" },
    messageType: "TEXT", content: "Welcome to LoopTalk!",
    createdAt: "2026-10-14T00:00:00Z",
  };
  for (const scenario of ["fresh", "cached", "empty"]) {
    const hooks = [];
    const pendingEffects = [];
    const timers = new Map();
    let cursor = 0;
    let nextTimer = 0;
    let completeLoad;
    let conversationId = "welcome";
    let contacts = {};
    let headerOptions;
    let screen;
    const loaded = new Promise((resolve) => { completeLoad = resolve; });
    const state = {
      messages: scenario === "cached" ? [welcome] : [],
      conversations: [{ id: conversationId, kind: "WELCOME", participants: [] }],
      typingUsers: new Set(), hasOlderMessages: false, loadingOlderMessages: false,
      loadMessages: () => loaded,
      joinConversation() {}, leaveConversation() {}, stopTyping() {},
    };
    const react = {
      ...React,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = initial;
        return [hooks[index], (value) => {
          hooks[index] = typeof value === "function" ? value(hooks[index]) : value;
        }];
      },
      useRef: (initial) => {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = { current: initial };
        return hooks[index];
      },
      useMemo: (compute) => compute(),
      useEffect: (effect, deps) => {
        const index = cursor++;
        const previous = hooks[index];
        if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
        hooks[index] = { deps };
        pendingEffects.push(() => {
          previous?.cleanup?.();
          hooks[index].cleanup = effect();
        });
      },
    };
    const FlatList = () => null;
    const mocks = {
      react,
      "react-native": { ...native, FlatList, KeyboardAvoidingView: host("div") },
      "@expo/vector-icons/Ionicons": () => null,
      "expo-image-picker": {}, "expo-document-picker": {}, "expo-video-thumbnails": {},
      "../../store/authStore": {
        useAuthStore: (select) => select({ user: { id: "self" }, token: "token" }),
      },
      "../../store/messageStore": { useMessageStore: (select) => select(state) },
      "../../store/contactStore": { useContactStore: (select) => select({ contacts }) },
      "../../utils/contactDisplayName": loadClient("utils/contactDisplayName.js"),
      "../../store/callStore": {
        useCallStore: (select) => select({ isCallingSupported: false, isVideoCallingSupported: false }),
      },
      "../../hooks/useTranslation": { useTranslation: () => translate },
      "../../hooks/useAppTheme": { useAppTheme: () => ({ colors }) },
      "../../config/environment": { API_URL: "https://localhost" },
      "../../utils/showAlert": { showAlert: () => assert.fail("Unexpected chat alert") },
      "../../api/reports": {},
      "../../utils/secureMessaging": { getEncryptionSafetyCodes: async () => [] },
      "../../utils/privateMedia": { openPrivateAttachment: async () => {} },
    };
    for (const name of [
      "AppTextInput", "AppText", "UserPresence", "EmptyState", "AttachmentSheet",
      "DrawingPad", "VoiceRecorderBar", "VoiceMessageBubble", "VideoMessageBubble",
      "SearchBar", "FilterChips", "HighlightText",
    ]) {
      mocks[`../../components/${name}`] = { [name]: host("span") };
    }
    const { ChatScreen } = loadClient("screens/app/ChatScreen.js", mocks, {
      setTimeout: (handler) => { timers.set(++nextTimer, handler); return nextTimer; },
      clearTimeout: (id) => timers.delete(id),
      requestAnimationFrame: (handler) => handler(),
    });
    const render = () => {
      cursor = 0;
      screen = ChatScreen({
        route: { params: { conversationId, name: "LoopTalk" } },
        navigation: { setOptions(options) { headerOptions = options; }, navigate() {} },
      });
      return allElements(screen).find((element) => element.type === FlatList);
    };
    const flushEffects = () => {
      while (pendingEffects.length) pendingEffects.shift()();
    };
    let list = render();
    assert.equal(list.props.style.opacity, 0);
    list.props.onLayout();
    list.props.onContentSizeChange(500, 150);
    flushEffects();
    render();
    flushEffects();
    state.messages = scenario === "empty" ? [] : [welcome];
    completeLoad();
    await loaded;
    await Promise.resolve();
    list = render();
    flushEffects();
    render();
    flushEffects();
    for (const handler of [...timers.values()]) handler();
    list = render();
    flushEffects();
    assert.equal(list.props.style, undefined, `${scenario} chat must not stay hidden`);
    if (state.messages.length) {
      const bubble = list.props.renderItem({ item: welcome, index: 0 });
      const elements = allElements(bubble);
      assert.ok(elements.some((element) => element.props?.text === "LoopTalk"));
      assert.ok(elements.some((element) => element.props?.text === welcome.content));
      assert.equal(bubble.props.style[1].justifyContent, "flex-start");
    }
    const peer = { id: "peer", displayName: "public_handle", username: "public_handle" };
    state.conversations = [{
      id: conversationId, participants: [{ userId: "peer", user: peer }],
    }];
    contacts = { "All Contacts 1": [{
      contactUserId: "peer", contactUser: { ...peer, displayName: "Shared Name" },
    }] };
    render();
    flushEffects();
    assert.match(renderToStaticMarkup(headerOptions.headerTitle()), /Shared Name/);
    contacts = { "Work 1": [{ contactUserId: "peer", nickname: "New Name", contactUser: peer }] };
    list = render();
    flushEffects();
    assert.match(renderToStaticMarkup(headerOptions.headerTitle()), /New Name/);
    const peerBubble = list.props.renderItem({
      item: { ...welcome, senderId: "peer", sender: peer, automaticWelcome: true,
        replyTo: { ...welcome, senderId: "peer", sender: peer } }, index: 0,
    });
    assert.ok(allElements(peerBubble).some((element) => element.props?.text === "New Name"));
    assert.match(renderToStaticMarkup(peerBubble), /New Name/);
    state.typingUsers = new Set(["peer"]);
    render();
    assert.match(renderToStaticMarkup(screen), /New Name/);
    state.typingUsers = new Set();
    conversationId = "another-chat";
    state.messages = [];
    list = render();
    list.props.onLayout();
    flushEffects();
    await Promise.resolve();
    await Promise.resolve();
    render();
    flushEffects();
    list = render();
    assert.equal(list.props.style, undefined, "Switching chats must use the new layout event");
    hooks.forEach((hook) => hook?.cleanup?.());
  }
});
