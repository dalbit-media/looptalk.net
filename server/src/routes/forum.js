const express = require("express");
const rateLimit = require("express-rate-limit");
const prisma = require("../db/client");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
const PAGE_SIZE = 20;
const publicAuthor = { id: true, publicUsername: true, publicDisplayName: true };
const authorIdentity = (author) => ({
  id: author.id,
  name: author.publicDisplayName || author.publicUsername || author.id,
});
const pageOffset = (value = "1") =>
  typeof value === "string" && /^[1-9]\d{0,5}$/.test(value) ? (Number(value) - 1) * PAGE_SIZE : null;
const validText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.userId,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many forum updates. Please try again later." },
});
const VISIBILITIES = new Set(["contacts", "network", "public"]);
const VISIBILITY_ERROR = "Visibility must be contacts, network or public";
const memberOnly = (res) => res.status(403).json({ error: "Join with an invitation to participate", code: "MEMBERSHIP_REQUIRED" });
const pollSelection = (userId) => ({
  id: true,
  question: true,
  visibility: true,
  createdAt: true,
  author: { select: publicAuthor },
  options: { orderBy: { position: "asc" }, select: { id: true, text: true } },
  votes: { where: { userId }, select: { optionId: true } },
});
const pollSummary = ({ votes, author, ...poll }) => ({
  ...poll,
  author: authorIdentity(author),
  myOptionId: votes[0]?.optionId || null,
});

router.use(authMiddleware);
router.use(async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isMember: true } });
    if (!user) return res.status(401).json({ error: "Invalid token" });
    req.isMember = user.isMember;
    next();
  } catch (error) {
    console.error("Forum membership error:", error);
    res.status(500).json({ error: "Failed to verify membership" });
  }
});

router.get("/polls", async (req, res) => {
  const skip = pageOffset(req.query.page);
  if (skip === null) return res.status(400).json({ error: "Invalid page" });
  const scope = req.query.scope ?? "public";
  if (!["public", "network", "loop"].includes(scope)) return res.status(400).json({ error: "Invalid scope" });
  if (scope !== "public" && !req.isMember) return memberOnly(res);
  try {
    // The server does not know contacts; "loop" returns every post and the device keeps those from the user's contacts.
    const polls = await prisma.forumPoll.findMany({
      where: scope === "loop" ? undefined : { visibility: scope },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: PAGE_SIZE + 1,
      select: pollSelection(req.userId),
    });
    res.json({ polls: polls.slice(0, PAGE_SIZE).map(pollSummary), hasMore: polls.length > PAGE_SIZE });
  } catch (error) {
    console.error("Forum list error:", error);
    res.status(500).json({ error: "Failed to load polls" });
  }
});

router.post("/polls", writeLimiter, async (req, res) => {
  const { question, options, visibility = "contacts" } = req.body || {};
  if (!VISIBILITIES.has(visibility)) return res.status(400).json({ error: VISIBILITY_ERROR });
  if (!req.isMember && visibility !== "public") return memberOnly(res);
  if (!validText(question, 300) || !Array.isArray(options) || options.length < 1 || options.length > 10 ||
      options.some((option) => !validText(option, 120)) ||
      new Set(options.map((option) => option.trim().toLowerCase())).size !== options.length) {
    return res.status(400).json({ error: "Provide a question (1-300 characters) and 1-10 distinct options (1-120 characters each)" });
  }
  try {
    const poll = await prisma.forumPoll.create({
      data: {
        authorId: req.userId,
        question: question.trim(),
        visibility,
        options: { create: options.map((text, position) => ({ text: text.trim(), position })) },
      },
      select: pollSelection(req.userId),
    });
    res.status(201).json(pollSummary(poll));
  } catch (error) {
    console.error("Forum creation error:", error);
    res.status(500).json({ error: "Failed to create poll" });
  }
});

router.patch("/polls/:id/visibility", writeLimiter, async (req, res) => {
  const { visibility } = req.body || {};
  if (!VISIBILITIES.has(visibility)) return res.status(400).json({ error: VISIBILITY_ERROR });
  if (!req.isMember && visibility !== "public") return memberOnly(res);
  try {
    const poll = await prisma.forumPoll.findUnique({ where: { id: req.params.id }, select: { authorId: true } });
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    if (poll.authorId !== req.userId) return res.status(403).json({ error: "Only the author can change visibility" });
    await prisma.forumPoll.update({ where: { id: req.params.id }, data: { visibility } });
    res.json({ visibility });
  } catch (error) {
    console.error("Forum visibility error:", error);
    res.status(500).json({ error: "Failed to update visibility" });
  }
});

router.get("/polls/:id", async (req, res) => {
  try {
    const poll = await prisma.forumPoll.findUnique({
      where: { id: req.params.id }, select: pollSelection(req.userId),
    });
    if (!poll || (!req.isMember && poll.visibility !== "public")) return res.status(404).json({ error: "Poll not found" });
    const summary = pollSummary(poll);
    if (summary.myOptionId) {
      const counts = await prisma.forumVote.groupBy({
        by: ["optionId"], where: { pollId: poll.id }, _count: { _all: true },
      });
      summary.results = summary.options.map((option) => ({
        optionId: option.id, votes: counts.find((count) => count.optionId === option.id)?._count._all || 0,
      }));
      summary.totalVotes = summary.results.reduce((sum, result) => sum + result.votes, 0);
    }
    res.json(summary);
  } catch (error) {
    console.error("Forum detail error:", error);
    res.status(500).json({ error: "Failed to load poll" });
  }
});

router.post("/polls/:id/vote", writeLimiter, async (req, res) => {
  if (!req.isMember) return memberOnly(res);
  const { optionId } = req.body || {};
  if (typeof optionId !== "string" || !optionId || optionId.length > 100) {
    return res.status(400).json({ error: "A valid option is required" });
  }
  try {
    const poll = await prisma.forumPoll.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    const option = await prisma.forumOption.findFirst({ where: { id: optionId, pollId: poll.id }, select: { id: true } });
    if (!option) return res.status(400).json({ error: "Option does not belong to this poll" });
    await prisma.forumVote.create({ data: { pollId: poll.id, optionId, userId: req.userId } });
    res.status(201).json({ myOptionId: optionId });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "You have already voted. Votes are final." });
    console.error("Forum vote error:", error);
    res.status(500).json({ error: "Failed to vote" });
  }
});

const requireParticipant = async (req, res, next) => {
  if (!req.isMember) return memberOnly(res);
  try {
    const poll = await prisma.forumPoll.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    const vote = await prisma.forumVote.findUnique({
      where: { pollId_userId: { pollId: poll.id, userId: req.userId } }, select: { id: true },
    });
    if (!vote) return res.status(403).json({ error: "Vote in this poll to access comments", code: "PARTICIPATION_REQUIRED" });
    next();
  } catch (error) {
    console.error("Forum participation check error:", error);
    res.status(500).json({ error: "Failed to verify participation" });
  }
};

router.get("/polls/:id/comments", requireParticipant, async (req, res) => {
  const skip = pageOffset(req.query.page);
  if (skip === null) return res.status(400).json({ error: "Invalid page" });
  try {
    const comments = await prisma.forumComment.findMany({
      where: { pollId: req.params.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip, take: PAGE_SIZE + 1,
      select: { id: true, content: true, createdAt: true, author: { select: publicAuthor } },
    });
    res.json({
      comments: comments.slice(0, PAGE_SIZE).map(({ author, ...comment }) => ({ ...comment, author: authorIdentity(author) })),
      hasMore: comments.length > PAGE_SIZE,
    });
  } catch (error) {
    console.error("Forum comments error:", error);
    res.status(500).json({ error: "Failed to load comments" });
  }
});

router.post("/polls/:id/comments", writeLimiter, requireParticipant, async (req, res) => {
  const { content } = req.body || {};
  if (!validText(content, 2000)) return res.status(400).json({ error: "Comment must contain 1-2000 characters" });
  try {
    const { author, ...comment } = await prisma.forumComment.create({
      data: { pollId: req.params.id, authorId: req.userId, content: content.trim() },
      select: { id: true, content: true, createdAt: true, author: { select: publicAuthor } },
    });
    res.status(201).json({ ...comment, author: authorIdentity(author) });
  } catch (error) {
    console.error("Forum comment creation error:", error);
    res.status(500).json({ error: "Failed to post comment" });
  }
});

module.exports = router;
