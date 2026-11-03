const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
const fixture = (options = {}) => {
  const slots = [];
  let cursor = 0;
  const pending = [];
  const captures = [], sent = [], alerts = [], released = [];
  let closed = 0, visible = false;
  const listeners = new Map();
  const canvas = {
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
    setPointerCapture() {},
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name, handler) => { if (listeners.get(name) === handler) listeners.delete(name); },
  };
  const filename = path.join(__dirname, "..", "src", "components", "DrawingPad.js");
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false,
    plugins: ["@babel/plugin-transform-modules-commonjs", ["@babel/plugin-transform-react-jsx", { runtime: "automatic" }]],
  });
  const module = { exports: {} };
  const mocks = {
    react: {
      useState: (initial) => {
        const i = cursor++;
        if (!(i in slots)) slots[i] = initial;
        return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
      },
      useRef: (initial) => { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
      useCallback: (callback) => callback,
      useEffect: (callback, deps) => {
        const i = cursor++;
        if (!slots[i] || deps.some((dep, j) => dep !== slots[i].deps[j])) {
          pending.push(() => {
            slots[i]?.cleanup?.();
            slots[i] = { deps, cleanup: callback() };
          });
        }
      },
    },
    "react-native": {
      View: "View", TouchableOpacity: "TouchableOpacity", Modal: "Modal",
      PanResponder: { create: (handlers) => ({ panHandlers: handlers }) },
      Platform: { OS: options.native ? "android" : "web" },
      StyleSheet: { create: (styles) => styles, absoluteFill: {} },
    },
    "./AppText": { AppText: "Text" },
    "react-native-svg": { default: "Svg", Path: "Path" },
    "../utils/captureDrawing": { captureDrawing: async (...args) => {
      captures.push(args);
      return options.capture ? options.capture() : "data:image/png;base64,test";
    }, releaseDrawing: (uri) => { if (options.native) released.push(uri); } },
    "@expo/vector-icons/Ionicons": { default: "Icon" },
    "../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
    "../hooks/useTranslation": { useTranslation: () => (key) => key },
    "../utils/showAlert": { showAlert: (...args) => alerts.push(args) },
  };
  vm.runInNewContext(code, {
    module, exports: module.exports, console: { error() {} },
    require: (name) => mocks[name] || require(name),
  });
  const render = () => {
    cursor = 0;
    const tree = module.exports.DrawingPad({
      visible, onClose: () => { closed++; },
      onSend: async (uri) => { sent.push(uri); if (options.send) await options.send(uri); },
    });
    pending.splice(0).forEach((effect) => effect());
    return tree;
  };
  const getCanvas = (tree) => nodes(tree).find((node) => node.props?.collapsable === false);
  const open = () => {
    render();
    visible = true;
    getCanvas(render()).props.ref(canvas);
    return render();
  };
  const pointer = (name, props = {}) => listeners.get(name)?.({
    pointerId: 1, button: 0, buttons: 1, clientX: 30, clientY: 40,
    preventDefault() {}, ...props,
  });
  const draw = () => { pointer("pointerdown"); pointer("pointermove", { clientX: 50 }); pointer("pointerup"); };
  const button = (label) => nodes(render()).find((node) => node.props?.accessibilityLabel === label);
  return { open, render, pointer, draw, button, getCanvas, captures, sent, alerts, released, listeners,
    closed: () => closed, hide: () => { visible = false; render(); } };
};

test("web drawing attaches when the modal mounts, tracks one pointer, and reopens cleanly", () => {
  const f = fixture();
  f.render();
  assert.equal(f.listeners.size, 0);
  f.open();
  assert.equal(f.listeners.size, 5);
  f.pointer("pointerdown");
  f.pointer("pointermove", { pointerId: 2, clientX: 90 });
  f.pointer("pointerup", { pointerId: 2 });
  f.pointer("pointerup");
  const drawn = nodes(f.render()).find((node) => node.type === "Path");
  assert.equal(drawn.props.d, "M20,20 L20,20", "Single taps remain visible dots");
  f.button("messages.drawingUndo").props.onPress();
  assert.equal(nodes(f.render()).some((node) => node.type === "Path"), false);
  f.draw();
  f.button("messages.drawingClear").props.onPress();
  assert.equal(nodes(f.render()).some((node) => node.type === "Path"), false);
  f.hide();
  assert.equal(f.listeners.size, 0);
  f.open();
  f.draw();
  assert.ok(nodes(f.render()).find((node) => node.type === "Path"));
});

test("failed send preserves strokes; duplicate sends and edits are blocked until completion", async () => {
  let fail = true, resolve;
  const f = fixture({ send: async () => {
    if (fail) throw new Error("Offline");
    await new Promise((done) => { resolve = done; });
  } });
  f.open(); f.draw();
  await f.button("messages.drawingSend").props.onPress();
  assert.equal(f.alerts.length, 1);
  assert.ok(nodes(f.render()).find((node) => node.type === "Path"));
  assert.equal(f.captures[0][1].length, 1, "The exporter receives the completed strokes");
  fail = false;
  const send = f.button("messages.drawingSend").props.onPress();
  await Promise.resolve(); await Promise.resolve();
  await f.button("messages.drawingSend").props.onPress();
  f.button("messages.drawingClear").props.onPress();
  f.button("common.close").props.onPress();
  assert.equal(f.closed(), 0);
  assert.equal(f.sent.length, 2);
  assert.ok(nodes(f.render()).find((node) => node.type === "Path"));
  resolve();
  await send;
  assert.equal(nodes(f.render()).some((node) => node.type === "Path"), false);
});

test("native touch drawing supports dots and releases terminated strokes", () => {
  const f = fixture({ native: true });
  const tree = f.open();
  const handlers = f.getCanvas(tree).props;
  handlers.onPanResponderGrant({ nativeEvent: { locationX: 12, locationY: 13 } });
  handlers.onPanResponderRelease();
  assert.equal(nodes(f.render()).find((node) => node.type === "Path").props.d, "M12,13 L12,13");
  handlers.onPanResponderGrant({ nativeEvent: { locationX: 20, locationY: 30 } });
  handlers.onPanResponderTerminate();
  assert.equal(nodes(f.render()).filter((node) => node.type === "Path").length, 1);
});

test("capture failure preserves the drawing and native send releases its temporary PNG", async () => {
  const failed = fixture({ capture: async () => { throw new Error("Capture failed"); } });
  failed.open(); failed.draw();
  await failed.button("messages.drawingSend").props.onPress();
  assert.equal(failed.sent.length, 0);
  assert.equal(failed.alerts.length, 1);
  assert.equal(failed.button("messages.drawingSend").props.disabled, false);
  const native = fixture({ native: true });
  const handlers = native.getCanvas(native.open()).props;
  handlers.onPanResponderGrant({ nativeEvent: { locationX: 10, locationY: 20 } });
  handlers.onPanResponderRelease();
  await native.button("messages.drawingSend").props.onPress();
  assert.equal(native.captures[0][1].length, 1);
  assert.deepEqual(native.released, ["data:image/png;base64,test"]);
});

const loadUtility = (name, mocks = {}, globals = {}) => {
  const filename = path.join(__dirname, "..", "src", "utils", name);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-modules-commonjs"],
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => {
      if (!Object.hasOwn(mocks, name)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    },
    ...globals,
  });
  return module.exports;
};

test("web export renders strokes on white directly without DOM screenshots or network requests", async () => {
  const strokes = [], fills = [];
  const context = {
    fillRect: (...args) => fills.push([context.fillStyle, ...args]),
    stroke: (path) => strokes.push([path.d, context.strokeStyle, context.lineWidth, context.lineCap]),
  };
  const canvas = {
    getContext: () => context,
    toDataURL: (type) => { assert.equal(type, "image/png"); return "data:image/png;base64,AQID"; },
  };
  const ref = { current: {
    getBoundingClientRect: () => ({ width: 120.5, height: 240 }),
    ownerDocument: { createElement: (tag) => { assert.equal(tag, "canvas"); return canvas; } },
  } };
  const { captureDrawing } = loadUtility("captureDrawing.web.js", {}, {
    Path2D: class { constructor(d) { this.d = d; } },
  });
  const paths = [{ d: "M10,20 L80,90", color: "#FF3B30", strokeWidth: 8 }];
  assert.equal(await captureDrawing(ref, paths), "data:image/png;base64,AQID");
  assert.deepEqual(fills, [["#FFFFFF", 0, 0, 121, 240]]);
  assert.deepEqual(strokes, [["M10,20 L80,90", "#FF3B30", 8, "round"]]);
  ref.current.getBoundingClientRect = () => ({ width: 0, height: 0 });
  await assert.rejects(captureDrawing(ref, paths), /not visible/);
});

test("native export retains PNG temporary-file capture and cleanup", async () => {
  const captures = [], released = [];
  const { captureDrawing, releaseDrawing } = loadUtility("captureDrawing.js", {
    "react-native-view-shot": {
      captureRef: async (...args) => { captures.push(args); return "file:temp.png"; },
      releaseCapture: (uri) => released.push(uri),
    },
  });
  const ref = { current: {} };
  assert.equal(await captureDrawing(ref), "file:temp.png");
  assert.equal(captures[0][0], ref);
  assert.equal(captures[0][1].result, "tmpfile");
  assert.equal(captures[0][1].format, "png");
  releaseDrawing("file:temp.png");
  assert.deepEqual(released, ["file:temp.png"]);
});

test("web drawing data URLs are decoded locally under a CSP that forbids data fetches", async () => {
  const { readUploadBytes, encodeAttachment } = loadUtility("privateMedia.web.js", {
    "../storage/privateRecords": {},
    "./messageEncryption": {
      decodeBase64: (value) => new Uint8Array(Buffer.from(value, "base64")),
      encodeBase64: (value) => Buffer.from(value).toString("base64"),
    },
    "../config/limits": require("../src/config/limits"),
    "./ownerSession": {},
  }, { fetch: () => { throw new Error("CSP blocked network fetch"); } });
  assert.deepEqual([...await readUploadBytes("data:image/png;base64,AQID")], [1, 2, 3]);
  assert.equal(await encodeAttachment("data:image/png;base64,AQID"), "AQID");
  await assert.rejects(readUploadBytes("data:image/png,invalid"), /Invalid attachment data URL/);
});
