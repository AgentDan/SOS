import { readEnvelope, readKnobs } from "../config/load.js";
import { locate, matchesTemplate, valueErrors } from "../validation/knobs.js";
import { adminError } from "./auth.js";
import { appendJournal } from "./journal.js";
import { commitDraft } from "./sections.js";

function listKnobs() {
  const registry = readKnobs();
  const knobs = Array.isArray(registry.knobs) ? registry.knobs : [];
  const drafts = new Map();

  return knobs.map((knob) => {
    let values = [];
    if (knob && typeof knob.section === "string" && typeof knob.path === "string") {
      if (!drafts.has(knob.section)) {
        try {
          drafts.set(knob.section, readEnvelope(knob.section).draft);
        } catch {
          drafts.set(knob.section, undefined);
        }
      }
      const draft = drafts.get(knob.section);
      if (draft !== undefined) values = locate(draft, knob.path);
    }
    return { ...knob, values };
  });
}

function setPath(root, at, value) {
  const parts = at.split(".");
  let node = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (Array.isArray(node)) node = node[Number(part)];
    else node = node[part];
    if (node === undefined || node === null) {
      throw adminError(422, { errors: [`knobs: path "${at}" finds no value`] });
    }
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(node)) node[Number(last)] = value;
  else node[last] = value;
}

function updateKnob(id, at, value) {
  const registry = readKnobs();
  const knobs = Array.isArray(registry.knobs) ? registry.knobs : [];
  const knob = knobs.find((item) => item && item.id === id);
  if (!knob) throw adminError(404, { error: "unknown knob" });

  if (typeof at !== "string" || !matchesTemplate(knob.path, at)) {
    throw adminError(422, {
      errors: [`knobs: "${id}" at ${JSON.stringify(at)} does not match path "${knob.path}"`]
    });
  }

  const envelope = readEnvelope(knob.section);
  const found = locate(envelope.draft, knob.path).find((item) => item.at === at);
  if (!found) {
    throw adminError(422, { errors: [`knobs: "${id}" path "${at}" finds no value`] });
  }

  const problems = valueErrors(knob, value, at);
  if (problems.length > 0) throw adminError(422, { errors: problems });

  const draft = structuredClone(envelope.draft);
  setPath(draft, at, value);
  const result = commitDraft(knob.section, draft);
  appendJournal({
    action: "knob",
    section: knob.section,
    detail: { id, at, from: found.value, to: value, draftVersion: result.draftVersion }
  });
  return { draftVersion: result.draftVersion, id, at, value };
}

export { listKnobs, updateKnob };
