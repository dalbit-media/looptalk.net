const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.migrationOnly && !(req.baseUrl === "/api/auth" &&
        (["/legacy-data", "/migrate"].includes(req.path) ||
         (req.path === "/account" && req.method === "DELETE")))) {
      return res.status(426).json({ error: "Legacy session is restricted to explicit migration", code: "MIGRATION_REQUIRED" });
    }
    req.userId = decoded.id;
    res.set("Cache-Control", "no-store");
    if (!res.identitySanitized) {
      res.identitySanitized = true;
      const json = res.json.bind(res);
      res.json = (value) => json(require("../utils/privateAccounts").sanitizeIdentity(value));
    }
    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid token" });
  }
};

module.exports = authMiddleware;
