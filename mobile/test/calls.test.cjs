const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const babel = require("@babel/core");
const { create } = require("zustand");

const root = path.resolve(__dirname, "..");
const load = (relative, mocks, globals = {}) => {
  const filename = path.join(root, relative);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename, configFile: false, babelrc: false,
    plugins: ["@babel/plugin-transform-modules-commonjs", "@babel/plugin-transform-react-jsx"],
  });
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
    ...globals,
  }, { filename });
  return exports;
};

let trackId = 0;
const track = (kind) => ({
  id: `${kind}-${++trackId}`, kind, enabled: true, muted: false, readyState: "live", contentHint: "",
  stop() { this.readyState = "ended"; },
});
class Stream {
  constructor(tracks = []) { this.tracks = [...tracks]; }
  getTracks() { return [...this.tracks]; }
  getAudioTracks() { return this.tracks.filter((value) => value.kind === "audio"); }
  getVideoTracks() { return this.tracks.filter((value) => value.kind === "video"); }
  addTrack(value) { this.tracks.push(value); }
  removeTrack(value) { this.tracks = this.tracks.filter((entry) => entry !== value); }
}
class Sender {
  constructor(value = null) { this.track = value; this.parameters = { encodings: [{}] }; }
  async replaceTrack(value) {
    if (this.failure) throw this.failure;
    this.track = value;
  }
  setStreams(...streams) { this.streams = streams; }
  getParameters() { return structuredClone(this.parameters); }
  async setParameters(value) { this.parameters = value; }
}
class Channel {
  constructor(label) { this.label = label; this.readyState = "connecting"; this.messages = []; }
  send(message) { this.messages.push(JSON.parse(message)); }
  close() { this.readyState = "closed"; }
  open() { this.readyState = "open"; this.onopen?.(); }
}
class Peer {
  constructor() {
    this.transceivers = [];
    this.connectionState = "new";
    this.signalingState = "stable";
    this.candidates = [];
    this.offers = [];
  }
  createDataChannel(label) { return new Channel(label); }
  setConfiguration(configuration) { this.configuration = configuration; }
  addTransceiver(kind, options = {}) {
    const transceiver = { sender: new Sender(), receiver: { track: track(kind) }, ...options };
    this.transceivers.push(transceiver);
    return transceiver;
  }
  addTrack(value, stream) {
    const transceiver = this.transceivers.find((entry) =>
      entry.receiver.track.kind === value.kind && !entry.sender.track
    ) || this.addTransceiver(value.kind);
    transceiver.sender.track = value;
    transceiver.sender.setStreams(stream);
    return transceiver.sender;
  }
  getTransceivers() { return this.transceivers; }
  getSenders() { return this.transceivers.map((entry) => entry.sender); }
  async createOffer(options) {
    this.offers.push(options);
    return { type: "offer", sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n" };
  }
  async createAnswer() { return { type: "answer", sdp: "v=0\r\n" }; }
  async setLocalDescription(value) {
    this.localDescription = value;
    this.signalingState = value.type === "offer" ? "have-local-offer" : "stable";
  }
  async setRemoteDescription(value) {
    this.remoteDescription = value;
    this.signalingState = value.type === "offer" ? "have-remote-offer" : "stable";
    if (!this.transceivers.length) this.addTransceiver("video");
  }
  async addIceCandidate(value) { this.candidates.push(value); }
  async getStats() { return new Map(); }
  close() { this.connectionState = "closed"; this.signalingState = "closed"; }
}
const namedError = (name) => Object.assign(new Error(name), { name });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const setup = (options = {}) => {
  const captures = [];
  const signals = [];
  const warnings = [];
  const errors = [];
  const permissions = [];
  const timeouts = new Map();
  const intervals = new Map();
  let timerId = 0;
  const auth = { token: options.token || null };
  const audio = track("audio");
  const camera = track("video");
  const screen = track("video");
  const local = new Stream(options.video ? [audio, camera] : [audio]);
  const display = new Stream([screen]);
  let appState;
  const native = Object.fromEntries([
    "answerNativeCall", "displayNativeIncomingCall", "endNativeCall", "markNativeCallActive",
    "rejectNativeCall", "setNativeCallMuted", "startNativeOutgoingCall",
  ].map((name) => [name, () => {}]));
  const { useCallStore: store } = load("src/store/callStore.js", {
    zustand: { create },
    "react-native": { AppState: { addEventListener: (_event, handler) => { appState = handler; return { remove() {} }; } } },
    "../api/client": { api: { get: options.ice || (async () => ({ data: { iceServers: [] } })) } },
    "./authStore": { useAuthStore: { getState: () => auth } },
    "../utils/callQuality": load("src/utils/callQuality.js", {}),
    "../utils/webrtc": {
      RTCPeerConnection: Peer, RTCSessionDescription: class { constructor(value) { Object.assign(this, value); } },
      RTCIceCandidate: class { constructor(value) { Object.assign(this, value); } },
      MediaStream: Stream, isCallingSupported: true, isVideoCallingSupported: true, isScreenSharingSupported: true,
      mediaDevices: {
        getUserMedia: async (constraints) => {
          captures.push(constraints);
          return options.capture ? options.capture(constraints) : constraints.audio === false ? new Stream([track("video")]) : local;
        },
        getDisplayMedia: async () => options.display ? options.display() : display,
      },
    },
    "../utils/inCallManager": Object.fromEntries(["start", "stop", "setKeepScreenOn", "setForceSpeakerphoneOn"].map((name) => [name, () => {}])),
    "../utils/requestCallPermissions": { requestCallPermissions: async (kind) => {
      permissions.push(kind);
      if (options.permission) await options.permission(kind);
    } },
    "../utils/nativeCalling": native,
  }, {
    console: { warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) },
    setTimeout: (handler, delay) => { const id = ++timerId; timeouts.set(id, { handler, delay }); return id; },
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: (handler, delay) => { const id = ++timerId; intervals.set(id, { handler, delay }); return id; },
    clearInterval: (id) => intervals.delete(id),
  });
  store.setState({ socket: { connected: true, emit: (...args) => signals.push(args) } });
  const connect = async (kind = "audio", incoming = false) => {
    if (incoming) {
      store.getState()._handleIncoming({
        callId: "incoming", conversationId: "conversation", callType: kind,
        caller: { id: "peer" }, sdp: { type: "offer", sdp: "v=0\r\n" },
      });
      assert.equal(await store.getState().acceptCall(), true);
    } else {
      await store.getState().startCall("conversation", kind, { id: "peer" });
      await store.getState()._handleAnswered({
        callId: store.getState().call.callId, sdp: { type: "answer", sdp: "v=0\r\n" },
      });
    }
    store.getState().pc.connectionState = "connected";
    store.getState().pc.onconnectionstatechange();
  };
  return {
    store, connect, captures, signals, permissions, warnings, errors, auth,
    audio, camera, screen, local, display, timeouts, intervals,
    appState: (value) => appState(value),
    runTimeout: async (delay) => {
      const entry = [...timeouts.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `Missing ${delay}ms timeout`);
      timeouts.delete(entry[0]);
      entry[1].handler();
      await new Promise(setImmediate);
    },
  };
};

for (const incoming of [false, true]) {
  for (const cameraError of ["NotFoundError", "NotAllowedError", "NotReadableError", "OverconstrainedError"]) {
    test(`${incoming ? "accept" : "start"} video without camera (${cameraError}) keeps audio and a video sender`, async () => {
      const audio = track("audio");
      const env = setup({ capture: async (constraints) => {
        if (constraints.video) throw namedError(cameraError);
        return new Stream([audio]);
      } });
      await env.connect("video", incoming);
      const state = env.store.getState();
      assert.equal(state.isCameraOff, true);
      assert.equal(state.audioSender.track, audio);
      assert.equal(state.videoSender.track, null);
      assert.equal(state.pc.getTransceivers().find((value) => value.receiver.track.kind === "video").direction, "sendrecv");
      assert.equal(env.warnings.length, 1);
      assert.equal(await state.startScreenShare(), true);
      assert.equal(env.store.getState().videoSender.track, env.screen);
      env.store.getState().endCall();
    });
  }
}

test("denied native camera permission retries microphone permission only", async () => {
  const env = setup({ permission: async (kind) => {
    if (kind === "video") throw Object.assign(new Error("Denied"), { code: "CALL_PERMISSION_DENIED" });
  } });
  await env.connect("video");
  assert.deepEqual(env.permissions, ["video", "audio"]);
  assert.equal(env.store.getState().isCameraOff, true);
  env.store.getState().endCall();
});

test("microphone denial fails rather than joining a silent call", async () => {
  const env = setup({ capture: async () => { throw namedError("NotAllowedError"); } });
  await assert.rejects(env.store.getState().startCall("conversation", "video", {}), { name: "NotAllowedError" });
  assert.equal(env.store.getState().call, null);
  assert.equal(env.store.getState().isStartingCall, false);
  assert.equal(env.errors.length, 1);
});

test("incoming call without microphone returns an explicit failure and clears state", async () => {
  const env = setup({ capture: async () => { throw namedError("NotFoundError"); } });
  env.store.getState()._handleIncoming({
    callId: "incoming", conversationId: "conversation", callType: "video",
    sdp: { type: "offer", sdp: "v=0\r\n" },
  });
  assert.equal(await env.store.getState().acceptCall(), "CALL_DEVICE_UNAVAILABLE");
  assert.equal(env.store.getState().call, null);
  assert.ok(env.signals.some(([event]) => event === "call:decline"));
});

test("voice -> camera -> screen -> camera -> voice preserves microphone and uses no new offers", async () => {
  const env = setup();
  await env.connect();
  const state = env.store.getState();
  const sender = state.videoSender;
  await state.toggleCamera();
  const camera = sender.track;
  assert.equal(camera.kind, "video");
  assert.equal(env.captures.at(-1).audio, false);
  assert.equal(env.store.getState().isCameraOff, false);
  env.store.getState().toggleMute();
  await state.startScreenShare();
  assert.equal(sender.track, env.screen);
  assert.equal(env.audio.enabled, false);
  await state.stopScreenShare();
  assert.equal(sender.track, camera);
  assert.equal(env.screen.readyState, "ended");
  await state.toggleCamera();
  assert.equal(sender.track, null);
  assert.equal(camera.readyState, "ended");
  assert.equal(env.local.getVideoTracks().length, 0);
  assert.equal(env.store.getState().isCameraOff, true);
  assert.equal(env.signals.filter(([event]) => event === "call:invite").length, 1);
  assert.equal(env.signals.filter(([event]) => event === "call:offer").length, 0);
  assert.equal(env.store.getState().audioSender.track, env.audio);
  env.store.getState().endCall();
});

test("browser Stop sharing returns a camera-free voice call to a null video track", async () => {
  const env = setup();
  await env.connect();
  await env.store.getState().startScreenShare();
  env.screen.stop();
  env.screen.onended();
  await new Promise(setImmediate);
  assert.equal(env.store.getState().videoSender.track, null);
  assert.equal(env.store.getState().isScreenSharing, false);
  assert.equal(env.screen.onended, null);
  env.store.getState().endCall();
});

test("cancelled picker, missing display track, and failed replacement leave call intact and release captures", async () => {
  for (const failure of ["cancel", "empty", "replace"]) {
    const env = setup({
      display: failure === "cancel" ? async () => { throw namedError("NotAllowedError"); }
        : failure === "empty" ? async () => new Stream() : undefined,
    });
    await env.connect();
    const sender = env.store.getState().videoSender;
    if (failure === "replace") sender.failure = new Error("replace failed");
    await assert.rejects(env.store.getState().startScreenShare());
    assert.equal(env.store.getState().isChangingMedia, false);
    assert.equal(env.store.getState().isScreenSharing, false);
    assert.equal(env.store.getState().call.status, "connected");
    assert.equal(sender.track, null);
    if (failure === "replace") assert.equal(env.screen.readyState, "ended");
    env.store.getState().endCall();
  }
});

test("camera failure leaves audio and media controls usable", async () => {
  const env = setup({ capture: async (constraints) => {
    if (constraints.audio === false) throw namedError("NotFoundError");
    return new Stream([track("audio")]);
  } });
  await env.connect();
  await assert.rejects(env.store.getState().toggleCamera(), { name: "NotFoundError" });
  assert.equal(env.store.getState().isCameraOff, true);
  assert.equal(env.store.getState().isChangingMedia, false);
  assert.equal(await env.store.getState().startScreenShare(), true);
  env.store.getState().endCall();
});

test("ending the call while the screen picker is open releases late screen capture", async () => {
  const pending = deferred();
  const env = setup({ display: () => pending.promise });
  await env.connect();
  const sharing = env.store.getState().startScreenShare();
  assert.equal(env.store.getState().isChangingMedia, true);
  assert.equal(await env.store.getState().startScreenShare(), false);
  env.store.getState().endCall();
  pending.resolve(env.display);
  assert.equal(await sharing, false);
  assert.equal(env.screen.readyState, "ended");
  assert.equal(env.store.getState().screenStream, null);
});

test("ending the call during camera permission/capture releases the late camera", async () => {
  const pending = deferred();
  const camera = track("video");
  const env = setup({ capture: async (constraints) =>
    constraints.audio === false ? pending.promise : new Stream([track("audio")])
  });
  await env.connect();
  const enabling = env.store.getState().toggleCamera();
  await Promise.resolve();
  env.store.getState().endCall();
  pending.resolve(new Stream([camera]));
  await enabling;
  assert.equal(camera.readyState, "ended");
  assert.equal(env.store.getState().localStream, null);
});

test("voice calls receive streamless camera tracks and update remote video visibility", async () => {
  const env = setup();
  await env.connect();
  const pc = env.store.getState().pc;
  const audio = track("audio");
  const video = track("video");
  video.muted = true;
  pc.ontrack({ track: audio, streams: [new Stream([audio])] });
  pc.ontrack({ track: video, streams: [] });
  assert.equal(env.store.getState().remoteStream.getTracks().length, 2);
  assert.equal(env.store.getState().remoteVideoActive, false);
  video.muted = false;
  video.onunmute();
  assert.equal(env.store.getState().remoteVideoActive, true);
  video.muted = true;
  video.onmute();
  assert.equal(env.store.getState().remoteVideoActive, false);
  const lateUnmute = video.onunmute;
  env.store.getState().endCall();
  lateUnmute();
  assert.equal(env.store.getState().remoteStream, null);
});

test("camera enabled from a voice call pauses in background without pausing screen capture", async () => {
  const env = setup();
  await env.connect();
  await env.store.getState().toggleCamera();
  const camera = env.store.getState().videoSender.track;
  await env.store.getState().startScreenShare();
  env.appState("background");
  assert.equal(camera.enabled, false);
  assert.equal(env.screen.enabled, true);
  env.appState("active");
  assert.equal(camera.enabled, true);
  env.store.getState().endCall();
  assert.equal(camera.readyState, "ended");
  assert.equal(env.screen.readyState, "ended");
  assert.equal(env.audio.readyState, "ended");
});

test("ICE-restart answers do not reset the connected status or elapsed call", async () => {
  const env = setup();
  await env.connect();
  await env.store.getState()._handleAnswered({
    callId: env.store.getState().call.callId, sdp: { type: "answer", sdp: "v=0\r\n" },
  });
  assert.equal(env.store.getState().call.status, "connected");
  env.store.getState().endCall();
});

test("Android requests camera-only permission when enabling video in a voice call", async () => {
  const requests = [];
  const { requestCallPermissions } = load("src/utils/requestCallPermissions.js", {
    "react-native": {
      Platform: { OS: "android" },
      PermissionsAndroid: {
        PERMISSIONS: { RECORD_AUDIO: "mic", CAMERA: "camera" }, RESULTS: { GRANTED: "granted" },
        requestMultiple: async (values) => { requests.push([...values]); return Object.fromEntries(values.map((value) => [value, "granted"])); },
      },
    },
  });
  await requestCallPermissions("audio");
  await requestCallPermissions("camera");
  await requestCallPermissions("video");
  assert.deepEqual(requests, [["mic"], ["camera"], ["mic", "camera"]]);
});

test("Android screen-sharing plugin enables the bundled projection service once for Java and Kotlin", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")).expo;
  assert.ok(config.plugins.includes("./plugins/withScreenSharing"));
  assert.ok(config.android.permissions.includes("FOREGROUND_SERVICE_MEDIA_PROJECTION"));
  const filename = path.join(root, "plugins", "withScreenSharing.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    require: (name) => name === "@expo/config-plugins"
      ? { withMainApplication: (config, operation) => operation(config) }
      : require(path.join(root, "node_modules", name)),
  }, { filename });
  for (const language of ["java", "kt"]) {
    const config = { modResults: { language, contents: "onCreate() {\n    super.onCreate();\n}" } };
    module.exports(config);
    const first = config.modResults.contents;
    assert.match(first, /WebRTCModuleOptions\.getInstance\(\)\.enableMediaProjectionService = true/);
    module.exports(config);
    assert.equal(config.modResults.contents, first);
  }
});

test("native WebRTC silently rejecting a replacement is surfaced and capture is released", async () => {
  const env = setup();
  await env.connect();
  env.store.getState().videoSender.replaceTrack = async () => {};
  await assert.rejects(env.store.getState().startScreenShare(), /Unable to replace outgoing video/);
  assert.equal(env.screen.readyState, "ended");
  assert.equal(env.store.getState().isScreenSharing, false);
  assert.equal(env.store.getState().isChangingMedia, false);
  env.store.getState().endCall();
});

const renderOverlay = (overrides = {}) => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const actions = [];
  const buttons = {};
  const state = {
    call: { callId: "test", callType: "audio", status: "connected", peerUser: { username: "Peer" } },
    localStream: new Stream([track("audio")]), remoteStream: new Stream([track("video")]),
    remoteVideoActive: true, isCameraOff: true, isScreenSharing: false, isChangingMedia: false,
    isScreenSharingSupported: true, isVideoCallingSupported: true,
    stopScreenShare: async () => actions.push("stopScreenShare"),
    toggleCamera: async () => actions.push("toggleCamera"),
    ...overrides,
  };
  const View = ({ children }) => React.createElement("div", null, children);
  const TouchableOpacity = ({ children, accessibilityLabel, disabled, onPress }) => {
    buttons[accessibilityLabel] = onPress;
    return React.createElement("button", { "aria-label": accessibilityLabel, disabled }, children);
  };
  const { CallOverlay } = load("src/components/CallOverlay.js", {
    react: React,
    "react-native": {
      View, TouchableOpacity, Modal: View, Vibration: {}, Platform: { OS: "web" },
      StyleSheet: { create: (value) => value, absoluteFill: {} },
      Animated: { ValueXY: class { getLayout() { return {}; } }, View, event() {} },
      PanResponder: { create: () => ({ panHandlers: {} }) },
      Dimensions: { get: () => ({ width: 520, height: 800 }) },
    },
    "./AppText": { AppText: ({ children }) => React.createElement("span", null, children) },
    "@expo/vector-icons/Ionicons": () => null,
    "../store/callStore": { useCallStore: Object.assign((selector) => selector(state), { getState: () => state }) },
    "../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
    "../hooks/useTranslation": { useTranslation: () => (key) => key },
    "../utils/callRingtone": {},
    "./RemoteAudio": { RemoteAudio: () => React.createElement("audio") },
    "./VideoStream": { VideoStream: ({ objectFit }) => React.createElement("video", { "data-fit": objectFit }) },
    "../utils/showAlert": { showAlert: () => {} },
  });
  return { markup: renderToStaticMarkup(React.createElement(CallOverlay)), actions, buttons };
};

test("voice-call overlay shows incoming video, camera controls, and screen sharing without a local camera", () => {
  const { markup } = renderOverlay();
  assert.match(markup, /aria-label="calls.toggleCamera"/);
  assert.match(markup, /aria-label="calls.startScreenShare"/);
  assert.match(markup, /<video data-fit="contain"/);
});

test("minimized call keeps its remote audio player mounted", () => {
  const { markup } = renderOverlay({ minimized: true });
  assert.match(markup, /<audio/);
  assert.match(markup, /aria-label="calls.returnToCall"/);
});

test("camera button switches out of screen sharing and enables a camera only when needed", async () => {
  for (const isCameraOff of [true, false]) {
    const { buttons, actions } = renderOverlay({
      isScreenSharing: true, isCameraOff, screenStream: new Stream([track("video")]),
    });
    await buttons["calls.toggleCamera"]();
    assert.deepEqual(actions, isCameraOff ? ["stopScreenShare", "toggleCamera"] : ["stopScreenShare"]);
  }
});

test("screen encoding preserves detail and restores camera parameters afterward", async () => {
  const env = setup({ video: true });
  await env.connect("video");
  await new Promise(setImmediate);
  const sender = env.store.getState().videoSender;
  assert.equal(sender.parameters.degradationPreference, "balanced");
  assert.equal(sender.parameters.encodings[0].maxFramerate, 30);
  assert.equal(env.camera.contentHint, "motion");
  await env.store.getState().startScreenShare();
  await new Promise(setImmediate);
  assert.equal(env.screen.contentHint, "detail");
  assert.equal(sender.parameters.degradationPreference, "maintain-resolution");
  assert.equal(sender.parameters.encodings[0].maxFramerate, 15);
  assert.equal(sender.parameters.encodings[0].scaleResolutionDownBy, 1);
  assert.equal(sender.parameters.encodings[0].maxBitrate, 4000000);
  await env.store.getState().stopScreenShare();
  await new Promise(setImmediate);
  assert.equal(sender.parameters.degradationPreference, "balanced");
  assert.equal(sender.parameters.encodings[0].maxFramerate, 30);
  env.store.getState().endCall();
});

test("sender parameter updates are serialized and never fabricate unnegotiated encodings", async () => {
  const env = setup();
  await env.connect();
  await new Promise(setImmediate);
  const sender = env.store.getState().audioSender;
  sender.parameters.encodings = [];
  let writes = 0;
  sender.setParameters = async () => { writes += 1; };
  await env.store.getState()._applyInitialAudioParameters(sender);
  assert.equal(writes, 0);
  assert.match(env.warnings.at(-1)[0], /not negotiated/);
  sender.parameters = { encodings: [{ rid: "primary" }] };
  const pending = deferred();
  const values = [];
  sender.setParameters = async (parameters) => {
    values.push(parameters.encodings[0].maxBitrate);
    assert.equal(parameters.encodings[0].rid, "primary");
    if (values.length === 1) await pending.promise;
    sender.parameters = parameters;
  };
  const one = env.store.getState()._updateSenderParameters(sender, { maxBitrate: 20000 });
  const two = env.store.getState()._updateSenderParameters(sender, { maxBitrate: 48000 });
  await new Promise(setImmediate);
  assert.deepEqual(values, [20000]);
  pending.resolve();
  await Promise.all([one, two]);
  assert.deepEqual(values, [20000, 48000]);
  env.store.getState().endCall();
});

test("cancelling a pending call prevents late camera/microphone permission results from starting it", async () => {
  const pending = deferred();
  const env = setup({ capture: () => pending.promise });
  const starting = env.store.getState().startCall("conversation", "video", {});
  env.store.getState().endCall();
  pending.resolve(env.local);
  await starting;
  assert.equal(env.store.getState().call, null);
  assert.equal(env.store.getState().isStartingCall, false);
  assert.equal(env.audio.readyState, "ended");
  assert.equal(env.signals.length, 0);
});

test("muting while answering preserves the mute when media acquisition completes", async () => {
  const pending = deferred();
  const env = setup({ capture: () => pending.promise });
  env.store.getState()._handleIncoming({
    callId: "incoming", conversationId: "conversation", callType: "audio",
    sdp: { type: "offer", sdp: "v=0\r\n" },
  });
  const accepting = env.store.getState().acceptCall();
  await env.store.getState().toggleMute();
  pending.resolve(env.local);
  assert.equal(await accepting, true);
  assert.equal(env.audio.enabled, false);
  assert.equal(env.store.getState().isMuted, true);
  env.store.getState().endCall();
});

test("microphone disconnection is explicit and retry replaces only the audio track", async () => {
  let captures = 0;
  const original = track("audio");
  const replacement = track("audio");
  const env = setup({ capture: async () => new Stream([captures++ ? replacement : original]) });
  await env.connect();
  await env.store.getState().startScreenShare();
  original.stop();
  original.onended();
  assert.equal(env.store.getState().microphoneUnavailable, true);
  assert.equal(env.store.getState().isMuted, true);
  assert.equal(await env.store.getState().toggleMute(), true);
  assert.equal(env.store.getState().audioSender.track, replacement);
  assert.equal(replacement.readyState, "live");
  assert.equal(env.store.getState().microphoneUnavailable, false);
  assert.equal(env.store.getState().isMuted, false);
  assert.equal(env.store.getState().videoSender.track, env.screen);
  env.store.getState().endCall();
});

test("peer media snapshots report mute, screen, and camera-off states without relying on track mute events", async () => {
  const env = setup();
  await env.connect();
  const channel = env.store.getState().mediaStateChannel;
  channel.open();
  assert.deepEqual(channel.messages.at(-1), { version: 1, muted: false, video: "none" });
  await env.store.getState().toggleMute();
  assert.equal(channel.messages.at(-1).muted, true);
  await env.store.getState().startScreenShare();
  assert.equal(channel.messages.at(-1).video, "screen");
  await env.store.getState().stopScreenShare();
  assert.equal(channel.messages.at(-1).video, "none");
  channel.onmessage({ data: JSON.stringify({ version: 1, muted: true, video: "screen" }) });
  assert.equal(env.store.getState().remoteMediaState.video, "screen");
  channel.onmessage({ data: "not-json" });
  assert.equal(env.warnings.length, 1);
  assert.equal(env.store.getState().remoteMediaState.video, "screen");
  env.store.getState().endCall();
  assert.equal(channel.readyState, "closed");
});

test("peer camera-off snapshot hides a stale receiver frame immediately", () => {
  const { markup } = renderOverlay({ remoteMediaState: { video: "none", muted: true } });
  assert.doesNotMatch(markup, /<video/);
  assert.match(markup, /calls.peerMuted/);
});

test("screen-sharing restore failure releases both captures and reports camera off", async () => {
  const env = setup({ video: true });
  await env.connect("video");
  await env.store.getState().startScreenShare();
  env.store.getState().videoSender.failure = new Error("Cannot restore camera");
  await assert.rejects(env.store.getState().stopScreenShare(), /Cannot restore camera/);
  assert.equal(env.screen.readyState, "ended");
  assert.equal(env.camera.readyState, "ended");
  assert.equal(env.store.getState().isCameraOff, true);
  assert.equal(env.store.getState().isScreenSharing, false);
  env.store.getState().endCall();
});

test("disconnected transport retries ICE after a short grace and stops retrying after recovery", async () => {
  const env = setup();
  await env.connect();
  const pc = env.store.getState().pc;
  const connectedAt = env.store.getState().call.connectedAt;
  pc.connectionState = "disconnected";
  pc.onconnectionstatechange();
  assert.equal(env.store.getState().call.status, "reconnecting");
  await env.runTimeout(2000);
  assert.equal(pc.offers.at(-1).iceRestart, true);
  assert.ok([...env.timeouts.values()].some((timer) => timer.delay === 4000));
  pc.connectionState = "connected";
  pc.onconnectionstatechange();
  assert.equal(env.store.getState().call.connectedAt, connectedAt);
  assert.equal(env.timeouts.size, 0);
  env.store.getState().endCall();
});

test("ICE restart refreshes expired TURN credentials and only the caller offers", async () => {
  let fetches = 0;
  const env = setup({
    token: "owner-session",
    ice: async () => {
      fetches += 1;
      return { data: { expiresAt: Math.floor(Date.now() / 1000) + (fetches === 1 ? -1 : 600), iceServers: [{ urls: "turn:relay.invalid", username: `turn-${fetches}`, credential: "test-credential" }] } };
    },
  });
  await env.connect();
  await env.store.getState()._attemptIceRestart(env.store.getState().call.callId);
  assert.equal(fetches, 2);
  assert.equal(env.store.getState().pc.configuration.iceServers[0].username, "turn-2");
  env.store.getState().endCall();
  const incoming = setup();
  await incoming.connect("audio", true);
  await incoming.store.getState()._attemptIceRestart("incoming");
  assert.equal(incoming.store.getState().pc.offers.length, 0);
  incoming.store.getState().endCall();
});

test("new ICE-generation candidates arriving ahead of their offer are retained until matching SDP", async () => {
  const env = setup();
  await env.connect("audio", true);
  const pc = env.store.getState().pc;
  pc.remoteDescription = { type: "offer", sdp: "v=0\r\na=ice-ufrag:old\r\n" };
  const candidate = { candidate: "candidate:1 ufrag new", usernameFragment: "new", sdpMid: "0" };
  await env.store.getState()._handleRemoteIceCandidate({ callId: "incoming", candidate });
  assert.equal(pc.candidates.length, 0);
  assert.equal(env.store.getState().pendingIceCandidates.length, 1);
  await env.store.getState()._handleRemoteOffer({ callId: "incoming", sdp: { type: "offer", sdp: "v=0\r\na=ice-ufrag:new\r\n" } });
  assert.equal(pc.candidates.length, 1);
  assert.equal(env.store.getState().pendingIceCandidates.length, 0);
  env.store.getState().endCall();
});

test("failed recovery ends with an explicit reason and releases devices", async () => {
  const env = setup();
  await env.connect();
  env.store.getState().pc.connectionState = "failed";
  env.store.getState().pc.onconnectionstatechange();
  await env.runTimeout(30000);
  assert.equal(env.store.getState().call.status, "ended");
  assert.equal(env.store.getState().call.endReason, "connection-lost");
  assert.equal(env.audio.readyState, "ended");
  assert.equal(env.store.getState().pc, null);
});

const stats = (...reports) => new Map(reports.map((report) => [report.id, report]));
test("quality uses the selected transport, per-stream deltas and concealment, not unrelated successful pairs", () => {
  const { summarizeCallStats } = load("src/utils/callQuality.js", {});
  const transport = { id: "transport", type: "transport", selectedCandidatePairId: "chosen" };
  const chosen = { id: "chosen", type: "candidate-pair", state: "succeeded", currentRoundTripTime: 0.03 };
  const other = { id: "unused", type: "candidate-pair", state: "succeeded", currentRoundTripTime: 5 };
  const audio = { id: "audio", type: "inbound-rtp", kind: "audio", packetsReceived: 100, packetsLost: 0, totalSamplesReceived: 1000, concealedSamples: 0 };
  const one = summarizeCallStats(stats(transport, chosen, other, audio));
  assert.equal(one.quality, "good");
  const two = summarizeCallStats(stats(transport, chosen, { ...audio, packetsReceived: 200, totalSamplesReceived: 2000, concealedSamples: 100 }), one.audio);
  assert.equal(two.quality, "poor");
  const reset = summarizeCallStats(stats(transport, chosen, { ...audio, packetsReceived: 5, packetsLost: 1 }), two.audio);
  assert.equal(reset.quality, "good");
});

test("quality monitoring does not overlap, does not update ended calls and requires stable recovery samples", async () => {
  const env = setup();
  await env.connect();
  const pc = env.store.getState().pc;
  const tick = [...env.intervals.values()][0].handler;
  const pending = deferred();
  let samples = 0;
  pc.getStats = () => { samples += 1; return pending.promise; };
  const reading = tick();
  await tick();
  assert.equal(samples, 1);
  pending.resolve(stats({ id: "pair", type: "candidate-pair", state: "succeeded", nominated: true, currentRoundTripTime: 1 }));
  await reading;
  assert.equal(env.store.getState().networkQuality, "poor");
  pc.getStats = async () => new Map();
  await tick();
  await tick();
  assert.equal(env.store.getState().networkQuality, "poor");
  await tick();
  assert.equal(env.store.getState().networkQuality, "good");
  const late = deferred();
  pc.getStats = () => late.promise;
  const stale = tick();
  env.store.getState().endCall();
  late.resolve(stats({ id: "pair", type: "candidate-pair", state: "succeeded", selected: true, currentRoundTripTime: 1 }));
  await stale;
  assert.equal(env.store.getState().networkQuality, "good");
});

const playbackSetup = (play) => {
  const listeners = new Map();
  const warnings = [];
  const blocked = [];
  const document = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
  };
  const { attachMediaPlayback } = load("src/utils/mediaPlayback.web.js", {}, {
    document, console: { warn: (...args) => warnings.push(args) },
  });
  const element = { play, srcObject: null };
  const stream = {};
  return { attachMediaPlayback, element, stream, listeners, warnings, blocked };
};

test("blocked browser playback is visible and retries on a user gesture", async () => {
  let attempts = 0;
  const env = playbackSetup(async () => {
    if (++attempts === 1) throw namedError("NotAllowedError");
  });
  const cleanup = env.attachMediaPlayback(env.element, env.stream, (value) => env.blocked.push(value));
  await new Promise(setImmediate);
  assert.deepEqual(env.blocked, [true]);
  assert.equal(env.warnings.length, 1);
  assert.ok(env.listeners.has("pointerdown"));
  env.listeners.get("pointerdown")();
  await new Promise(setImmediate);
  assert.deepEqual(env.blocked, [true, false]);
  assert.equal(env.listeners.size, 0);
  cleanup();
  assert.equal(env.element.srcObject, null);
});

test("late playback errors after cleanup never notify a new call or retain gesture listeners", async () => {
  const pending = deferred();
  const env = playbackSetup(() => pending.promise);
  const cleanup = env.attachMediaPlayback(env.element, env.stream, (value) => env.blocked.push(value));
  cleanup();
  pending.reject(namedError("AbortError"));
  await new Promise(setImmediate);
  assert.equal(env.blocked.length, 0);
  assert.equal(env.warnings.length, 0);
  assert.equal(env.listeners.size, 0);
});

test("expired incoming invitations never ring and delayed invitations keep their original deadline", () => {
  const env = setup();
  const data = {
    callId: "incoming", conversationId: "conversation", callType: "audio",
    sdp: { type: "offer", sdp: "v=0\r\n" },
  };
  env.store.getState()._handleIncoming({ ...data, expiresAt: Date.now() - 1 });
  assert.equal(env.store.getState().call, null);
  assert.equal(env.timeouts.size, 0);
  env.store.getState()._handleIncoming({ ...data, expiresAt: Date.now() + 5000 });
  assert.ok([...env.timeouts.values()].some((timer) => timer.delay > 0 && timer.delay <= 5000));
  env.store.getState().endCall();
});

test("cancelling acceptance suppresses late permission errors without disturbing a subsequent call", async () => {
  const pending = deferred();
  let captures = 0;
  const env = setup({ capture: () => captures++ === 0 ? pending.promise : Promise.resolve(new Stream([track("audio")])) });
  env.store.getState()._handleIncoming({
    callId: "incoming", conversationId: "conversation", callType: "audio",
    sdp: { type: "offer", sdp: "v=0\r\n" },
  });
  const accepting = env.store.getState().acceptCall();
  await new Promise(setImmediate);
  env.store.getState().endCall();
  await env.connect();
  pending.reject(namedError("NotAllowedError"));
  assert.equal(await accepting, "CALL_CANCELLED");
  assert.equal(env.errors.length, 0);
  assert.equal(env.store.getState().call.status, "connected");
  env.store.getState().endCall();
});

test("late picker cancellation after hangup is not reported as a failure in a later call", async () => {
  const pending = deferred();
  const env = setup({ display: () => pending.promise });
  await env.connect();
  const sharing = env.store.getState().startScreenShare();
  env.store.getState().endCall();
  pending.reject(namedError("NotAllowedError"));
  assert.equal(await sharing, false);
  assert.equal(env.store.getState().isChangingMedia, false);
});

test("signaling reconnect resumes active call ownership even when media never disconnected", async () => {
  const env = setup();
  await env.connect();
  env.store.getState()._handleSocketConnect();
  assert.ok(env.signals.some(([event, data]) => event === "call:resume" && data.callId === env.store.getState().call.callId));
  assert.equal(env.store.getState().call.status, "connected");
  env.store.getState().endCall();
});
