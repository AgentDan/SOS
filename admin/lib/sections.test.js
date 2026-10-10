import test from "node:test";
import assert from "node:assert/strict";
import { sectionLabel, labelSections } from "./sections.js";

test("section names are shown in Russian", () => {
  assert.equal(sectionLabel("questionnaire"), "Анкета");
  assert.equal(sectionLabel("catalog"), "Каталог");
  assert.equal(sectionLabel("consultant"), "Консультант");
  assert.equal(sectionLabel("director"), "Режиссёр");
  assert.equal(sectionLabel("sales"), "Продажа");
  assert.equal(sectionLabel("commands"), "Команды сцены");
  assert.equal(sectionLabel("ai-rules"), "Правила AI");
  assert.equal(sectionLabel("custom"), "custom");
  assert.equal(sectionLabel(""), "Раздел");
});

test("labelSections keeps API order and unpublished flag", () => {
  const labeled = labelSections([
    { name: "director", draftVersion: 2, publishedVersion: 1, hasUnpublishedChanges: true },
    { name: "sales", draftVersion: 1, publishedVersion: 1, hasUnpublishedChanges: false }
  ]);
  assert.deepEqual(labeled, [
    {
      name: "director",
      label: "Режиссёр",
      draftVersion: 2,
      publishedVersion: 1,
      hasUnpublishedChanges: true
    },
    {
      name: "sales",
      label: "Продажа",
      draftVersion: 1,
      publishedVersion: 1,
      hasUnpublishedChanges: false
    }
  ]);
  assert.deepEqual(labelSections(null), []);
});
