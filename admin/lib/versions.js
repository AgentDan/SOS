import { SECTIONS, sectionLabel } from "./sections.js";

const SECTION_ORDER = SECTIONS.map((pair) => pair[0]);
const ORDER_INDEX = new Map(SECTION_ORDER.map((name, index) => [name, index]));

const JOURNAL_FILTERS = {
  publish: new Set(["publish", "rollback"]),
  draft: new Set(["draft"]),
  model: new Set(["model"]),
  knob: new Set(["knob"])
};

function sectionCountText(count) {
  const numeric = Math.trunc(Number(count));
  const n = Number.isFinite(numeric) ? Math.abs(numeric) : 0;
  const mod100 = n % 100;
  const mod10 = n % 10;
  let word = "разделов";
  if (!(mod100 > 10 && mod100 < 20)) {
    if (mod10 === 1) word = "раздел";
    else if (mod10 >= 2 && mod10 <= 4) word = "раздела";
  }
  return `${n} ${word}`;
}

function unpublished(list) {
  if (!Array.isArray(list)) return [];
  const pending = new Map();
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (item.hasUnpublishedChanges !== true) continue;
    if (typeof item.name !== "string" || !ORDER_INDEX.has(item.name)) continue;
    pending.set(item.name, item);
  }
  return SECTION_ORDER.filter((name) => pending.has(name)).map((name) => {
    const item = pending.get(name);
    return {
      name,
      label: sectionLabel(name),
      draftVersion: item.draftVersion,
      publishedVersion: item.publishedVersion
    };
  });
}

function publishOrder(names) {
  if (!Array.isArray(names)) return [];
  const known = [];
  const unknown = [];
  const seen = new Set();
  for (const name of names) {
    if (typeof name !== "string" || name.length === 0 || seen.has(name)) continue;
    seen.add(name);
    if (ORDER_INDEX.has(name)) known.push(name);
    else unknown.push(name);
  }
  known.sort((left, right) => ORDER_INDEX.get(left) - ORDER_INDEX.get(right));
  return [...known, ...unknown];
}

function entriesOf(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry));
}

function filterJournal(entries, filter) {
  const list = entriesOf(entries);
  const allowed = JOURNAL_FILTERS[filter];
  if (!allowed) return list;
  return list.filter((entry) => allowed.has(entry.action));
}

function rollbackTarget(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  if (entry.action !== "publish" && entry.action !== "rollback") return null;
  if (typeof entry.section !== "string" || entry.section.length === 0) return null;
  const detail = entry.detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  if (!Number.isInteger(detail.publishedVersion)) return null;
  return { section: entry.section, version: detail.publishedVersion };
}

function namedResults(results) {
  if (!Array.isArray(results)) return [];
  return results.filter((item) => item && typeof item === "object" && typeof item.name === "string" && item.name.length > 0);
}

function publishReport(results) {
  const list = namedResults(results);
  const done = list.filter((item) => item.ok === true);
  const failed = list.filter((item) => item.ok !== true);
  const doneNames = done.map((item) => sectionLabel(item.name)).join(", ");
  let text = `Опубликовано ${done.length} из ${list.length}`;
  if (doneNames) text += `: ${doneNames}`;
  if (failed.length > 0) {
    const first = failed[0];
    const raw = typeof first.problem === "string" ? first.problem.split("\n")[0].trim() : "";
    const label = sectionLabel(first.name);
    text += raw ? `. ${label}: ${raw}` : `. ${label}`;
  }
  return { done, failed, text };
}

export { sectionCountText, unpublished, publishOrder, filterJournal, rollbackTarget, publishReport };
