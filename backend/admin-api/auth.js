import { createHash, timingSafeEqual } from "node:crypto";

function configuredToken() {
  const token = process.env.ADMIN_TOKEN;
  if (typeof token !== "string" || token.length === 0) return null;
  return token;
}

function tokensMatch(presented, expected) {
  const left = createHash("sha256").update(presented, "utf8").digest();
  const right = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(left, right);
}

function requireAdmin(req, res, next) {
  const expected = configuredToken();
  if (!expected) {
    res.status(503).json({
      error: "Admin API is unavailable because ADMIN_TOKEN is not set"
    });
    return;
  }

  const header = req.headers.authorization;
  const presented = typeof header === "string" && header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
  if (presented === null || !tokensMatch(presented, expected)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  next();
}

function adminError(status, body) {
  const err = new Error(body.error || "admin request failed");
  err.status = status;
  err.body = body;
  return err;
}

export { requireAdmin, adminError };
