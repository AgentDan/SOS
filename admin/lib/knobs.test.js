import test from "node:test";
import assert from "node:assert/strict";
import { boundsText, checkKnobValue, describeKnobValues, groupKnobsByLayer } from "./knobs.js";

function knob(partial) {
  return {
    id: "sample",
    layer: "dialog",
    label: "Пример",
    type: "number",
    values: [{ at: "low", value: 35 }],
    ...partial
  };
}

test("groupKnobsByLayer keeps known layers in order and skips empty ones", () => {
  const groups = groupKnobsByLayer([
    knob({ id: "price", layer: "product" }),
    knob({ id: "humor", layer: "dialog" }),
    knob({ id: "again", layer: "dialog" }),
    null,
    knob({ id: "plant", layer: "growth" })
  ]);
  assert.deepEqual(
    groups.map((group) => [group.layer, group.title, group.knobs.map((item) => item.id)]),
    [
      ["dialog", "Ручки диалога", ["humor", "again"]],
      ["product", "Ручки продукта", ["price"]],
      ["growth", "Ручки: growth", ["plant"]]
    ]
  );
  assert.equal(groups.some((group) => group.layer === "acquisition"), false);
  assert.equal(groups.some((group) => group.layer === "production"), false);
});

test("describeKnobValues splits several targets and keeps each at", () => {
  const described = describeKnobValues(
    knob({
      path: "products.*.priceEur",
      values: [
        { at: "products.0.priceEur", value: 120, key: "DESK-TOP-1800" },
        { at: "products.1.priceEur", value: 80, key: "CHAIR-460" }
      ]
    })
  );
  assert.equal(described.broken, false);
  assert.equal(described.multiple, true);
  assert.deepEqual(
    described.rows.map((row) => [row.label, row.at, row.value, row.applicable]),
    [
      ["DESK-TOP-1800", "products.0.priceEur", 120, true],
      ["CHAIR-460", "products.1.priceEur", 80, true]
    ]
  );
});

test("describeKnobValues treats a star path as several values even for one row", () => {
  const described = describeKnobValues(
    knob({ path: "types.*.maxOnScene", values: [{ at: "types.0.maxOnScene", value: 1 }] })
  );
  assert.equal(described.multiple, true);
  assert.equal(described.rows[0].label, "types.0.maxOnScene");
});

test("describeKnobValues marks a knob with no values as broken", () => {
  assert.deepEqual(describeKnobValues(knob({ values: [] })), { broken: true, multiple: false, rows: [] });
  assert.deepEqual(describeKnobValues(knob({ values: undefined })), {
    broken: true,
    multiple: false,
    rows: []
  });
  const missingAt = describeKnobValues(knob({ values: [{ value: 1 }] }));
  assert.equal(missingAt.broken, false);
  assert.equal(missingAt.rows[0].applicable, false);
});

test("bounds and client checks follow the knob type", () => {
  const price = knob({ type: "number", min: 0, max: 5000 });
  assert.equal(boundsText(price), "от 0 до 5000");
  assert.deepEqual(checkKnobValue(price, 0), []);
  assert.deepEqual(checkKnobValue(price, 5000), []);
  assert.deepEqual(checkKnobValue(price, -1), ["Меньше минимума 0"]);
  assert.deepEqual(checkKnobValue(price, 5001), ["Больше максимума 5000"]);
  assert.deepEqual(checkKnobValue(price, Number.NaN), ["Нужно число"]);

  const tone = knob({ type: "enum", options: ["вы", "ты"] });
  assert.equal(boundsText(tone), "вы, ты");
  assert.deepEqual(checkKnobValue(tone, "вы"), []);
  assert.deepEqual(checkKnobValue(tone, "мы"), ["Нет такого варианта"]);

  const emoji = knob({ type: "boolean" });
  assert.equal(boundsText(emoji), "да или нет");
  assert.deepEqual(checkKnobValue(emoji, false), []);
  assert.deepEqual(checkKnobValue(emoji, "false"), ["Нужно да или нет"]);
});
