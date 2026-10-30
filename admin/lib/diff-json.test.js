import test from "node:test";
import assert from "node:assert/strict";
import { diffJson } from "./diff-json.js";

test("an added field is one row", () => {
  const diff = diffJson({ a: 1 }, { a: 1, title: "Стол", extra: { z: 1 } });
  assert.equal(diff.total, 2);
  assert.equal(diff.truncated, false);
  assert.deepEqual(diff.rows, [
    { path: "extra", kind: "added", was: "—", now: "{…}" },
    { path: "title", kind: "added", was: "—", now: "Стол" }
  ]);
});

test("a removed field is one row", () => {
  const diff = diffJson({ meta: { title: "A", box: { w: 1 } } }, { meta: { title: "A" } });
  assert.deepEqual(diff.rows, [{ path: "meta.box", kind: "removed", was: "{…}", now: "—" }]);
});

test("a changed number keeps the field path", () => {
  const diff = diffJson({ gains: { pause: 8, tip: 5 } }, { gains: { pause: 9, tip: 5 } });
  assert.deepEqual(diff.rows, [{ path: "gains.pause", kind: "changed", was: "8", now: "9" }]);
});

test("a type change is a single row", () => {
  assert.deepEqual(diffJson({ n: 5 }, { n: "5" }).rows, [
    { path: "n", kind: "changed", was: "5", now: "5" }
  ]);
  assert.deepEqual(diffJson({ n: { a: 1 } }, { n: [1, 2] }).rows, [
    { path: "n", kind: "changed", was: "{…}", now: "[2 шт.]" }
  ]);
});

test("object arrays with sku match by sku", () => {
  const diff = diffJson(
    {
      products: [
        { sku: "DESK-TOP-1400", id: "desk", price: 100 },
        { sku: "OLD", id: "old", price: 10 }
      ]
    },
    {
      products: [
        { sku: "DESK-TOP-1400", id: "desk", price: 120 },
        { sku: "NEW", id: "new", price: 15 }
      ]
    }
  );
  assert.deepEqual(diff.rows, [
    { path: "products[DESK-TOP-1400].price", kind: "changed", was: "100", now: "120" },
    { path: "products[OLD]", kind: "removed", was: "{…}", now: "—" },
    { path: "products[NEW]", kind: "added", was: "—", now: "{…}" }
  ]);
});

test("object arrays use id when sku is not shared", () => {
  const diff = diffJson(
    { questions: [{ id: "q1", text: "Чем заняты?" }, { sku: "skip", id: "q2", text: "Где?" }] },
    { questions: [{ id: "q1", text: "Чем заняты дома?" }, { sku: "skip", id: "q2", text: "Где?" }] }
  );
  assert.deepEqual(diff.rows, [
    { path: "questions[q1].text", kind: "changed", was: "Чем заняты?", now: "Чем заняты дома?" }
  ]);
});

test("object arrays without a shared key compare by index", () => {
  const diff = diffJson(
    { items: [{ text: "a" }, { text: "b" }, { text: "old" }] },
    { items: [{ text: "a" }, { text: "b" }, { text: "new" }, { text: "extra" }] }
  );
  assert.deepEqual(diff.rows, [
    { path: "items[2].text", kind: "changed", was: "old", now: "new" },
    { path: "items[3]", kind: "added", was: "—", now: "{…}" }
  ]);
});

test("a scalar array is one changed value", () => {
  const diff = diffJson({ tags: ["a", "b"] }, { tags: ["a", "b", "c"] });
  assert.deepEqual(diff, {
    rows: [{ path: "tags", kind: "changed", was: "a, b", now: "a, b, c" }],
    total: 1,
    truncated: false
  });
});

test("a section that was never published is one added row", () => {
  const diff = diffJson(undefined, { title: "Черновик" });
  assert.deepEqual(diff, {
    rows: [{ path: "(весь раздел)", kind: "added", was: "—", now: "ещё не публиковался" }],
    total: 1,
    truncated: false
  });
});

test("a long string is clipped to 80 characters", () => {
  const exact = "я".repeat(80);
  const longer = "я".repeat(81);
  assert.equal(diffJson({ t: exact }, { t: exact }).total, 0);
  const row = diffJson({ t: "x" }, { t: longer }).rows[0];
  assert.equal(row.kind, "changed");
  assert.equal(row.now, `${"я".repeat(79)}…`);
  assert.equal(row.now.length, 80);
});

test("limit keeps the total and marks truncated rows", () => {
  const diff = diffJson({ a: 1, b: 2, c: 3 }, { a: 1, b: 9, c: 8, d: 7 }, { limit: 2 });
  assert.equal(diff.total, 3);
  assert.equal(diff.truncated, true);
  assert.deepEqual(
    diff.rows.map((item) => item.path),
    ["b", "c"]
  );
  const exact = diffJson({ a: 1 }, { a: 2 }, { limit: 1 });
  assert.equal(exact.truncated, false);
  assert.equal(exact.rows.length, 1);
  const none = diffJson({ a: 1 }, { a: 2 }, { limit: 0 });
  assert.deepEqual(none.rows, []);
  assert.equal(none.total, 1);
  assert.equal(none.truncated, true);
});

test("equal values produce no rows", () => {
  assert.deepEqual(diffJson({ b: 1, a: [1, 2] }, { a: [1, 2], b: 1 }), {
    rows: [],
    total: 0,
    truncated: false
  });
  assert.equal(diffJson({ items: [{ sku: "A", price: 1 }] }, { items: [{ price: 1, sku: "A" }] }).total, 0);
});
