import test from "node:test";
import assert from "node:assert/strict";
import { NAV_LEGACY, NAV_MAIN, activeNavId, screenTitle } from "./nav.js";

const PAIRS = [
  [{ screen: "overview" }, "home"],
  [{ screen: "section", name: "catalog" }, "catalog"],
  [{ screen: "section", name: "questionnaire" }, "questionnaire"],
  [{ screen: "section", name: "consultant" }, "dialog"],
  [{ screen: "section", name: "director" }, "dialog"],
  [{ screen: "section", name: "sales" }, "dialog"],
  [{ screen: "section", name: "commands" }, "dialog"],
  [{ screen: "section", name: "ai-rules" }, "dialog"],
  [{ screen: "section", name: "ergonomics" }, "ergonomics"],
  [{ screen: "map" }, "map"],
  [{ screen: "journal" }, "journal"],
  [{ screen: "sections" }, "sections"],
  [{ screen: "knobs" }, "knobs"],
  [{ screen: "models" }, "models"]
];

test("activeNavId maps each menu route to its item", () => {
  for (const [route, id] of PAIRS) {
    assert.equal(activeNavId(route), id);
  }
});

test("an unknown section highlights the sections item", () => {
  assert.equal(activeNavId({ screen: "section", name: "archive" }), "sections");
  assert.equal(activeNavId(null), "sections");
});

test("every nav item has a unique id, a route and text", () => {
  const items = [...NAV_MAIN, ...NAV_LEGACY];
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(NAV_MAIN.length, 7);
  assert.equal(NAV_LEGACY.length, 3);
  for (const item of items) {
    assert.equal(typeof item.text, "string");
    assert.ok(item.text.length > 0);
    assert.equal(typeof item.route, "object");
    assert.equal(typeof item.route.screen, "string");
    assert.equal(activeNavId(item.route), item.id);
  }
});

test("screenTitle names screens and uses section labels", () => {
  assert.equal(screenTitle({ screen: "overview" }), "Главная");
  assert.equal(screenTitle({ screen: "sections" }), "Разделы");
  assert.equal(screenTitle({ screen: "knobs" }), "Ручки");
  assert.equal(screenTitle({ screen: "models" }), "Модели");
  assert.equal(screenTitle({ screen: "map" }), "Карта связей");
  assert.equal(screenTitle({ screen: "journal" }), "Версии и журнал");
  assert.equal(screenTitle({ screen: "section", name: "catalog" }), "Каталог");
  assert.equal(screenTitle({ screen: "section", name: "director" }), "Режиссёр");
  assert.equal(screenTitle({ screen: "section", name: "sales" }), "Продажа");
  assert.equal(screenTitle({ screen: "section", name: "archive" }), "archive");
  assert.equal(screenTitle(null), "Главная");
});
