const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createInvitationCode, normalizeInvitationCode, validInvitationCode } = require("../src/utils/invitationCode");

test("new invitation codes are exactly ten unambiguous cryptographically random characters", async () => {
  const codes = new Set();
  const model = { findUnique: async () => null };
  for (let index = 0; index < 100; index += 1) {
    const code = await createInvitationCode({ privateInvitation: model, invitation: model });
    assert.match(code, /^[2-9A-HJ-NP-Z]{10}$/);
    codes.add(code);
  }
  assert.equal(codes.size, 100);
});

test("allocation retries collisions in either table and fails explicitly after five attempts", async (t) => {
  let randomCalls = 0;
  t.mock.method(crypto, "randomInt", (maximum) => {
    assert.equal(maximum, 32);
    return Math.floor(randomCalls++ / 10);
  });
  const queries = [];
  const code = await createInvitationCode({
    privateInvitation: { findUnique: async ({ where }) => {
      queries.push(where.code);
      return where.code === "2".repeat(10) ? { code: where.code } : null;
    } },
    invitation: { findUnique: async ({ where }) => where.code === "3".repeat(10) ? { code: where.code } : null },
  });
  assert.equal(code, "4".repeat(10));
  assert.equal(queries.length, 3);
  const occupied = { findUnique: async () => ({ code: "occupied" }) };
  await assert.rejects(createInvitationCode({ privateInvitation: occupied, invitation: occupied }), /unique invitation code/);
});

test("manual codes and old links normalize without accepting other punctuation", () => {
  for (const input of ["7ac4m-9k2xe", " 7ac4m 9k2xe ", "ABCDEFGH", "a".repeat(32)]) {
    assert.equal(validInvitationCode(normalizeInvitationCode(input)), true);
  }
  assert.equal(normalizeInvitationCode(null), "");
  for (const input of ["7AC4M/9K2XE", "7AC4M9K2X", "1".repeat(10)]) {
    assert.equal(validInvitationCode(normalizeInvitationCode(input)), false);
  }
});
