import { Router } from "express";
import { requireAdmin } from "../admin-api/auth.js";
import { healthReport } from "../admin-api/health.js";
import { readJournal } from "../admin-api/journal.js";
import { listKnobs, updateKnob } from "../admin-api/knobs.js";
import {
  getSection,
  isSection,
  listSections,
  publishSection,
  rollbackSection,
  sectionHistory,
  updateDraft
} from "../admin-api/sections.js";

const router = Router();
const admin = Router();

admin.use(requireAdmin);

function respond(res, next, fn) {
  try {
    res.json(fn());
  } catch (err) {
    if (err && Number.isInteger(err.status) && err.body) {
      res.status(err.status).json(err.body);
      return;
    }
    next(err);
  }
}

function plainObject(body) {
  return body !== null && typeof body === "object" && !Array.isArray(body);
}

admin.get("/sections", (req, res, next) => {
  respond(res, next, () => listSections());
});

admin.get("/sections/:name/history", (req, res, next) => {
  respond(res, next, () => sectionHistory(req.params.name));
});

admin.get("/sections/:name", (req, res, next) => {
  respond(res, next, () => getSection(req.params.name));
});

admin.put("/sections/:name/draft", (req, res, next) => {
  if (!isSection(req.params.name)) {
    res.status(404).json({ error: "unknown section" });
    return;
  }
  if (!plainObject(req.body) || !Object.hasOwn(req.body, "draft")) {
    res.status(400).json({ error: "draft is required" });
    return;
  }
  const baseDraftVersion = Object.hasOwn(req.body, "baseDraftVersion")
    ? req.body.baseDraftVersion
    : undefined;
  respond(res, next, () => updateDraft(req.params.name, req.body.draft, baseDraftVersion));
});

admin.post("/sections/:name/publish", (req, res, next) => {
  if (!isSection(req.params.name)) {
    res.status(404).json({ error: "unknown section" });
    return;
  }
  if (req.body !== undefined && !plainObject(req.body)) {
    res.status(400).json({ error: "invalid body" });
    return;
  }
  const description = req.body && Object.hasOwn(req.body, "description") ? req.body.description : "";
  if (typeof description !== "string") {
    res.status(400).json({ error: "description must be a string" });
    return;
  }
  respond(res, next, () => publishSection(req.params.name, description));
});

admin.post("/sections/:name/rollback", (req, res, next) => {
  if (!isSection(req.params.name)) {
    res.status(404).json({ error: "unknown section" });
    return;
  }
  if (!plainObject(req.body)) {
    res.status(400).json({ error: "invalid body" });
    return;
  }
  respond(res, next, () => rollbackSection(req.params.name, req.body.version));
});

admin.get("/health", (req, res) => {
  try {
    res.json(healthReport());
  } catch (err) {
    const errors = [err && err.message ? err.message : "health check failed"];
    res.json({
      draft: { ok: false, errors },
      published: { ok: false, errors },
      knobs: { ok: false, errors },
      dataVersion: null
    });
  }
});

admin.get("/journal", (req, res, next) => {
  respond(res, next, () => readJournal(req.query.limit));
});

admin.get("/knobs", (req, res, next) => {
  respond(res, next, () => listKnobs());
});

admin.put("/knobs/:id", (req, res, next) => {
  if (!plainObject(req.body) || !Object.hasOwn(req.body, "at") || !Object.hasOwn(req.body, "value")) {
    res.status(400).json({ error: "at and value are required" });
    return;
  }
  respond(res, next, () => updateKnob(req.params.id, req.body.at, req.body.value));
});

router.use("/admin", admin);

function invalidJsonHandler(err, req, res, next) {
  const path = req.originalUrl || req.path || "";
  if (err && err.type === "entity.parse.failed" && path.startsWith("/api/admin")) {
    res.status(400).json({ error: "invalid JSON" });
    return;
  }
  next(err);
}

export { invalidJsonHandler };
export default router;
