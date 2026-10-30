const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUsername, isUsername } = require("../src/utils/privateAccounts");

test("random usernames combine two English words and a number, and are valid login usernames", async () => {
  const names = new Set();
  for (let index = 0; index < 100; index += 1) {
    const username = await randomUsername({ user: { findFirst: async ({ where, select }) => {
      assert.equal(where.OR[0].username, where.OR[1].publicUsername);
      assert.deepEqual(select, { id: true });
      return null;
    } } });
    assert.match(username, /^[a-z]+-[a-z]+-\d{3,4}$/);
    assert.ok(isUsername(username));
    names.add(username);
  }
  assert.ok(names.size > 90);
});

test("random usernames retry collisions without overwriting existing handles", async () => {
  let attempts = 0;
  const seen = [];
  const username = await randomUsername({ user: { findFirst: async ({ where }) => {
    attempts += 1;
    seen.push(where.OR[0].username);
    return attempts < 3 ? { id: "existing-owner" } : null;
  } } });
  assert.equal(attempts, 3);
  assert.equal(username, seen[2]);
});

test("random username allocation stops after bounded collisions and propagates database failures", async () => {
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
