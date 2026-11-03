const test = require("node:test");
const assert = require("node:assert/strict");
const limits = require("../../mobile/src/config/limits");
const { MAX_PAYLOAD_BYTES } = require("../src/routes/secure");

test("server and app agree on the encrypted attachment limit", () => {
  assert.equal(limits.MAX_ATTACHMENT_MB, 250);
  assert.equal(MAX_PAYLOAD_BYTES, limits.MAX_PAYLOAD_BYTES);
  // Base64 of a full-size attachment plus its envelope must fit the upload cap.
  assert.ok(Math.ceil(limits.MAX_ATTACHMENT_BYTES / 3) * 4 + 1024 * 1024 < MAX_PAYLOAD_BYTES);
});

test("oversized attachments fail with a code the chat screen can explain", () => {
  assert.doesNotThrow(() => limits.assertAttachmentSize(limits.MAX_ATTACHMENT_BYTES));
  assert.throws(() => limits.assertAttachmentSize(limits.MAX_ATTACHMENT_BYTES + 1), { code: "ATTACHMENT_TOO_LARGE" });
});
