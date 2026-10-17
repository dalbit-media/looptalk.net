const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const { transformSync } = require("@babel/core");
const { collectInvitationMap, createInvitationMapHandler, MAX_NODES } = require("../src/utils/invitationMap");

const fixture = (count, size = Math.min(count, MAX_NODES)) => ({
  user: {
    count: async () => count,
    findMany: async (query) => {
      assert.equal(query.take, MAX_NODES);
      assert.deepEqual(query.select, { id: true });
      assert.deepEqual(query.where, { status: { not: "SYSTEM" } });
      return Array.from({ length: size }, (_, id) => ({ id: `private-account-${id}` }));
    },
  },
  invitation: {
    findMany: async (query) => {
      assert.ok(query.take >= 1 && query.take <= 400);
      assert.deepEqual(query.select, { inviterId: true, acceptedById: true });
      return Array.from({ length: Math.max(0, size - 1) }, (_, id) => ({
        inviterId: `private-account-${Math.floor(id / 3)}`,
        acceptedById: `private-account-${id + 1}`,
      })).filter((edge) => query.where.acceptedById.in.includes(edge.acceptedById));
    },
    count: async () => 7,
  },
  privateInvitation: { findMany: async () => [], count: async () => 0 },
});

test("real data is used even for empty and small networks", async () => {
  for (const count of [0, 1, 99]) {
    const prisma = fixture(count);
    const data = await collectInvitationMap(prisma);
    assert.equal(data.mode, "live");
    assert.equal(data.totalUsers, count);
    assert.equal(data.demoThreshold, undefined);
    assert.equal(data.nodes.length, count);
    assert.equal(data.nodes.filter((node) => node.parentId !== null).length, Math.max(0, count - 1));
    assert.deepEqual(data.nodes.map((node) => node.label).sort(),
      Array.from({ length: count }, (_, id) => `private-account-${id}`.slice(-4)).sort());
  }
});

test("exactly 100 users switches to recorded topology without exposing identities", async () => {
  const data = await collectInvitationMap(fixture(100));
  assert.equal(data.mode, "live");
  assert.equal(data.nodes.length, 100);
  assert.equal(data.nodes.filter((node) => node.parentId !== null).length, 99);
  assert.equal(data.limited, false);
  assert.equal(data.historicalMissingLinks, 7);
  assert.equal(JSON.stringify(data).includes("private-account"), false);
  const ids = new Set(data.nodes.map((node) => node.id));
  assert.ok(data.nodes.every((node) => node.parentId === null || ids.has(node.parentId)));
  assert.ok(data.nodes.every((node) => Object.keys(node).sort().join(",") === "id,label,parentId"));
});

test("large graphs have bounded queries, node counts, edges, and payload size", async () => {
  const data = await collectInvitationMap(fixture(1_000_000));
  assert.equal(data.nodes.length, MAX_NODES);
  assert.equal(data.totalUsers, 1_000_000);
  assert.equal(data.limited, true);
  assert.ok(Buffer.byteLength(JSON.stringify(data)) < 100_000);
});

test("duplicate four-character suffixes remain separate nodes", async () => {
  const prisma = fixture(2);
  prisma.user.findMany = async () => [{ id: "user-one-abcd" }, { id: "user-two-abcd" }];
  prisma.invitation.findMany = async () => [
    { inviterId: "user-one-abcd", acceptedById: "user-two-abcd" },
  ];
  const data = await collectInvitationMap(prisma);
  assert.deepEqual(data.nodes.map((node) => node.label), ["abcd", "abcd"]);
  assert.equal(new Set(data.nodes.map((node) => node.id)).size, 2);
  assert.equal(data.nodes.filter((node) => node.parentId !== null).length, 1);
});

test("map explicitly binds small Sigma labels and permits deep zoom for crowded networks", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../app/_components/InvitationMap.js"), "utf8");
  assert.match(source, /label: \(attributes\) => attributes\.label/);
  assert.match(source, /labelSize: 10/);
  assert.match(source, /labelVisibility: "auto"/);
  assert.match(source, /renderLabels: true/);
  assert.match(source, /minCameraRatio: 0\.0001/);
});

test("public map coalesces concurrent requests and expires its one-minute cache", async (t) => {
  let time = 1_000;
  t.mock.method(Date, "now", () => time);
  const prisma = fixture(99);
  let queries = 0;
  prisma.user.count = async () => { queries += 1; return 99; };
  const handler = createInvitationMapHandler(prisma);
  const response = () => ({
    set: (name, value) => { assert.equal(name, "Cache-Control"); assert.equal(value, "no-store"); },
    json: (data) => { assert.equal(data.mode, "live"); },
  });
  await Promise.all(Array.from({ length: 20 }, () => handler({}, response())));
  assert.equal(queries, 1);
  time += 59_999;
  await handler({}, response());
  assert.equal(queries, 1);
  time += 1;
  await handler({}, response());
  assert.equal(queries, 2);
});

test("database failure is explicit and recoverable, never disguised as a demo", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const prisma = fixture(100);
  prisma.user.count = async () => { throw new Error("Database unavailable"); };
  const handler = createInvitationMapHandler(prisma);
  let status;
  let body;
  const response = {
    set: () => {},
    status: (code) => { status = code; return response; },
    json: (value) => { body = value; },
  };
  await handler({}, response);
  assert.equal(status, 500);
  assert.deepEqual(body, { error: "Failed to load invitation map" });
  assert.equal(log.mock.calls.length, 1);
  prisma.user.count = async () => 100;
  await handler({}, response);
  assert.equal(body.mode, "live");
});

test("private invitation edges contribute genuine links while duplicate and cyclic edges remain bounded", async () => {
  const prisma = fixture(100);
  prisma.invitation.findMany = async () => [];
  prisma.privateInvitation.findMany = async () => [
    { inviterId: "private-account-0", acceptedById: "private-account-1" },
    { inviterId: "private-account-1", acceptedById: "private-account-2" },
    { inviterId: "private-account-2", acceptedById: "private-account-0" },
    { inviterId: "private-account-2", acceptedById: "private-account-1" },
    { inviterId: "missing", acceptedById: "private-account-4" },
  ];
  const data = await collectInvitationMap(prisma);
  assert.equal(data.mode, "live");
  assert.equal(data.nodes.filter((node) => node.parentId !== null).length, 2);
  assert.equal(JSON.stringify(data).includes("private-account"), false);
});

const filename = path.resolve(__dirname, "../../app/_lib/invitationGraph.js");
const { code } = transformSync(fs.readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-modules-commonjs"],
});
const loaded = { exports: {} };
vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require });
const { buildInvitationGraph } = loaded.exports;

test("D3 radial trees preserve directed Graphology branches, forests, and finite coordinates", () => {
    const graph = buildInvitationGraph([
      { id: 0, parentId: null, label: "a1b2" }, { id: 1, parentId: 0 }, { id: 2, parentId: 0 },
      { id: 3, parentId: 1 }, { id: 4, parentId: null }, { id: 5, parentId: 4 },
    ]);
    assert.equal(graph.nodes.length, 6);
    assert.equal(graph.network.getNodeAttribute("node-0", "label"), "a1b2");
    assert.equal(graph.edgeCount, 4);
    assert.equal(graph.maxDepth, 2);
    assert.equal(graph.network.order, 6);
    assert.equal(graph.network.size, 4);
    assert.equal(graph.network.type, "directed");
    assert.ok(graph.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
    assert.equal(new Set(graph.nodes.map((node) => `${node.x},${node.y}`)).size, 6);
    assert.ok(graph.network.hasDirectedEdge("node-0", "node-1"));
    assert.equal(graph.network.hasDirectedEdge("node-1", "node-0"), false);
    assert.equal(graph.nodes.find((node) => node.id === 0).descendants, 3);
    assert.equal(graph.nodes.find((node) => node.id === 3).descendants, 0);
    assert.ok(graph.network.getNodeAttribute("node-0", "size") > graph.network.getNodeAttribute("node-3", "size"));
});

test("graph data handles empty, missing-parent, self-referential, and cyclic input without hanging", () => {
  assert.equal(buildInvitationGraph([]).nodes.length, 0);
  const graph = buildInvitationGraph([
    { id: 0, parentId: 1 }, { id: 1, parentId: 0 },
    { id: 2, parentId: 2 }, { id: 3, parentId: 99 },
  ]);
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.edgeCount, 1);
  assert.equal(graph.network.order, 4);
  assert.equal(graph.network.size, 1);
  assert.ok(graph.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
});

test("WebGL graph preparation lays out 2000-node chains, trees, stars, and forests under 1000ms", () => {
  for (const shape of ["chain", "tree", "star", "forest"]) {
    const input = Array.from({ length: MAX_NODES }, (_, id) => ({
      id, parentId: id === 0 || shape === "forest" ? null
        : shape === "star" ? 0 : Math.floor((id - 1) / (shape === "chain" ? 1 : 3)),
    }));
    const start = performance.now();
    const graph = buildInvitationGraph(input);
    const elapsed = performance.now() - start;
    assert.equal(graph.network.order, 2000);
    assert.equal(graph.network.size, shape === "forest" ? 0 : 1999);
    assert.ok(graph.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
    assert.equal(new Set(graph.nodes.map((node) => `${node.x},${node.y}`)).size, 2000);
    assert.ok(elapsed < 1000, `${shape} took ${elapsed.toFixed(1)}ms`);
  }
});
