import test from "node:test";
import assert from "node:assert/strict";
import { buildLinkMap, chainOf, describeLink, diffMaps, linkKey, onlyHere } from "./link-map.js";

function brief(link) {
  return [link.kind, link.from, link.to, link.label];
}

function slim(item) {
  return item.nodeId ? [item.level, item.text, item.nodeId] : [item.level, item.text];
}

test("minimal map builds every link kind", () => {
  const map = buildLinkMap({
    questionnaire: {
      scenarios: [{ id: "home", name: "Дом" }],
      questions: [
        {
          id: "q1",
          textFallback: "Чем заняты?",
          options: [{ id: "play", label: "Играю" }],
          appliesToScenarios: ["home"]
        }
      ],
      inference: [
        {
          id: "inf1",
          when: { questionId: "q1", optionId: "play" },
          resultNeed: "monitor",
          confidence: "high"
        }
      ],
      scenarioRules: [{ when: { questionId: "q1", optionId: "play" }, scenario: "home" }],
      defaultScenario: "home"
    },
    catalog: {
      types: [
        { id: "desk", label: "Стол", canHostOn: [] },
        { id: "monitor", label: "Монитор", canHostOn: ["desk"] }
      ],
      needs: [{ id: "monitor", name: "Монитор", criteria: { type: "monitor", minWidth: 500 } }],
      products: [
        {
          sku: "MON-1",
          type: "monitor",
          name: "Monitor",
          label: "Монитор 27",
          dimensions: { width: 600 },
          priceEur: 100,
          movable: true,
          media: { model3d: "m.glb" }
        }
      ]
    }
  });

  assert.deepEqual(
    map.nodes.map((node) => node.id),
    ["scenario:home", "question:q1", "option:q1:play", "need:monitor", "type:desk", "type:monitor", "product:MON-1"]
  );
  assert.deepEqual(map.links.map(brief), [
    ["applies", "scenario:home", "question:q1", ""],
    ["has-option", "question:q1", "option:q1:play", ""],
    ["infers", "option:q1:play", "need:monitor", "high"],
    ["picks-scenario", "option:q1:play", "scenario:home", ""],
    ["default-scenario", "question:q1", "scenario:home", "по умолчанию"],
    ["needs-type", "need:monitor", "type:monitor", ""],
    ["matches", "need:monitor", "product:MON-1", ""],
    ["is-type", "type:monitor", "product:MON-1", ""],
    ["hosts-on", "type:monitor", "type:desk", "ставится на"]
  ]);

  const nodesById = new Map(map.nodes.map((node) => [node.id, node]));
  const sentence = (kind) => describeLink(map.links.find((link) => link.kind === kind), nodesById);
  assert.equal(sentence("infers"), "Ответ «Играю» → потребность «Монитор» (high)");
  assert.equal(sentence("default-scenario"), "Вопрос «Чем заняты?» → сценарий «Дом» (по умолчанию)");
  assert.equal(sentence("hosts-on"), "Тип «Монитор» → тип «Стол» (ставится на)");
  assert.deepEqual(map.problems.map(slim), [["warn", "Тип «Стол» без товаров", "type:desk"]]);
});

test("default scenario links from the first rule's question", () => {
  const map = buildLinkMap({
    questionnaire: {
      scenarios: [
        { id: "home", name: "Дом" },
        { id: "game", name: "Игра" }
      ],
      questions: [
        {
          id: "q",
          textFallback: "Первый",
          options: [{ id: "a", label: "А" }],
          appliesToScenarios: ["home", "game"]
        },
        {
          id: "other",
          textFallback: "Второй",
          options: [{ id: "b", label: "Б" }],
          appliesToScenarios: ["home"]
        }
      ],
      scenarioRules: [
        { when: { questionId: "q", optionId: "a" }, scenario: "game" },
        { when: { questionId: "other", optionId: "b" }, scenario: "home" }
      ],
      defaultScenario: "home"
    },
    catalog: {}
  });

  const defaults = map.links.filter((link) => link.kind === "default-scenario");
  assert.deepEqual(defaults.map(brief), [["default-scenario", "question:q", "scenario:home", "по умолчанию"]]);
  assert.equal(map.problems.length, 0);
});

test("unused needs warn and a missing need is an error", () => {
  const map = buildLinkMap({
    questionnaire: {
      scenarios: [{ id: "s", name: "Сцена" }],
      questions: [
        {
          id: "q",
          textFallback: "Вопрос",
          options: [{ id: "a", label: "А" }],
          appliesToScenarios: ["s"]
        }
      ],
      inference: [{ id: "bad", when: { questionId: "q", optionId: "a" }, resultNeed: "ghost", confidence: "low" }]
    },
    catalog: {
      types: [{ id: "chair", label: "Кресло", canHostOn: [] }],
      needs: [
        { id: "quiet", name: "Тишина", criteria: { type: "chair" } },
        { id: "lamp", name: "Лампа", criteria: { type: "missing-type" } }
      ],
      products: []
    }
  });

  assert.deepEqual(map.problems.map(slim), [
    ["error", "Вывод «bad» ссылается на несуществующую потребность «ghost»", "option:q:a"],
    ["error", "Потребность «Лампа» с типом «missing-type», которого нет среди типов", "need:lamp"],
    ["warn", "Потребность «Тишина» не выводит ни один ответ", "need:quiet"],
    ["warn", "Под потребность «Тишина» не подходит ни один товар", "need:quiet"],
    ["warn", "Потребность «Лампа» не выводит ни один ответ", "need:lamp"],
    ["warn", "Под потребность «Лампа» не подходит ни один товар", "need:lamp"],
    ["warn", "Тип «Кресло» без товаров", "type:chair"]
  ]);
});

test("other holes cover rules, default scenario, quiet questions and empty types", () => {
  const map = buildLinkMap({
    questionnaire: {
      scenarios: [
        { id: "used", name: "Живой" },
        { id: "alone", name: "Один" }
      ],
      questions: [
        {
          id: "idle",
          textFallback: "Пустой вопрос",
          options: [{ id: "x", label: "Икс" }],
          appliesToScenarios: ["used"]
        }
      ],
      inference: [
        { id: "bad-q", when: { questionId: "missing-q", optionId: "z" }, resultNeed: "used-need", confidence: "high" }
      ],
      scenarioRules: [{ when: { questionId: "missing-q", optionId: "z" }, scenario: "missing-s" }],
      defaultScenario: "not-listed"
    },
    catalog: {
      types: [{ id: "box", label: "Коробка", canHostOn: ["missing-host"] }],
      needs: [{ id: "used-need", name: "Нужда", criteria: { type: "box" } }],
      products: [{ sku: "BAD", type: "no-type", label: "Чужой" }]
    }
  });

  assert.equal(map.links.some((link) => link.kind === "hosts-on" || link.kind === "default-scenario"), false);
  assert.equal(map.nodes.some((node) => node.id === "scenario:not-listed"), true);
  assert.deepEqual(map.problems.map(slim), [
    ["error", "Вывод «bad-q» ссылается на несуществующий вопрос «missing-q»"],
    ["error", "Вывод «bad-q» ссылается на несуществующий ответ «missing-q:z»"],
    ["error", "Правило сценария 1 ссылается на несуществующий вопрос «missing-q»"],
    ["error", "Правило сценария 1 ссылается на несуществующий ответ «missing-q:z»"],
    ["error", "Правило сценария 1 ссылается на несуществующий сценарий «missing-s»", "scenario:missing-s"],
    ["error", "Сценарий по умолчанию «not-listed» не входит в список сценариев", "scenario:not-listed"],
    ["error", "Товар «BAD» с типом «no-type», которого нет среди типов", "product:BAD"],
    ["warn", "Под потребность «Нужда» не подходит ни один товар", "need:used-need"],
    ["warn", "Тип «Коробка» без товаров", "type:box"],
    ["warn", "Вопрос «Пустой вопрос»: ни один ответ ни на что не влияет", "question:idle"],
    ["warn", "Сценарий «Один» без вопросов", "scenario:alone"],
    ["warn", "Сценарий «missing-s» без вопросов", "scenario:missing-s"],
    ["warn", "Сценарий «not-listed» без вопросов", "scenario:not-listed"]
  ]);
});

test("matches respects numeric minWidth and ignores other criteria", () => {
  const map = buildLinkMap({
    questionnaire: {},
    catalog: {
      types: [{ id: "desk", label: "Стол", canHostOn: [] }],
      needs: [
        { id: "wide", name: "Широкий", criteria: { type: "desk", minWidth: 1600, note: "дуб" } },
        { id: "any", name: "Любой", criteria: { type: "desk" } },
        { id: "texty", name: "Текст", criteria: { type: "desk", minWidth: "1600" } }
      ],
      products: [
        { sku: "NARROW", type: "desk", dimensions: { width: 1400 } },
        { sku: "WIDE", type: "desk", dimensions: { width: 1800 } },
        { sku: "EXACT", type: "desk", dimensions: { width: 1600 } },
        { sku: "NOWIDTH", type: "desk" }
      ]
    }
  });

  const pairs = map.links.filter((link) => link.kind === "matches").map((link) => [link.from, link.to]);
  assert.deepEqual(pairs, [
    ["need:wide", "product:WIDE"],
    ["need:wide", "product:EXACT"],
    ["need:any", "product:NARROW"],
    ["need:any", "product:WIDE"],
    ["need:any", "product:EXACT"],
    ["need:any", "product:NOWIDTH"],
    ["need:texty", "product:NARROW"],
    ["need:texty", "product:WIDE"],
    ["need:texty", "product:EXACT"],
    ["need:texty", "product:NOWIDTH"]
  ]);
});

test("diffMaps marks added, removed, changed and untouched nodes and links", () => {
  const published = {
    nodes: [
      { id: "scenario:keep", data: { id: "keep", name: "A" } },
      { id: "scenario:edit", data: { id: "edit", name: "Old" } },
      { id: "scenario:gone", data: { id: "gone" } }
    ],
    links: [
      { kind: "applies", from: "scenario:keep", to: "question:q", label: "" },
      { kind: "applies", from: "scenario:gone", to: "question:q", label: "" }
    ]
  };
  const draft = {
    nodes: [
      { id: "scenario:keep", data: { name: "A", id: "keep" } },
      { id: "scenario:edit", data: { name: "New", id: "edit" } },
      { id: "question:q", data: { id: "q" } }
    ],
    links: [
      { kind: "applies", from: "scenario:keep", to: "question:q", label: "" },
      { kind: "has-option", from: "question:q", to: "option:q:a", label: "" }
    ]
  };

  const diff = diffMaps(published, draft);
  assert.equal(diff.nodes.get("scenario:keep"), "same");
  assert.equal(diff.nodes.get("scenario:edit"), "changed");
  assert.equal(diff.nodes.get("scenario:gone"), "removed");
  assert.equal(diff.nodes.get("question:q"), "added");
  assert.equal(diff.links.get(linkKey(published.links[0])), "same");
  assert.equal(diff.links.get(linkKey(published.links[1])), "removed");
  assert.equal(diff.links.get(linkKey(draft.links[1])), "added");
  assert.deepEqual(diff.counts, {
    nodesAdded: 1,
    nodesRemoved: 1,
    nodesChanged: 1,
    linksAdded: 1,
    linksRemoved: 1
  });
});

test("empty and malformed inputs do not throw", () => {
  assert.deepEqual(buildLinkMap(null), { nodes: [], links: [], problems: [] });
  assert.deepEqual(buildLinkMap(undefined), { nodes: [], links: [], problems: [] });
  assert.deepEqual(buildLinkMap({}), { nodes: [], links: [], problems: [] });
  assert.deepEqual(
    buildLinkMap({
      questionnaire: { scenarios: "x", questions: {}, inference: 1, scenarioRules: null, defaultScenario: null },
      catalog: { types: {}, needs: "y", products: 3 }
    }),
    { nodes: [], links: [], problems: [] }
  );
  assert.deepEqual(buildLinkMap({ questionnaire: [], catalog: [] }), { nodes: [], links: [], problems: [] });
  assert.doesNotThrow(() => {
    buildLinkMap({
      questionnaire: { questions: ["bad", null, { id: "", options: "no" }] },
      catalog: { products: [null, { name: "no sku" }, { sku: "OK" }] }
    });
    diffMaps(null, undefined);
    diffMaps({ nodes: "bad", links: null }, { nodes: [null, { id: 5, data: { a: 1 } }], links: [null, "x"] });
    describeLink(null, null);
    describeLink({ from: "option:q:a" }, new Map());
  });
  const diff = diffMaps(null, {});
  assert.equal(diff.counts.nodesAdded, 0);
  assert.equal(diff.counts.linksRemoved, 0);
  assert.ok(diff.nodes instanceof Map);
  assert.ok(diff.links instanceof Map);
  assert.equal(describeLink(null, null), "");
});

test("key order in data does not mark a node changed", () => {
  const same = diffMaps(
    {
      nodes: [{ id: "need:a", data: { name: "A", criteria: { minWidth: 1, type: "t" }, id: "a" } }],
      links: []
    },
    {
      nodes: [{ id: "need:a", data: { id: "a", name: "A", criteria: { type: "t", minWidth: 1 } } }],
      links: []
    }
  );
  assert.equal(same.nodes.get("need:a"), "same");
  assert.equal(same.counts.nodesChanged, 0);

  const changed = diffMaps(
    { nodes: [{ id: "need:a", data: { id: "a", name: "A" } }], links: [] },
    { nodes: [{ id: "need:a", data: { name: "B", id: "a" } }], links: [] }
  );
  assert.equal(changed.nodes.get("need:a"), "changed");
  assert.equal(changed.counts.nodesChanged, 1);
});

function sorted(set) {
  return [...set].sort();
}

test("chainOf walks forward and backward separately", () => {
  const links = [
    { kind: "applies", from: "scenario:home", to: "question:q", label: "" },
    { kind: "has-option", from: "question:q", to: "option:q:play", label: "" },
    { kind: "infers", from: "option:q:play", to: "need:monitor", label: "high" }
  ];
  const mid = chainOf("question:q", links);
  assert.deepEqual(sorted(mid.down), ["need:monitor", "option:q:play", "question:q"]);
  assert.deepEqual(sorted(mid.up), ["question:q", "scenario:home"]);
  assert.equal(mid.ids.has("scenario:home"), true);
  assert.equal(mid.down.has("scenario:home"), false);
  assert.equal(mid.up.has("need:monitor"), false);
});

test("scenario cycle does not pull the other scenario", () => {
  const links = [
    { kind: "applies", from: "scenario:home", to: "question:q", label: "" },
    { kind: "applies", from: "scenario:game", to: "question:spk", label: "" },
    { kind: "has-option", from: "question:q", to: "option:q:play", label: "" },
    { kind: "has-option", from: "question:spk", to: "option:spk:yes", label: "" },
    { kind: "infers", from: "option:q:play", to: "need:monitor", label: "high" },
    { kind: "infers", from: "option:spk:yes", to: "need:spk", label: "high" },
    { kind: "picks-scenario", from: "option:q:play", to: "scenario:game", label: "" },
    { kind: "default-scenario", from: "question:q", to: "scenario:home", label: "по умолчанию" },
    { kind: "needs-type", from: "need:monitor", to: "type:monitor", label: "" },
    { kind: "matches", from: "need:spk", to: "product:SPK", label: "" }
  ];
  const nodes = [
    { id: "scenario:home", kind: "scenario" },
    { id: "scenario:game", kind: "scenario" },
    { id: "question:q", kind: "question" },
    { id: "question:spk", kind: "question" },
    { id: "option:q:play", kind: "option" },
    { id: "option:spk:yes", kind: "option" },
    { id: "need:monitor", kind: "need" },
    { id: "need:spk", kind: "need" },
    { id: "type:monitor", kind: "type" },
    { id: "product:SPK", kind: "product" }
  ];

  const home = chainOf("scenario:home", links);
  assert.equal(home.ids.has("scenario:game"), false);
  assert.equal(home.ids.has("question:spk"), false);
  assert.equal(home.ids.has("need:spk"), false);
  assert.equal(home.linkKeys.has(linkKey(links.find((link) => link.kind === "default-scenario"))), true);
  assert.equal(home.linkKeys.has(linkKey(links.find((link) => link.kind === "picks-scenario"))), false);

  const game = chainOf("scenario:game", links);
  assert.equal(game.ids.has("scenario:home"), false);
  assert.equal(game.ids.has("question:q"), false);
  assert.equal(game.ids.has("question:spk"), true);
  assert.equal(game.linkKeys.has(linkKey(links.find((link) => link.kind === "picks-scenario"))), true);
  assert.equal(game.ids.has("option:q:play"), false);

  const lonely = chainOf("scenario:alone", [
    { kind: "picks-scenario", from: "option:q:play", to: "scenario:alone", label: "" },
    { kind: "applies", from: "scenario:home", to: "question:q", label: "" }
  ]);
  assert.deepEqual(sorted(lonely.ids), ["scenario:alone"]);
  assert.equal(lonely.linkKeys.size, 1);

  const speakers = chainOf("question:spk", links);
  assert.equal(speakers.ids.has("scenario:game"), true);
  assert.equal(speakers.ids.has("scenario:home"), false);

  const onlyGame = onlyHere("scenario:game", nodes, links);
  assert.equal(onlyGame.has("question:spk"), true);
  assert.equal(onlyGame.has("need:spk"), true);
  assert.equal(onlyGame.has("product:SPK"), true);
  assert.equal(onlyGame.has("question:q"), false);
  assert.equal(onlyGame.has("scenario:home"), false);

  const onlyHome = onlyHere("home", nodes, links);
  assert.equal(onlyHome.has("scenario:home"), true);
  assert.equal(onlyHome.has("question:q"), true);
  assert.equal(onlyHome.has("question:spk"), false);
  assert.equal(onlyHome.has("need:spk"), false);
});

test("onlyHere compares a scenario with every other scenario", () => {
  const links = [
    { kind: "applies", from: "scenario:a", to: "question:shared", label: "" },
    { kind: "applies", from: "scenario:b", to: "question:shared", label: "" },
    { kind: "applies", from: "scenario:c", to: "question:shared", label: "" },
    { kind: "applies", from: "scenario:a", to: "question:only-a", label: "" }
  ];
  const nodes = [
    { id: "scenario:a", kind: "scenario" },
    { id: "scenario:b", kind: "scenario" },
    { id: "scenario:c", kind: "scenario" }
  ];
  const only = onlyHere("scenario:a", nodes, links);
  assert.equal(only.has("question:only-a"), true);
  assert.equal(only.has("question:shared"), false);
  assert.equal(only.has("scenario:b"), false);
  assert.equal(only.has("scenario:c"), false);
});

test("chainOf and onlyHere tolerate empty and unknown input", () => {
  assert.doesNotThrow(() => {
    chainOf(null, null);
    chainOf(undefined, {});
    chainOf("scenario:missing", []);
    chainOf("scenario:missing", [null, "bad", { kind: "applies" }, { from: 1, to: 2, kind: "applies" }]);
    onlyHere(null, null, null);
    onlyHere("scenario:missing", {}, []);
    onlyHere("", [{ id: "scenario:a", kind: "scenario" }], null);
  });
  const empty = chainOf(null, null);
  assert.equal(empty.ids.size, 0);
  assert.equal(empty.down.size, 0);
  assert.equal(empty.up.size, 0);
  assert.equal(empty.linkKeys.size, 0);
  const unknown = chainOf("scenario:missing", []);
  assert.deepEqual(sorted(unknown.ids), ["scenario:missing"]);
  assert.equal(unknown.linkKeys.size, 0);
  assert.equal(onlyHere(null, null, null).size, 0);
  assert.equal(onlyHere("nope", [], [{ kind: "applies", from: "scenario:nope", to: "question:q", label: "" }]).has("question:q"), true);
});
