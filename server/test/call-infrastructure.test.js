const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const {
  initializeCallInfrastructure, closeCallInfrastructure, resumeActiveCall,
  savePendingCalls, getPendingCalls, clearPendingCall,
} = require("../src/utils/callInfrastructure");

test("Redis is optional, but configured adapters connect before they are used", async (t) => {
  const previousUrl = process.env.REDIS_URL;
  t.after(() => {
    if (previousUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousUrl;
  });

  const originalLoad = Module._load;
  const loads = [];
  const operations = [];
  let finishConnect;
  const connection = new Promise((resolve) => { finishConnect = resolve; });
  const client = {
    isOpen: true,
    on: (event) => { operations.push(event); },
    connect: () => { operations.push("connect"); return connection; },
    close: async () => { operations.push("close"); },
  };
  const adapter = {};
  t.mock.method(Module, "_load", function(name, ...args) {
    if (name === "redis") {
      loads.push(name);
      return { createClient: ({ url }) => {
        assert.equal(url, "redis://localhost:6379");
        return client;
      } };
    }
    if (name === "@socket.io/redis-streams-adapter") {
      loads.push(name);
      return { createAdapter: (connectedClient) => {
        assert.equal(connectedClient, client);
        return adapter;
      } };
    }
    return originalLoad.call(this, name, ...args);
  });
  const io = { adapter: (value) => {
    assert.equal(value, adapter);
    operations.push("adapter");
  } };

  delete process.env.REDIS_URL;
  await initializeCallInfrastructure(io);
  assert.deepEqual(loads, []);
  assert.deepEqual(operations, []);

  process.env.REDIS_URL = "redis://localhost:6379";
  const pending = initializeCallInfrastructure(io);
  assert.deepEqual(loads, ["@socket.io/redis-streams-adapter", "redis"]);
  assert.deepEqual(operations, ["error", "connect"]);
  finishConnect();
  await pending;
  assert.deepEqual(operations, ["error", "connect", "adapter"]);
  await closeCallInfrastructure();
  assert.equal(operations.at(-1), "close");
});

test("reconnected call ownership moves to the new socket without an old disconnect timer ending it", (t) => {
  const call = { ownerId: "caller", conversationId: "conversation", otherIds: ["callee"] };
  const timer = {};
  const cleared = [];
  t.mock.method(global, "clearTimeout", (value) => cleared.push(value));
  const current = new Map();
  const activeCallsBySocket = new Map([
    ["old", new Map([["call", call]])],
    ["new", current],
    ["peer", new Map([["call", { ...call, ownerId: "callee", otherIds: ["caller"] }]])],
  ]);
  const callDisconnectTimers = new Map([["old", timer]]);
  assert.equal(resumeActiveCall({
    activeCallsBySocket, callDisconnectTimers, socketId: "new", userId: "caller",
    callId: "call", conversationId: "conversation", otherIds: ["callee"],
  }), true);
  assert.equal(activeCallsBySocket.has("old"), false);
  assert.equal(callDisconnectTimers.has("old"), false);
  assert.deepEqual(cleared, [timer]);
  assert.equal(current.get("call").ownerId, "caller");
  assert.equal(activeCallsBySocket.get("peer").get("call").ownerId, "callee");
});

test("call resumption cannot adopt another account's call or an unknown conversation", () => {
  const activeCallsBySocket = new Map([["old", new Map([["call", {
    ownerId: "owner", conversationId: "conversation", otherIds: ["peer"],
  }]])]]);
  for (const [userId, conversationId] of [["other", "conversation"], ["owner", "different"]]) {
    assert.equal(resumeActiveCall({
      activeCallsBySocket, callDisconnectTimers: new Map(), socketId: "new",
      userId, callId: "call", conversationId, otherIds: ["peer"],
    }), false);
  }
  assert.equal(activeCallsBySocket.has("old"), true);
  assert.equal(activeCallsBySocket.has("new"), false);
});

test("pending call replays retain the original ringing deadline and exclude expired invitations", async (t) => {
  let now = 100000;
  t.mock.method(Date, "now", () => now);
  await savePendingCalls(["recipient"], { callId: "call", expiresAt: now + 45000 });
  now += 40000;
  const pending = await getPendingCalls("recipient");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].expiresAt, 145000);
  now += 6000;
  assert.deepEqual(await getPendingCalls("recipient"), []);
  await clearPendingCall(["recipient"], "call");
});

test("Redis 6 batched scans replay only unexpired pending calls", async (t) => {
  const previousUrl = process.env.REDIS_URL;
  t.after(async () => {
    await closeCallInfrastructure();
    if (previousUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousUrl;
  });
  process.env.REDIS_URL = "redis://test.invalid";
  const records = new Map();
  const batches = [];
  const client = {
    isOpen: true, on() {}, connect: async () => {}, close: async () => {},
    set: async (key, value) => records.set(key, value),
    scanIterator: async function* () { yield []; yield [...records.keys()]; },
    mGet: async (keys) => { batches.push(keys); return keys.map((key) => records.get(key)); },
    del: async (keys) => keys.forEach((key) => records.delete(key)),
  };
  const originalLoad = Module._load;
  t.mock.method(Module, "_load", function(name, ...args) {
    if (name === "redis") return { createClient: () => client };
    if (name === "@socket.io/redis-streams-adapter") return { createAdapter: () => ({}) };
    return originalLoad.call(this, name, ...args);
  });
  await initializeCallInfrastructure({ adapter() {} });
  await savePendingCalls(["recipient"], { callId: "live", expiresAt: Date.now() + 30000 });
  await savePendingCalls(["recipient"], { callId: "expired", expiresAt: Date.now() - 1 });
  const calls = await getPendingCalls("recipient");
  assert.deepEqual(calls.map((call) => call.callId), ["live"]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
  await clearPendingCall(["recipient"], "live");
});
