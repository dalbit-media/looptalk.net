const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === "object" ? [tree, ...nodes(typeof tree.type === "function" ? tree.type(tree.props) : tree.props?.children)] : [];
const fixture = (options = {}) => {
  const slots = [];
  let cursor = 0;
  const pending = [];
  const frames = new Map();
  let frameId = 0;
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
      memo: (component) => component,
      useState: (initial) => {
        const i = cursor++;
        if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
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
      View: "View", TouchableOpacity: "TouchableOpacity", TextInput: "TextInput", Modal: "Modal",
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
    "../utils/painting": loadUtility("painting.js"),
    "@expo/vector-icons/Ionicons": { default: "Icon" },
    "../hooks/useAppTheme": { useAppTheme: () => ({ colors: {} }) },
    "../hooks/useTranslation": { useTranslation: () => (key) => key },
    "../utils/showAlert": { showAlert: (...args) => alerts.push(args) },
  };
  vm.runInNewContext(code, {
    module, exports: module.exports, console: { error() {} },
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
    require: (name) => mocks[name] || require(name),
  });
  const render = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
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
    type: name, pointerId: 1, button: 0, buttons: 1, clientX: 30, clientY: 40,
    preventDefault() {}, ...props,
  });
  const draw = () => { render(); pointer("pointerdown"); pointer("pointermove", { clientX: 50 }); pointer("pointerup"); };
  const button = (label) => nodes(render()).find((node) => node.props?.accessibilityLabel === label);
  return { open, render, pointer, draw, button, getCanvas, captures, sent, alerts, released, listeners,
    frames, closed: () => closed, hide: () => { visible = false; render(); } };
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
  assert.match(drawn.props.d, /a4,4/, "Single taps remain visible dots");
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

test("drawing preview fills the canvas and updates before the pointer is released", () => {
  const f = fixture();
  const tree = f.open();
  const svg = nodes(tree).find((node) => node.props?.pointerEvents === "none");
  assert.equal(svg.props.width, "100%");
  assert.equal(svg.props.height, "100%");
  const previewStyle = Object.assign({}, ...svg.props.style);
  assert.equal(previewStyle.width, "100%", "CSS sizing must override website SVG icon styles, not just SVG attributes");
  assert.equal(previewStyle.height, "100%");
  f.pointer("pointerdown", { clientX: 410, clientY: 420 });
  assert.match(nodes(f.render()).find((node) => node.type === "Path").props.d, /^M396,400 a4,4/);
  f.pointer("pointermove", { clientX: 510, clientY: 520 });
  assert.match(nodes(f.render()).find((node) => node.type === "Path").props.d, / Q/);
  assert.equal(f.button("messages.drawingSend").props.disabled, true, "Stroke is still in progress");
  f.pointer("pointerup");
  assert.equal(f.button("messages.drawingSend").props.disabled, false);
});

test("painting batches coalesced stylus samples into one preview frame and cancels interrupted gestures", () => {
  const f = fixture();
  f.open();
  f.pointer("pointerdown", { pointerType: "pen", pressure: 0.1 });
  f.pointer("pointermove", {
    getCoalescedEvents: () => Array.from({ length: 60 }, (_, index) => ({
      clientX: 40 + index * 2, clientY: 40 + index, pointerType: "pen", pressure: index / 60,
    })),
  });
  assert.equal(f.frames.size, 1, "High frequency input schedules only one React preview per frame");
  assert.match(nodes(f.render()).find((node) => node.type === "Path").props.d, / Q/);
  f.pointer("pointercancel");
  assert.equal(nodes(f.render()).filter((node) => node.type === "Path").length, 0);
  assert.equal(f.frames.size, 0);
});

test("studio supports reversible clear, redo, marker opacity, white-paper eraser, and custom colors", async () => {
  const f = fixture();
  f.open();
  f.draw();
  f.button("messages.drawingClear").props.onPress();
  assert.equal(nodes(f.render()).filter((node) => node.type === "Path").length, 0);
  f.button("messages.drawingUndo").props.onPress();
  assert.equal(nodes(f.render()).filter((node) => node.type === "Path").length, 1);
  f.button("messages.drawingRedo").props.onPress();
  assert.equal(nodes(f.render()).filter((node) => node.type === "Path").length, 0);
  f.button("messages.drawingUndo").props.onPress();
  f.button("messages.drawingMarker").props.onPress();
  const input = () => nodes(f.render()).find((node) => node.type === "TextInput");
  input().props.onChangeText("#12");
  input().props.onBlur();
  assert.equal(input().props.value, "#1C1C1E");
  input().props.onChangeText("#123abc");
  f.button("messages.drawingLighter").props.onPress();
  f.button("messages.drawingLarger").props.onPress();
  f.draw();
  let strokes = nodes(f.render()).filter((node) => node.type === "Path");
  assert.equal(strokes[1].props.fill, "#123ABC");
  assert.ok(Math.abs(strokes[1].props.fillOpacity - 0.315) < 0.0001);
  assert.equal(f.button("messages.drawingRedo").props.disabled, true, "New paint discards redo branch");
  f.button("messages.drawingEraser").props.onPress();
  f.draw();
  strokes = nodes(f.render()).filter((node) => node.type === "Path");
  assert.equal(strokes[2].props.fill, "#FFFFFF");
  assert.equal(strokes[2].props.fillOpacity, 1);
  f.button("messages.drawingUndo").props.onPress();
  assert.equal(nodes(f.render()).filter((node) => node.type === "Path").length, 2);
  await f.button("messages.drawingSend").props.onPress();
  assert.equal(f.captures[0][1].length, 2);
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
  assert.match(nodes(f.render()).find((node) => node.type === "Path").props.d, /^M8,13 a4,4/);
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

test("painting geometry smooths pressure, draws round dots and bounds long gesture memory", () => {
  const { paintingPath, addPaintingPoint, paintHistory, paintingExportSize } = loadUtility("painting.js");
  const points = [];
  addPaintingPoint(points, { x: 10, y: 10, pressure: 0.1 });
  const thin = paintingPath({ points, size: 20, tool: "brush" });
  addPaintingPoint(points, { x: 10.1, y: 10, pressure: 1 });
  assert.equal(points.length, 1, "Stationary pressure changes remain a dot");
  const thick = paintingPath({ points, size: 20, tool: "brush" });
  assert.notEqual(thin, thick);
  assert.equal(paintingPath({ points, size: 20, tool: "pen" }),
    paintingPath({ points: [{ x: 10, y: 10, pressure: 0.1 }], size: 20, tool: "pen" }));
  for (let index = 0; index < 12000; index++) addPaintingPoint(points, { x: index, y: index / 2, pressure: 0.5 });
  assert.ok(points.length <= 4096);
  assert.equal(points[points.length - 1].x, 11999);
  const d = paintingPath({ points, size: 10, tool: "brush" });
  assert.match(d, / Q/);
  assert.ok(!/NaN|Infinity|undefined/.test(d));
  assert.ok(d.length < 400000, "Path serialization stays bounded for a very long gesture");
  let history = { past: [], present: [], future: [] };
  for (let index = 0; index < 100; index++) history = paintHistory(history, { type: "stroke", stroke: { d: `${index}` } });
  assert.equal(history.past.length, 40);
  assert.equal(history.present.length, 100, "Undo limit never deletes artwork");
  for (const [width, height] of [[390, 650], [2000, 1000], [4000, 3000], [10000, 50]]) {
    const output = paintingExportSize(width, height, 3);
    assert.ok(output.width <= 3072 && output.height <= 3072);
    assert.ok(output.width * output.height <= 4000000);
    assert.ok(Math.abs(output.height - output.width * height / width) <= 1, "Aspect ratio stays within one output pixel");
  }
});

test("painting PNG export preserves stroke opacity, eraser order and high-density output", async () => {
  const operations = [];
  const context = {
    fillRect() {}, scale: (...values) => operations.push(["scale", ...values]),
    fill: (path) => operations.push([context.fillStyle, context.globalAlpha, path.d]),
  };
  const canvas = { getContext: () => context, toDataURL: () => "png" };
  const view = {
    getBoundingClientRect: () => ({ width: 390, height: 650 }),
    ownerDocument: { defaultView: { devicePixelRatio: 3 }, createElement: () => canvas },
  };
  const { captureDrawing } = loadUtility("captureDrawing.web.js", { "./painting": loadUtility("painting.js") }, {
    Path2D: class { constructor(d) { this.d = d; } },
  });
  await captureDrawing({ current: view }, [
    { d: "marker", color: "#123ABC", opacity: 0.35 },
    { d: "eraser", color: "#FFFFFF", opacity: 1 },
  ]);
  assert.equal(canvas.width, 1170);
  assert.equal(canvas.height, 1950);
  assert.deepEqual(operations, [["scale", 3, 3], ["#123ABC", 0.35, "marker"], ["#FFFFFF", 1, "eraser"]]);
});

test("web export renders strokes on white directly without DOM screenshots or network requests", async () => {
  const strokes = [], fills = [];
  const context = {
    scale: () => {},
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
  const { captureDrawing } = loadUtility("captureDrawing.web.js", { "./painting": loadUtility("painting.js") }, {
    Path2D: class { constructor(d) { this.d = d; } },
  });
  const paths = [{ d: "M10,20 L80,90", color: "#FF3B30", strokeWidth: 8 }];
  assert.equal(await captureDrawing(ref, paths), "data:image/png;base64,AQID");
  assert.deepEqual(fills, [["#FFFFFF", 0, 0, 241, 480]]);
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
