import { isDeepStrictEqual } from "node:util";
import { SECTION_NAMES, readEnvelope } from "../config/load.js";
import { publish, rollback, writeDraft } from "../config/publish.js";
import { validateDialogData } from "../validation/index.js";
import { adminError } from "./auth.js";
import { appendJournal } from "./journal.js";

const HISTORY_FIELDS = ["version", "date", "description", "rolledBackTo"];

function isSection(name) {
  return SECTION_NAMES.includes(name);
}

function loadSections() {
  const sections = {};
  for (const name of SECTION_NAMES) {
    sections[name] = readEnvelope(name);
  }
  return sections;
}

function toDialogData(sections) {
  return {
    questionnaire: sections.questionnaire,
    catalog: sections.catalog,
    consultant: sections.consultant,
    director: sections.director,
    sales: sections.sales,
    commands: sections.commands,
    aiRules: sections["ai-rules"]
  };
}

function sectionAsLayer(envelope, draft) {
  const copy = {
    section: envelope.section,
    draftVersion: envelope.draftVersion,
    publishedVersion: envelope.publishedVersion,
    history: envelope.history,
    draft,
    published: envelope.published
  };
  if (
    envelope.section === "catalog" &&
    draft &&
    typeof draft === "object" &&
    Array.isArray(draft.products)
  ) {
    Object.defineProperty(copy, "skuFileNames", {
      value: draft.products.map((product) => `${product && product.sku}.json`),
      enumerable: false
    });
  }
  return copy;
}

function splitErrors(message) {
  const parts = String(message).split("\n  - ");
  if (parts.length === 1) return [parts[0]];
  return parts.slice(1);
}

function isDialogValidation(err) {
  return err instanceof Error && err.message.startsWith("Dialog data validation failed:");
}

function publicHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => {
    const out = {};
    for (const key of HISTORY_FIELDS) {
      if (entry && entry[key] !== undefined) out[key] = entry[key];
    }
    return out;
  });
}

function assertSection(name) {
  if (!isSection(name)) throw adminError(404, { error: "unknown section" });
}

function listSections() {
  return SECTION_NAMES.map((name) => {
    const envelope = readEnvelope(name);
    const published = envelope.published;
    return {
      name,
      draftVersion: envelope.draftVersion,
      publishedVersion: envelope.publishedVersion,
      hasUnpublishedChanges: published === undefined || !isDeepStrictEqual(envelope.draft, published)
    };
  });
}

function getSection(name) {
  assertSection(name);
  const envelope = readEnvelope(name);
  return {
    name,
    draftVersion: envelope.draftVersion,
    publishedVersion: envelope.publishedVersion,
    draft: envelope.draft,
    published: envelope.published,
    history: publicHistory(envelope.history)
  };
}

function sectionHistory(name) {
  assertSection(name);
  return publicHistory(readEnvelope(name).history);
}

function commitDraft(name, draft, baseDraftVersion) {
  assertSection(name);
  const sections = loadSections();
  sections[name] = sectionAsLayer(sections[name], draft);
  try {
    validateDialogData(toDialogData(sections));
  } catch (err) {
    if (isDialogValidation(err)) throw adminError(422, { errors: splitErrors(err.message) });
    throw err;
  }

  const current = readEnvelope(name).draftVersion;
  if (baseDraftVersion !== undefined && baseDraftVersion !== current) {
    throw adminError(409, { error: "draft version conflict" });
  }

  return writeDraft(name, draft);
}

function updateDraft(name, draft, baseDraftVersion) {
  const result = commitDraft(name, draft, baseDraftVersion);
  appendJournal({
    action: "draft",
    section: name,
    detail: { draftVersion: result.draftVersion }
  });
  return { draftVersion: result.draftVersion };
}

function publishSection(name, description) {
  assertSection(name);
  let result;
  try {
    result = publish(name, description);
  } catch (err) {
    if (isDialogValidation(err)) throw adminError(422, { errors: splitErrors(err.message) });
    throw err;
  }
  appendJournal({
    action: "publish",
    section: name,
    detail: { publishedVersion: result.publishedVersion, description }
  });
  return result;
}

function rollbackSection(name, version) {
  assertSection(name);
  let result;
  try {
    result = rollback(name, version);
  } catch (err) {
    if (isDialogValidation(err)) throw adminError(422, { errors: splitErrors(err.message) });
    if (
      err instanceof Error &&
      (err.message.includes("snapshot for version") || err.message.includes("version must be an integer"))
    ) {
      throw adminError(422, { error: err.message });
    }
    throw err;
  }
  appendJournal({
    action: "rollback",
    section: name,
    detail: {
      publishedVersion: result.publishedVersion,
      version,
      description: `rollback to v${version}`
    }
  });
  return result;
}

export {
  isSection,
  loadSections,
  toDialogData,
  sectionAsLayer,
  splitErrors,
  listSections,
  getSection,
  sectionHistory,
  commitDraft,
  updateDraft,
  publishSection,
  rollbackSection
};
