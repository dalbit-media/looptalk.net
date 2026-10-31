const prisma = require("../db/client");

const requireMember = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { isMember: true },
    });
    if (!user) return res.status(401).json({ error: "Account not found" });
    if (!user.isMember) {
      return res.status(403).json({
        error: "Join a network with an invitation to use this feature",
        code: "MEMBERSHIP_REQUIRED",
      });
    }
    return next();
  } catch (error) {
    console.error("Error verifying membership:", error);
    return res.status(500).json({ error: "Failed to verify membership" });
  }
};

module.exports = requireMember;
