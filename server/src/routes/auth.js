const express = require("express");
const prisma = require("../db/client");
const { hashPassword, comparePassword, generateToken } = require("../utils/auth");
const authMiddleware = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const { OAuth2Client } = require("google-auth-library");
const appleSignin = require("apple-signin-auth");

const router = express.Router();
const googleClient = new OAuth2Client();

const normalizeEmail = (email) => (
  typeof email === "string" ? email.trim().toLowerCase() || null : null
);
const normalizePhoneNumber = (phoneNumber) => {
  if (typeof phoneNumber !== "string" || !phoneNumber.trim()) return null;
  const normalized = phoneNumber.trim().replace(/[\s().-]/g, "");
  return normalized.startsWith("+")
    ? `+${normalized.slice(1).replace(/\D/g, "")}`
    : normalized.replace(/\D/g, "");
};
const isValidEmail = (email) => (
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
);
const isValidPhoneNumber = (phoneNumber) => /^\+?\d{7,15}$/.test(phoneNumber);

const createRandomUsername = async (tx) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const username = `user_${uuidv4().replace(/-/g, "").slice(0, 10)}`;
    const exists = await tx.user.findUnique({ where: { username } });
    if (!exists) return username;
  }
  throw new Error("USERNAME_GENERATION_FAILED");
};

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  phoneNumber: user.phoneNumber,
  displayName: user.displayName,
  profilePicture: user.profilePicture,
});

const acceptInvitation = async (tx, invitation, inviteeId) => {
  const acceptedAt = new Date();
  const contactPairs = [
    { userId: inviteeId, contactUserId: invitation.inviterId },
    { userId: invitation.inviterId, contactUserId: inviteeId },
  ];

  await Promise.all([
    tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" },
    }),
    ...contactPairs.map(({ userId, contactUserId }) =>
      tx.contact.upsert({
        where: { userId_contactUserId: { userId, contactUserId } },
        update: {},
        create: { userId, contactUserId, groupName: "All Contacts 1" },
      })
    ),
  ]);

  await tx.conversation.create({
    data: {
      isGroupChat: false,
      lastMessageAt: acceptedAt,
      participants: {
        create: [
          { userId: invitation.inviterId },
          { userId: inviteeId },
        ],
      },
      messages: {
        create: {
          senderId: invitation.inviterId,
          content: "Invitation accepted. You can start chatting now.",
          messageType: "SYSTEM",
          createdAt: acceptedAt,
        },
      },
    },
  });
};

const verifySocialIdentity = async (provider, idToken) => {
  if (provider === "google") {
    const audiences = [
      process.env.GOOGLE_WEB_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
    ].filter(Boolean);
    if (audiences.length === 0) throw new Error("PROVIDER_NOT_CONFIGURED");

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: audiences,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email_verified) throw new Error("INVALID_PROVIDER_TOKEN");
    return {
      providerId: payload.sub,
      email: normalizeEmail(payload.email),
      displayName: payload.name,
      profilePicture: payload.picture,
    };
  }

  if (provider === "apple") {
    if (!process.env.APPLE_CLIENT_ID) throw new Error("PROVIDER_NOT_CONFIGURED");
    const payload = await appleSignin.verifyIdToken(idToken, {
      audience: process.env.APPLE_CLIENT_ID,
      ignoreExpiration: false,
    });
    if (!payload?.sub) throw new Error("INVALID_PROVIDER_TOKEN");
    return {
      providerId: payload.sub,
      email: normalizeEmail(payload.email),
    };
  }

  throw new Error("INVALID_PROVIDER");
};

router.get("/bootstrap-status", async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ bootstrapAvailable: userCount === 0 });
  } catch (error) {
    console.error("Bootstrap status error:", error);
    res.status(500).json({ error: "Failed to check registration status" });
  }
});

// Register with invitation code
router.post("/register", async (req, res) => {
  try {
    const { email, phoneNumber, password, displayName, invitationCode } = req.body;
    if (
      (email != null && typeof email !== "string") ||
      (phoneNumber != null && typeof phoneNumber !== "string") ||
      typeof password !== "string" ||
      (displayName != null && typeof displayName !== "string") ||
      (invitationCode != null && typeof invitationCode !== "string")
    ) {
      return res.status(400).json({ error: "Invalid registration data" });
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    if ((!normalizedEmail && !normalizedPhoneNumber) || !password) {
      return res.status(400).json({ error: "Contact and password are required" });
    }
    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Invalid email address" });
    }
    if (normalizedPhoneNumber && !isValidPhoneNumber(normalizedPhoneNumber)) {
      return res.status(400).json({ error: "Invalid phone number" });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: "Password must be 6 to 128 characters" });
    }
    if (displayName?.trim().length > 100 || invitationCode?.trim().length > 100) {
      return res.status(400).json({ error: "Registration data is too long" });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const isBootstrapRegistration = (await tx.user.count()) === 0;
      let invitation = null;

      if (!isBootstrapRegistration) {
        if (!invitationCode) {
          throw new Error("INVITATION_REQUIRED");
        }

        invitation = await tx.invitation.findUnique({
          where: { code: invitationCode },
        });

        if (!invitation) {
          throw new Error("INVALID_INVITATION");
        }
        if (invitation.status !== "PENDING") {
          throw new Error("INVITATION_UNAVAILABLE");
        }
        if (new Date() > invitation.expiresAt) {
          throw new Error("INVITATION_EXPIRED");
        }
        if (
          normalizedEmail &&
          invitation.inviteeEmail &&
          invitation.inviteeEmail.toLowerCase() !== normalizedEmail
        ) {
          throw new Error("INVITATION_EMAIL_MISMATCH");
        }
      }

      const existingUser = await tx.user.findFirst({
        where: {
          OR: [
            ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
            ...(normalizedPhoneNumber ? [{ phoneNumber: normalizedPhoneNumber }] : []),
          ],
        },
      });

      if (existingUser) {
        throw new Error("USER_EXISTS");
      }

      const username = await createRandomUsername(tx);
      const createdUser = await tx.user.create({
        data: {
          username,
          email: normalizedEmail,
          phoneNumber: normalizedPhoneNumber,
          displayName:
            displayName?.trim() ||
            normalizedEmail?.split("@")[0] ||
            `User ${normalizedPhoneNumber.slice(-4)}`,
          passwordHash,
        },
      });

      if (invitation) {
        await acceptInvitation(tx, invitation, createdUser.id);
      }

      return createdUser;
    }, { isolationLevel: "Serializable" });

    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    const registrationErrors = {
      INVITATION_REQUIRED: "Invitation code is required",
      INVALID_INVITATION: "Invalid invitation code",
      INVITATION_UNAVAILABLE: "Invitation already used or expired",
      INVITATION_EXPIRED: "Invitation expired",
      INVITATION_EMAIL_MISMATCH: "Email does not match invitation",
      USER_EXISTS: "Email or phone number already exists",
    };
    if (registrationErrors[error.message]) {
      return res.status(400).json({ error: registrationErrors[error.message] });
    }
    if (error.code === "P2034") {
      return res.status(409).json({ error: "Registration changed; please try again" });
    }
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (typeof identifier !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Identifier and password are required" });
    }
    const normalizedIdentifier = identifier.trim();

    if (!normalizedIdentifier || !password) {
      return res.status(400).json({ error: "Identifier and password are required" });
    }
    if (normalizedIdentifier.length > 254 || password.length > 128) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: normalizedIdentifier },
          { email: normalizeEmail(normalizedIdentifier) },
          { phoneNumber: normalizePhoneNumber(normalizedIdentifier) },
        ],
      },
    });

    if (!user?.passwordHash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
        profilePicture: user.profilePicture,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/social", async (req, res) => {
  try {
    const { provider, idToken, invitationCode, displayName } = req.body;
    if (!idToken) return res.status(400).json({ error: "Provider token is required" });

    const identity = await verifySocialIdentity(provider, idToken);
    const providerField = provider === "apple" ? "appleId" : "googleId";
    let user = await prisma.user.findFirst({
      where: { [providerField]: identity.providerId },
    });

    if (!user) {
      user = await prisma.$transaction(async (tx) => {
        const isBootstrapRegistration = (await tx.user.count()) === 0;
        let invitation = null;

        if (!isBootstrapRegistration) {
          if (!invitationCode) throw new Error("INVITATION_REQUIRED");
          invitation = await tx.invitation.findUnique({
            where: { code: invitationCode },
          });
          if (!invitation) throw new Error("INVALID_INVITATION");
          if (invitation.status !== "PENDING" || new Date() > invitation.expiresAt) {
            throw new Error("INVITATION_UNAVAILABLE");
          }
          if (
            identity.email &&
            invitation.inviteeEmail &&
            invitation.inviteeEmail.toLowerCase() !== identity.email
          ) {
            throw new Error("INVITATION_EMAIL_MISMATCH");
          }
        }

        const existingByEmail = identity.email
          ? await tx.user.findUnique({ where: { email: identity.email } })
          : null;
        if (existingByEmail) {
          return tx.user.update({
            where: { id: existingByEmail.id },
            data: { [providerField]: identity.providerId },
          });
        }
        if (!identity.email) throw new Error("PROVIDER_EMAIL_REQUIRED");

        const username = await createRandomUsername(tx);
        const createdUser = await tx.user.create({
          data: {
            username,
            email: identity.email,
            displayName:
              displayName?.trim() || identity.displayName || identity.email.split("@")[0],
            profilePicture: identity.profilePicture,
            [providerField]: identity.providerId,
          },
        });

        if (invitation) {
          await acceptInvitation(tx, invitation, createdUser.id);
        }
        return createdUser;
      }, { isolationLevel: "Serializable" });
    }

    res.json({ token: generateToken(user.id), user: publicUser(user) });
  } catch (error) {
    const socialErrors = {
      PROVIDER_NOT_CONFIGURED: [503, "Provider is not configured"],
      INVALID_PROVIDER: [400, "Invalid provider"],
      INVALID_PROVIDER_TOKEN: [401, "Invalid provider token"],
      PROVIDER_EMAIL_REQUIRED: [400, "Provider must share an email for signup"],
      INVITATION_REQUIRED: [400, "Invitation code is required"],
      INVALID_INVITATION: [400, "Invalid invitation code"],
      INVITATION_UNAVAILABLE: [400, "Invitation already used or expired"],
      INVITATION_EMAIL_MISMATCH: [400, "Email does not match invitation"],
    };
    if (socialErrors[error.message]) {
      const [status, message] = socialErrors[error.message];
      return res.status(status).json({ error: message });
    }
    console.error("Social authentication error:", error);
    res.status(401).json({ error: "Social authentication failed" });
  }
});

// Get current user
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        username: true,
        email: true,
        phoneNumber: true,
        displayName: true,
        profilePicture: true,
        bio: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Register device token for push notifications
router.post("/device-token", authMiddleware, async (req, res) => {
  try {
    const { token, platform } = req.body;

    await prisma.deviceToken.upsert({
      where: { token },
      update: { isActive: true, platform },
      create: {
        userId: req.userId,
        token,
        platform,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error registering device token:", error);
    res.status(500).json({ error: "Failed to register device token" });
  }
});

router.delete("/device-token", authMiddleware, async (req, res) => {
  try {
    await prisma.deviceToken.updateMany({
      where: { userId: req.userId },
      data: { isActive: false },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error disabling device tokens:", error);
    res.status(500).json({ error: "Failed to disable device tokens" });
  }
});

router.delete("/account", authMiddleware, async (req, res) => {
  try {
    if (req.body?.confirmation !== "DELETE") {
      return res.status(400).json({ error: "Account deletion confirmation is required" });
    }

    await prisma.$transaction(async (tx) => {
      const memberships = await tx.conversationParticipant.findMany({
        where: { userId: req.userId },
        include: {
          conversation: {
            select: {
              isGroupChat: true,
              participants: { orderBy: [{ joinedAt: "asc" }, { id: "asc" }] },
            },
          },
        },
      });

      for (const membership of memberships) {
        if (!membership.conversation.isGroupChat) {
          await tx.conversation.delete({ where: { id: membership.conversationId } });
          continue;
        }

        const remaining = membership.conversation.participants.filter(
          (participant) => participant.userId !== req.userId
        );
        if (remaining.length === 0) {
          await tx.conversation.delete({ where: { id: membership.conversationId } });
        } else if (membership.role === "OWNER") {
          const successor = remaining.find((participant) => participant.role === "ADMIN") || remaining[0];
          await tx.conversationParticipant.update({
            where: { id: successor.id },
            data: { role: "OWNER" },
          });
        }
      }

      await tx.user.delete({ where: { id: req.userId } });
    });

    const io = req.app.get("io");
    for (const socket of io?.sockets?.sockets?.values?.() || []) {
      if (socket.userId === req.userId) socket.disconnect(true);
    }

    res.json({ success: true });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    console.error("Account deletion error:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

module.exports = router;
