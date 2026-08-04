require("dotenv").config();
const prisma = require("../src/db/client");
const { generateToken } = require("../src/utils/auth");

const apiOrigin = (process.env.SMOKE_API_URL || "http://localhost:3001").replace(/\/+$/, "");
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let reporterId;
let subjectId;
let conversationId;

const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(`${apiOrigin}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
};

const run = async () => {
  const [reporter, subject] = await Promise.all([
    prisma.user.create({
      data: { username: `smoke_reporter_${suffix}`, displayName: "Release Smoke Reporter" },
    }),
    prisma.user.create({
      data: { username: `smoke_subject_${suffix}`, displayName: "Release Smoke Subject" },
    }),
  ]);
  reporterId = reporter.id;
  subjectId = subject.id;
  const conversation = await prisma.conversation.create({
    data: {
      name: "Release smoke group",
      isGroupChat: true,
      participants: {
        create: [
          { userId: reporter.id, role: "OWNER" },
          { userId: subject.id, role: "MEMBER" },
        ],
      },
    },
  });
  conversationId = conversation.id;
  const token = generateToken(reporter.id);

  const report = await request("/api/reports", {
    token,
    method: "POST",
    body: JSON.stringify({ reportedUserId: subject.id, category: "SPAM" }),
  });
  if (report.response.status !== 201 || report.body?.status !== "OPEN") {
    throw new Error(`Report submission failed: ${report.response.status}`);
  }

  const duplicate = await request("/api/reports", {
    token,
    method: "POST",
    body: JSON.stringify({ reportedUserId: subject.id, category: "SPAM" }),
  });
  if (duplicate.response.status !== 409) {
    throw new Error(`Duplicate report was not rejected: ${duplicate.response.status}`);
  }

  const deletion = await request("/api/auth/account", {
    token,
    method: "DELETE",
    body: JSON.stringify({ confirmation: "DELETE" }),
  });
  if (deletion.response.status !== 200 || !deletion.body?.success) {
    throw new Error(`Account deletion failed: ${deletion.response.status}`);
  }

  const [deletedReporter, successor] = await Promise.all([
    prisma.user.findUnique({ where: { id: reporter.id } }),
    prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: conversation.id, userId: subject.id } },
    }),
  ]);
  if (deletedReporter || successor?.role !== "OWNER") {
    throw new Error("Account deletion did not remove the user and transfer ownership");
  }

  const rejectedToken = await request("/api/auth/me", { token });
  if (![403, 404].includes(rejectedToken.response.status)) {
    throw new Error(`Deleted account token remained usable: ${rejectedToken.response.status}`);
  }

  console.log("Release smoke probe OK: reports, duplicate guard, deletion, ownership transfer");
};

run()
  .finally(async () => {
    if (conversationId) {
      await prisma.conversation.deleteMany({ where: { id: conversationId } }).catch(() => {});
    }
    await prisma.report.deleteMany({
      where: { OR: [{ reporterId }, { reportedUserId: subjectId }] },
    }).catch(() => {});
    if (subjectId) await prisma.user.deleteMany({ where: { id: subjectId } }).catch(() => {});
    if (reporterId) await prisma.user.deleteMany({ where: { id: reporterId } }).catch(() => {});
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
