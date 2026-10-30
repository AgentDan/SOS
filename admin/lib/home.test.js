import test from "node:test";
import assert from "node:assert/strict";
import { gapRows, homeStats, recentRows, routeForSection } from "./home.js";

const ZEROS = {
  products: 0,
  withoutModel: 0,
  questions: 0,
  answers: 0,
  needs: 0,
  needsWithoutAnswer: 0
};

test("routeForSection opens the new screens and keeps unknown sections", () => {
  assert.deepEqual(routeForSection("catalog"), { screen: "catalog" });
  assert.deepEqual(routeForSection("questionnaire"), { screen: "questionnaire" });
  assert.deepEqual(routeForSection("consultant"), { screen: "dialog", name: "consultant" });
  assert.deepEqual(routeForSection("director"), { screen: "dialog", name: "director" });
  assert.deepEqual(routeForSection("sales"), { screen: "dialog", name: "sales" });
  assert.deepEqual(routeForSection("commands"), { screen: "dialog", name: "commands" });
  assert.deepEqual(routeForSection("ai-rules"), { screen: "dialog", name: "ai-rules" });
  assert.deepEqual(routeForSection("ergonomics"), { screen: "section", name: "ergonomics" });
  assert.deepEqual(routeForSection("archive"), { screen: "section", name: "archive" });
  assert.deepEqual(routeForSection(""), { screen: "section", name: "" });
});

test("homeStats counts products, answers and needs without an inference", () => {
  const stats = homeStats({
    catalog: {
      products: [
        { sku: "A", media: { model3d: "a.glb" } },
        { sku: "B" },
        { sku: "C", media: { model3d: "" } },
        { sku: "" },
        null,
        { name: "без артикула" }
      ],
      needs: [{ id: "n1" }, { id: "n2" }, { name: "без id" }, "x"]
    },
    questionnaire: {
      questions: [
        { id: "q1", options: [{ id: "a" }, { id: "b" }, null, { label: "без id" }] },
        { id: "q2", options: [] },
        { textFallback: "без id", options: [{ id: "skip" }] }
      ]
    },
    problems: [
      { level: "warn", text: "Потребность «N» не выводит ни один ответ" },
      { level: "warn", text: "Потребность «M» не выводит ни один ответ" },
      { level: "warn", text: "Под потребность «N» не подходит ни один товар" },
      { level: "error", text: "сломанная ссылка" }
    ]
  });
  assert.deepEqual(stats, {
    products: 3,
    withoutModel: 2,
    questions: 2,
    answers: 2,
    needs: 2,
    needsWithoutAnswer: 2
  });
});

test("homeStats turns empty and broken input into zeros", () => {
  assert.deepEqual(homeStats(null), ZEROS);
  assert.deepEqual(homeStats(undefined), ZEROS);
  assert.deepEqual(homeStats("каталог"), ZEROS);
  assert.deepEqual(homeStats({}), ZEROS);
  assert.deepEqual(homeStats({ catalog: [], questionnaire: "x", problems: null }), ZEROS);
  assert.deepEqual(
    homeStats({
      catalog: { products: "нет", needs: { id: "n" } },
      questionnaire: { questions: [{ id: 1, options: "нет" }] },
      problems: [{ level: "warn" }]
    }),
    ZEROS
  );
});

test("gapRows puts errors first and links a row to its node", () => {
  const nodes = [
    { id: "need:n1", kind: "need", key: "n1", label: "Монитор" },
    { id: "product:MON-1", kind: "product", key: "MON-1", label: "монитор" },
    { id: "question:q1", kind: "question", key: "q1", label: "Рост" }
  ];
  const rows = gapRows(
    [
      { level: "warn", text: "сначала предупреждение", nodeId: "need:n1" },
      { level: "error", text: "первая ошибка", nodeId: "product:MON-1" },
      { level: "warn", text: "второе предупреждение", nodeId: "missing" },
      { level: "error", text: "вторая ошибка" },
      { level: "info", text: "не уровень" },
      { level: "error", text: "" },
      null,
      { level: "warn", nodeId: "question:q1" }
    ],
    nodes
  );
  assert.deepEqual(rows, [
    { level: "error", text: "первая ошибка", route: { screen: "catalog", sku: "MON-1" } },
    { level: "error", text: "вторая ошибка", route: null },
    { level: "warn", text: "сначала предупреждение", route: { screen: "catalog", tab: "needs", item: "n1" } },
    { level: "warn", text: "второе предупреждение", route: null }
  ]);
});

test("gapRows rejects empty and broken input", () => {
  assert.deepEqual(gapRows(null, null), []);
  assert.deepEqual(gapRows("ошибка", {}), []);
  assert.deepEqual(gapRows([{ level: "error", text: "есть" }], "не список"), [
    { level: "error", text: "есть", route: null }
  ]);
  assert.deepEqual(gapRows([{ level: "error", text: "есть", nodeId: "product:A" }], [{ id: "" }, null]), [
    { level: "error", text: "есть", route: null }
  ]);
});

test("recentRows keeps the newest journal rows and skips garbage", () => {
  const older = { ts: "2020-01-01T00:00:00.000Z", action: "draft", section: "catalog" };
  const newer = { ts: "2024-06-01T00:00:00.000Z", action: "publish", section: "sales" };
  const sameEarly = { ts: "2024-06-01T00:00:00.000Z", action: "knob", section: "director" };
  const undated = { action: "model", section: "catalog" };
  const rows = recentRows([older, null, "мусор", [], { foo: 1 }, sameEarly, newer, undated, { detail: {} }], 3);
  assert.deepEqual(rows, [newer, sameEarly, older]);
  assert.deepEqual(recentRows([older, newer, undated, { action: "draft", section: "a" }], 0), []);
  assert.equal(recentRows(null).length, 0);
  assert.deepEqual(recentRows({}), []);
});

test("recentRows defaults to six newest rows", () => {
  const entries = [];
  for (let index = 0; index < 8; index += 1) {
    entries.push({
      ts: `2024-01-0${index + 1}T00:00:00.000Z`,
      action: "draft",
      section: "catalog"
    });
  }
  const rows = recentRows(entries);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].ts, "2024-01-08T00:00:00.000Z");
  assert.equal(rows[5].ts, "2024-01-03T00:00:00.000Z");
  assert.equal(recentRows(entries, Number.NaN).length, 6);
});
