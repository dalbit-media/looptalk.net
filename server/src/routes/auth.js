const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const prisma = require("../db/client");
const { comparePassword, generateToken } = require("../utils/auth");
const authMiddleware = require("../middleware/auth");
const { webPushConfigured, parseSubscription } = require("../utils/pushNotifications");
const { pruneSecureRecipient, secureTransaction } = require("../utils/secureRelay");
const { opaqueUser, upgradeRequired, decodeBase64, validVault, accountId, onlyFields,
  normalizeIdentifier, credentialFields } = require("../utils/privateAccounts");

const router = express.Router();
router.use(require("./privateAuth"));
router.post("/social", (req, res) => upgradeRequired(res));
router.get("/bootstrap-status", async (req, res) => {
  const count = await prisma.user.count({ where: { status: { not: "SYSTEM" } } });
  res.json({ bootstrapAvailable: count === 0 });
});

// Existing credentials authorize only export, explicit migration, or deletion.
router.post("/legacy-login", rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
}), async (req, res) => {
  const { identifier, password } = req.body || {};
  if (typeof identifier !== "string" || identifier.length > 254 ||
      typeof password !== "string" || password.length > 128) {
    return res.status(400).json({ error: "Invalid credentials" });
  }
  const normalized = identifier.trim();
  const phone = normalized.replace(/[\s().-]/g, "");
  const user = await prisma.user.findFirst({ where: {
    OR: [{ username: normalized }, { email: normalized.toLowerCase() }, { phoneNumber: phone }],
  } });
  if (!user?.passwordHash || user.authPublicKey || !await comparePassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ id: user.id, migrationOnly: true }, process.env.JWT_SECRET, { expiresIn: "15m" });
  return res.json({ token, migrationRequired: true, user: opaqueUser(user) });
});

router.get("/legacy-data", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || user.authPublicKey) return res.status(409).json({ error: "Legacy account required" });
  const [contacts, invitations, receivedInvitations, memberships] = await Promise.all([
    prisma.contact.findMany({ where: { userId: req.userId } }),
    prisma.invitation.findMany({ where: { inviterId: req.userId } }),
    prisma.invitation.findMany({ where: { acceptedById: req.userId } }),
    prisma.conversationParticipant.findMany({
      where: { userId: req.userId, conversation: { isGroupChat: true } },
      select: { conversation: { select: { id: true, name: true } } },
    }),
  ]);
  // Export is deliberately owner-only and bypasses peer-response redaction.
  res.type("json").send(JSON.stringify({
    profile: { email: user.email, phoneNumber: user.phoneNumber, displayName: user.displayName,
      username: user.username, bio: user.bio, profilePicture: user.profilePicture },
    contacts, invitations, receivedInvitations,
    conversationNames: memberships.filter(({ conversation }) => conversation.name)
      .map(({ conversation }) => ({ conversationId: conversation.id, name: conversation.name })),
    warning: "Migration replaces the legacy profile, deletes the owner's contact rows, and clears invitation contact addresses while retaining operational invitation topology. Existing shared conversation names, messages, uploads, historical reports and other owners' contact rows remain readable on the server; they are not retroactively encrypted. Embed the avatar in the encrypted vault before migrating.",
  }));
});

router.post("/migrate", authMiddleware, async (req, res) => {
  if (!onlyFields(req.body, ["identifier", "credentialSalt", "publicKey", "vault", "confirmation", "avatarImported"])) return upgradeRequired(res);
  const { identifier, credentialSalt, publicKey, vault, confirmation, avatarImported } = req.body;
  const credentialMode = identifier !== undefined || credentialSalt !== undefined;
  if (credentialMode && (!normalizeIdentifier(identifier) || !decodeBase64(credentialSalt, 16))) {
    return res.status(400).json({ error: "A valid email or phone identifier and 16-byte credentialSalt are required" });
  }
  const key = decodeBase64(publicKey, 32);
  if (!key || !validVault(vault) || confirmation !== "ENCRYPT_AND_REMOVE_LEGACY_PROFILE") {
    return res.status(400).json({ error: "Encrypted vault and explicit profile replacement confirmation are required" });
  }
  try {
    const id = accountId(key);
    const credentials = credentialMode ? credentialFields(identifier, credentialSalt) : {};
    const migration = await prisma.$transaction(async (tx) => {
      const owner = await tx.user.findUnique({ where: { id: req.userId } });
      if (!owner || owner.authPublicKey) return { conflict: true };
      if (owner.profilePicture && avatarImported !== true) return { avatarRequired: true };
      const updated = await tx.user.updateMany({
        where: { id: req.userId, authPublicKey: null },
        data: {
          authPublicKey: publicKey, authAccountId: id, ...credentials,
          encryptedVault: JSON.stringify(vault), vaultRevision: 1,
          username: owner.id, displayName: owner.id, email: null, phoneNumber: null,
          passwordHash: null, appleId: null, googleId: null, bio: null, profilePicture: null, lastActiveAt: null,
        },
      });
      if (!updated.count) return { conflict: true };
      const contacts = await tx.contact.deleteMany({ where: { userId: req.userId } });
      const invitations = await tx.invitation.updateMany({
        where: { OR: [{ inviterId: req.userId }, { acceptedById: req.userId }] },
        data: { inviteeEmail: null },
      });
      return { profilePicture: owner.profilePicture, contacts: contacts.count, invitations: invitations.count };
    }, { isolationLevel: "Serializable" });
    if (migration.conflict) return res.status(409).json({ error: "Account already migrated" });
    if (migration.avatarRequired) {
      return res.status(400).json({ error: "Import the existing avatar into the encrypted vault first", code: "AVATAR_IMPORT_REQUIRED" });
    }
    // Legacy uploads have no uploader/ownership relation. A profile URL alone
    // is not ownership proof: old clients could assign any public media URL.
    // Never unlink such a file and risk deleting another person's upload.
    const avatarCleanup = migration.profilePicture ? {
      status: "retained-unsafe",
      error: "Legacy avatar uploader ownership cannot be verified; the file was retained to avoid unrelated media deletion",
    } : { status: "none" };
    return res.json({
      user: { id: req.userId, username: req.userId, displayName: req.userId }, token: generateToken(req.userId),
      vault, revision: 1, accountId: id,
      legacyHistoryRetained: true, avatarCleanup,
      legacyContactsRemoved: migration.contacts, legacyInvitationEdgesRemoved: 0,
      legacyInvitationContactsCleared: migration.invitations,
    });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "Authentication key already registered" });
    if (error.code === "P2034") return res.status(409).json({ error: "Migration conflict; try again" });
    throw error;
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(opaqueUser(user));
});

router.get("/invitation-onboarding", authMiddleware, async (req, res) => {
  const invitation = await prisma.privateInvitation.findUnique({ where: { acceptedById: req.userId } }) ||
    await prisma.invitation.findUnique({ where: { acceptedById: req.userId } });
  if (!invitation?.inviterId) return res.json({ onboarding: null });
  const inviter = await prisma.user.findUnique({ where: { id: invitation.inviterId } });
  if (!inviter || inviter.status === "SYSTEM" || inviter.id === req.userId) return res.json({ onboarding: null });
  const conversation = await prisma.conversation.findFirst({
    where: {
      kind: "CHAT", isGroupChat: false,
      participants: {
        some: { userId: req.userId },
        every: { userId: { in: [req.userId, inviter.id] } },
      },
      messages: { some: { automaticWelcome: true, senderId: inviter.id } },
    },
    select: { id: true, createdAt: true },
  });
  if (!conversation) return res.json({ onboarding: null });
  return res.json({ onboarding: {
    inviter: opaqueUser(inviter),
    inviterDisplayName: invitation.inviterDisplayName || null,
    conversationId: conversation.id, createdAt: conversation.createdAt,
  } });
});

router.get("/web-push-key", (_req, res) => {
  if (!webPushConfigured()) return res.status(503).json({ error: "Web push is not configured" });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post("/device-token", authMiddleware, async (req, res) => {
  const { token, platform } = req.body || {};
  if (typeof token !== "string" || !token || token.length > 4096 ||
      !["ios", "android", "web"].includes(platform)) {
    return res.status(400).json({ error: "Invalid device token" });
  }
  if (platform === "web") {
    const subscription = parseSubscription(token);
    let secureEndpoint = false;
    try { secureEndpoint = new URL(subscription?.endpoint).protocol === "https:"; } catch { /* invalid endpoint */ }
    if (!secureEndpoint) return res.status(400).json({ error: "Invalid web push subscription" });
  }
  await prisma.deviceToken.upsert({
    where: { token }, update: { userId: req.userId, isActive: true, platform },
    create: { userId: req.userId, token, platform },
  });
  res.json({ success: true });
});

router.delete("/device-token", authMiddleware, async (req, res) => {
  await prisma.deviceToken.updateMany({ where: { userId: req.userId }, data: { isActive: false } });
  res.json({ success: true });
});

router.delete("/account", authMiddleware, async (req, res) => {
  try {
    if (req.body?.confirmation !== "DELETE") {
      return res.status(400).json({ error: "Account deletion confirmation is required" });
    }
    await secureTransaction(prisma, async (tx) => {
      const memberships = await tx.conversationParticipant.findMany({
        where: { userId: req.userId },
        include: { conversation: { select: {
          isGroupChat: true, participants: { orderBy: [{ joinedAt: "asc" }, { id: "asc" }] },
        } } },
      });
      for (const membership of memberships) {
        await pruneSecureRecipient(tx, membership.conversationId, req.userId);
        const remaining = membership.conversation.participants.filter((p) => p.userId !== req.userId);
        if (!membership.conversation.isGroupChat || !remaining.length) {
          await tx.conversation.delete({ where: { id: membership.conversationId } });
        } else if (membership.role === "OWNER") {
          const successor = remaining.find((p) => p.role === "ADMIN") || remaining[0];
          await tx.conversationParticipant.update({ where: { id: successor.id }, data: { role: "OWNER" } });
        }
      }
      await tx.privateInvitation.updateMany({
        where: { inviterId: req.userId }, data: { inviterDisplayName: null },
      });
      await tx.user.delete({ where: { id: req.userId } });
    });
    for (const socket of req.app.get("io")?.sockets?.sockets?.values?.() || []) {
      if (socket.userId === req.userId) socket.disconnect(true);
    }
    res.json({ success: true });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ error: "User not found" });
    console.error("Account deletion error:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

module.exports = router;
