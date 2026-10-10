import { readKnobs, readEnvelope, SECTION_NAMES } from "../config/load.js";
import test from "node:test";
import assert from "node:assert/strict";
import { knobErrors, validateKnobs } from "./knobs.js";

function realSections() {
  const sections = {};
  for (const name of SECTION_NAMES) sections[name] = readEnvelope(name);
  return sections;
}

test("shipped knobs match section drafts", () => {
  const sections = realSections();
  assert.deepEqual(knobErrors(readKnobs(), sections), []);
  assert.equal(validateKnobs(readKnobs(), sections), true);
});

test("a knob path that finds nothing is an error", () => {
  const sections = {
    director: { draft: { low: 35 } }
  };
  const registry = {
    knobs: [
      {
        id: "director-missing",
        layer: "dialog",
        section: "director",
        path: "missing.threshold",
        label: "Нет такого поля",
        type: "number",
        min: 0,
        max: 100,
        description: "Путь, которого нет в черновике режиссёра."
      }
    ]
  };
  const errors = knobErrors(registry, sections);
  assert.ok(errors.some((line) => line.includes('path "missing.threshold" finds no value')));
  assert.throws(() => validateKnobs(registry, sections), /Knobs validation failed/);
});

test("a knob value outside its bounds is an error", () => {
  const sections = {
    director: { draft: { low: 150 } }
  };
  const registry = {
    knobs: [
      {
        id: "director-low",
        layer: "dialog",
        section: "director",
        path: "low",
        label: "Нижний порог терпения",
        type: "number",
        min: 0,
        max: 100,
        description: "Ниже этого числа терпение на исходе."
      }
    ]
  };
  const errors = knobErrors(registry, sections);
  assert.ok(errors.some((line) => line.includes("above max 100")));
});
