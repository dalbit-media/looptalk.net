const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { transformSync } = require("@babel/core");
const { createInvitationTraffic } = require("../src/utils/invitationTraffic");
const { createInvitationMapHandler } = require("../src/utils/invitationMap");

test("traffic aggregates real byte samples by opaque node and direction without replay", () => {
  let time = 1000;
  const traffic = createInvitationTraffic({ now: () => time });
  const ids = new Map([["alice-private", 0], ["bob-private", 1]]);
  traffic.record("alice-private", "out", 1024);
  traffic.record("alice-private", "out", 512);
  traffic.record("bob-private", "in", 1024);
  traffic.record("hidden", "out", 100);
  const first = traffic.read(ids, 0);
  assert.deepEqual(first, { cursor: 4, nodes: [
    { id: 0, inBytes: 0, outBytes: 1536 }, { id: 1, inBytes: 1024, outBytes: 0 },
  ] });
  assert.equal(JSON.stringify(first).includes("private"), false);
  assert.deepEqual(traffic.read(ids, first.cursor).nodes, []);
  time += 10_000;
  assert.deepEqual(traffic.read(ids, 0).nodes, []);
  for (const [userId, direction, bytes] of [
    [null, "in", 1], ["alice-private", "sideways", 1], ["alice-private", "out", -1],
    ["alice-private", "in", 1.5], ["alice-private", "in", Infinity],
  ]) assert.throws(() => traffic.record(userId, direction, bytes), /Invalid/);
});

test("traffic memory and responses are bounded under sustained activity", () => {
  const traffic = createInvitationTraffic({ now: () => 1000 });
  for (let i = 0; i < 3000; i++) traffic.record("alice", "out", 100);
  assert.deepEqual(traffic.read(new Map([["alice", 1]]), 0), {
    cursor: 3000, nodes: [{ id: 1, inBytes: 0, outBytes: 200_000 }],
  });
});

test("traffic uses the matching snapshot and rejects missing/stale snapshots and invalid cursors", async (t) => {
  let time = 1000;
  t.mock.method(Date, "now", () => time);
  const traffic = createInvitationTraffic({ now: () => time });
  const prisma = {
    user: { count: async () => 2, findMany: async () => [{ id: "first-abcd" }, { id: "second-abcd" }] },
    invitation: { findMany: async () => [], count: async () => 0 },
    privateInvitation: { findMany: async () => [], count: async () => 0 },
  };
  const handler = createInvitationMapHandler(prisma, traffic);
  const response = () => ({
    statusCode: 200,
    set: (key, value) => assert.deepEqual([key, value], ["Cache-Control", "no-store"]),
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
  });
  const missing = response();
  handler.traffic({ query: { after: "0", snapshotId: "unknown" } }, missing);
  assert.equal(missing.statusCode, 409);
  const map = response();
  await handler({}, map);
  traffic.record("first-abcd", "out", 1200);
  traffic.record("second-abcd", "in", 1200);
  const result = response();
  handler.traffic({ query: { after: "0", snapshotId: map.body.snapshotId } }, result);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.nodes.length, 2);
  assert.equal(new Set(result.body.nodes.map((node) => node.id)).size, 2);
  assert.equal(result.body.nodes.reduce((total, node) => total + node.outBytes, 0), 1200);
  assert.equal(result.body.snapshotId, map.body.snapshotId);
  assert.doesNotMatch(JSON.stringify(result.body), /first|second|abcd/);
  for (const after of [undefined, "-1", "1.5", "NaN", "9007199254740999"]) {
    const invalid = response();
    handler.traffic({ query: { after, snapshotId: map.body.snapshotId } }, invalid);
    assert.equal(invalid.statusCode, 400);
  }
  const replay = response();
  handler.traffic({ query: { after: String(result.body.cursor), snapshotId: map.body.snapshotId } }, replay);
  assert.deepEqual(replay.body.nodes, []);
  time += 10_000;
  const expired = response();
  handler.traffic({ query: { after: "0", snapshotId: map.body.snapshotId } }, expired);
  assert.deepEqual(expired.body.nodes, []);
  time += 60_000;
  const refreshed = response();
  await handler({}, refreshed);
  assert.notEqual(refreshed.body.snapshotId, map.body.snapshotId);
  const stale = response();
  handler.traffic({ query: { after: "0", snapshotId: map.body.snapshotId } }, stale);
  assert.equal(stale.statusCode, 409);
});

const filename = path.resolve(__dirname, "../../app/_lib/invitationTraffic.js");
const { code } = transformSync(fs.readFileSync(filename, "utf8"), {
  filename, configFile: false, babelrc: false, plugins: ["@babel/plugin-transform-modules-commonjs"],
});
const loaded = { exports: {} };
vm.runInNewContext(code, { module: loaded, exports: loaded.exports });
const { formatTrafficBytes, validateTraffic, drawInvitationTraffic, createTrafficAnimator, MAX_TRAFFIC_PULSES } = loaded.exports;

const animationFixture = () => {
  let time = 0, nextId = 0, visible = true, active = true, cost = 0;
  const frames = new Map(), timers = new Map(), draws = [];
  const animator = createTrafficAnimator({
    draw: () => { draws.push(time); time += cost; return active; },
    isVisible: () => visible,
    now: () => time,
    requestFrame: (callback) => { const id = ++nextId; frames.set(id, callback); return id; },
    cancelFrame: (id) => frames.delete(id),
    setTimer: (callback, delay) => {
      const id = ++nextId; timers.set(id, { at: time + delay, callback }); return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  return {
    animator, frames, timers, draws,
    setVisible: (value) => { visible = value; },
    setActive: (value) => { active = value; },
    setCost: (value) => { cost = value; },
    frame: () => {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id); callback();
    },
    timer: () => {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id); time = timer.at; timer.callback();
    },
  };
};

test("animation coalesces render storms and stays at or below 30 FPS", () => {
  const f = animationFixture();
  for (let i = 0; i < 10_000; i++) f.animator.schedule();
  assert.equal(f.frames.size, 1);
  for (let i = 0; i < 60; i++) {
    f.frame();
    for (let j = 0; j < 100; j++) f.animator.schedule();
    assert.equal(f.timers.size, 1);
    assert.equal(f.frames.size, 0);
    f.timer();
  }
  assert.equal(f.draws.length, 60);
  for (let i = 1; i < f.draws.length; i++) {
    assert.ok(f.draws[i] - f.draws[i - 1] >= 1000 / 30 - 0.00001);
  }
  f.animator.dispose();
  assert.equal(f.frames.size + f.timers.size, 0);
});

test("animation backs off on slow frames, stops while idle or hidden, and cancels on cleanup", () => {
  const f = animationFixture();
  f.setCost(50);
  f.animator.schedule();
  f.frame();
  assert.equal(f.timers.values().next().value.at, 150, "50ms draw gets a 100ms rest");
  f.setVisible(false);
  f.animator.pause();
  f.animator.schedule();
  assert.equal(f.frames.size + f.timers.size, 0);
  f.setVisible(true);
  f.setCost(0);
  f.setActive(false);
  f.animator.schedule();
  f.timer();
  f.frame();
  assert.equal(f.frames.size + f.timers.size, 0, "Idle overlays must not keep a loop running");
  f.animator.schedule();
  f.animator.dispose();
  f.animator.schedule();
  assert.equal(f.frames.size + f.timers.size, 0);
});

test("visibility changes before a pending frame prevent drawing without leaking work", () => {
  const f = animationFixture();
  f.animator.schedule();
  f.setVisible(false);
  f.frame();
  assert.equal(f.draws.length, 0);
  assert.equal(f.frames.size + f.timers.size, 0);
  f.setVisible(true);
  f.animator.schedule();
  f.frame();
  f.setVisible(false);
  f.timer();
  assert.equal(f.frames.size + f.timers.size, 0);
  f.animator.dispose();
});

test("size estimates abbreviate bytes and traffic responses validate IDs and monotonic cursors", () => {
  for (const [bytes, text] of [[100, "100 B"], [1024, "1 KB"], [1536, "1.5 KB"],
    [1024 ** 2 * 24, "24 MB"], [1024 ** 3, "1 GB"]]) {
    assert.equal(formatTrafficBytes(bytes), text);
  }
  const valid = { snapshotId: "snapshot", cursor: 10, nodes: [{ id: 1, inBytes: 1024, outBytes: 0 }] };
  const check = (value) => validateTraffic(value, "snapshot", new Set([1]), 9);
  assert.equal(check(valid), valid);
  for (const change of [
    { snapshotId: "stale" }, { cursor: 8 }, { cursor: Infinity },
    { nodes: [{ id: 999, inBytes: 1, outBytes: 0 }] },
    { nodes: [{ id: 1, inBytes: -1, outBytes: 0 }] },
    { nodes: [{ id: 1, inBytes: 1, outBytes: NaN }] },
    { nodes: [...valid.nodes, ...valid.nodes] },
  ]) assert.throws(() => check({ ...valid, ...change }), /Invalid invitation traffic/);
});

test("flow pulses are directional, size text is zoom-gated, and old traffic disappears", () => {
  const labels = [], strokes = [];
  const context = {
    clearRect: () => {}, beginPath: () => {}, stroke: () => {}, fill: () => {},
    moveTo: (x, y) => strokes.push([x, y]), lineTo: () => {},
    fillRect: () => {}, measureText: (value) => ({ width: value.length * 5 }),
    fillText: (value) => labels.push(value),
  };
  let ratio = 1;
  const network = {
    getCamera: () => ({ getState: () => ({ ratio }) }),
    getDimensions: () => ({ width: 800, height: 600 }),
    graphToViewport: () => ({ x: 400, y: 300 }),
  };
  const graph = {
    nodes: Array.from({ length: 2000 }),
    network: { hasNode: (key) => key === "node-1", getNodeAttributes: () => ({}) },
  };
  const samples = [{ id: 1, startedAt: 0, inBytes: 1024, outBytes: 2048 }];
  assert.equal(drawInvitationTraffic(context, network, graph, samples, 500, false), true);
  assert.equal(labels.length, 0, "Crowded overview must not show transfer text");
  assert.ok(strokes[0][0] < 400 && strokes[3][0] > 400, "Incoming and outgoing pulses are on opposite sides");
  ratio = 0.1;
  drawInvitationTraffic(context, network, graph, samples, 500, false);
  assert.equal(labels[0], "↑ ≈2 KB  ↓ ≈1 KB");
  labels.length = 0;
  assert.equal(drawInvitationTraffic(context, network, graph, samples, 3000, false), false);
  assert.equal(labels.length, 0);
  strokes.length = 0;
  drawInvitationTraffic(context, network, graph, samples, 100, true);
  const first = JSON.stringify(strokes);
  strokes.length = 0;
  drawInvitationTraffic(context, network, graph, samples, 900, true);
  assert.equal(JSON.stringify(strokes), first, "Reduced motion must not move the pulses");
  let visited = 0;
  graph.network.hasNode = () => { visited++; return false; };
  drawInvitationTraffic(context, network, graph,
    Array.from({ length: 100_000 }, (_, id) => ({ id, startedAt: 0, inBytes: 1, outBytes: 1 })),
    500, false);
  assert.equal(visited, MAX_TRAFFIC_PULSES, "Render work must stay bounded regardless of traffic volume");
});
