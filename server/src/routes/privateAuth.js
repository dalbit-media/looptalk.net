const express = require("express");
const crypto = require("node:crypto");
const rateLimit = require("express-rate-limit");
const prisma = require("../db/client");
const { generateToken } = require("../utils/auth");
const authMiddleware = require("../middleware/auth");
const { normalizeInvitationCode } = require("../utils/invitationCode");
const { createInvitationWelcome } = require("../utils/welcomeConversation");
const { verifySocialToken } = require("../utils/socialIdentity");
const { upgradeRequired, decodeBase64, validVault, accountId, randomUsername, opaqueUser, sanitizeIdentity, onlyFields,
  normalizeIdentifier, isUsername, contactLookup, syntheticSalt, credentialFields, validDisplayName } = require("../utils/privateAccounts");

const router = express.Router();
const challenges = new Map();
const TTL = 2 * 60 * 1000;
const MAX_CHALLENGES = 10000;
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many authentication attempts", code: "RATE_LIMITED" },
});
const session = (user) => ({
  user: { ...opaqueUser(user), member: user.isMember !== false }, token: generateToken(user.id),
  vault: JSON.parse(user.encryptedVault), revision: user.vaultRevision,
  accountId: accountId(Buffer.from(user.authPublicKey, "base64")),
});

const emitWelcome = (req, welcome) => {
  if (!welcome) return;
  const conversation = sanitizeIdentity(welcome);
  const io = req.app.get("io");
  for (const participant of welcome.participants) {
    io?.to(`user_${participant.userId}`).emit("conversation_updated", conversation);
  }
};

router.post("/credential-parameters", limiter, async (req, res) => {
  if (!onlyFields(req.body, ["identifier"]) || !normalizeIdentifier(req.body.identifier)) {
    return res.status(400).json({ error: "A valid username, email or phone number is required" });
  }
  const identifier = normalizeIdentifier(req.body.identifier);
  try {
    const user = await prisma.user.findUnique({
      where: { contactLookup: contactLookup(identifier) }, select: { credentialSalt: true },
    });
    return res.json({ salt: user?.credentialSalt || syntheticSalt(identifier), iterations: 600000, version: 1 });
  } catch {
    return res.status(503).json({ error: "Credential service unavailable" });
  }
});

const socialFailure = (error, res) => {
  if (error.code === "INVALID_SOCIAL_TOKEN") return res.status(401).json({ error: "Invalid sign-in", code: error.code });
  if (error.code === "SOCIAL_UNAVAILABLE") return res.status(503).json({ error: "Sign-in unavailable", code: error.code });
  return null;
};

router.post("/register", limiter, async (req, res) => {
  if (!onlyFields(req.body, ["identifier", "credentialSalt", "publicKey", "vault", "invitationCode", "displayName", "social"])) return upgradeRequired(res);
  const { identifier, credentialSalt, publicKey, vault, invitationCode, displayName, social } = req.body;
  if (social !== undefined && (!onlyFields(social, ["provider", "idToken"]) ||
      typeof social.provider !== "string" || typeof social.idToken !== "string")) {
    return res.status(400).json({ error: "Invalid social sign-in" });
  }
  if (displayName !== undefined && !validDisplayName(displayName)) {
    return res.status(400).json({ error: "Invalid public display name" });
  }
  if (!normalizeIdentifier(identifier) || !decodeBase64(credentialSalt, 16)) {
    return res.status(400).json({ error: "A valid email or phone identifier and 16-byte credentialSalt are required" });
  }
  const key = decodeBase64(publicKey, 32);
  if (!key || !validVault(vault) || (invitationCode !== undefined &&
      (typeof invitationCode !== "string" || invitationCode.length > 100))) {
    return res.status(400).json({ error: "Invalid encrypted registration" });
  }
  try {
    const link = social ? await verifySocialToken(social.provider, social.idToken) : null;
    if (link && await prisma.user.findFirst({ where: { [link.column]: link.providerId }, select: { id: true } })) {
      return res.status(409).json({ error: "This account is already registered", code: "SOCIAL_ACCOUNT_EXISTS" });
    }
    const credentials = credentialFields(identifier, credentialSalt);
    const { user, welcome } = await prisma.$transaction(async (tx) => {
      const id = `u_${crypto.randomBytes(16).toString("hex")}`;
      let legacyCode;
      let inviterId;
      let isMember = true;
      const bootstrap = await tx.user.count({ where: { status: { not: "SYSTEM" } } }) === 0;
      if (!bootstrap && !invitationCode) isMember = false;
      if (invitationCode) {
        const code = normalizeInvitationCode(invitationCode);
        const privateInvitation = await tx.privateInvitation.findUnique({ where: { code } });
        const invitation = privateInvitation || await tx.invitation.findUnique({ where: { code } });
        if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date()) {
          throw new Error("INVALID_INVITATION");
        }
        inviterId = invitation.inviterId;
        const redeemed = await (privateInvitation ? tx.privateInvitation : tx.invitation).updateMany({
          where: { code, status: "PENDING", expiresAt: { gt: new Date() } },
          data: { status: "ACCEPTED", ...(privateInvitation ? { acceptedById: id, acceptedAt: new Date() } : {}) },
        });
        if (redeemed.count !== 1) throw new Error("INVALID_INVITATION");
        if (!privateInvitation) legacyCode = code;
      }
      const canonicalId = accountId(key);
      const chosen = normalizeIdentifier(identifier);
      const username = isUsername(chosen) ? chosen : await randomUsername(tx);
      const created = await tx.user.create({ data: {
        id, username, publicUsername: username, displayName: username, isMember,
        publicDisplayName: displayName?.trim() || null,
        authPublicKey: publicKey, authAccountId: canonicalId,
        ...credentials,
        ...(link ? { [link.column]: link.providerId } : {}),
        encryptedVault: JSON.stringify(vault), vaultRevision: 1,
      } });
      if (legacyCode) await tx.invitation.update({
        where: { code: legacyCode }, data: { acceptedById: id, acceptedAt: new Date() },
      });
      const welcome = inviterId ? await createInvitationWelcome(tx, inviterId, id) : null;
      return { user: created, welcome };
    }, { isolationLevel: "Serializable" });
    emitWelcome(req, welcome);
    return res.json({ ...session(user), welcomeConversationId: welcome?.id || null });
  } catch (error) {
    if (socialFailure(error, res)) return;
    if (["INVITATION_REQUIRED", "INVALID_INVITATION"].includes(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    if (["P2002", "P2034"].includes(error.code)) return res.status(409).json({ error: "Registration conflict" });
    console.error("Private registration failed", { code: error.code });
    return res.status(500).json({ error: "Registration failed" });
  }
});

// A linked provider account can only recover access: the old device key and encrypted vault are replaced.
router.post("/social-recover", limiter, async (req, res) => {
  if (!onlyFields(req.body, ["provider", "idToken", "publicKey", "vault"])) return upgradeRequired(res);
  const { provider, idToken, publicKey, vault } = req.body;
  if (!decodeBase64(publicKey, 32) || !validVault(vault)) {
    return res.status(400).json({ error: "Invalid encrypted recovery" });
  }
  try {
    const link = await verifySocialToken(provider, idToken);
    const existing = await prisma.user.findFirst({ where: { [link.column]: link.providerId } });
    if (!existing || existing.status === "SYSTEM") {
      return res.status(404).json({ error: "No account is linked to this sign-in", code: "NO_LINKED_ACCOUNT" });
    }
    const user = await prisma.user.update({ where: { id: existing.id }, data: {
      authPublicKey: publicKey, authAccountId: accountId(Buffer.from(publicKey, "base64")),
      encryptedVault: JSON.stringify(vault), vaultRevision: { increment: 1 },
    } });
    return res.json(session(user));
  } catch (error) {
    if (socialFailure(error, res)) return;
    console.error("Social recovery failed", { code: error.code });
    return res.status(500).json({ error: "Recovery failed" });
  }
});

router.post("/join-network", authMiddleware, limiter, async (req, res) => {
  const { invitationCode } = req.body || {};
  if (!onlyFields(req.body, ["invitationCode"]) || typeof invitationCode !== "string" ||
      !invitationCode || invitationCode.length > 100) {
    return res.status(400).json({ error: "An invitation code is required" });
  }
  const code = normalizeInvitationCode(invitationCode);
  try {
    const { user, welcome } = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: req.userId } });
      if (!current || current.status === "SYSTEM") throw new Error("ACCOUNT_NOT_FOUND");
      if (current.isMember) throw new Error("ALREADY_MEMBER");
      const privateInvitation = await tx.privateInvitation.findUnique({ where: { code } });
      const invitation = privateInvitation || await tx.invitation.findUnique({ where: { code } });
      if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date() ||
          invitation.inviterId === current.id) {
        throw new Error("INVALID_INVITATION");
      }
      const redeemed = await (privateInvitation ? tx.privateInvitation : tx.invitation).updateMany({
        where: { code, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "ACCEPTED", acceptedById: current.id, acceptedAt: new Date() },
      });
      if (redeemed.count !== 1) throw new Error("INVALID_INVITATION");
      const updated = await tx.user.update({ where: { id: current.id }, data: { isMember: true } });
      const welcome = invitation.inviterId ? await createInvitationWelcome(tx, invitation.inviterId, current.id) : null;
      return { user: updated, welcome };
    }, { isolationLevel: "Serializable" });
    emitWelcome(req, welcome);
    return res.json({ user: { ...opaqueUser(user), member: true }, welcomeConversationId: welcome?.id || null });
  } catch (error) {
    if (error.message === "INVALID_INVITATION") return res.status(400).json({ error: error.message });
    if (error.message === "ALREADY_MEMBER") return res.status(409).json({ error: error.message });
    if (error.message === "ACCOUNT_NOT_FOUND") return res.status(404).json({ error: "Account not found" });
    if (["P2002", "P2034"].includes(error.code)) return res.status(409).json({ error: "Invitation conflict" });
    console.error("Joining the network failed", { code: error.code });
    return res.status(500).json({ error: "Could not join the network" });
  }
});

router.post("/challenge", limiter, async (req, res) => {
  if (!onlyFields(req.body, ["accountId"]) || !/^u_[0-9a-f]{32}$/.test(req.body.accountId)) {
    return res.status(400).json({ error: "Invalid account ID" });
  }
  for (const [id, entry] of challenges) if (entry.expiresAt <= Date.now()) challenges.delete(id);
  if (challenges.size >= MAX_CHALLENGES) return res.status(429).json({ error: "Try again later" });
  const challengeId = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.randomBytes(32).toString("base64");
  challenges.set(challengeId, {
    accountId: req.body.accountId, challenge, action: "login",
    origin: req.get("origin") || null, expiresAt: Date.now() + TTL,
  });
  return res.json({ challengeId, challenge });
});

router.post("/login", limiter, async (req, res) => {
  if (!onlyFields(req.body, ["accountId", "challengeId", "signature"])) return upgradeRequired(res);
  const { accountId: id, challengeId, signature } = req.body;
  if (typeof challengeId !== "string" || challengeId.length > 100 || typeof id !== "string" ||
      !/^u_[0-9a-f]{32}$/.test(id)) return res.status(400).json({ error: "Invalid authentication" });
  const entry = challenges.get(challengeId);
  challenges.delete(challengeId);
  const sig = decodeBase64(signature, 64);
  if (!entry || !sig || entry.expiresAt <= Date.now() || entry.accountId !== id ||
      entry.action !== "login" || entry.origin !== (req.get("origin") || null)) {
    return res.status(401).json({ error: "Invalid or expired challenge" });
  }
  try {
    const user = await prisma.user.findFirst({ where: { OR: [
      { authAccountId: id }, { username: id, authAccountId: null },
    ] } });
    if (!user?.authPublicKey || !user.encryptedVault ||
        accountId(Buffer.from(user.authPublicKey, "base64")) !== id) {
      return res.status(401).json({ error: "Invalid authentication" });
    }
    const key = crypto.createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(user.authPublicKey, "base64")]),
      format: "der", type: "spki",
    });
    if (!crypto.verify(null, Buffer.from(entry.challenge, "base64"), key, sig)) {
      return res.status(401).json({ error: "Invalid authentication" });
    }
    return res.json(session(user));
  } catch (error) {
    return res.status(500).json({ error: "Authentication failed" });
  }
});

module.exports = router;
