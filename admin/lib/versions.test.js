import test from "node:test";
import assert from "node:assert/strict";
import {
  filterJournal,
  publishOrder,
  publishReport,
  rollbackTarget,
  sectionCountText,
  unpublished
} from "./versions.js";

test("unpublished keeps section order and drops garbage", () => {
  const list = [
    { name: "ergonomics", hasUnpublishedChanges: true, draftVersion: 3, publishedVersion: 1 },
    { name: "nope", hasUnpublishedChanges: true, draftVersion: 1, publishedVersion: 1 },
    null,
    { name: "questionnaire", hasUnpublishedChanges: false, draftVersion: 1, publishedVersion: 1 },
    { name: "catalog", hasUnpublishedChanges: true, draftVersion: 9, publishedVersion: 8 },
    { hasUnpublishedChanges: true },
    { name: "catalog", hasUnpublishedChanges: true, draftVersion: 10, publishedVersion: 8 }
  ];
  assert.deepEqual(unpublished(list), [
    { name: "catalog", label: "Каталог", draftVersion: 10, publishedVersion: 8 },
    { name: "ergonomics", label: "Эргономика", draftVersion: 3, publishedVersion: 1 }
  ]);
});

test("unpublished rejects empty and broken input", () => {
  assert.deepEqual(unpublished(null), []);
  assert.deepEqual(unpublished({}), []);
  assert.deepEqual(unpublished([]), []);
  assert.deepEqual(unpublished([{ name: "catalog", hasUnpublishedChanges: "yes" }]), []);
  assert.deepEqual(unpublished(["catalog"]), []);
});

test("publishOrder sorts known names and keeps unknown names at the end", () => {
  assert.deepEqual(publishOrder(["ergonomics", "zzz", "catalog", "catalog", "nope", "questionnaire", 4, ""]), [
    "questionnaire",
    "catalog",
    "ergonomics",
    "zzz",
    "nope"
  ]);
});

test("publishOrder rejects empty and broken input", () => {
  assert.deepEqual(publishOrder(null), []);
  assert.deepEqual(publishOrder("catalog"), []);
  assert.deepEqual(publishOrder([]), []);
  assert.deepEqual(publishOrder([1, "", null]), []);
});

test("filterJournal keeps the selected actions", () => {
  const entries = [
    { action: "draft", section: "sales" },
    { action: "publish", section: "sales" },
    { action: "rollback", section: "catalog" },
    { action: "model", section: "catalog" },
    { action: "knob", section: "director" }
  ];
  assert.deepEqual(
    filterJournal(entries, "publish").map((entry) => entry.action),
    ["publish", "rollback"]
  );
  assert.deepEqual(
    filterJournal(entries, "draft").map((entry) => entry.action),
    ["draft"]
  );
  assert.deepEqual(
    filterJournal(entries, "model").map((entry) => entry.action),
    ["model"]
  );
  assert.deepEqual(
    filterJournal(entries, "knob").map((entry) => entry.action),
    ["knob"]
  );
  assert.equal(filterJournal(entries, "all").length, 5);
});

test("filterJournal treats an unknown filter as all and drops garbage", () => {
  const entries = [null, "draft", { action: "knob" }, ["publish"]];
  assert.deepEqual(filterJournal(entries, "archive"), [{ action: "knob" }]);
  assert.deepEqual(filterJournal(entries, undefined), [{ action: "knob" }]);
  assert.deepEqual(filterJournal(null, "all"), []);
  assert.deepEqual(filterJournal({}, "publish"), []);
});

test("rollbackTarget reads a published version", () => {
  assert.deepEqual(
    rollbackTarget({ action: "publish", section: "sales", detail: { publishedVersion: 4 } }),
    { section: "sales", version: 4 }
  );
  assert.deepEqual(
    rollbackTarget({ action: "rollback", section: "catalog", detail: { publishedVersion: 0 } }),
    { section: "catalog", version: 0 }
  );
});

test("rollbackTarget rejects entries that cannot be rolled back", () => {
  assert.equal(rollbackTarget(null), null);
  assert.equal(rollbackTarget({ action: "draft", section: "sales", detail: { publishedVersion: 4 } }), null);
  assert.equal(rollbackTarget({ action: "knob", section: "director", detail: { publishedVersion: 2 } }), null);
  assert.equal(rollbackTarget({ action: "publish", section: "sales", detail: { publishedVersion: 1.5 } }), null);
  assert.equal(rollbackTarget({ action: "publish", section: "sales", detail: { publishedVersion: "4" } }), null);
  assert.equal(rollbackTarget({ action: "publish", section: "", detail: { publishedVersion: 4 } }), null);
  assert.equal(rollbackTarget({ action: "publish", section: "sales" }), null);
  assert.equal(rollbackTarget({ action: "rollback", section: "sales", detail: {} }), null);
  assert.equal(rollbackTarget([]), null);
});

test("publishReport summarizes successes", () => {
  const report = publishReport([
    { name: "questionnaire", ok: true, version: 5 },
    { name: "catalog", ok: true, version: 22 }
  ]);
  assert.equal(report.done.length, 2);
  assert.equal(report.failed.length, 0);
  assert.equal(report.text, "Опубликовано 2 из 2: Анкета, Каталог");
});

test("publishReport includes the section and the first problem line", () => {
  const report = publishReport([
    { name: "questionnaire", ok: true, version: 5 },
    { name: "catalog", ok: false, problem: "цена должна быть числом\nвторая строка" },
    { name: "sales", ok: false, problem: "не дошли" }
  ]);
  assert.equal(report.done.length, 1);
  assert.equal(report.failed.length, 2);
  assert.equal(report.text, "Опубликовано 1 из 3: Анкета. Каталог: цена должна быть числом");
  const bare = publishReport([{ name: "sales", ok: false }]);
  assert.equal(bare.text, "Опубликовано 0 из 1. Продажа");
});

test("publishReport handles empty and broken input", () => {
  assert.deepEqual(publishReport(null), { done: [], failed: [], text: "Опубликовано 0 из 0" });
  assert.deepEqual(publishReport([]), { done: [], failed: [], text: "Опубликовано 0 из 0" });
  const report = publishReport([null, { ok: true }, { name: "", ok: true }, { name: "catalog", ok: true }]);
  assert.equal(report.done.length, 1);
  assert.equal(report.text, "Опубликовано 1 из 1: Каталог");
});

test("sectionCountText uses Russian plural forms", () => {
  assert.equal(sectionCountText(1), "1 раздел");
  assert.equal(sectionCountText(2), "2 раздела");
  assert.equal(sectionCountText(5), "5 разделов");
  assert.equal(sectionCountText(11), "11 разделов");
  assert.equal(sectionCountText(12), "12 разделов");
  assert.equal(sectionCountText(21), "21 раздел");
  assert.equal(sectionCountText(22), "22 раздела");
});
