const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../config/jwt");

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: "Sign in to continue." });

  const secret = getJwtSecret();
  if (!secret) {
    return res.status(503).json({ error: "JWT_SECRET must be set to a random string of at least 32 characters." });
  }

  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

module.exports = requireAuth;