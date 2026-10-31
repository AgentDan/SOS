import test from "node:test";
import assert from "node:assert/strict";
import { buildLinkMap } from "./link-map.js";
import { SCREEN_ENTRIES, buildSearchIndex, kindTitle, routeForNode, searchIndex } from "./search.js";

const SOURCE = {
  questionnaire: {
    phases: [{ id: "needs", name: "Потребности" }],
    scenarios: [{ id: "home", name: "Дом" }],
    questions: [
      {
        id: "q_back",
        phase: "needs",
        textFallback: "Спина болит?",
        options: [
          { id: "yes", label: "Да" },
          { id: "no", label: "Нет" }
        ],
        appliesToScenarios: ["home"]
      },
      {
        id: "exact",
        phase: "needs",
        textFallback: "Вопрос",
        options: [{ id: "a", label: "Ответ" }]
      }
    ]
  },
  catalog: {
    types: [
      { id: "monitor", label: "Монитор" },
      { id: "desk", label: "Стол" }
    ],
    needs: [{ id: "monitor_main", name: "Монитор", criteria: { type: "monitor", minWidth: 500 } }],
    products: [
      {
        sku: "EXACT",
        type: "monitor",
        label: "Другой",
        dimensions: { width: 10, depth: 20, height: 30 },
        words: ["экран"]
      },
      { sku: "zzz", type: "monitor", label: "Exact хвост" },
      { sku: "mid", type: "desk", label: "середина exact" },
      { sku: "bbb", type: "desk", label: "бета exact", words: ["монитор"] },
      { sku: "aaa", type: "desk", label: "альфа exact", words: ["монитор"] }
    ]
  }
};

function idsOf(groups) {
  return groups.map((group) => ({
    kind: group.kind,
    title: group.title,
    ids: group.items.map((item) => item.id)
  }));
}

function findEntry(index, id) {
  return index.find((item) => item.id === id);
}

test("empty query returns no groups", () => {
  const index = buildSearchIndex(SOURCE);
  assert.deepEqual(searchIndex(index, ""), []);
  assert.deepEqual(searchIndex(index, "   "), []);
  assert.deepEqual(searchIndex(index, "\n"), []);
});

test("every word must occur in the text", () => {
  const index = buildSearchIndex(SOURCE);
  const both = searchIndex(index, "exact хвост");
  assert.deepEqual(idsOf(both), [{ kind: "product", title: "Товары", ids: ["product:zzz"] }]);
  assert.deepEqual(searchIndex(index, "exact нет"), []);
  assert.deepEqual(searchIndex(index, "экран стол"), []);
  const byWord = searchIndex(index, "экран другой");
  assert.deepEqual(byWord.flatMap((group) => group.items.map((item) => item.id)), ["product:EXACT"]);
});

test("search ignores case and treats yo as ye", () => {
  const index = buildSearchIndex({
    questionnaire: {
      questions: [{ id: "q", textFallback: "Ёлка у окна", options: [{ id: "a", label: "Зелёная" }] }]
    },
    catalog: {}
  });
  const lower = searchIndex(index, "елка");
  const upper = searchIndex(index, "ЁЛКА");
  assert.deepEqual(
    lower.flatMap((group) => group.items.map((item) => item.id)),
    upper.flatMap((group) => group.items.map((item) => item.id))
  );
  assert.ok(lower.some((group) => group.items.some((item) => item.id === "question:q")));
  const screens = searchIndex(buildSearchIndex({}), "режиссер");
  assert.ok(screens.some((group) => group.items.some((item) => item.id === "screen:dialog:director")));
});

test("exact id or sku ranks ahead of a label prefix and the rest", () => {
  const groups = searchIndex(buildSearchIndex(SOURCE), "exact");
  assert.deepEqual(idsOf(groups), [
    {
      kind: "product",
      title: "Товары",
      ids: ["product:EXACT", "product:zzz", "product:aaa", "product:bbb", "product:mid"]
    },
    { kind: "question", title: "Вопросы", ids: ["question:exact"] },
    { kind: "option", title: "Ответы", ids: ["option:exact:a"] }
  ]);
});

test("groups follow kind order and labels stay alphabetical inside a tier", () => {
  const groups = searchIndex(buildSearchIndex(SOURCE), "монитор");
  assert.deepEqual(idsOf(groups), [
    { kind: "product", title: "Товары", ids: ["product:aaa", "product:bbb"] },
    { kind: "need", title: "Потребности", ids: ["need:monitor_main"] },
    { kind: "type", title: "Типы", ids: ["type:monitor"] }
  ]);
  assert.deepEqual(
    groups[0].items.map((item) => item.label),
    ["альфа exact", "бета exact"]
  );
});

test("limit caps the total number of items", () => {
  const groups = searchIndex(buildSearchIndex(SOURCE), "exact", 3);
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  assert.equal(count, 3);
  assert.deepEqual(idsOf(groups), [
    { kind: "product", title: "Товары", ids: ["product:EXACT", "product:zzz"] },
    { kind: "question", title: "Вопросы", ids: ["question:exact"] }
  ]);
  assert.deepEqual(searchIndex(buildSearchIndex(SOURCE), "exact", 0), []);
  assert.equal(searchIndex(buildSearchIndex(SOURCE), "exact", 1.9)[0].items.length, 1);
});

test("each node kind has a route and the index starts with screens", () => {
  const index = buildSearchIndex(SOURCE);
  assert.equal(index.length > SCREEN_ENTRIES.length, true);
  assert.deepEqual(
    index.slice(0, SCREEN_ENTRIES.length).map((item) => item.id),
    SCREEN_ENTRIES.map((item) => item.id)
  );
  const map = buildLinkMap(SOURCE);
  const expected = {
    "product:EXACT": { screen: "catalog", sku: "EXACT" },
    "product:zzz": { screen: "catalog", sku: "zzz" },
    "product:mid": { screen: "catalog", sku: "mid" },
    "product:bbb": { screen: "catalog", sku: "bbb" },
    "product:aaa": { screen: "catalog", sku: "aaa" },
    "type:monitor": { screen: "catalog", tab: "types", item: "monitor" },
    "type:desk": { screen: "catalog", tab: "types", item: "desk" },
    "need:monitor_main": { screen: "catalog", tab: "needs", item: "monitor_main" },
    "question:q_back": { screen: "questionnaire", q: "q_back" },
    "question:exact": { screen: "questionnaire", q: "exact" },
    "option:q_back:yes": { screen: "questionnaire", q: "q_back" },
    "option:q_back:no": { screen: "questionnaire", q: "q_back" },
    "option:exact:a": { screen: "questionnaire", q: "exact" },
    "scenario:home": { screen: "questionnaire", tab: "scenarios" }
  };
  assert.equal(map.nodes.length, Object.keys(expected).length);
  for (const node of map.nodes) {
    const route = routeForNode(node);
    assert.deepEqual(route, expected[node.id]);
    assert.deepEqual(findEntry(index, node.id).route, route);
  }
  assert.equal(routeForNode(null), null);
  assert.equal(routeForNode({ kind: "other" }), null);
  assert.deepEqual(routeForNode(SCREEN_ENTRIES[0]), SCREEN_ENTRIES[0].route);

  const product = findEntry(index, "product:EXACT");
  assert.equal(product.hint, "Монитор · 10×20×30");
  assert.equal(findEntry(index, "option:q_back:yes").hint, "Спина болит?");
  assert.equal(findEntry(index, "question:q_back").hint, "Потребности");
  assert.equal(findEntry(index, "type:desk").hint, "3 товара");
  assert.equal(findEntry(index, "type:monitor").hint, "2 товара");
  assert.equal(findEntry(index, "need:monitor_main").hint, "Монитор, от 500 мм");
});

test("index and search survive empty and broken data", () => {
  const inputs = [null, undefined, 0, "x", [], { questionnaire: null, catalog: { products: [null, { sku: 5 }, { label: "без артикула" }] } }];
  for (const input of inputs) {
    const index = buildSearchIndex(input);
    assert.equal(Array.isArray(index), true);
    assert.equal(index[0].kind, "screen");
    assert.deepEqual(searchIndex(index, ""), []);
    assert.doesNotThrow(() => searchIndex(index, "ёж"));
  }
  assert.deepEqual(searchIndex(null, "товар"), []);
  assert.deepEqual(searchIndex([{ text: 1, label: "A", kind: "product" }], "a"), []);
  const screens = buildSearchIndex({});
  assert.equal(screens.length, SCREEN_ENTRIES.length);
  const found = searchIndex(screens, "каталог");
  assert.equal(found[0].items[0].route.screen, "catalog");
});

test("спина finds the back question and its answers", () => {
  const index = buildSearchIndex({
    questionnaire: {
      questions: [
        {
          id: "q_back_pain",
          textFallback: "Спина не беспокоит от долгого сидения?",
          options: [
            { id: "yes", label: "Да, есть проблемы" },
            { id: "no", label: "Нет, всё в порядке" }
          ]
        },
        {
          id: "q_hand",
          textFallback: "Какой рукой вы работаете?",
          options: [{ id: "right", label: "Правой" }]
        }
      ]
    },
    catalog: {}
  });
  const ids = searchIndex(index, "спина").flatMap((group) => group.items.map((item) => item.id));
  assert.deepEqual(ids, ["question:q_back_pain", "option:q_back_pain:yes", "option:q_back_pain:no"]);
  const short = searchIndex(index, "спин").flatMap((group) => group.items.map((item) => item.id));
  assert.deepEqual(short, ids);
});

test("ergonomics search opens the form screen", () => {
  const entry = SCREEN_ENTRIES.find((item) => item.id === "screen:ergonomics");
  assert.deepEqual(entry.route, { screen: "ergonomics" });
  const found = searchIndex(buildSearchIndex({}), "эргономика");
  assert.equal(found[0].items[0].route.screen, "ergonomics");
});

test("kind titles name every search group", () => {
  assert.equal(kindTitle("screen"), "Экраны");
  assert.equal(kindTitle("product"), "Товары");
  assert.equal(kindTitle("question"), "Вопросы");
  assert.equal(kindTitle("option"), "Ответы");
  assert.equal(kindTitle("need"), "Потребности");
  assert.equal(kindTitle("type"), "Типы");
  assert.equal(kindTitle("scenario"), "Сценарии");
  assert.equal(kindTitle("nope"), "Прочее");
  assert.equal(SCREEN_ENTRIES.every((item) => item.kind === "screen" && item.route), true);
});
