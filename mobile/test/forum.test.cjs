const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const sourceRoot = path.join(__dirname, "..", "src");
const load = (relative, mocks) => {
  const filename = path.join(sourceRoot, relative);
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
const nodes = (element) => {
  if (!element || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  return [element, ...nodes(element.props?.children)];
};
const find = (tree, predicate) => nodes(tree).find(predicate);
const button = (tree, label) => find(tree, (node) => node.props?.label === label);
const tick = () => new Promise(setImmediate);
const poll = {
  id: "poll", question: "Which one?", author: { id: "alice", name: "Alice public" }, visibility: "public",
  createdAt: "2026-10-18T00:00:00Z",
  options: [{ id: "first", text: "First" }, { id: "second", text: "Second" }], myOptionId: null,
};

const fixture = (screen, api, contacts = { friends: [{ contactUserId: "alice" }] }, user = { id: "me" }) => {
  const React = require("react");
  const state = [];
  let cursor = 0, focus;
  const navigations = [];
  const { [screen]: Screen } = load("screens/app/ForumScreen.js", {
    react: {
      ...React,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
      useRef: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = { current: initial };
        return state[index];
      },
      useCallback: (callback) => callback,
    },
    "react-native": {
      ...Object.fromEntries(["ActivityIndicator", "FlatList", "KeyboardAvoidingView", "RefreshControl",
        "ScrollView", "TouchableOpacity", "View"].map((name) => [name, name])),
      Platform: { OS: "web" }, StyleSheet: { create: (value) => value },
    },
    "@react-navigation/native": { useFocusEffect: (callback) => { focus = callback; } },
    "../../components/AppText": { AppText: "Text" },
    "../../components/AppTextInput": { AppTextInput: "TextInput" },
    "../../components/InfoTip": { InfoTip: "InfoTip" },
    "../../components/GuestJoinBanner": { GuestJoinBanner: "GuestJoinBanner" },
    "@expo/vector-icons/Ionicons": { default: "Ionicons" },
    "../../store/authStore": { useAuthStore: (select) => select({ token: "token", user }) },
    "../../store/contactStore": { useContactStore: (select) => select({ contacts }) },
    "../../hooks/useAppTheme": { useAppTheme: () => ({ colors: { text: "#eee", danger: "#f00" } }) },
    "../../hooks/useTranslation": { useTranslation: () => (key, params) => key + (params ? JSON.stringify(params) : "") },
    "../../api/forum": api,
  });
  let createFab;
  const render = () => {
    cursor = 0;
    const tree = Screen({ route: { params: { pollId: "poll" } }, navigation: {
      navigate: (...args) => navigations.push(["navigate", ...args]),
      replace: (...args) => navigations.push(["replace", ...args]),
    } });
    if (screen !== "ForumScreen") return tree;
    [, createFab] = tree.props.children;
    return tree.props.children[0];
  };
  const open = async () => {
    render();
    focus?.();
    await tick();
    return render();
  };
  return { render, open, navigations, createFab: () => createFab, refocus: async () => { render(); focus?.(); await tick(); return render(); } };
};

test("forum is leftmost, Messages stays initial, and My Data follows Contacts instead of chat headers", () => {
  const navigation = fs.readFileSync(path.join(sourceRoot, "navigation", "AppStack.js"), "utf8");
  const tabs = navigation.slice(navigation.indexOf("<Tab.Navigator"));
  assert.match(tabs, /initialRouteName="Messages"/);
  assert.deepEqual([...tabs.matchAll(/<Tab.Screen\s+name="([^"]+)"/g)].map((match) => match[1]),
    ["Forum", "Messages", "Contacts", "MyData", "Settings"]);
  assert.match(navigation, /headerRight: \(\) => <WebAppInstallButton \/>/);
  assert.doesNotMatch(navigation, /navigation\.navigate\("MyDataHome"\)/);
  assert.match(navigation, /name="MyDataHome" component=\{MyDataScreen\}/);
  assert.match(navigation, /name="DataCategory" component=\{MyDataScreen\}/);
  const chat = fs.readFileSync(path.join(sourceRoot, "screens", "app", "ChatScreen.js"), "utf8");
  assert.doesNotMatch(chat, /navigation\.navigate\("MyDataHome"\)/);
});

test("all forum copy is present in every supported locale", () => {
  const source = fs.readFileSync(path.join(sourceRoot, "i18n", "i18n.js"), "utf8");
  const ast = babel.parseSync(source, { babelrc: false, configFile: false });
  const translations = ast.program.body.find((node) =>
    node.type === "VariableDeclaration" && node.declarations[0].id.name === "translations").declarations[0].init;
  const used = new Set([...fs.readFileSync(path.join(sourceRoot, "screens", "app", "ForumScreen.js"), "utf8")
    .matchAll(/"(forum\.[^"]+)"/g)].map((match) => match[1]));
  used.add("navigation.forum");
  assert.ok(used.size > 20);
  for (const locale of translations.properties) {
    const keys = new Set(locale.value.properties.map((property) => property.key.value));
    for (const key of used) assert.ok(keys.has(key), `${locale.key.name}: ${key}`);
  }
});

test("forum list creates polls, opens details, paginates and surfaces failed loads", async () => {
  let fail = false;
  const calls = [];
  const f = fixture("ForumScreen", {
    listPolls: async (token, page, scope) => {
      calls.push([token, page, scope]);
      if (fail) throw new Error("offline");
      return { polls: [{ ...poll, id: `poll-${page}` }], hasMore: page === 1 };
    },
  });
  let list = await f.open();
  assert.equal(list.props.data.length, 1);
  assert.equal(f.createFab().props.accessibilityLabel, "forum.create");
  f.createFab().props.onPress();
  list.props.renderItem({ item: list.props.data[0] }).props.onPress();
  assert.deepEqual(plain(f.navigations), [
    ["navigate", "CreatePoll"], ["navigate", "Poll", { pollId: "poll-1" }],
  ]);
  await list.props.ListFooterComponent.props.onPress();
  list = f.render();
  assert.equal(list.props.data.length, 2);
  assert.deepEqual(calls, [["token", 1, "loop"], ["token", 2, "loop"]]);
  fail = true;
  await list.props.refreshControl.props.onRefresh();
  list = f.render();
  assert.ok(find(list.props.ListHeaderComponent, (node) => node.props?.accessibilityRole === "alert"));
  assert.equal(list.props.data.length, 2, "Does not replace a failed request with a fake empty success");
});

test("My Contacts is default, Public shows everyone, and contact changes update the local filter", async () => {
  const contacts = { friends: [{ contactUserId: "alice" }], work: [{ contactUserId: "bob" }] };
  const calls = [];
  const publicPolls = [
    poll,
    { ...poll, id: "bob-poll", author: { id: "bob", name: "Bob" } },
    { ...poll, id: "stranger-poll", author: { id: "stranger", name: "Stranger" } },
  ];
  const f = fixture("ForumScreen", {
    listPolls: async (...args) => { calls.push(args); return { polls: publicPolls, hasMore: false }; },
  }, contacts);
  let list = await f.open();
  const tab = (tree, text) => find(tree.props.ListHeaderComponent,
    (node) => node.props?.accessibilityRole === "tab" && node.props.children?.props?.label === text);
  assert.deepEqual(plain(list.props.data.map((item) => item.id)), ["poll", "bob-poll"]);
  assert.equal(tab(list, "forum.myContacts").props.accessibilityState.selected, true);
  tab(list, "forum.public").props.onPress();
  list = await f.refocus();
  assert.deepEqual(plain(list.props.data.map((item) => item.id)), ["poll", "bob-poll", "stranger-poll"]);
  assert.equal(tab(list, "forum.public").props.accessibilityState.selected, true);
  tab(list, "forum.myContacts").props.onPress();
  contacts.friends = [];
  list = await f.refocus();
  assert.deepEqual(plain(list.props.data.map((item) => item.id)), ["bob-poll"]);
  contacts.friends.push({ contactUserId: "stranger" });
  assert.deepEqual(plain(f.render().props.data.map((item) => item.id)), ["bob-poll", "stranger-poll"]);
  assert.deepEqual(calls, [["token", 1, "loop"], ["token", 1, "public"], ["token", 1, "loop"]],
    "Tabs only send the scope, never private contacts");
});

test("public tab hides contacts-only posts and My Loop keeps the author's own posts", async () => {
  const mixed = [
    { ...poll, id: "open" },
    { ...poll, id: "loop-mine", visibility: "contacts", author: { id: "me", name: "Me" } },
    { ...poll, id: "loop-stranger", visibility: "contacts", author: { id: "stranger", name: "Stranger" } },
  ];
  const f = fixture("ForumScreen", { listPolls: async () => ({ polls: mixed, hasMore: false }) }, {});
  let list = await f.open();
  assert.deepEqual(plain(list.props.data.map((item) => item.id)), ["loop-mine"]);
  find(list.props.ListHeaderComponent, (node) => node.props?.accessibilityRole === "tab" &&
    node.props.children?.props?.label === "forum.public").props.onPress();
  list = await f.refocus();
  assert.deepEqual(plain(list.props.data.map((item) => item.id)), ["open"]);
});

test("contact polls on later public pages remain discoverable after an empty filtered page", async () => {
  const calls = [];
  const f = fixture("ForumScreen", {
    listPolls: async (...args) => {
      calls.push(args);
      const page = args[1];
      return {
        polls: page === 1 ? [{ ...poll, id: "stranger", author: { id: "stranger", name: "Stranger" } }] : [poll],
        hasMore: page === 1,
      };
    },
  });
  let list = await f.open();
  assert.equal(list.props.data.length, 0);
  assert.equal(list.props.ListEmptyComponent.props.children, "forum.noContactsLoaded");
  assert.ok(list.props.ListFooterComponent, "An empty filtered page must not stop pagination");
  await list.props.ListFooterComponent.props.onPress();
  list = f.render();
  assert.deepEqual(plain(list.props.data.map((item) => item.id)), ["poll"]);
  assert.equal(list.props.ListFooterComponent, null);
  assert.deepEqual(calls, [["token", 1, "loop"], ["token", 2, "loop"]]);
});

test("no contacts has a distinct empty state and Public still shows all posts", async () => {
  const f = fixture("ForumScreen", {
    listPolls: async () => ({ polls: [poll], hasMore: true }),
  }, {});
  let list = await f.open();
  assert.equal(list.props.data.length, 0);
  assert.equal(list.props.ListEmptyComponent.props.children, "forum.noContacts");
  assert.equal(list.props.ListFooterComponent, null);
  find(list.props.ListHeaderComponent, (node) => node.props?.accessibilityRole === "tab" &&
    node.props.children?.props?.label === "forum.public").props.onPress();
  list = await f.refocus();
  assert.equal(list.props.data.length, 1);
  assert.ok(list.props.ListFooterComponent);
});

test("poll results and comment requests stay locked until a vote succeeds", async () => {
  let voted = false;
  const calls = [];
  const f = fixture("PollScreen", {
    getPoll: async () => voted ? { ...poll, myOptionId: "first", totalVotes: 3, results: [
      { optionId: "first", votes: 2 }, { optionId: "second", votes: 1 },
    ] } : poll,
    vote: async (...args) => { calls.push(["vote", ...args]); voted = true; return { myOptionId: "first" }; },
    listComments: async (...args) => {
      calls.push(["comments", ...args]);
      return { comments: [{ id: "comment", content: "Interesting result", author: { name: "Bob" }, createdAt: poll.createdAt }], hasMore: false };
    },
  });
  let tree = await f.open();
  assert.equal(find(tree, (node) => node.props?.children === "forum.comments"), undefined);
  assert.equal(find(tree, (node) => node.type === "TextInput"), undefined);
  assert.equal(calls.length, 0);
  find(tree, (node) => node.props?.accessibilityRole === "radio").props.onPress();
  tree = f.render();
  await button(tree, "forum.vote").props.onPress();
  tree = f.render();
  assert.deepEqual(calls, [["vote", "token", "poll", "first"], ["comments", "token", "poll"]]);
  assert.ok(find(tree, (node) => node.props?.children === "forum.comments"));
  assert.ok(find(tree, (node) => node.props?.children === "Interesting result"));
  assert.ok(find(tree, (node) => node.props?.children === 'forum.result{"count":2,"percent":67}'));
  assert.ok(find(tree, (node) => node.props?.children === 'forum.result{"count":1,"percent":33}'));
  assert.equal(find(tree, (node) => node.props?.accessibilityRole === "radio"), undefined);
});

test("failed votes do not unlock results or request comments", async () => {
  let commentRequests = 0;
  const f = fixture("PollScreen", {
    getPoll: async () => poll,
    vote: async () => { throw new Error("offline"); },
    listComments: async () => { commentRequests += 1; },
  });
  let tree = await f.open();
  find(tree, (node) => node.props?.accessibilityRole === "radio").props.onPress();
  await button(f.render(), "forum.vote").props.onPress();
  tree = f.render();
  assert.ok(find(tree, (node) => node.props?.children === "forum.voteFailed"));
  assert.equal(find(tree, (node) => node.props?.children === "forum.comments"), undefined);
  assert.equal(commentRequests, 0);
});

test("participating users post real comments and see explicit posting errors", async () => {
  let fail = true;
  const submitted = [];
  const f = fixture("PollScreen", {
    getPoll: async () => ({ ...poll, myOptionId: "first", totalVotes: 1, results: [
      { optionId: "first", votes: 1 }, { optionId: "second", votes: 0 },
    ] }),
    listComments: async () => ({ comments: [], hasMore: false }),
    postComment: async (...args) => { if (fail) throw new Error("offline"); submitted.push(args); },
  });
  let tree = await f.open();
  find(tree, (node) => node.type === "TextInput").props.onChangeText(" My opinion ");
  await button(f.render(), "forum.postComment").props.onPress();
  tree = f.render();
  assert.ok(find(tree, (node) => node.props?.children === "forum.commentFailed"));
  assert.equal(find(tree, (node) => node.type === "TextInput").props.value, " My opinion ");
  fail = false;
  await button(tree, "forum.postComment").props.onPress();
  assert.deepEqual(submitted, [["token", "poll", "My opinion"]]);
  assert.equal(find(f.render(), (node) => node.type === "TextInput").props.value, "");
});

test("poll creation validates duplicate options and navigates to the persisted poll", async () => {
  const created = [];
  const f = fixture("CreatePollScreen", {
    createPoll: async (...args) => { created.push(args); return poll; },
  });
  let tree = f.render();
  await button(tree, "forum.create").props.onPress();
  assert.equal(created.length, 0);
  assert.ok(find(f.render(), (node) => node.props?.children === "forum.invalidPoll"));
  let inputs = nodes(f.render()).filter((node) => node.type === "TextInput");
  inputs[0].props.onChangeText(" Which one? ");
  await button(f.render(), "forum.create").props.onPress();
  assert.deepEqual(plain(created), [["token", "Which one?", ["forum.support"], "contacts"]]);
  created.length = 0;
  f.navigations.length = 0;
  button(f.render(), "forum.customChoices").props.onPress();
  inputs = nodes(f.render()).filter((node) => node.type === "TextInput");
  inputs[1].props.onChangeText(" First ");
  inputs[2].props.onChangeText("first");
  await button(f.render(), "forum.create").props.onPress();
  assert.equal(created.length, 0);
  inputs = nodes(f.render()).filter((node) => node.type === "TextInput");
  inputs[2].props.onChangeText("Second");
  find(f.render(), (node) => node.props?.accessibilityRole === "radio" &&
    node.props.children?.props?.label === "forum.visibilityPublic").props.onPress();
  await button(f.render(), "forum.create").props.onPress();
  assert.deepEqual(plain(created), [["token", "Which one?", ["First", "Second"], "public"]]);
  assert.deepEqual(plain(f.navigations), [["replace", "Poll", { pollId: "poll" }]]);
});

test("authors can move a post between My Loop, Neighbor Loops and public", async () => {
  const visibilityCalls = [];
  const f = fixture("PollScreen", {
    getPoll: async () => ({ ...poll, visibility: "contacts", author: { id: "me", name: "Me" } }),
    setPollVisibility: async (...args) => { visibilityCalls.push(args); return { visibility: args[2] }; },
  });
  const radio = (tree, text) => find(tree, (node) => node.props?.accessibilityRole === "radio" &&
    node.props.children?.props?.label === text);
  let tree = await f.open();
  await radio(tree, "forum.visibilityPublic").props.onPress();
  assert.deepEqual(visibilityCalls, [["token", "poll", "public"]]);
  tree = f.render();
  await radio(tree, "forum.visibilityNetwork").props.onPress();
  assert.deepEqual(visibilityCalls[1], ["token", "poll", "network"]);
});

test("Neighbor Loops tab lists only network posts and requests that scope", async () => {
  const calls = [];
  const mixed = [
    { ...poll, id: "net", visibility: "network" },
    { ...poll, id: "open", visibility: "public" },
  ];
  const f = fixture("ForumScreen", { listPolls: async (...args) => { calls.push(args); return { polls: mixed, hasMore: false }; } });
  let list = await f.open();
  find(list.props.ListHeaderComponent, (node) => node.props?.accessibilityRole === "tab" &&
    node.props.children?.props?.label === "forum.network").props.onPress();
  list = await f.refocus();
  assert.deepEqual(plain(list.props.data.map((item) => item.id)), ["net"]);
  assert.equal(calls.at(-1)[2], "network");
});

test("guests only get the Public tab, public-only posting and no voting", async () => {
  const guest = { id: "me", member: false };
  const calls = [];
  const f = fixture("ForumScreen", { listPolls: async (...args) => { calls.push(args); return { polls: [poll], hasMore: false }; } }, {}, guest);
  const list = await f.open();
  const tabs = nodes(list.props.ListHeaderComponent).filter((node) => node.props?.accessibilityRole === "tab");
  assert.deepEqual(tabs.map((node) => node.props.children.props.label), ["forum.public"]);
  assert.equal(calls[0][2], "public");
  const created = [];
  const create = fixture("CreatePollScreen", { createPoll: async (...args) => { created.push(args); return poll; } }, {}, guest);
  const tree = create.render();
  nodes(tree).filter((node) => node.type === "TextInput")[0].props.onChangeText("Hello");
  await button(create.render(), "forum.create").props.onPress();
  assert.equal(created[0][3], "public");
  const detail = fixture("PollScreen", { getPoll: async () => ({ ...poll, visibility: "public" }) }, {}, guest);
  const opened = await detail.open();
  assert.ok(find(opened, (node) => node.props?.children === "forum.guestNotice"));
  assert.equal(button(opened, "forum.vote"), undefined);
});

test("forum API helper wires token, pagination and request bodies", async () => {
  const calls = [];
  const api = load("api/forum.js", { "./client": { api: {
    get: async (...args) => { calls.push(["GET", ...args]); return { data: { ok: true } }; },
    post: async (...args) => { calls.push(["POST", ...args]); return { data: { ok: true } }; },
    patch: async (...args) => { calls.push(["PATCH", ...args]); return { data: { ok: true } }; },
  } } });
  await api.listPolls("token", 2);
  await api.getPoll("token", "poll");
  await api.createPoll("token", "Question", ["A", "B"]);
  await api.setPollVisibility("token", "poll", "public");
  await api.vote("token", "poll", "option");
  await api.listComments("token", "poll", 3);
  await api.postComment("token", "poll", "Comment");
  assert.deepEqual(plain(calls), [
    ["GET", "/forum/polls", { headers: { Authorization: "Bearer token" }, params: { page: 2, scope: "public" } }],
    ["GET", "/forum/polls/poll", { headers: { Authorization: "Bearer token" } }],
    ["POST", "/forum/polls", { question: "Question", options: ["A", "B"], visibility: "contacts" }, { headers: { Authorization: "Bearer token" } }],
    ["PATCH", "/forum/polls/poll/visibility", { visibility: "public" }, { headers: { Authorization: plain(calls)[0][2].headers.Authorization } }],
    ["POST", "/forum/polls/poll/vote", { optionId: "option" }, { headers: { Authorization: "Bearer token" } }],
    ["GET", "/forum/polls/poll/comments", { headers: { Authorization: "Bearer token" }, params: { page: 3 } }],
    ["POST", "/forum/polls/poll/comments", { content: "Comment" }, { headers: { Authorization: "Bearer token" } }],
  ]);
});

test("Metro includes shared repository assets and pins React without breaking nested dependencies", () => {
  const directory = path.join(__dirname, "..");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(directory, "metro.config.js"), "utf8"), {
    module, __dirname: directory,
    require: (name) => name === "expo/metro-config" ? {
      getDefaultConfig: () => ({ watchFolders: [], server: {}, resolver: {} }),
    } : require(name),
  });
  const config = module.exports;
  assert.ok(config.watchFolders.includes(path.resolve(directory, "..")));
  assert.equal(config.server.unstable_serverRoot, path.resolve(directory, ".."));
  const requests = [];
  const context = {
    originModulePath: path.join(directory, "node_modules", "nested", "index.js"),
    resolveRequest: (...args) => { requests.push(args); return "resolved"; },
  };
  for (const name of ["react", "react/jsx-runtime", "react-dom", "react-dom/client"]) {
    assert.equal(config.resolver.resolveRequest(context, name, "web"), "resolved");
    assert.equal(requests.at(-1)[0].originModulePath, path.join(directory, "package.json"));
  }
  config.resolver.resolveRequest(context, "@react-navigation/elements", "web");
  assert.equal(requests.at(-1)[0], context, "Nested package resolution remains unchanged");
});
