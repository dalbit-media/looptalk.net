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
    plugins: [
      ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }],
      "@babel/plugin-transform-modules-commonjs",
    ],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  }, { filename });
  return module.exports;
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const fixture = () => {
  const values = new Map();
  const reads = [];
  const records = {
    getAllKeys: async () => [...values.keys()],
    multiGet: async (keys) => Promise.all(keys.map(async (key) => [key, await records.getItem(key)])),
    getItem: async (key) => { reads.push(key); return values.get(key) ?? null; },
    updateItem: async (key, update) => {
      if (records.failWrites) throw new Error("Disk full");
      const next = update(values.get(key) ?? null);
      if (next === null) values.delete(key);
      else values.set(key, next);
      return next;
    },
  };
  const storage = load("storage/conversationStorage.js", {
    "./privateRecords": records,
    "../utils/privateMedia": { readPrivateMedia: async () => { throw new Error("Must not read attachment bytes for an index"); } },
    "../utils/ownerSession": { isOwnerAccount: () => false },
  });
  const library = load("utils/dataLibrary.js", {
    "../storage/privateRecords": records,
    "../storage/conversationStorage": storage,
  });
  const saveConversation = (owner, conversation, messages) =>
    values.set(`looptalk:conversation:${owner}:${conversation}`, JSON.stringify(messages));
  return { values, reads, records, storage, library, saveConversation };
};
const message = (id, messageType = "TEXT", extra = {}) => ({
  id, messageType, content: messageType === "TEXT" ? `Message ${id}` : null,
  createdAt: "2026-10-16T12:00:00Z", ...extra,
});

test("local library reads only the active account, including saved conversations absent from server lists", async () => {
  const f = fixture();
  f.saveConversation("alice", "old-room", [message("one")]);
  f.saveConversation("alice", "another-room", [message("two", "IMAGE", { localMediaId: "photo" })]);
  f.saveConversation("bob", "secret-room", [message("secret")]);
  f.values.set("looptalk:conversation:alice-other:private", "not readable");
  f.values.set("looptalk:device-identity:alice", "secret key material");
  const { entries } = await f.library.loadDataLibrary("alice");
  assert.equal(entries.length, 2);
  assert.deepEqual(plain(entries.map((entry) => entry.message.conversationId)), ["old-room", "another-room"]);
  assert.ok(!f.reads.some((key) => /bob|alice-other|device-identity/.test(key)));
});

test("library deduplicates pending copies, excludes deleted/system messages and queued operations", async () => {
  const f = fixture();
  f.saveConversation("alice", "room", [
    message("saved", "TEXT", { clientMessageId: "pending-id" }),
    message("deleted", "TEXT", { deletedAt: "2026-10-16" }),
    message("system", "SYSTEM"),
  ]);
  f.values.set("looptalk:message-outbox:alice", JSON.stringify([
    { clientMessageId: "pending-id", conversationId: "room", content: "pending copy" },
    { clientMessageId: "deleted", conversationId: "room", content: "do not resurrect" },
    { clientMessageId: "unmaterialized", conversationId: "room", secureBody: { messageType: "TEXT", content: "Queued text" } },
    { clientMessageId: "edit", conversationId: "room", kind: "edit", secureBody: { content: "not a new message" } },
    { clientMessageId: "delete", conversationId: "room", kind: "delete" },
    { clientMessageId: "reaction", conversationId: "room", kind: "reaction" },
  ]));
  const { entries } = await f.library.loadDataLibrary("alice");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].message.content, "Message saved");
  assert.equal(entries[1].message.content, "Queued text");
});

test("histogram has exact item counts, drawing and MIME categories, and newest-first ordering", () => {
  const { library } = fixture();
  const entries = library.buildDataLibrary([
    message("old", "TEXT", { conversationId: "room" }),
    message("new", "TEXT", { conversationId: "room", createdAt: "2026-10-17T12:00:00Z" }),
    ...["IMAGE", "DRAWING", "VIDEO", "VOICE", "FILE"].map((type) =>
      message(type, type, { conversationId: "room" })),
    message("audio-file", "FILE", { conversationId: "room", mediaMimeType: "audio/mpeg" }),
    message("video-file", "FILE", { conversationId: "room", mediaMimeType: "video/mp4" }),
    message("image-file", "FILE", { conversationId: "room", mediaMimeType: "image/png" }),
  ]);
  assert.equal(entries[0].message.id, "new");
  assert.deepEqual(plain(library.summarizeDataLibrary(entries).map(({ key, count }) => [key, count])),
    [["text", 2], ["image", 3], ["video", 2], ["audio", 2], ["file", 1]]);
  assert.ok(library.summarizeDataLibrary([]).every((type) => type.count === 0));
});

test("tags persist per account, normalize duplicates, filter across conversations and remove cleanly", async () => {
  const f = fixture();
  f.saveConversation("alice", "one", [message("id", "TEXT", { content: "Train tickets" })]);
  f.saveConversation("alice", "two", [message("id", "FILE", { fileName: "journey.pdf" })]);
  const { entries } = await f.library.loadDataLibrary("alice");
  assert.notEqual(entries[0].key, entries[1].key);
  assert.deepEqual(plain(await f.library.saveDataTags("alice", entries[0].key, "#Travel, travel, Work, ")), ["travel", "Work"]);
  await f.library.saveDataTags("alice", entries[1].key, "travel");
  await f.library.saveDataTags("bob", entries[0].key, "private");
  const { tags } = await f.library.loadDataLibrary("alice");
  assert.equal(f.library.filterDataLibrary(entries, tags, null, "", "travel").length, 2);
  assert.equal(f.library.filterDataLibrary(entries, tags, "file", "JOURNEY").length, 1);
  assert.equal(f.library.filterDataLibrary(entries, tags, "text", "TICKETS").length, 1);
  assert.equal(f.library.filterDataLibrary(entries, tags, null, "work").length, 1);
  assert.equal(f.library.filterDataLibrary(entries, tags, null, "private").length, 0);
  await f.library.saveDataTags("alice", entries[0].key, "");
  const loaded = await f.library.loadDataLibrary("alice");
  assert.equal(loaded.tags[entries[0].key], undefined);
  assert.equal(loaded.tags[entries[1].key][0], "travel");
});

test("invalid tags, corrupt records and storage failures are rejected instead of returning fake empty results", async () => {
  const f = fixture();
  assert.throws(() => f.library.normalizeDataTags("x".repeat(33)), /32/);
  assert.throws(() => f.library.normalizeDataTags(Array.from({ length: 11 }, (_, i) => `tag${i}`)), /10/);
  assert.throws(() => f.library.normalizeDataTags("line\nbreak"), /32/);
  assert.throws(() => f.library.normalizeDataTags([42]), /Invalid/);
  await assert.rejects(f.library.loadDataLibrary(null), /signed-in/);
  f.values.set("looptalk:data-tags:alice", "{broken");
  await assert.rejects(f.library.loadDataLibrary("alice"));
  f.values.delete("looptalk:data-tags:alice");
  f.values.set("looptalk:conversation:alice:room", "{}");
  await assert.rejects(f.library.loadDataLibrary("alice"), /not an array/);
  f.values.clear();
  f.records.failWrites = true;
  await assert.rejects(f.library.saveDataTags("alice", "item", "tag"), /Disk full/);
});

test("My Data follows Contacts in navigation and every locale has all screen strings", () => {
  const navigation = fs.readFileSync(path.join(__dirname, "..", "src", "navigation", "AppStack.js"), "utf8");
  assert.match(navigation, /name="Contacts"[\s\S]*?name="MyData"[\s\S]*?component=\{MyDataStack\}[\s\S]*?name="Settings"/);
  assert.match(navigation, /name="MyDataHome" component=\{MyDataScreen\}/);
  assert.doesNotMatch(navigation, /navigation\.navigate\("MyDataHome"\)/);
  assert.match(navigation, /name="DataCategory" component=\{MyDataScreen\}/);
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "i18n", "i18n.js"), "utf8");
  const ast = babel.parseSync(source, { babelrc: false, configFile: false });
  const translations = ast.program.body.find((node) => node.type === "VariableDeclaration" && node.declarations[0].id.name === "translations").declarations[0].init;
  const keys = translations.properties.map((locale) => new Set(locale.value.properties.map((property) => property.key.value)));
  const dataKeys = [...keys[0]].filter((key) => key.startsWith("myData.") || key === "navigation.myData");
  assert.ok(dataKeys.length >= 30);
  for (const locale of keys) for (const key of dataKeys) assert.ok(locale.has(key), key);
});

const screenFixture = () => {
  const f = fixture();
  const React = require("react");
  const states = [];
  let cursor = 0;
  let focus;
  let route = { name: "MyDataHome" };
  const navigations = [];
  const colors = new Proxy({}, { get: () => "#123456" });
  const account = (select) => select({ user: { id: "alice" } });
  account.getState = () => ({ user: { id: "alice" } });
  const hooks = {
    ...React,
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (update) => {
        states[index] = typeof update === "function" ? update(states[index]) : update;
      }];
    },
    useCallback: (callback) => callback,
    useMemo: (callback) => callback(),
  };
  const { MyDataScreen } = load("screens/app/MyDataScreen.js", {
    react: hooks,
    "react-native": Object.fromEntries(["ActivityIndicator", "FlatList", "Image", "Modal",
      "RefreshControl", "ScrollView", "TouchableOpacity", "View"].map((name) => [name, name])
      .concat([["StyleSheet", { create: (styles) => styles }]])),
    "@react-navigation/native": { useFocusEffect: (callback) => { focus = callback; } },
    "@expo/vector-icons/Ionicons": "Icon",
    "@expo/vector-icons/MaterialCommunityIcons": "ProviderIcon",
    "../../../../public/site/cloud-providers": require("../../public/site/cloud-providers"),
    "../../components/AppText": { AppText: "Text" },
    "../../components/AppTextInput": { AppTextInput: "TextInput" },
    "../../components/SearchBar": { SearchBar: "SearchBar" },
    "../../components/VideoMessageBubble": { VideoMessageBubble: "Video" },
    "../../components/VoiceMessageBubble": { VoiceMessageBubble: "Audio" },
    "../../hooks/useAppTheme": { useAppTheme: () => ({ colors }) },
    "../../hooks/useTranslation": { useTranslation: () => (key, options) => `${key}${options ? `:${options.count}` : ""}` },
    "../../store/authStore": { useAuthStore: account },
    "../../utils/dataLibrary": f.library,
    "../../utils/privateMedia": { privateMediaUrl: async () => { throw new Error("Unexpected media read"); } },
    "../../utils/showAlert": { showAlert: () => {} },
  });
  const render = () => {
    cursor = 0;
    return MyDataScreen({ route, navigation: { navigate: (...args) => navigations.push(args) } });
  };
  const nodes = (element) => {
    if (!element || typeof element !== "object") return [];
    if (Array.isArray(element)) return element.flatMap(nodes);
    return [element, ...nodes(element.props?.children)];
  };
  const find = (tree, predicate) => nodes(tree).find(predicate);
  const focusScreen = async () => {
    render();
    focus();
    await new Promise(setImmediate);
    return render();
  };
  return { ...f, render, nodes, find, focusScreen, navigations, setRoute: (value) => { route = value; } };
};

test("screen histogram opens galleries/lists and cloud cards stay explicitly disconnected", async () => {
  const f = screenFixture();
  f.saveConversation("alice", "room", [message("text"), message("photo", "IMAGE")]);
  const tree = await f.focusScreen();
  const imageBar = f.find(tree, (node) => node.props?.accessibilityLabel?.startsWith("myData.type.image,"));
  assert.ok(imageBar);
  imageBar.props.onPress();
  assert.deepEqual(plain(f.navigations[0]), ["DataCategory", { category: "image" }]);
  assert.equal(f.nodes(tree).filter((node) => node.type === "Text" && node.props.children === "myData.notConnected").length, 4);
  const logos = f.nodes(tree).filter((node) => node.type === "ProviderIcon");
  assert.deepEqual(logos.map((node) => node.props.name), ["microsoft-onedrive", "google-drive", "apple-icloud", "dropbox"]);
  for (const logo of logos) {
    assert.equal(logo.props.color, "#686868", "Uses a neutral grayscale tone");
    assert.equal(logo.props.accessible, false, "Provider name already labels the card");
  }
  const nodes = f.nodes(tree);
  const nas = f.find(tree, (node) => node.props?.testID === "personal-nas-preview");
  assert.ok(nas);
  assert.ok(nodes.indexOf(nas) > nodes.findIndex((node) => node.props?.children === "myData.cloudNote"));
  assert.ok(f.find(nas, (node) => node.props?.children === "myData.nasStatus"));
  assert.ok(f.find(nas, (node) => node.props?.children === "myData.nasBody"));
  assert.equal(f.nodes(nas).filter((node) => node.type === "TouchableOpacity").length, 0);
  f.setRoute({ name: "DataCategory", params: { category: "image" } });
  const gallery = f.find(f.render(), (node) => node.type === "FlatList");
  assert.equal(gallery.props.numColumns, 2);
  assert.equal(gallery.props.data.length, 1);
  assert.equal(gallery.props.data[0].message.id, "photo");
  f.setRoute({ name: "DataCategory", params: { category: "text" } });
  const list = f.find(f.render(), (node) => node.type === "FlatList");
  assert.equal(list.props.numColumns, 1);
  assert.equal(list.props.data[0].message.id, "text");
});

test("item modal saves real local tags and search filters the list", async () => {
  const f = screenFixture();
  f.saveConversation("alice", "room", [message("first"), message("second")]);
  f.setRoute({ name: "DataCategory", params: { category: "text" } });
  let tree = await f.focusScreen();
  const list = f.find(tree, (node) => node.type === "FlatList");
  list.props.renderItem({ item: list.props.data[0] }).props.onPress();
  tree = f.render();
  assert.equal(f.find(tree, (node) => node.type === "Modal").props.visible, true);
  f.find(tree, (node) => node.type === "TextInput").props.onChangeText("travel, tickets");
  tree = f.render();
  const save = f.find(tree, (node) => node.type === "TouchableOpacity" &&
    node.props.children?.props?.children === "common.save");
  await save.props.onPress();
  tree = f.render();
  assert.equal(f.find(tree, (node) => node.type === "Modal").props.visible, false);
  const library = await f.library.loadDataLibrary("alice");
  assert.deepEqual(plain(library.tags[library.entries[0].key]), ["travel", "tickets"]);
  const search = f.find(tree, (node) => node.type === "FlatList").props.ListHeaderComponent.props.children
    .find((node) => node.type === "SearchBar");
  search.props.onChangeText("tickets");
  const filtered = f.find(f.render(), (node) => node.type === "FlatList");
  assert.equal(filtered.props.data.length, 1);
  assert.equal(filtered.props.data[0].message.id, "first");
});
