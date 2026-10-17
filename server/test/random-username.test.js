const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { randomUsername } = require("../src/utils/privateAccounts");

test("random usernames contain exactly 12 lowercase hex characters without an ID prefix", async () => {
  const names = new Set();
  for (let index = 0; index < 100; index += 1) {
    const username = await randomUsername({ user: { findFirst: async ({ where, select }) => {
      assert.equal(where.OR[0].username, where.OR[1].publicUsername);
      assert.deepEqual(select, { id: true });
      return null;
    } } });
    assert.match(username, /^[0-9a-f]{12}$/);
    names.add(username);
  }
  assert.equal(names.size, 100);
});

test("random usernames retry collisions without overwriting existing handles", async (t) => {
  let attempts = 0;
  t.mock.method(crypto, "randomBytes", (length) => {
    assert.equal(length, 6);
    attempts += 1;
    return Buffer.alloc(length, attempts);
  });
  const username = await randomUsername({ user: { findFirst: async () =>
    attempts < 3 ? { id: "existing-owner" } : null,
  } });
  assert.equal(username, "030303030303");
  assert.equal(attempts, 3);
});

test("random username allocation stops after bounded collisions and propagates database failures", async (t) => {
  t.mock.method(crypto, "randomBytes", (length) => Buffer.alloc(length, 1));
  let attempts = 0;
  await assert.rejects(randomUsername({ user: { findFirst: async () => {
    attempts += 1;
    return { id: "existing-owner" };
  } } }), /Unable to allocate a unique random username/);
  assert.equal(attempts, 5);
  await assert.rejects(randomUsername({ user: { findFirst: async () => {
    throw new Error("Database unavailable");
  } } }), /Database unavailable/);
});
