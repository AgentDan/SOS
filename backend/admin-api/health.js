import { readDataVersion, readKnobs } from "../config/load.js";
import { validateDialogData } from "../validation/index.js";
import { knobErrors } from "../validation/knobs.js";
import { loadSections, sectionAsLayer, splitErrors, toDialogData } from "./sections.js";

function layerReport(check) {
  try {
    check();
    return { ok: true, errors: [] };
  } catch (err) {
    return { ok: false, errors: splitErrors(err.message) };
  }
}

function healthReport() {
  const report = {
    draft: { ok: false, errors: [] },
    published: { ok: false, errors: [] },
    knobs: { ok: false, errors: [] },
    dataVersion: null
  };

  let sections;
  try {
    sections = loadSections();
  } catch (err) {
    const errors = [err.message];
    report.draft.errors = errors;
    report.published.errors = errors;
  }

  if (sections) {
    report.draft = layerReport(() => validateDialogData(toDialogData(sections)));
    const published = {};
    for (const [name, envelope] of Object.entries(sections)) {
      published[name] = sectionAsLayer(envelope, envelope.published);
    }
    report.published = layerReport(() => validateDialogData(toDialogData(published)));
  }

  try {
    report.dataVersion = readDataVersion();
  } catch {
    report.dataVersion = null;
  }

  try {
    const registry = readKnobs();
    if (!sections) {
      report.knobs = { ok: false, errors: ["sections unavailable"] };
    } else {
      const errors = knobErrors(registry, sections);
      report.knobs = { ok: errors.length === 0, errors };
    }
  } catch (err) {
    report.knobs = { ok: false, errors: [err.message] };
  }

  return report;
}

export { healthReport };
