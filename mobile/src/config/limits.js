// Shared by the app and the server test that keeps server/src/routes/secure.js in step.
const MAX_ATTACHMENT_MB = 250;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;
// Attachments travel base64-encoded (+33%) inside the encrypted envelope, with room for metadata and thumbnails.
const MAX_PAYLOAD_BYTES = Math.ceil(MAX_ATTACHMENT_BYTES * 1.4);

const assertAttachmentSize = (bytes) => {
  if (bytes > MAX_ATTACHMENT_BYTES) {
    throw Object.assign(new Error(`Attachment exceeds the ${MAX_ATTACHMENT_MB} MB limit`), { code: "ATTACHMENT_TOO_LARGE" });
  }
};

module.exports = { MAX_ATTACHMENT_MB, MAX_ATTACHMENT_BYTES, MAX_PAYLOAD_BYTES, assertAttachmentSize };
