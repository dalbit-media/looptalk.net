const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");

const load = (relative, mocks = {}, globals = {}) => {
  const filename = path.join(__dirname, "..", "src", relative);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false,
    plugins: ["@babel/plugin-transform-modules-commonjs", ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }]],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console: { error() {} },
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith(".")) return load(path.relative(path.join(__dirname, "..", "src"), path.resolve(path.dirname(filename), `${name}.js`)));
      return require(name);
    },
    ...globals,
  });
  return module.exports;
};
const selection = load("utils/attachmentSelection.js");
const limits = require("../src/config/limits");
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const video = {
  uri: "file:source.mov", name: "source.mov", fileName: "source.mov",
  fileSize: 20_000_000, mimeType: "video/quicktime", messageType: "VIDEO",
};

test("pickers select multiple originals and classify videos chosen as files", () => {
  assert.equal(selection.LIBRARY_PICKER_OPTIONS.allowsMultipleSelection, true);
  assert.equal(selection.LIBRARY_PICKER_OPTIONS.quality, 1);
  assert.equal(selection.LIBRARY_PICKER_OPTIONS.videoExportPreset, 0);
  assert.equal(selection.LIBRARY_PICKER_OPTIONS.preferredAssetRepresentationMode, "current");
  assert.equal(selection.FILE_PICKER_OPTIONS.multiple, true);
  assert.equal(selection.FILE_PICKER_OPTIONS.type, "*/*");
  const asset = selection.selectedAttachment({ name: "clip.MOV", uri: "blob:clip", size: 12, mimeType: "application/octet-stream" });
  assert.equal(asset.messageType, "VIDEO");
  assert.equal(asset.mimeType, "video/quicktime");
  assert.equal(asset.fileSize, 12);
  assert.equal(selection.selectedAttachment({ name: "report.pdf" }).messageType, "FILE");
});

test("selection cleanup only revokes the browser object URLs owned by the picker", () => {
  const revoked = [];
  const { releaseSelectedAttachment } = load("utils/attachmentSelection.js", {}, {
    URL: { revokeObjectURL: (uri) => revoked.push(uri) },
  });
  releaseSelectedAttachment({ uri: "blob:selected-file" });
  releaseSelectedAttachment({ uri: "file:camera.mp4" });
  releaseSelectedAttachment({ uri: "data:image/png;base64,AQID" });
  assert.deepEqual(revoked, ["blob:selected-file"]);
});

const webFixture = ({ outputSize = 100, unsupported = false, discarded = false, fail = false } = {}) => {
  const events = [], configs = [];
  let converted = false;
  const source = new Blob([new Uint8Array(1000)], { type: "video/mp4" });
  const conversion = {
    isValid: true, discardedTracks: discarded ? [{}] : [], state: "pending",
    execute: async () => {
      if (fail) throw new Error("Encoder failed");
      conversion.onProgress?.(0.5);
      converted = true;
      conversion.state = "done";
    },
    cancel: async () => events.push("cancel"),
  };
  const media = {
    Input: class {
      getPrimaryVideoTrack = async () => ({ displayWidth: 1920, displayHeight: 1080 });
      getAudioTracks = async () => [{}];
      computeDuration = async () => 10;
      dispose = () => events.push("input.dispose");
    },
    BlobSource: class {},
    ALL_FORMATS: [],
    Output: class {},
    BufferTarget: class { get buffer() { assert.equal(converted, true); return new Uint8Array(outputSize); } },
    Mp4OutputFormat: class {},
    Quality: class { constructor(value) { this.value = value; } },
    canEncodeVideo: async () => !unsupported,
    canEncodeAudio: async () => !unsupported,
    Conversion: { init: async (config) => { configs.push(config); return conversion; } },
  };
  const { prepareAttachment } = load("utils/prepareAttachment.web.js", {
    mediabunny: media, "../config/limits": limits, "./attachmentSelection": selection,
  }, {
    Blob,
    fetch: async () => { events.push("fetch"); return { ok: true, blob: async () => source }; },
    URL: {
      createObjectURL: (blob) => { events.push(["url", blob.size]); return "blob:encoded"; },
      revokeObjectURL: (uri) => events.push(["revoke", uri]),
    },
  });
  return { prepareAttachment, events, configs };
};

test("Original size bypasses web encoding byte-for-byte; non-video files stay unchanged", async () => {
  const f = webFixture();
  const result = await f.prepareAttachment(video, { original: true });
  assert.equal(result.payload, video);
  assert.equal(f.events.length, 0);
  const file = { ...video, messageType: "FILE" };
  assert.equal((await f.prepareAttachment(file)).payload, file);
  assert.equal(f.events.length, 0);
});

test("web video encoding keeps dimensions and audio, reports progress and releases output URLs", async () => {
  const f = webFixture();
  const progress = [];
  const result = await f.prepareAttachment(video, { onProgress: (p) => progress.push(p) });
  assert.equal(result.payload.uri, "blob:encoded");
  assert.equal(result.payload.fileSize, 100);
  assert.equal(result.payload.mimeType, "video/mp4");
  assert.equal(result.payload.name, "source.mp4");
  assert.equal(result.payload.width, 1920);
  assert.equal(result.payload.height, 1080);
  assert.equal(result.payload.duration, 10_000);
  assert.equal(f.configs[0].video.quality.value, 0.8);
  assert.equal(f.configs[0].video.width, undefined, "No resizing");
  assert.equal(f.configs[0].video.frameRate, undefined, "No frame-rate cap");
  assert.equal(f.configs[0].audio.codec, "aac");
  assert.equal(f.configs[0].audio.discard, undefined);
  assert.deepEqual(progress, [0.5]);
  result.dispose();
  assert.ok(f.events.some((event) => Array.isArray(event) && event[0] === "revoke"));
  assert.ok(f.events.includes("input.dispose"));
});

test("larger encoded results keep the original; unavailable codecs, dropped tracks and encoder errors are explicit", async () => {
  const large = webFixture({ outputSize: 1200 });
  const result = await large.prepareAttachment(video);
  assert.equal(result.payload.uri, video.uri);
  assert.equal(result.payload.fileSize, 1000);
  assert.equal(large.events.some(Array.isArray), false);
  for (const options of [{ unsupported: true }, { discarded: true }]) {
    const f = webFixture(options);
    await assert.rejects(f.prepareAttachment(video), { code: "VIDEO_ENCODING_UNAVAILABLE" });
    assert.ok(f.events.includes("input.dispose"));
  }
  const failed = webFixture({ fail: true });
  await assert.rejects(failed.prepareAttachment(video), /Encoder failed/);
  assert.ok(failed.events.includes("cancel"));
  assert.ok(failed.events.includes("input.dispose"));
  const empty = webFixture({ outputSize: 0 });
  await assert.rejects(empty.prepareAttachment(video), /empty file/);
});

const nativeFixture = ({ size = 20_000_000, outputSize = 5_000_000 } = {}) => {
  const events = [];
  const compressor = {
    getVideoMetaData: async () => { events.push("metadata"); return { width: 1920, height: 1080, size, duration: 10 }; },
    Video: { compress: async (_uri, options, onProgress) => {
      events.push(["compress", options]);
      onProgress?.(0.5);
      return "file:encoded.mp4";
    } },
  };
  const { prepareAttachment } = load("utils/prepareAttachment.js", {
    "react-native-compressor": compressor, "../config/limits": limits, "./attachmentSelection": selection,
    "expo-file-system": { File: class {
      size = outputSize;
      exists = true;
      delete() { this.exists = false; events.push("delete"); }
    } },
  });
  return { prepareAttachment, events };
};

test("native encoder preserves resolution, keeps smaller results, and cleans temporary files", async () => {
  const f = nativeFixture();
  const result = await f.prepareAttachment(video);
  const [, options] = f.events.find(Array.isArray);
  assert.equal(options.compressionMethod, "manual");
  assert.equal(options.maxSize, 1920);
  assert.ok(options.bitrate >= 7_000_000);
  assert.equal(options.stripAudio, undefined);
  assert.equal(result.payload.fileSize, 5_000_000);
  assert.equal(result.payload.name, "source.mp4");
  result.dispose();
  assert.ok(f.events.includes("delete"));
  const bypass = nativeFixture();
  assert.equal((await bypass.prepareAttachment(video, { original: true })).payload, video);
  assert.equal(bypass.events.length, 0);
  const efficient = nativeFixture({ size: 1_000_000 });
  assert.equal((await efficient.prepareAttachment(video)).payload.uri, video.uri);
  assert.equal(efficient.events.some(Array.isArray), false);
  const large = nativeFixture({ outputSize: 30_000_000 });
  assert.equal((await large.prepareAttachment(video)).payload.uri, video.uri);
  assert.ok(large.events.includes("delete"));
  const empty = nativeFixture({ outputSize: 0 });
  await assert.rejects(empty.prepareAttachment(video), /empty file/);
  assert.ok(empty.events.includes("delete"));
});

test("Original size still enforces the attachment size limit", async () => {
  for (const f of [webFixture(), nativeFixture()]) {
    await assert.rejects(f.prepareAttachment({ ...video, fileSize: limits.MAX_ATTACHMENT_BYTES + 1 }, { original: true }),
      { code: "ATTACHMENT_TOO_LARGE" });
  }
});

test("review exposes a small unchecked Original size option before sending multiple files", () => {
  const changes = [], actions = [];
  const { AttachmentReview } = load("components/AttachmentReview.js", {
    react: React,
    "react-native": { View: "View", ScrollView: "ScrollView", TouchableOpacity: "TouchableOpacity",
      ActivityIndicator: "Spinner", StyleSheet: { create: (styles) => styles } },
    "@expo/vector-icons/Ionicons": { default: "Icon" },
    "./AppText": { AppText: "Text" },
    "../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
    "../hooks/useTranslation": { useTranslation: () => (key) => key },
  });
  const props = { items: [video, { ...video, uri: "file:second", name: "second.mp4" }],
    onOriginalChange: (value) => changes.push(value), onSend: () => actions.push("send"),
    onCancel: () => actions.push("cancel"), busy: false };
  const tree = AttachmentReview(props);
  const checkbox = nodes(tree).find((node) => node.props?.accessibilityRole === "checkbox");
  assert.equal(checkbox.props.accessibilityState.checked, false);
  assert.equal(nodes(checkbox).find((node) => node.type === "Text").props.style.fontSize, 12);
  checkbox.props.onPress();
  assert.deepEqual(changes, [true]);
  nodes(tree).find((node) => node.props?.accessibilityLabel === "messages.sendAttachments").props.onPress();
  assert.deepEqual(actions, ["send"]);
  const busy = nodes(AttachmentReview({ ...props, busy: true }));
  assert.ok(busy.filter((node) => node.type === "TouchableOpacity").every((node) => node.props.disabled));
});

const chatFixture = ({ prepare, send, calling = false } = {}) => {
  const slots = [], prepared = [], sent = [], disposed = [], alerts = [], picks = [];
  const calls = [];
  let cursor = 0;
  const state = {
    messages: [], conversations: [{ id: "room", kind: "CHAT", participants: [
      { userId: "bob", user: { id: "bob", displayName: "Bob" } },
    ] }], typingUsers: new Set(),
    sendMediaMessage: async (...args) => { sent.push(args); if (send) await send(...args); },
  };
  const mocks = {
    react: {
      ...React, useEffect() {}, useMemo: (fn) => fn(),
      useState: (initial) => {
        const i = cursor++;
        if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
        return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
      },
      useRef: (initial) => { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    },
    "react-native": {
      View: "View", FlatList: "FlatList", TouchableOpacity: "TouchableOpacity", KeyboardAvoidingView: "KeyboardAvoidingView",
      ActivityIndicator: "Spinner", Image: "Image", Linking: {}, Platform: { OS: "web" },
      StyleSheet: { create: (styles) => styles, absoluteFill: {} },
    },
    "expo-image-picker": {
      requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
      launchImageLibraryAsync: async (options) => { picks.push(options); return { assets: [
        { uri: "blob:one", fileName: "one.mp4", mimeType: "video/mp4", fileSize: 2000, type: "video" },
        { uri: "blob:two", fileName: "two.mp4", mimeType: "video/mp4", fileSize: 3000, type: "video" },
      ] }; },
    },
    "expo-document-picker": {
      getDocumentAsync: async (options) => { picks.push(options); return { assets: [
        { uri: "blob:file", name: "report.pdf", mimeType: "application/pdf", size: 100 },
      ] }; },
    },
    "expo-video-thumbnails": {},
    "@expo/vector-icons/Ionicons": { default: "Icon" },
    "../../store/authStore": { useAuthStore: (select) => select({ token: "token", user: { id: "alice" } }) },
    "../../store/messageStore": { useMessageStore: (select) => select(state) },
    "../../store/callStore": { useCallStore: (select) => select({
      isCallingSupported: calling, isVideoCallingSupported: calling, isScreenSharingSupported: calling,
      startCall: async (...args) => { calls.push(args); },
    }) },
    "../../store/contactStore": { useContactStore: (select) => select({ contacts: {} }) },
    "../../utils/contactDisplayName": { contactDisplayNames: () => new Map(), resolveDisplayName: () => "" },
    "../../hooks/useTranslation": { useTranslation: () => (key, params) => `${key}${params ? JSON.stringify(params) : ""}` },
    "../../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
    "../../config/environment": { API_URL: "http://localhost" },
    "../../config/limits": limits,
    "../../utils/showAlert": { showAlert: (...args) => alerts.push(args) },
    "../../api/reports": {},
    "../../utils/secureMessaging": {},
    "../../utils/privateMedia": {},
    "../../utils/attachmentSelection": selection,
    "../../utils/prepareAttachment": { prepareAttachment: async (...args) => {
      prepared.push(args);
      if (prepare) await prepare(...args);
      return { payload: args[0], dispose: () => disposed.push(args[0].uri) };
    } },
  };
  for (const component of [
    "AppTextInput", "AppText", "UserPresence", "EmptyState", "AttachmentSheet", "AttachmentReview",
    "DrawingPad", "VoiceRecorderBar", "VoiceMessageBubble", "VideoMessageBubble", "SearchBar", "FilterChips", "HighlightText",
  ]) mocks[`../../components/${component}`] = { [component]: component };
  mocks["../../components/ReactionPicker"] = { ReactionBar: "ReactionBar", ReactionPicker: "ReactionPicker" };
  const { ChatScreen } = load("screens/app/ChatScreen.js", mocks);
  const render = () => {
    cursor = 0;
    return ChatScreen({ route: { params: { conversationId: "room" } }, navigation: {} });
  };
  const review = () => nodes(render()).find((node) => node.type === "AttachmentReview").props;
  const select = async (key) => {
    nodes(render()).find((node) => node.type === "AttachmentSheet").props.onSelect(key);
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };
  const sheet = () => nodes(render()).find((node) => node.type === "AttachmentSheet").props;
  return { review, select, prepared, sent, disposed, alerts, picks, calls, sheet };
};

test("attachment call actions close the menu and start the selected mode for the conversation peer", async () => {
  const f = chatFixture({ calling: true });
  assert.equal(f.sheet().canCall, true);
  assert.equal(f.sheet().canVideoCall, true);
  assert.equal(f.sheet().canScreenShare, true);
  for (const mode of ["audio", "video", "screen"]) {
    await f.select(mode);
    assert.equal(f.sheet().visible, false);
  }
  assert.deepEqual(f.calls.map(([conversationId, mode, peer]) => [conversationId, mode, peer.id]), [
    ["room", "audio", "bob"], ["room", "video", "bob"], ["room", "screen", "bob"],
  ]);
  const unsupported = chatFixture();
  for (const mode of ["audio", "video", "screen"]) await unsupported.select(mode);
  assert.equal(unsupported.calls.length, 0);
});

test("chat reviews all selected media before sending and passes original-size and upload progress options", async () => {
  const f = chatFixture();
  await f.select("library");
  assert.equal(f.review().items.length, 2);
  assert.equal(f.review().original, false);
  assert.equal(f.prepared.length, 0, "Picking does not encode or send");
  assert.equal(f.sent.length, 0);
  f.review().onOriginalChange(true);
  await f.review().onSend();
  assert.deepEqual(f.prepared.map(([asset]) => asset.name), ["one.mp4", "two.mp4"]);
  assert.ok(f.prepared.every(([, options]) => options.original === true));
  assert.equal(f.sent.length, 2);
  assert.equal(typeof f.sent[0][3].onUploadProgress, "function");
  assert.equal(f.disposed.length, 2);
  assert.equal(f.review().items.length, 0);
  await f.select("file");
  assert.equal(f.review().original, false, "Each new selection starts unchecked");
  assert.equal(f.picks[1].multiple, true);
  f.review().onCancel();
  assert.equal(f.review().items.length, 0);
});

test("chat blocks duplicate batch submissions and retains unprocessed files after encoding failure", async () => {
  let reject;
  const f = chatFixture({ prepare: () => new Promise((_resolve, fail) => { reject = fail; }) });
  await f.select("library");
  const sending = f.review().onSend();
  assert.equal(f.review().busy, true);
  await f.review().onSend();
  assert.equal(f.prepared.length, 1);
  reject(selection.encodingUnavailable());
  await sending;
  assert.equal(f.review().items.length, 2);
  assert.equal(f.review().busy, false);
  assert.equal(f.sent.length, 0);
  assert.match(f.alerts[0][1], /messages.encodingUnavailable/);
});

test("chat does not duplicate a failed attachment already owned by the durable outbox", async () => {
  const f = chatFixture({ send: async () => {
    throw Object.assign(new Error("Recipient unavailable"), { clientMessageId: "durable-id" });
  } });
  await f.select("library");
  await f.review().onSend();
  assert.equal(f.sent.length, 1);
  assert.equal(f.review().items.length, 1);
  assert.equal(f.review().items[0].name, "two.mp4");
  assert.equal(f.disposed.length, 1);
  assert.equal(f.alerts.length, 1);
});

test("an unsupported encoder can be bypassed explicitly with Original size without losing the selection", async () => {
  const f = chatFixture({ prepare: async (_asset, options) => {
    if (!options.original) throw selection.encodingUnavailable();
  } });
  await f.select("library");
  await f.review().onSend();
  assert.equal(f.sent.length, 0);
  assert.equal(f.review().items.length, 2);
  f.review().onOriginalChange(true);
  await f.review().onSend();
  assert.equal(f.sent.length, 2);
  assert.equal(f.review().items.length, 0);
});
