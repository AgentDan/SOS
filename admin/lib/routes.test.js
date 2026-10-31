import test from "node:test";
import assert from "node:assert/strict";
import { hrefFor, parseHash, sameHash, staysOnQuestionnaire } from "./routes.js";

const ROUND_TRIPS = [
  "#/overview",
  "#/sections",
  "#/sections/catalog",
  `#/sections/${encodeURIComponent("имя/раздела")}`,
  "#/knobs",
  "#/map",
  "#/journal",
  "#/catalog",
  "#/catalog?tab=types",
  "#/catalog?tab=needs",
  "#/catalog?tab=types&item=monitor",
  "#/catalog?tab=needs&item=monitor_main",
  "#/catalog?sku=DESK-TOP-1400",
  "#/catalog?create=1",
  "#/dialog/consultant",
  "#/dialog/director",
  "#/dialog/sales",
  "#/dialog/commands",
  "#/dialog/ai-rules",
  "#/questionnaire",
  "#/questionnaire?q=q_work_type",
  "#/questionnaire?tab=scenarios",
  "#/questionnaire?tab=phases",
  "#/questionnaire?q=q_work_type&tab=scenarios",
  "#/ergonomics"
];

test("each address round-trips through parse and href", () => {
  for (const hash of ROUND_TRIPS) {
    assert.equal(hrefFor(parseHash(hash)), hash);
  }
});

test("models address opens the catalog", () => {
  assert.deepEqual(parseHash("#/models"), parseHash("#/catalog"));
  assert.equal(hrefFor(parseHash("#/models")), "#/catalog");
});

test("an unknown dialog section opens the consultant", () => {
  assert.deepEqual(parseHash("#/dialog/nope"), { screen: "dialog", name: "consultant" });
  assert.equal(hrefFor(parseHash("#/dialog/nope")), "#/dialog/consultant");
  assert.equal(hrefFor(parseHash("#/dialog")), "#/dialog/consultant");
});

test("an empty hash, a bare hash and garbage open the home screen", () => {
  for (const hash of ["", "#", "#/", "#/nope", "#/??", "not-a-hash"]) {
    assert.equal(hrefFor(parseHash(hash)), "#/overview");
  }
  assert.equal(sameHash("", "#/overview"), true);
  assert.equal(sameHash("#", "#/overview"), true);
  assert.equal(sameHash("#/catalog", "#/catalog"), true);
  assert.equal(sameHash("#/catalog", "#/overview"), false);
});

test("broken percent-encoding does not throw", () => {
  assert.doesNotThrow(() => parseHash("#/sections/%"));
  assert.doesNotThrow(() => parseHash("#/sections/%E0%A4"));
  assert.doesNotThrow(() => parseHash("#/dialog/%"));
  assert.deepEqual(parseHash("#/sections/%"), { screen: "section", name: "%" });
  assert.equal(parseHash("#/dialog/%").name, "consultant");
});

test("staying on the questionnaire keeps the same screen", () => {
  assert.equal(staysOnQuestionnaire("#/questionnaire", "#/questionnaire?q=q_work_type"), true);
  assert.equal(staysOnQuestionnaire("#/questionnaire?tab=phases", "#/questionnaire"), true);
  assert.equal(staysOnQuestionnaire("#/questionnaire", "#/catalog"), false);
  assert.equal(staysOnQuestionnaire("#/catalog", "#/catalog?sku=A"), false);
});
