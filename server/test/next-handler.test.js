const test = require("node:test");
const assert = require("node:assert/strict");
const { createNextHandler } = require("../src/utils/nextHandler");

test("Next.js initialization is deferred until a website request", async () => {
  let created = 0;
  let prepared = 0;
  const requests = [];
  const next = createNextHandler(() => {
    created += 1;
    return {
      prepare: async () => { prepared += 1; },
      getRequestHandler: () => (req, res) => { requests.push({ req, res }); return "handled"; },
    };
  });
  assert.equal(created, 0);
  const req = {};
  const res = {};
  assert.equal(await next.handleRequest(req, res), "handled");
  assert.equal(created, 1);
  assert.equal(prepared, 1);
  assert.deepEqual(requests, [{ req, res }]);
  await next.handleRequest({}, {});
  assert.equal(created, 1);
  assert.equal(prepared, 1);
});

test("concurrent first requests share preparation and wait until it succeeds", async () => {
  let created = 0;
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const handled = [];
  const next = createNextHandler(() => {
    created += 1;
    return {
      prepare: () => waiting,
      getRequestHandler: () => (req) => { handled.push(req.id); },
    };
  });
  const first = next.handleRequest({ id: 1 }, {});
  const second = next.handleRequest({ id: 2 }, {});
  await Promise.resolve();
  assert.equal(created, 1);
  assert.deepEqual(handled, []);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(handled, [1, 2]);
});

test("production-style explicit preparation is reused by requests", async () => {
  let created = 0;
  const next = createNextHandler(() => {
    created += 1;
    return { prepare: async () => {}, getRequestHandler: () => () => {} };
  });
  assert.equal(next.prepare(), next.prepare());
  await next.prepare();
  await next.handleRequest({}, {});
  assert.equal(created, 1);
});

test("creation and preparation errors reject requests rather than report readiness", async () => {
  for (const createApp of [
    () => { throw new Error("creation failed"); },
    () => ({
      prepare: async () => { throw new Error("preparation failed"); },
      getRequestHandler: () => { assert.fail("Handler should not be returned"); },
    }),
  ]) {
    const next = createNextHandler(createApp);
    await assert.rejects(next.handleRequest({}, {}), /failed/);
    await assert.rejects(next.prepare(), /failed/);
  }
});

test("request handler errors propagate to Express error handling", async () => {
  const next = createNextHandler(() => ({
    prepare: async () => {},
    getRequestHandler: () => async () => { throw new Error("request failed"); },
  }));
  await assert.rejects(next.handleRequest({}, {}), /request failed/);
});
