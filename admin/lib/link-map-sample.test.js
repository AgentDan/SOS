import test from "node:test";
import assert from "node:assert/strict";
import { buildLinkMap, diffMaps } from "./link-map.js";
import { makeSampleData } from "./link-map-sample.js";

function countBy(list, read) {
  return list.filter((item) => read(item)).length;
}

test("sample sizes follow the arguments", () => {
  const data = makeSampleData({
    scenarios: 4,
    questions: 10,
    optionsPerQuestion: [2, 2],
    needs: 6,
    types: 5,
    products: 12,
    seed: 4
  });
  const questionnaire = data.questionnaire.published;
  const catalog = data.catalog.published;
  assert.equal(questionnaire.scenarios.length, 4);
  assert.equal(questionnaire.questions.length, 10);
  assert.equal(catalog.needs.length, 6);
  assert.equal(catalog.types.length, 5);
  assert.equal(catalog.products.length, 12);
  for (const question of questionnaire.questions) {
    assert.equal(question.options.length, 2);
    assert.ok(Array.isArray(question.appliesToScenarios));
    assert.equal(typeof question.textFallback, "string");
  }
  assert.ok(Array.isArray(questionnaire.inference));
  assert.ok(Array.isArray(questionnaire.scenarioRules));
  assert.equal(typeof questionnaire.defaultScenario, "string");
  assert.equal(typeof catalog.needs[0].criteria.type, "string");
  const product = catalog.products[0];
  assert.equal(typeof product.sku, "string");
  assert.equal(typeof product.type, "string");
  assert.equal(typeof product.dimensions.width, "number");
  assert.equal(typeof product.dimensions.depth, "number");
  assert.equal(typeof product.dimensions.height, "number");
  assert.equal(typeof product.priceEur, "number");
  assert.ok(Array.isArray(product.words));
});

test("the same seed repeats and another seed differs", () => {
  const left = makeSampleData({ seed: 7, questions: 8, products: 15, needs: 6, types: 4, scenarios: 3 });
  const right = makeSampleData({ seed: 7, questions: 8, products: 15, needs: 6, types: 4, scenarios: 3 });
  assert.deepEqual(left, right);
  const other = makeSampleData({ seed: 8, questions: 8, products: 15, needs: 6, types: 4, scenarios: 3 });
  assert.notDeepEqual(left, other);
});

test("buildLinkMap accepts the sample and finds the planted holes", () => {
  const data = makeSampleData();
  const map = buildLinkMap({
    questionnaire: data.questionnaire.published,
    catalog: data.catalog.published
  });
  assert.equal(countBy(map.nodes, (node) => node.kind === "question"), 60);
  assert.equal(countBy(map.nodes, (node) => node.kind === "product"), 500);
  assert.equal(countBy(map.nodes, (node) => node.kind === "need"), 40);
  assert.equal(countBy(map.nodes, (node) => node.kind === "type"), 25);
  assert.equal(countBy(map.nodes, (node) => node.kind === "scenario"), 5);
  const text = map.problems.map((item) => item.text).join("\n");
  assert.match(text, /не выводит ни один ответ/);
  assert.match(text, /не подходит ни один товар/);
  assert.match(text, /ни на что не влияет/);
  assert.match(text, /без товаров/);
});

test("diffMaps sees the planted draft differences", () => {
  const data = makeSampleData({ scenarios: 4, questions: 8, needs: 6, types: 5, products: 12, seed: 2 });
  const published = buildLinkMap({
    questionnaire: data.questionnaire.published,
    catalog: data.catalog.published
  });
  const draft = buildLinkMap({
    questionnaire: data.questionnaire.draft,
    catalog: data.catalog.draft
  });
  assert.equal(data.questionnaire.draft.questions.some((question) => question.id === "q_draft_new"), true);
  assert.equal(data.questionnaire.published.questions.some((question) => question.id === "q_draft_new"), false);
  assert.equal(data.catalog.draft.products.some((product) => product.sku === "NEW-0001"), true);
  assert.equal(data.catalog.draft.needs.some((need) => need.id === "need_draft_new"), true);
  const removedSku = data.catalog.published.products[data.catalog.published.products.length - 1].sku;
  assert.equal(data.catalog.draft.products.some((product) => product.sku === removedSku), false);
  const diff = diffMaps(published, draft);
  assert.ok(diff.counts.nodesChanged >= 5);
  assert.ok(diff.counts.nodesAdded >= 3);
  assert.ok(diff.counts.nodesRemoved >= 2);
  assert.ok(diff.counts.linksAdded >= 2);
});
