import test from "node:test";
import assert from "node:assert/strict";
import {
  addProduct,
  applyNeedFields,
  applyTypeFields,
  compareSizes,
  filterRows,
  formToProduct,
  joinWords,
  matchingNeeds,
  needToForm,
  parseObjectText,
  productRows,
  productToForm,
  removeProduct,
  replaceItem,
  replaceProduct,
  splitWords,
  typeExtra,
  typeFacts,
  typeToForm,
  validateNeedForm,
  validateProductForm,
  validateTypeForm
} from "./catalog.js";

const TYPES = [
  { id: "desk_top", label: "Desk top", canBeHost: true, canHostOn: ["desk_legs"], maxOnScene: 2, rowGapMm: 100 },
  { id: "monitor", label: "Monitor", canBeHost: false, canHostOn: ["desk_top"] },
  { id: "person", label: "Person", canBeHost: false, canHostOn: [] }
];

const CHAIR = {
  sku: "CHAIR-460",
  type: "chair",
  name: "Chair 460x520",
  label: "кресло",
  movable: false,
  dimensions: { width: 550, depth: 610, height: 1040, note: "keep-dim" },
  priceEur: 129,
  words: ["кресл", "стул"],
  media: { model3d: "CHAIR-460.glb", poster: "keep-poster" },
  custom: { ok: true },
  placement: { offset: { x: 0, z: 760 }, hostSku: "DESK-LEGS-1400", seatHeightMm: 450 }
};

function validForm(patch = {}) {
  return {
    sku: "NEW-1",
    type: "chair",
    name: "Новый",
    label: "новый",
    width: "100",
    depth: "80",
    height: "40",
    priceEur: "15",
    words: "стул, кресло",
    movable: true,
    seatHeightMm: "",
    hostSku: "",
    ...patch
  };
}

const VALID_OPTIONS = {
  existingSkus: ["CHAIR-460"],
  isNew: true,
  typeIds: ["chair", "person", "monitor"],
  productSkus: ["CHAIR-460", "DESK-TOP-1400"]
};

test("productRows keeps draft order and marks unpublished products", () => {
  const draft = {
    types: TYPES,
    products: [
      { sku: "MON-1", type: "monitor", name: "Monitor 32-inch", label: "монитор 32", dimensions: { width: 715, depth: 212, height: 427 }, priceEur: 349, words: ["монитор", "32"], media: { model3d: "MON-1.glb" }, movable: true },
      { sku: "character", type: "person", name: "Character", label: "манекен", dimensions: { width: 814, depth: 778, height: 1420 }, words: [], media: { model3d: "character.glb" } },
      { sku: "GHOST", type: "missing", label: "", dimensions: { width: 1, depth: 2, height: 3 }, priceEur: 1, words: ["x"] }
    ]
  };
  const published = {
    products: [
      { sku: "MON-1", type: "monitor", name: "Monitor 32-inch", label: "монитор 32", dimensions: { width: 715, depth: 212, height: 427 }, priceEur: 300, words: ["монитор", "32"], media: { model3d: "MON-1.glb" }, movable: true }
    ]
  };
  const rows = productRows(draft, published);
  assert.deepEqual(rows.map((row) => row.sku), ["MON-1", "character", "GHOST"]);
  assert.equal(rows[0].typeLabel, "Monitor");
  assert.equal(rows[0].modelListed, true);
  assert.equal(rows[0].unpublished, true);
  assert.equal(rows[0].movable, true);
  assert.equal(rows[1].movable, null);
  assert.equal(rows[1].priceEur, null);
  assert.equal(rows[1].unpublished, true);
  assert.equal(rows[2].typeLabel, "missing");
  assert.equal(rows[2].modelListed, false);
  assert.deepEqual(
    productRows(
      { products: [{ sku: "SAME", type: "monitor", priceEur: 1, words: [] }] },
      { products: [{ sku: "SAME", words: [], priceEur: 1, type: "monitor" }] }
    )[0].unpublished,
    false
  );
});

test("filterRows matches type and text in sku, name, label and words", () => {
  const rows = productRows(
    {
      types: TYPES,
      products: [
        { sku: "DESK-TOP-1400", type: "desk_top", name: "Desk top 1400x800", label: "стол 140", words: ["стол", "140"], priceEur: 1, dimensions: { width: 1, depth: 1, height: 1 } },
        { sku: "MON-715-427", type: "monitor", name: "Monitor 32-inch", label: "монитор 32", words: ["монитор", "экран", "32"], priceEur: 1, dimensions: { width: 1, depth: 1, height: 1 } }
      ]
    },
    { products: [] }
  );
  assert.equal(filterRows(rows, { type: "", text: "" }).length, 2);
  assert.deepEqual(filterRows(rows, { type: "monitor", text: "" }).map((row) => row.sku), ["MON-715-427"]);
  assert.deepEqual(filterRows(rows, { type: "", text: "desk" }).map((row) => row.sku), ["DESK-TOP-1400"]);
  assert.deepEqual(filterRows(rows, { type: "", text: "МОНИТОР" }).map((row) => row.sku), ["MON-715-427"]);
  assert.deepEqual(filterRows(rows, { type: "desk_top", text: "32" }).map((row) => row.sku), []);
  assert.deepEqual(filterRows(rows, { type: "", text: "экран" }).map((row) => row.sku), ["MON-715-427"]);
  assert.deepEqual(filterRows(null, { type: "x", text: "y" }), []);
});

test("splitWords and joinWords drop blanks and repeats", () => {
  assert.deepEqual(splitWords(" монитор, экран\n32, монитор, ,\rэкран "), ["монитор", "экран", "32"]);
  assert.deepEqual(splitWords(""), []);
  assert.deepEqual(splitWords(null), []);
  assert.equal(joinWords([" монитор ", "монитор", "экран"]), "монитор, экран");
  assert.equal(joinWords(null), "");
  assert.equal(joinWords("стул"), "");
});

test("formToProduct keeps unknown fields and drops empty placement", () => {
  const form = productToForm(CHAIR);
  form.priceEur = "130";
  form.hostSku = "";
  form.seatHeightMm = "";
  const next = formToProduct(form, CHAIR);
  assert.equal(next.priceEur, 130);
  assert.equal(next.custom.ok, true);
  assert.equal(next.media.model3d, "CHAIR-460.glb");
  assert.equal(next.media.poster, "keep-poster");
  assert.equal(next.dimensions.note, "keep-dim");
  assert.deepEqual(next.placement, { offset: { x: 0, z: 760 } });
  assert.equal(CHAIR.priceEur, 129);
  assert.equal(CHAIR.placement.hostSku, "DESK-LEGS-1400");
  assert.notEqual(next, CHAIR);
});

test("formToProduct omits a default movable flag and writes an explicit one", () => {
  const original = { sku: "KB", type: "keyboard", dimensions: { width: 1, depth: 1, height: 1 }, priceEur: 5, words: ["клавиатур"], media: { model3d: "KB.glb" } };
  const kept = formToProduct(productToForm(original), original);
  assert.equal(Object.hasOwn(kept, "movable"), false);
  const stopped = productToForm(original);
  stopped.movable = false;
  assert.equal(formToProduct(stopped, original).movable, false);
  const turnedOn = productToForm({ ...original, movable: false });
  turnedOn.movable = true;
  assert.equal(formToProduct(turnedOn, { ...original, movable: false }).movable, true);
});

test("a new product receives model3d and a person does not receive a price", () => {
  const created = formToProduct(validForm({ movable: true }), null);
  assert.equal(created.media.model3d, "NEW-1.glb");
  assert.equal(Object.hasOwn(created, "movable"), false);
  assert.equal(Object.hasOwn(created, "placement"), false);

  const personOriginal = { sku: "character", type: "person", dimensions: { width: 1, depth: 2, height: 3 }, words: [], media: { model3d: "character.glb" } };
  const personForm = productToForm(personOriginal);
  personForm.priceEur = "10";
  const person = formToProduct(personForm, personOriginal);
  assert.equal(Object.hasOwn(person, "priceEur"), false);
  assert.equal(person.media.model3d, "character.glb");
  assert.deepEqual(person.words, []);

  const priced = { sku: "CHAIR-460", type: "chair", priceEur: 10, dimensions: { width: 1, depth: 1, height: 1 }, words: ["a"], media: { model3d: "CHAIR-460.glb" } };
  const switched = productToForm(priced);
  switched.type = "person";
  assert.equal(Object.hasOwn(formToProduct(switched, priced), "priceEur"), false);
});

test("validateProductForm accepts a person without a price and rejects bad input", () => {
  const person = validForm({ sku: "character", type: "person", priceEur: "", words: "", name: "" });
  assert.deepEqual(validateProductForm(person, { ...VALID_OPTIONS, isNew: false, existingSkus: ["character"] }), {});

  const duplicate = validateProductForm(validForm({ sku: "CHAIR-460" }), VALID_OPTIONS);
  assert.equal(duplicate.sku, "Такой артикул уже есть");

  const selfHost = validateProductForm(validForm({ sku: "NEW-1", hostSku: "NEW-1" }), VALID_OPTIONS);
  assert.equal(selfHost.hostSku, "Нельзя выбрать этот же товар");

  const empty = validateProductForm({}, { existingSkus: [], isNew: true, typeIds: ["chair"], productSkus: [] });
  assert.equal(empty.sku, "Укажите артикул");
  assert.equal(empty.type, "Выберите тип");
  assert.equal(empty.width, "Укажите ширину");
  assert.equal(empty.depth, "Укажите глубину");
  assert.equal(empty.height, "Укажите высоту");
  assert.equal(empty.priceEur, "Укажите цену");
  assert.equal(empty.words, "Добавьте хотя бы одно слово");
  assert.equal(empty.name, undefined);
  assert.equal(empty.label, undefined);

  const garbage = validateProductForm(
    validForm({ width: "-5", depth: "abc", height: "0", priceEur: "нет", words: " , ", seatHeightMm: "1.5", hostSku: "НЕТ", label: "   ", type: "unknown" }),
    VALID_OPTIONS
  );
  assert.equal(garbage.width, "Нужно положительное число");
  assert.equal(garbage.depth, "Нужно положительное число");
  assert.equal(garbage.height, "Нужно положительное число");
  assert.equal(garbage.priceEur, "Нужно число");
  assert.equal(garbage.words, "Добавьте хотя бы одно слово");
  assert.equal(garbage.seatHeightMm, "Нужно целое число от нуля");
  assert.equal(garbage.hostSku, "Такого товара нет");
  assert.equal(garbage.label, "Подпись не может быть пустой");
  assert.equal(garbage.type, "Такого типа нет");
  assert.equal(validateProductForm(validForm({ priceEur: "-1" }), VALID_OPTIONS).priceEur, "Цена не может быть отрицательной");
  assert.equal(validateProductForm(validForm({ seatHeightMm: "0", hostSku: "CHAIR-460" }), VALID_OPTIONS).seatHeightMm, undefined);
});

test("editing a product does not report its own sku as a duplicate", () => {
  const form = productToForm(CHAIR);
  const errors = validateProductForm(form, {
    existingSkus: ["CHAIR-460", "OTHER"],
    isNew: false,
    typeIds: ["chair"],
    productSkus: ["CHAIR-460", "OTHER"]
  });
  assert.equal(errors.sku, undefined);
});

test("replaceProduct, addProduct and removeProduct return a new draft", () => {
  const draft = {
    types: [{ id: "chair", label: "Кресло" }],
    needs: [{ id: "n", name: "Кресло" }],
    products: [{ sku: "A", custom: { x: 1 } }],
    extra: true
  };
  const before = structuredClone(draft);
  const replaced = replaceProduct(draft, "A", { sku: "A", custom: { x: 2 } });
  replaced.products[0].custom.x = 9;
  assert.deepEqual(draft, before);
  assert.equal(replaced.products[0].custom.x, 9);
  assert.equal(replaced.extra, true);
  assert.equal(replaceProduct(draft, "missing", { sku: "missing" }).products.length, 1);

  const added = addProduct(draft, { sku: "B" });
  assert.deepEqual(added.products.map((item) => item.sku), ["A", "B"]);
  assert.equal(draft.products.length, 1);

  const removed = removeProduct(added, "A");
  assert.deepEqual(removed.products.map((item) => item.sku), ["B"]);
  assert.equal(added.products.length, 2);
});

test("replaceItem swaps an existing id and does not append a missing one", () => {
  const draft = { types: [{ id: "chair", label: "Кресло", rowGapMm: 1 }], needs: [{ id: "n", name: "Старое", extra: 1 }], products: [] };
  const before = structuredClone(draft);
  const missing = replaceItem(draft, "types", "nope", { id: "nope", label: "Новый" });
  assert.equal(missing.types.length, 1);
  assert.notEqual(missing, draft);
  assert.deepEqual(draft, before);

  const next = replaceItem(draft, "needs", "n", { id: "n", name: "Новое", extra: 1 });
  assert.equal(next.needs[0].name, "Новое");
  assert.equal(draft.needs[0].name, "Старое");
  next.needs[0].extra = 5;
  assert.equal(draft.needs[0].extra, 1);
});

test("compareSizes checks each axis and keeps non-numeric values", () => {
  assert.deepEqual(compareSizes({ width: 100, depth: 50, height: 40 }, { width: 100, depth: 53, height: "40" }), [
    { axis: "width", model: 100, catalog: 100, diff: 0, ok: true },
    { axis: "depth", model: 50, catalog: 53, diff: -3, ok: false },
    { axis: "height", model: 40, catalog: "40", diff: null, ok: false }
  ]);
  const edge = compareSizes({ width: 10, depth: 10, height: 10 }, { width: 12, depth: 8, height: NaN }, 2);
  assert.equal(edge[0].ok, true);
  assert.equal(edge[1].ok, true);
  assert.equal(edge[2].ok, false);
  assert.equal(Number.isNaN(edge[2].catalog), true);
});

test("matchingNeeds follows type and minimum width and skips a person", () => {
  const needs = [
    { id: "wide", name: "Широкая столешница", criteria: { type: "desk_top", minWidth: 1600 } },
    { id: "any", name: "Любая столешница", criteria: { type: "desk_top" } },
    { id: "man", name: "Манекен", criteria: { type: "person" } }
  ];
  const wide = { sku: "WIDE", type: "desk_top", dimensions: { width: 1800 } };
  const narrow = { sku: "NARROW", type: "desk_top", dimensions: { width: 1400 } };
  assert.deepEqual(matchingNeeds(wide, needs).map((need) => need.id), ["wide", "any"]);
  assert.deepEqual(matchingNeeds(narrow, needs).map((need) => need.id), ["any"]);
  assert.deepEqual(matchingNeeds({ sku: "character", type: "person", dimensions: { width: 800 } }, needs), []);
  assert.deepEqual(matchingNeeds(wide, null), []);
});

test("typeFacts describes a type and is null when the id is missing", () => {
  assert.deepEqual(typeFacts("desk_top", TYPES), {
    label: "Desk top",
    canBeHost: true,
    canHostOn: [{ id: "desk_legs", label: "desk_legs" }],
    maxOnScene: 2
  });
  assert.equal(typeFacts("monitor", TYPES).maxOnScene, undefined);
  assert.equal(typeFacts("nope", TYPES), null);
  assert.equal(typeFacts("desk_top", null), null);
});

test("type and need edits keep fields that the form does not show", () => {
  const type = TYPES[0];
  const typeForm = typeToForm(type);
  assert.equal(typeForm.maxOnScene, "2");
  assert.deepEqual(typeExtra(type), { rowGapMm: 100 });
  const parsed = parseObjectText(typeForm.extraText);
  assert.equal(parsed.ok, true);
  const nextType = applyTypeFields(type, {
    label: "Столешница",
    canBeHost: false,
    canHostOn: ["desk_legs"],
    maxOnScene: 3,
    extra: { ...parsed.value, id: "stolen", label: "нет" }
  });
  assert.equal(nextType.id, "desk_top");
  assert.equal(nextType.label, "Столешница");
  assert.equal(nextType.canBeHost, false);
  assert.equal(nextType.maxOnScene, 3);
  assert.equal(nextType.rowGapMm, 100);
  assert.equal(nextType.id === "desk_top", true);
  const cleared = applyTypeFields(type, { label: "Столешница", canBeHost: true, canHostOn: [], maxOnScene: "", extra: {} });
  assert.equal(Object.hasOwn(cleared, "maxOnScene"), false);
  assert.equal(Object.hasOwn(cleared, "rowGapMm"), false);

  const need = { id: "wide", name: "Широкая столешница", why: "", criteria: { type: "desk_top", minWidth: 1600, note: "keep" }, extra: true };
  const needForm = needToForm(need);
  needForm.name = "Ещё шире";
  needForm.minWidth = "";
  const nextNeed = applyNeedFields(need, { name: needForm.name, why: needForm.why, type: needForm.type, minWidth: "" });
  assert.equal(nextNeed.extra, true);
  assert.equal(nextNeed.criteria.note, "keep");
  assert.equal(Object.hasOwn(nextNeed.criteria, "minWidth"), false);
  assert.equal(nextNeed.id, "wide");
  assert.deepEqual(need.criteria, { type: "desk_top", minWidth: 1600, note: "keep" });
});

test("type and need forms block an empty title and broken JSON", () => {
  assert.equal(validateTypeForm({ label: "  ", maxOnScene: "0" }, "{").label, "Укажите название");
  assert.equal(validateTypeForm({ label: "Стол", maxOnScene: "0" }, "{}").maxOnScene, "Нужно целое число от 1");
  assert.equal(validateTypeForm({ label: "Стол", maxOnScene: "" }, "[]").extra, "Нужен JSON-объект");
  assert.equal(validateTypeForm({ label: "Стол", maxOnScene: "2" }, "").extra, undefined);
  assert.deepEqual(parseObjectText("[]"), { ok: false, error: "Нужен JSON-объект" });
  assert.equal(parseObjectText("").ok, true);
  assert.equal(validateNeedForm({ name: "", type: "", minWidth: "-1" }).name, "Укажите название");
  assert.equal(validateNeedForm({ name: "", type: "", minWidth: "-1" }).type, "Выберите тип");
  assert.equal(validateNeedForm({ name: "Стол", type: "desk_top", minWidth: "" }).minWidth, undefined);
  assert.equal(validateNeedForm({ name: "Стол", type: "desk_top", minWidth: "1.2" }).minWidth, "Нужно целое число от нуля");
});
