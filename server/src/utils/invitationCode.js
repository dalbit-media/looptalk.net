const crypto = require("node:crypto");

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const normalizeInvitationCode = (value) => typeof value === "string"
  ? value.replace(/[\s-]/g, "").toUpperCase() : "";
const validInvitationCode = (value) => /^(?:[A-Z0-9]{8}|[2-9A-HJ-NP-Z]{10}|[A-F0-9]{32})$/.test(value);
const createInvitationCode = async (prisma) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = Array.from({ length: 10 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
    const matches = await Promise.all([prisma.privateInvitation, prisma.invitation].map((model) =>
      model.findUnique({ where: { code }, select: { code: true } })
    ));
    if (matches.every((match) => !match)) return code;
  }
  throw new Error("Unable to allocate a unique invitation code");
};

module.exports = { normalizeInvitationCode, validInvitationCode, createInvitationCode };
