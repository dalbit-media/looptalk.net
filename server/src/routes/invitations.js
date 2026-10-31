const express = require("express");
const prisma = require("../db/client");
const authMiddleware = require("../middleware/auth");
const requireMember = require("../middleware/requireMember");
const { normalizeInvitationCode, validInvitationCode, createInvitationCode } = require("../utils/invitationCode");
const sharp = require("sharp");
const { createInvitationMapHandler } = require("../utils/invitationMap");
const { opaqueUser } = require("../utils/privateAccounts");

const router = express.Router();
const invitationMap = createInvitationMapHandler(prisma);
router.get("/map", invitationMap);
router.get("/map/traffic", invitationMap.traffic);

// Global cap on invitations created platform-wide in a rolling 24h window,
// configurable via env since it depends on deployment scale/abuse tolerance.
const DAILY_INVITATION_LIMIT = parseInt(process.env.DAILY_INVITATION_LIMIT, 10) || 1000;
// Per-user cap over the same rolling window, to stop a single account from
// mass-generating codes.
const PER_USER_INVITATION_LIMIT = 5;
const INVITATION_THROTTLE_WINDOW_MS = 24 * 60 * 60 * 1000;
const privateIssuance = new Map();
const inviterSelect = { id: true, publicUsername: true, publicDisplayName: true };
const lookupInvitation = async (code) => {
  const privateInvitation = await prisma.privateInvitation.findUnique({ where: { code } });
  if (privateInvitation) {
    const owner = privateInvitation.inviterId
      ? await prisma.user.findUnique({ where: { id: privateInvitation.inviterId }, select: inviterSelect })
      : null;
    const inviter = owner ? opaqueUser(owner) : null;
    return {
      ...privateInvitation,
      inviter: inviter ? { username: inviter.username, displayName: privateInvitation.inviterDisplayName || inviter.displayName } : null,
    };
  }
  const invitation = await prisma.invitation.findUnique({
    where: { code }, include: { inviter: { select: inviterSelect } },
  });
  if (!invitation) return null;
  const inviter = opaqueUser(invitation.inviter);
  return { ...invitation, inviter: { username: inviter.username, displayName: inviter.displayName } };
};
const inviterLabel = (inviter) => inviter ? `${inviter.displayName} (${inviter.username})` : "LoopTalk";

const PREVIEW_COPY = {
  ko: {
    brand: "루프톡",
    eyebrow: "초대 전용 · 비공개 중심",
    headline: ["가까운 사람들과,", "걱정 없이."],
    description: "신뢰하는 사람들과 나누는 안전하고 사적인 대화",
    invite: "초대 코드",
  },
  ja: {
    brand: "ループトーク",
    eyebrow: "招待制 · プライバシー重視",
    headline: ["大切な人と、", "安心してつながる。"],
    description: "信頼できる人たちとの、安全でプライベートな会話",
    invite: "招待コード",
  },
  en: {
    brand: "LoopTalk",
    eyebrow: "INVITATION ONLY · PRIVATE BY DESIGN",
    headline: ["Stay close.", "Communicate worry-free."],
    description: "Secure, private conversations with the people you trust.",
    invite: "INVITE",
  },
};
const LANDING_COPY = {
  ko: {
    title: "루프톡 초대가 도착했습니다",
    description: "가까운 사람들과 안전하고 사적으로 대화하세요.",
    unavailableTitle: "사용할 수 없는 루프톡 초대입니다",
    unavailableDescription: "이미 사용했거나 만료된 초대입니다.",
    open: "루프톡 초대 열기",
    imageAlt: "루프톡 초대",
    invitedBy: "님이 초대했습니다",
    accept: "수락",
    decline: "거절",
    expiresIn: "남은 시간",
    expired: "초대가 만료되었습니다",
    declined: "초대를 거절했습니다. 이 창을 닫아도 됩니다.",
  },
  ja: {
    title: "ループトークへの招待が届きました",
    description: "大切な人たちと、安全でプライベートに会話しましょう。",
    unavailableTitle: "このループトーク招待は利用できません",
    unavailableDescription: "この招待は使用済みか、有効期限が切れています。",
    open: "ループトークの招待を開く",
    imageAlt: "ループトークへの招待",
    invitedBy: "さんからの招待",
    accept: "承諾",
    decline: "辞退",
    expiresIn: "有効期限まで",
    expired: "招待の有効期限が切れました",
    declined: "招待を辞退しました。この画面を閉じてもかまいません。",
  },
  en: {
    title: "You're invited to LoopTalk",
    description: "Communicate securely and privately with the people you trust.",
    unavailableTitle: "LoopTalk invitation unavailable",
    unavailableDescription: "This invitation has already been used or has expired.",
    open: "Open LoopTalk invitation",
    imageAlt: "LoopTalk invitation",
    invitedBy: "invited you",
    accept: "Accept",
    decline: "Decline",
    expiresIn: "Expires in",
    expired: "Invitation expired",
    declined: "Invitation declined. You can close this window.",
  },
};

const normalizeLanguage = () => "ko";
const getRequestLanguage = () => "ko";
const getRequestOrigin = (req) => `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
const getInvitationUrl = (code, language = "ko", req) => (
  `${getRequestOrigin(req)}/api/invitations/open/${encodeURIComponent(code)}?lang=${normalizeLanguage(language)}`
);
const getPreviewUrl = (code, language = "ko", req) => (
  `${getRequestOrigin(req)}/api/invitations/${encodeURIComponent(code)}/preview.png?lang=${normalizeLanguage(language)}`
);
const getWebRegistrationUrl = (code, req) => {
  const clientUrl = new URL(
    process.env.WEB_CLIENT_URL || "/app/",
    `${getRequestOrigin(req)}/`
  );
  clientUrl.pathname = `${clientUrl.pathname.replace(/\/?$/, "/")}register`;
  clientUrl.searchParams.set("code", code);
  return clientUrl.toString();
};

const escapeHtml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const getInvitationStatus = (invitation) => {
  if (invitation.status !== "PENDING") return "USED";
  return new Date() > invitation.expiresAt ? "EXPIRED" : "CREATED";
};

const getInvitationStats = async (inviterId) => {
  const owner = await prisma.user.findUnique({ where: { id: inviterId }, select: { authPublicKey: true } });
  if (owner?.authPublicKey) {
    const [linksShared, acceptedUsers] = await Promise.all([
      prisma.privateInvitation.count({ where: { inviterId } }),
      prisma.privateInvitation.count({ where: { inviterId, status: "ACCEPTED" } }),
    ]);
    return { linksShared, acceptedUsers, connections: 0, recentConnections: 0 };
  }
  const recentThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [linksShared, acceptedUsers, contactEdges] = await Promise.all([
    prisma.invitation.count({ where: { inviterId } }),
    prisma.invitation.count({ where: { inviterId, status: "ACCEPTED" } }),
    prisma.contact.findMany({
      where: { OR: [{ userId: inviterId }, { contactUserId: inviterId }] },
      select: { userId: true, contactUserId: true, createdAt: true },
    }),
  ]);
  const connectionIds = new Set();
  const recentConnectionIds = new Set();
  contactEdges.forEach((contact) => {
    const connectionId = contact.userId === inviterId
      ? contact.contactUserId
      : contact.userId;
    connectionIds.add(connectionId);
    if (contact.createdAt >= recentThreshold) recentConnectionIds.add(connectionId);
  });
  return {
    linksShared,
    acceptedUsers,
    connections: connectionIds.size,
    recentConnections: recentConnectionIds.size,
  };
};

// Get invitation and connection activity for the current user
router.get("/stats", authMiddleware, requireMember, async (req, res) => {
  try {
    res.json(await getInvitationStats(req.userId));
  } catch (error) {
    console.error("Error fetching invitation stats:", error);
    res.status(500).json({ error: "Failed to fetch invitation stats" });
  }
});

// Create invitation
router.post("/create", authMiddleware, requireMember, async (req, res) => {
  try {
    if (req.body && Object.keys(req.body).some((key) => !["language", "inviterDisplayName"].includes(key))) {
      return require("../utils/privateAccounts").upgradeRequired(res);
    }
    const displayName = req.body?.inviterDisplayName;
    if (displayName !== undefined && (typeof displayName !== "string" ||
        !displayName.trim() || displayName.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(displayName))) {
      return res.status(400).json({ error: "Inviter display name must contain 1–100 characters without control characters" });
    }
    const owner = await prisma.user.findUnique({ where: { id: req.userId }, select: { authPublicKey: true } });
    if (owner?.authPublicKey) {
      const now = Date.now();
      for (const [id, record] of privateIssuance) {
        if (record.start <= now - INVITATION_THROTTLE_WINDOW_MS) privateIssuance.delete(id);
      }
      const issued = privateIssuance.get(req.userId) || { start: now, count: 0 };
      if (issued.count >= PER_USER_INVITATION_LIMIT || privateIssuance.size >= 10000) {
        return res.status(429).json({ error: "Invitation rate limit reached" });
      }
      // Reserve synchronously before any database await so concurrent requests
      // cannot each observe an unused per-owner allowance.
      issued.count += 1;
      privateIssuance.set(req.userId, issued);
      const counts = await Promise.all([prisma.privateInvitation, prisma.invitation].map((model) => model.count({
        where: { createdAt: { gte: new Date(now - INVITATION_THROTTLE_WINDOW_MS) } },
      })));
      const recent = counts.reduce((sum, count) => sum + count, 0);
      if (recent >= DAILY_INVITATION_LIMIT) return res.status(429).json({ error: "Daily invitation limit reached" });
      const code = await createInvitationCode(prisma);
      const invitation = await prisma.privateInvitation.create({
        data: {
          code, inviterId: req.userId, inviterDisplayName: displayName?.trim() || null,
          expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
        },
      });
      const language = getRequestLanguage(req);
      return res.status(201).json({
        id: code, code, status: "CREATED", createdAt: invitation.createdAt, expiresAt: invitation.expiresAt,
        invitationUrl: getInvitationUrl(code, language, req),
        previewImageUrl: getPreviewUrl(code, language, req),
        stats: await getInvitationStats(req.userId),
      });
    }
    const windowStart = new Date(Date.now() - INVITATION_THROTTLE_WINDOW_MS);
    const [userRecentCount, totalRecentCount] = await Promise.all([
      prisma.invitation.count({
        where: { inviterId: req.userId, createdAt: { gte: windowStart } },
      }),
      prisma.invitation.count({
        where: { createdAt: { gte: windowStart } },
      }),
    ]);

    if (userRecentCount >= PER_USER_INVITATION_LIMIT) {
      return res.status(429).json({
        error: `You can only generate up to ${PER_USER_INVITATION_LIMIT} invitations within 24 hours.`,
      });
    }
    if (totalRecentCount >= DAILY_INVITATION_LIMIT) {
      return res.status(429).json({
        error: "The daily invitation limit has been reached. Please try again later.",
      });
    }

    const language = getRequestLanguage(req);
    const code = await createInvitationCode(prisma);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        inviterId: req.userId,
        code,
        expiresAt,
      },
    });
    const stats = await getInvitationStats(req.userId);

    res.status(201).json({
      code: invitation.code,
      invitationUrl: getInvitationUrl(invitation.code, language, req),
      previewImageUrl: getPreviewUrl(invitation.code, language, req),
      expiresAt: invitation.expiresAt,
      stats,
    });
  } catch (error) {
    console.error("Error creating invitation:", error);
    res.status(500).json({ error: "Failed to create invitation" });
  }
});

router.get("/:code/preview.png", async (req, res) => {
  const code = normalizeInvitationCode(req.params.code);
  if (!validInvitationCode(code)) {
    return res.status(400).json({ error: "Invalid invitation code" });
  }

  const language = getRequestLanguage(req);
  const copy = PREVIEW_COPY[language];

  const invitation = await lookupInvitation(code);
  if (!invitation) return res.status(404).json({ error: "Invitation not found" });

  const safeCode = escapeHtml(code);
  const headline = copy.headline.map((line, index) => (
    `<text x="112" y="${282 + index * 52}" fill="#111827" font-family="Arial, sans-serif" font-size="43" font-weight="700">${escapeHtml(line)}</text>`
  )).join("");
  const preview = `
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#F7FAFC"/>
      <rect x="64" y="48" width="1072" height="534" rx="20" fill="#FFFFFF" stroke="#D8E2EC" stroke-width="2"/>
      <text x="112" y="128" fill="#111827" font-family="Arial, sans-serif" font-size="46" font-weight="700">${escapeHtml(copy.brand)}</text>
      <rect x="112" y="174" width="430" height="38" rx="8" fill="#E8F2FF"/>
      <text x="130" y="200" fill="#0066CC" font-family="Arial, sans-serif" font-size="18" font-weight="700">${escapeHtml(copy.eyebrow)}</text>
      ${headline}
      <text x="112" y="380" fill="#52606D" font-family="Arial, sans-serif" font-size="21">${escapeHtml(copy.description)}</text>
      <rect x="112" y="430" width="310" height="42" rx="8" fill="#FFF4E5"/>
      <text x="130" y="459" fill="#9A5B00" font-family="Arial, sans-serif" font-size="19" font-weight="700">${escapeHtml(copy.invite)} ${safeCode}</text>
      <rect x="702" y="126" width="322" height="322" rx="26" fill="#E8F2FF" stroke="#80BFFF" stroke-width="2"/>
      <line x1="760" y1="318" x2="966" y2="318" stroke="#007AFF" stroke-width="5" opacity="0.35"/>
      <circle cx="756" cy="318" r="35" fill="#FFFFFF" stroke="#007AFF" stroke-width="4"/>
      <circle cx="970" cy="318" r="35" fill="#FFFFFF" stroke="#007AFF" stroke-width="4"/>
      <circle cx="756" cy="307" r="9" fill="#007AFF"/><path d="M738 332c3-13 33-13 36 0" fill="#007AFF"/>
      <circle cx="970" cy="307" r="9" fill="#007AFF"/><path d="M952 332c3-13 33-13 36 0" fill="#007AFF"/>
      <rect x="813" y="225" width="102" height="82" rx="12" fill="#FFFFFF"/>
      <path d="M829 245h70v45h-70z" fill="#007AFF"/><path d="M829 245l35 28 35-28" fill="none" stroke="#FFFFFF" stroke-width="5"/>
      <circle cx="910" cy="299" r="18" fill="#007AFF"/><path d="M901 299l6 6 12-14" fill="none" stroke="#FFFFFF" stroke-width="4"/>
    </svg>`;

  try {
    const image = await sharp(Buffer.from(preview)).png().toBuffer();
    res.set({
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    });
    res.send(image);
  } catch (error) {
    console.error("Invitation preview error:", error);
    res.status(500).json({ error: "Failed to generate invitation preview" });
  }
});

router.get("/open/:code", async (req, res) => {
  const code = normalizeInvitationCode(req.params.code);
  if (!validInvitationCode(code)) {
    return res.status(400).send("Invalid invitation code");
  }

  const invitation = await lookupInvitation(code);
  if (!invitation) return res.status(404).send("Invitation not found");

  const language = getRequestLanguage(req);
  const copy = LANDING_COPY[language];
  const safeCode = escapeHtml(code);
  const webRegistrationUrl = getWebRegistrationUrl(code, req);
  const previewUrl = getPreviewUrl(safeCode, language, req);
  const isAvailable = getInvitationStatus(invitation) === "CREATED";
  const title = isAvailable ? copy.title : copy.unavailableTitle;
  const description = isAvailable
    ? copy.description
    : copy.unavailableDescription;

  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'nonce-${res.locals.cspNonce}'; base-uri 'none'`
  );
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.type("html").send(`<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#f4f1e8">
    <script nonce="${escapeHtml(res.locals.cspNonce)}" src="/site/theme.js"></script>
    <link rel="stylesheet" href="/site/theme.css">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${escapeHtml(previewUrl)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--paper); color: var(--ink); font-family: "Trebuchet MS", "Segoe UI", sans-serif; }
      main { width: min(560px, calc(100% - 48px)); margin: 32px auto; padding: clamp(24px, 5vw, 48px); border: 1px solid var(--line); border-radius: 20px; background: var(--white); text-align: center; overflow-wrap: anywhere; word-break: keep-all; }
      .brand { display: inline-flex; align-items: center; gap: 10px; margin-bottom: 32px; color: var(--ink); font-family: Georgia, "Times New Roman", serif; font-size: 24px; font-weight: 700; text-decoration: none; }
      .brand img { width: 40px; height: 40px; }
      .envelope { position: relative; width: 104px; height: 76px; margin: 0 auto 24px; border-radius: 10px; background: var(--loop-accent); }
      .envelope::before { content: ""; position: absolute; inset: 0; background: linear-gradient(145deg, transparent 48%, white 49% 52%, transparent 53%), linear-gradient(215deg, transparent 48%, white 49% 52%, transparent 53%); }
      .inviter { margin: 0 0 12px; color: var(--ink); font-weight: 700; }
      h1 { margin: 28px 0 10px; font-size: 30px; font-weight: 700; letter-spacing: -.04em; }
      p { color: var(--muted); line-height: 1.65; }
      .actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; margin-top: 18px; }
      .actions a, .actions button { margin: 0; min-width: 112px; border: 0; padding: 14px 22px; border-radius: 8px; font: inherit; font-weight: 700; cursor: pointer; }
      .actions a { background: var(--loop-accent); color: var(--loop-on-accent); text-decoration: none; }
      .actions button { background: var(--loop-soft); color: var(--ink); }
      :focus-visible { outline: 3px solid var(--coral); outline-offset: 4px; }
      #countdown { padding: 12px 14px; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); font-variant-numeric: tabular-nums; }
    </style>
  </head>
  <body class="site-page">
    <main>
      <a class="brand" href="/"><img src="/site/app-icon.svg" alt="" width="40" height="40">${escapeHtml(PREVIEW_COPY[language].brand)}</a>
      <div class="envelope" role="img" aria-label="${escapeHtml(copy.imageAlt)}"></div>
      <p class="inviter">${escapeHtml(inviterLabel(invitation.inviter))}${language === "en" ? " " : ""}${escapeHtml(copy.invitedBy)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p id="description">${escapeHtml(description)}</p>
      ${isAvailable ? `<div class="actions"><a id="accept" href="${escapeHtml(webRegistrationUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.accept)}</a><button id="decline" type="button">${escapeHtml(copy.decline)}</button><span id="countdown">${escapeHtml(copy.expiresIn)}</span></div>` : ""}
    </main>
    ${isAvailable ? `<script nonce="${escapeHtml(res.locals.cspNonce)}">
      const expiresAt = ${JSON.stringify(invitation.expiresAt.toISOString())};
      const countdown = document.getElementById("countdown");
      const accept = document.getElementById("accept");
      const decline = document.getElementById("decline");
      const description = document.getElementById("description");
      const updateCountdown = function () {
        const remaining = new Date(expiresAt).getTime() - Date.now();
        if (remaining <= 0) {
          countdown.textContent = ${JSON.stringify(copy.expired)};
          accept.removeAttribute("href");
          accept.style.opacity = "0.45";
          decline.disabled = true;
          return;
        }
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        countdown.textContent = ${JSON.stringify(copy.expiresIn + " ")} +
          String(hours).padStart(2, "0") + ":" +
          String(minutes).padStart(2, "0") + ":" +
          String(seconds).padStart(2, "0");
      };
      decline.addEventListener("click", function () {
        document.querySelector(".actions").remove();
        description.textContent = ${JSON.stringify(copy.declined)};
      });
      updateCountdown();
      setInterval(updateCountdown, 1000);
    </script>` : ""}
  </body>
</html>`);
});

// Get invitation info
router.get("/:code", async (req, res) => {
  try {
    const code = normalizeInvitationCode(req.params.code);
    if (!validInvitationCode(code)) {
      return res.status(400).json({ error: "Invalid invitation code" });
    }

    const invitation = await lookupInvitation(code);

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    res.set("Cache-Control", "no-store");
    res.json({
      code,
      status: invitation.status !== "PENDING" ? "ACCEPTED" :
        new Date() > invitation.expiresAt ? "EXPIRED" : "PENDING",
      expiresAt: invitation.expiresAt,
      inviter: invitation.inviter,
    });
  } catch (error) {
    console.error("Error fetching invitation:", error);
    res.status(500).json({ error: "Failed to fetch invitation" });
  }
});

// List invitations sent by user
router.get("/", authMiddleware, requireMember, async (req, res) => {
  try {
    const owner = await prisma.user.findUnique({ where: { id: req.userId }, select: { authPublicKey: true } });
    if (owner?.authPublicKey) return res.json([]);
    const language = getRequestLanguage(req);
    const invitations = await prisma.invitation.findMany({
      where: { inviterId: req.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    res.json(invitations.map((invitation) => ({
      id: invitation.id,
      code: invitation.code,
      status: getInvitationStatus(invitation),
      invitationUrl: getInvitationUrl(invitation.code, language, req),
      previewImageUrl: getPreviewUrl(invitation.code, language, req),
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    })));
  } catch (error) {
    console.error("Error fetching invitations:", error);
    res.status(500).json({ error: "Failed to fetch invitations" });
  }
});

module.exports = router;
