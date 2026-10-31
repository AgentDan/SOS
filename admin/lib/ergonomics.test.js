import test from "node:test";
import assert from "node:assert/strict";
import {
  draftFromForm,
  ergoTargets,
  formFromDraft,
  heightSamples,
  isDirtyForm,
  validateErgonomicsForm
} from "./ergonomics.js";

const TABLE = {
  seatHeightFactor: 2.6,
  deskHeightFactor: 4.15,
  eyeAboveSeatFactor: 4.57,
  monitorDistanceFactor: 3.4,
  monitorDistanceMinMm: 500,
  monitorDistanceMaxMm: 700,
  eyeForwardMm: 150,
  tolerance: {
    deskHeightMm: 60,
    monitorDistanceMm: 100,
    monitorTopMm: 80
  }
};

function draft() {
  return {
    extra: { keep: true },
    bounds: { heightMinCm: 140, heightMaxCm: 210, note: { id: 1 } },
    defaults: { heightCm: 175, hand: "right", legacy: true },
    mannequin: {
      sku: "character",
      referenceHeightCm: 180,
      pose: "sit",
      offsetMm: { x: 0, y: 0, z: 0, w: 1 }
    },
    table: {
      ...TABLE,
      custom: 2,
      tolerance: { ...TABLE.tolerance, extraTol: 1 }
    }
  };
}

function validForm() {
  return formFromDraft(draft());
}

test("ergoTargets for 175 cm matches the server example", () => {
  assert.deepEqual(ergoTargets(TABLE, 175), {
    seatHeightMm: 455,
    deskHeightMm: 726,
    eyeHeightMm: 1255,
    monitorDistanceMm: 595,
    monitorTopMm: 1255
  });
  const roundedSeat = ergoTargets(
    {
      seatHeightFactor: 2.5,
      deskHeightFactor: 1,
      eyeAboveSeatFactor: 0.6,
      monitorDistanceFactor: 1,
      monitorDistanceMinMm: 1,
      monitorDistanceMaxMm: 2
    },
    1
  );
  assert.equal(roundedSeat.seatHeightMm, 3);
  assert.equal(roundedSeat.eyeHeightMm, 4);
});

test("monitor distance is clamped to the lower and upper bounds", () => {
  const low = ergoTargets({ ...TABLE, monitorDistanceFactor: 1 }, 175);
  const high = ergoTargets({ ...TABLE, monitorDistanceFactor: 10 }, 175);
  assert.equal(low.monitorDistanceMm, 500);
  assert.equal(high.monitorDistanceMm, 700);
});

test("an incomplete table or a bad height has no targets", () => {
  const { seatHeightFactor, ...rest } = TABLE;
  assert.equal(ergoTargets(rest, 175), null);
  assert.equal(ergoTargets({ ...TABLE, seatHeightFactor: 0 }, 175), null);
  assert.equal(ergoTargets({ ...TABLE, monitorDistanceMinMm: 800 }, 175), null);
  assert.equal(ergoTargets(TABLE, 0), null);
  assert.equal(ergoTargets(TABLE, -5), null);
  assert.equal(ergoTargets(TABLE, "175"), null);
  assert.equal(ergoTargets(null, 175), null);
  assert.equal(ergoTargets({}, 175), null);
});

test("heightSamples lists the bounds and the default, and drops broken bounds", () => {
  assert.deepEqual(heightSamples({ heightMinCm: 140, heightMaxCm: 210 }, { heightCm: 175 }), [140, 175, 210]);
  assert.deepEqual(heightSamples({ heightMinCm: 175, heightMaxCm: 210 }, { heightCm: 175 }), [175, 210]);
  assert.deepEqual(heightSamples({ heightMinCm: 140, heightMaxCm: 210 }, { heightCm: 220 }), [140, 210, 220]);
  assert.deepEqual(heightSamples({ heightMinCm: 140, heightMaxCm: 210 }, { heightCm: 100 }), [100, 140, 210]);
  assert.deepEqual(heightSamples({ heightMinCm: 100, heightMaxCm: 250 }, {}), [100, 250]);
  assert.deepEqual(heightSamples({ heightMinCm: 210, heightMaxCm: 140 }, { heightCm: 175 }), [175]);
  assert.deepEqual(heightSamples({ heightMinCm: 140, heightMaxCm: 140 }, { heightCm: 175 }), [175]);
  assert.deepEqual(heightSamples({ heightMinCm: "140", heightMaxCm: 210 }, { heightCm: 175 }), [175]);
  assert.deepEqual(heightSamples(null, { heightCm: 175 }), [175]);
  assert.deepEqual(heightSamples(null, { heightCm: "175" }), []);
  assert.deepEqual(heightSamples(null, null), []);
});

test("formFromDraft keeps strings and survives an empty or broken draft", () => {
  const form = formFromDraft(draft());
  assert.equal(form.bounds.heightMinCm, "140");
  assert.equal(form.defaults.hand, "right");
  assert.equal(form.table.deskHeightFactor, "4.15");
  assert.equal(form.mannequin.offsetMm.z, "0");
  for (const input of [null, undefined, 0, "", [], "текст", { bounds: null, table: "x", mannequin: 4 }]) {
    const next = formFromDraft(input);
    assert.equal(next.bounds.heightMinCm, "");
    assert.equal(next.table.eyeForwardMm, "");
    assert.equal(next.mannequin.sku, "");
  }
});

test("draftFromForm keeps unknown keys and does not change the original", () => {
  const original = draft();
  const before = structuredClone(original);
  const form = formFromDraft(original);
  form.table.deskHeightFactor = "5";
  form.table.seatHeightFactor = "абв";
  const next = draftFromForm(original, form);
  assert.deepEqual(original, before);
  assert.notEqual(next, original);
  assert.notEqual(next.bounds, original.bounds);
  assert.deepEqual(next.extra, { keep: true });
  assert.deepEqual(next.bounds.note, { id: 1 });
  assert.equal(next.defaults.legacy, true);
  assert.equal(next.mannequin.pose, "sit");
  assert.equal(next.mannequin.offsetMm.w, 1);
  assert.equal(next.table.custom, 2);
  assert.equal(next.table.tolerance.extraTol, 1);
  assert.equal(next.table.deskHeightFactor, 5);
  assert.equal(next.table.seatHeightFactor, "абв");
  assert.equal(next.bounds.heightMinCm, 140);
  const comma = formFromDraft(original);
  comma.table.eyeAboveSeatFactor = "4,57";
  assert.equal(draftFromForm(original, comma).table.eyeAboveSeatFactor, 4.57);
});

test("empty optional eye forward and a mannequin without sku are removed only when they were absent", () => {
  const bare = { note: true, table: { seatHeightFactor: 2.6 } };
  const bareNext = draftFromForm(bare, formFromDraft(bare));
  assert.equal(Object.hasOwn(bareNext.table, "eyeForwardMm"), false);
  assert.equal(Object.hasOwn(bareNext, "mannequin"), false);
  assert.equal(bareNext.note, true);
  assert.equal(bare.table.seatHeightFactor, 2.6);

  const withEye = { table: { eyeForwardMm: 150, seatHeightFactor: 2.6 } };
  const cleared = formFromDraft(withEye);
  cleared.table.eyeForwardMm = "";
  const keptEye = draftFromForm(withEye, cleared);
  assert.equal(Object.hasOwn(keptEye.table, "eyeForwardMm"), true);
  assert.equal(keptEye.table.eyeForwardMm, "");
  assert.equal(withEye.table.eyeForwardMm, 150);

  const withMannequin = { mannequin: { sku: "character", referenceHeightCm: 180, pose: "sit" } };
  const noSku = formFromDraft(withMannequin);
  noSku.mannequin.sku = "";
  const kept = draftFromForm(withMannequin, noSku);
  assert.equal(kept.mannequin.sku, "");
  assert.equal(kept.mannequin.pose, "sit");
  assert.equal(withMannequin.mannequin.sku, "character");
});

test("bounds accept 100 and 250 and reject an inverted range", () => {
  const people = { personSkus: ["character"] };
  assert.deepEqual(validateErgonomicsForm(validForm(), people), {});
  const low = validForm();
  low.bounds.heightMinCm = "100";
  low.bounds.heightMaxCm = "250";
  low.defaults.heightCm = "100";
  assert.equal(validateErgonomicsForm(low, people)["bounds.heightMinCm"], undefined);
  assert.equal(validateErgonomicsForm(low, people)["defaults.heightCm"], undefined);
  const edges = validForm();
  edges.defaults.heightCm = "250";
  edges.bounds.heightMinCm = "100";
  edges.bounds.heightMaxCm = "250";
  assert.equal(validateErgonomicsForm(edges, people)["defaults.heightCm"], undefined);

  const below = validForm();
  below.bounds.heightMinCm = "99";
  assert.equal(validateErgonomicsForm(below, people)["bounds.heightMinCm"], "Целое число от 100 до 250");
  const above = validForm();
  above.bounds.heightMaxCm = "251";
  assert.equal(validateErgonomicsForm(above, people)["bounds.heightMaxCm"], "Целое число от 100 до 250");
  const inverted = validForm();
  inverted.bounds.heightMinCm = "200";
  inverted.bounds.heightMaxCm = "180";
  const invertedErrors = validateErgonomicsForm(inverted, people);
  assert.equal(invertedErrors["bounds.heightMinCm"], "Минимальный рост должен быть меньше максимального");
  assert.equal(invertedErrors["bounds.heightMaxCm"], "Минимальный рост должен быть меньше максимального");
  const equal = validForm();
  equal.bounds.heightMinCm = "180";
  equal.bounds.heightMaxCm = "180";
  assert.equal(
    validateErgonomicsForm(equal, people)["bounds.heightMinCm"],
    "Минимальный рост должен быть меньше максимального"
  );
});

test("the default height must sit inside the bounds and the hand is right or left", () => {
  const people = { personSkus: ["character"] };
  const low = validForm();
  low.defaults.heightCm = "139";
  assert.equal(validateErgonomicsForm(low, people)["defaults.heightCm"], "Целое число внутри границ роста");
  const high = validForm();
  high.defaults.heightCm = "211";
  assert.equal(validateErgonomicsForm(high, people)["defaults.heightCm"], "Целое число внутри границ роста");
  const fraction = validForm();
  fraction.defaults.heightCm = "175.5";
  assert.ok(validateErgonomicsForm(fraction, people)["defaults.heightCm"]);
  const atMin = validForm();
  atMin.defaults.heightCm = "140";
  assert.equal(validateErgonomicsForm(atMin, people)["defaults.heightCm"], undefined);
  const left = validForm();
  left.defaults.hand = "left";
  assert.equal(validateErgonomicsForm(left, people)["defaults.hand"], undefined);
  const badHand = validForm();
  badHand.defaults.hand = "both";
  assert.equal(validateErgonomicsForm(badHand, people)["defaults.hand"], "Выберите правую или левую руку");
  const emptyHand = validForm();
  emptyHand.defaults.hand = "";
  assert.ok(validateErgonomicsForm(emptyHand, people)["defaults.hand"]);
});

test("distance order, tolerance and offset follow the server bounds", () => {
  const people = { personSkus: ["character"] };
  const inverted = validForm();
  inverted.table.monitorDistanceMinMm = "700";
  inverted.table.monitorDistanceMaxMm = "500";
  const distanceErrors = validateErgonomicsForm(inverted, people);
  assert.equal(distanceErrors["table.monitorDistanceMinMm"], "Минимум должен быть меньше максимума");
  assert.equal(distanceErrors["table.monitorDistanceMaxMm"], "Минимум должен быть меньше максимума");
  const equal = validForm();
  equal.table.monitorDistanceMinMm = "600";
  equal.table.monitorDistanceMaxMm = "600";
  assert.ok(validateErgonomicsForm(equal, people)["table.monitorDistanceMinMm"]);
  const zero = validForm();
  zero.table.deskHeightFactor = "0";
  assert.equal(validateErgonomicsForm(zero, people)["table.deskHeightFactor"], "Число больше 0");
  const small = validForm();
  small.table.seatHeightFactor = "0.01";
  assert.equal(validateErgonomicsForm(small, people)["table.seatHeightFactor"], undefined);

  const negative = validForm();
  negative.table.tolerance.deskHeightMm = "-1";
  assert.equal(validateErgonomicsForm(negative, people)["table.tolerance.deskHeightMm"], "Число не меньше 0");
  const zeroTol = validForm();
  zeroTol.table.tolerance.monitorTopMm = "0";
  assert.equal(validateErgonomicsForm(zeroTol, people)["table.tolerance.monitorTopMm"], undefined);

  const highOffset = validForm();
  highOffset.mannequin.offsetMm.x = "501";
  assert.equal(validateErgonomicsForm(highOffset, people)["mannequin.offsetMm.x"], "Число от −500 до 500");
  const lowOffset = validForm();
  lowOffset.mannequin.offsetMm.z = "-501";
  assert.ok(validateErgonomicsForm(lowOffset, people)["mannequin.offsetMm.z"]);
  const edges = validForm();
  edges.mannequin.offsetMm.x = "500";
  edges.mannequin.offsetMm.y = "-500";
  edges.mannequin.referenceHeightCm = "100";
  assert.equal(validateErgonomicsForm(edges, people)["mannequin.offsetMm.x"], undefined);
  assert.equal(validateErgonomicsForm(edges, people)["mannequin.offsetMm.y"], undefined);
  assert.equal(validateErgonomicsForm(edges, people)["mannequin.referenceHeightCm"], undefined);
  const tall = validForm();
  tall.mannequin.referenceHeightCm = "251";
  assert.equal(validateErgonomicsForm(tall, people)["mannequin.referenceHeightCm"], "Целое число от 100 до 250");

  const forward = validForm();
  forward.table.eyeForwardMm = "";
  assert.equal(validateErgonomicsForm(forward, people)["table.eyeForwardMm"], undefined);
  forward.table.eyeForwardMm = "0";
  assert.equal(validateErgonomicsForm(forward, people)["table.eyeForwardMm"], "Число больше 0");
});

test("an unknown mannequin warns, and a missing catalog skips that check", () => {
  const missing = validForm();
  missing.mannequin.sku = "chair";
  assert.equal(
    validateErgonomicsForm(missing, { personSkus: ["character"] })["mannequin.sku"],
    "Такого товара нет среди манекенов"
  );
  assert.equal(validateErgonomicsForm(missing, { personSkus: null })["mannequin.sku"], undefined);
  assert.equal(validateErgonomicsForm(missing)["mannequin.sku"], undefined);
  assert.equal(validateErgonomicsForm(validForm(), { personSkus: [] })["mannequin.sku"], "Такого товара нет среди манекенов");

  const empty = validForm();
  empty.mannequin = { sku: "", referenceHeightCm: "", offsetMm: { x: "", y: "", z: "" } };
  assert.equal(validateErgonomicsForm(empty, { personSkus: [] })["mannequin.sku"], undefined);
  const heightOnly = validForm();
  heightOnly.mannequin.sku = "";
  assert.equal(validateErgonomicsForm(heightOnly, { personSkus: ["character"] })["mannequin.sku"], "Укажите товар-манекен");
});

test("garbage inputs do not throw", () => {
  const inputs = [null, undefined, 0, "", [], "текст", { bounds: null, table: "x", mannequin: 4, defaults: 5 }];
  for (const input of inputs) {
    assert.doesNotThrow(() => formFromDraft(input));
    assert.doesNotThrow(() => draftFromForm(input, input));
    assert.doesNotThrow(() => validateErgonomicsForm(input));
    assert.doesNotThrow(() => validateErgonomicsForm(input, { personSkus: null }));
    assert.doesNotThrow(() => ergoTargets(input, input));
    assert.doesNotThrow(() => heightSamples(input, input));
    assert.equal(typeof isDirtyForm(input, formFromDraft(input)), "boolean");
  }
  assert.equal(ergoTargets(TABLE, 175).seatHeightMm, 455);
  const form = validForm();
  assert.equal(isDirtyForm(form, validForm()), false);
  const edited = validForm();
  edited.bounds.heightMinCm = "141";
  assert.equal(isDirtyForm(form, edited), true);
  assert.equal(isDirtyForm(null, null), false);
});
