function isSafeClientId(clientId) {
  return typeof clientId === "string" && /^[A-Za-z0-9_-]+$/.test(clientId);
}

function requireClientId(req, res, next) {
  const clientId = req.method === "GET" ? req.query.clientId : req.body?.clientId;
  if (!isSafeClientId(clientId)) {
    return res.status(400).json({ error: "invalid clientId" });
  }
  next();
}

export { isSafeClientId, requireClientId };
