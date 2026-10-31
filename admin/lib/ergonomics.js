import { sameJson } from "./edits.js";

// Формулы зеркалят backend/ergonomics/ergonomics.js.
// Если расчёт на сервере изменится, менять нужно оба места.

const RANGE_MIN = 100;
const RANGE_MAX = 250;
const OFFSET_LIMIT = 500;

const FACTORS = ["seatHeightFactor", "deskHeightFactor", "eyeAboveSeatFactor", "monitorDistanceFactor"];
const DISTANCES = ["monitorDistanceMinMm", "monitorDistanceMaxMm"];
const TOLERANCES = ["deskHeightMm", "monitorDistanceMm", "monitorTopMm"];

const TEXT = {
  range: "Целое число от 100 до 250",
  order: "Минимальный рост должен быть меньше максимального",
  inside: "Целое число внутри границ роста",
  hand: "Выберите правую или левую руку",
  positive: "Число больше 0",
  distance: "Минимум должен быть меньше максимума",
  tolerance: "Число не меньше 0",
  offset: "Число от −500 до 500",
  skuMissing: "Укажите товар-манекен",
  skuUnknown: "Такого товара нет среди манекенов"
};

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function textOf(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value;
  return "";
}

function parsedNumber(raw) {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (text === "") return { kind: "empty" };
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return { kind: "bad" };
  const value = Number(text);
  if (!Number.isFinite(value)) return { kind: "bad" };
  return { kind: "number", value };
}

function readNumber(raw) {
  const parsed = parsedNumber(raw);
  if (parsed.kind === "number") return parsed.value;
  if (parsed.kind === "empty") return "";
  return typeof raw === "string" ? raw : String(raw ?? "");
}

function inBodyRange(parsed) {
  return (
    parsed.kind === "number" &&
    Number.isInteger(parsed.value) &&
    parsed.value >= RANGE_MIN &&
    parsed.value <= RANGE_MAX
  );
}

function filled(value) {
  return String(value ?? "").trim() !== "";
}

function tableReady(table) {
  return (
    isRecord(table) &&
    positive(table.seatHeightFactor) &&
    positive(table.deskHeightFactor) &&
    positive(table.eyeAboveSeatFactor) &&
    positive(table.monitorDistanceFactor) &&
    positive(table.monitorDistanceMinMm) &&
    positive(table.monitorDistanceMaxMm) &&
    table.monitorDistanceMinMm < table.monitorDistanceMaxMm
  );
}

function ergoTargets(table, heightCm) {
  if (!tableReady(table) || !positive(heightCm)) return null;
  const seatHeightMm = Math.round(heightCm * table.seatHeightFactor);
  const deskHeightMm = Math.round(heightCm * table.deskHeightFactor);
  const eyeHeightMm = Math.round(seatHeightMm + heightCm * table.eyeAboveSeatFactor);
  const span = heightCm * table.monitorDistanceFactor;
  const monitorDistanceMm = Math.round(
    Math.min(table.monitorDistanceMaxMm, Math.max(table.monitorDistanceMinMm, span))
  );
  return {
    seatHeightMm,
    deskHeightMm,
    eyeHeightMm,
    monitorDistanceMm,
    monitorTopMm: eyeHeightMm
  };
}

function heightSamples(bounds, defaults) {
  const min = isRecord(bounds) ? bounds.heightMinCm : undefined;
  const max = isRecord(bounds) ? bounds.heightMaxCm : undefined;
  const height = isRecord(defaults) ? defaults.heightCm : undefined;
  const minOk = typeof min === "number" && Number.isFinite(min);
  const maxOk = typeof max === "number" && Number.isFinite(max);
  const heightOk = typeof height === "number" && Number.isFinite(height);
  if (!minOk || !maxOk || min >= max) return heightOk ? [height] : [];
  const values = [min, max];
  if (heightOk) values.push(height);
  return [...new Set(values)].sort((left, right) => left - right);
}

function formFromDraft(draft) {
  const root = isRecord(draft) ? draft : {};
  const bounds = isRecord(root.bounds) ? root.bounds : {};
  const defaults = isRecord(root.defaults) ? root.defaults : {};
  const mannequin = isRecord(root.mannequin) ? root.mannequin : {};
  const offset = isRecord(mannequin.offsetMm) ? mannequin.offsetMm : {};
  const table = isRecord(root.table) ? root.table : {};
  const tolerance = isRecord(table.tolerance) ? table.tolerance : {};
  return {
    bounds: {
      heightMinCm: textOf(bounds.heightMinCm),
      heightMaxCm: textOf(bounds.heightMaxCm)
    },
    defaults: {
      heightCm: textOf(defaults.heightCm),
      hand: typeof defaults.hand === "string" ? defaults.hand : ""
    },
    mannequin: {
      sku: typeof mannequin.sku === "string" ? mannequin.sku.trim() : "",
      referenceHeightCm: textOf(mannequin.referenceHeightCm),
      offsetMm: {
        x: textOf(offset.x),
        y: textOf(offset.y),
        z: textOf(offset.z)
      }
    },
    table: {
      seatHeightFactor: textOf(table.seatHeightFactor),
      deskHeightFactor: textOf(table.deskHeightFactor),
      eyeAboveSeatFactor: textOf(table.eyeAboveSeatFactor),
      monitorDistanceFactor: textOf(table.monitorDistanceFactor),
      monitorDistanceMinMm: textOf(table.monitorDistanceMinMm),
      monitorDistanceMaxMm: textOf(table.monitorDistanceMaxMm),
      eyeForwardMm: textOf(table.eyeForwardMm),
      tolerance: {
        deskHeightMm: textOf(tolerance.deskHeightMm),
        monitorDistanceMm: textOf(tolerance.monitorDistanceMm),
        monitorTopMm: textOf(tolerance.monitorTopMm)
      }
    }
  };
}

function cloneRecord(value) {
  if (!isRecord(value)) return {};
  try {
    return structuredClone(value);
  } catch {
    return {};
  }
}

function draftFromForm(original, form) {
  const hadMannequin = isRecord(original) && Object.hasOwn(original, "mannequin");
  const hadEye = isRecord(original) && isRecord(original.table) && Object.hasOwn(original.table, "eyeForwardMm");
  const source = cloneRecord(original);
  const view = formFromDraft(form);

  source.bounds = isRecord(source.bounds) ? source.bounds : {};
  source.bounds.heightMinCm = readNumber(view.bounds.heightMinCm);
  source.bounds.heightMaxCm = readNumber(view.bounds.heightMaxCm);

  source.defaults = isRecord(source.defaults) ? source.defaults : {};
  source.defaults.heightCm = readNumber(view.defaults.heightCm);
  source.defaults.hand = view.defaults.hand;

  source.table = isRecord(source.table) ? source.table : {};
  for (const key of FACTORS) source.table[key] = readNumber(view.table[key]);
  for (const key of DISTANCES) source.table[key] = readNumber(view.table[key]);
  if (!filled(view.table.eyeForwardMm) && !hadEye) delete source.table.eyeForwardMm;
  else source.table.eyeForwardMm = readNumber(view.table.eyeForwardMm);
  source.table.tolerance = isRecord(source.table.tolerance) ? source.table.tolerance : {};
  for (const key of TOLERANCES) source.table.tolerance[key] = readNumber(view.table.tolerance[key]);

  const sku = view.mannequin.sku.trim();
  if (!sku && !hadMannequin) {
    delete source.mannequin;
  } else {
    source.mannequin = isRecord(source.mannequin) ? source.mannequin : {};
    source.mannequin.sku = sku;
    source.mannequin.referenceHeightCm = readNumber(view.mannequin.referenceHeightCm);
    source.mannequin.offsetMm = isRecord(source.mannequin.offsetMm) ? source.mannequin.offsetMm : {};
    source.mannequin.offsetMm.x = readNumber(view.mannequin.offsetMm.x);
    source.mannequin.offsetMm.y = readNumber(view.mannequin.offsetMm.y);
    source.mannequin.offsetMm.z = readNumber(view.mannequin.offsetMm.z);
  }
  return source;
}

function personList(options) {
  if (!isRecord(options) || !Object.hasOwn(options, "personSkus")) return null;
  return options.personSkus;
}

function validateErgonomicsForm(form, options) {
  const errors = {};
  const view = formFromDraft(form);
  const minParsed = parsedNumber(view.bounds.heightMinCm);
  const maxParsed = parsedNumber(view.bounds.heightMaxCm);
  let minValue = null;
  let maxValue = null;
  if (!inBodyRange(minParsed)) errors["bounds.heightMinCm"] = TEXT.range;
  else minValue = minParsed.value;
  if (!inBodyRange(maxParsed)) errors["bounds.heightMaxCm"] = TEXT.range;
  else maxValue = maxParsed.value;
  if (minValue !== null && maxValue !== null && minValue >= maxValue) {
    errors["bounds.heightMinCm"] = TEXT.order;
    errors["bounds.heightMaxCm"] = TEXT.order;
    minValue = null;
    maxValue = null;
  }
  const boundsUsable = minValue !== null && maxValue !== null;
  const height = parsedNumber(view.defaults.heightCm);
  const outside = boundsUsable && (height.kind !== "number" || height.value < minValue || height.value > maxValue);
  if (height.kind !== "number" || !Number.isInteger(height.value) || outside) {
    errors["defaults.heightCm"] = TEXT.inside;
  }
  if (view.defaults.hand !== "right" && view.defaults.hand !== "left") {
    errors["defaults.hand"] = TEXT.hand;
  }

  const mannequin = view.mannequin;
  const active =
    filled(mannequin.sku) ||
    filled(mannequin.referenceHeightCm) ||
    filled(mannequin.offsetMm.x) ||
    filled(mannequin.offsetMm.y) ||
    filled(mannequin.offsetMm.z);
  if (active) {
    const sku = mannequin.sku.trim();
    const people = personList(options);
    if (!sku) errors["mannequin.sku"] = TEXT.skuMissing;
    else if (Array.isArray(people) && !people.includes(sku)) errors["mannequin.sku"] = TEXT.skuUnknown;
    if (!inBodyRange(parsedNumber(mannequin.referenceHeightCm))) {
      errors["mannequin.referenceHeightCm"] = TEXT.range;
    }
    for (const axis of ["x", "y", "z"]) {
      const parsed = parsedNumber(mannequin.offsetMm[axis]);
      if (parsed.kind !== "number" || parsed.value < -OFFSET_LIMIT || parsed.value > OFFSET_LIMIT) {
        errors[`mannequin.offsetMm.${axis}`] = TEXT.offset;
      }
    }
  }

  for (const key of FACTORS) {
    const parsed = parsedNumber(view.table[key]);
    if (parsed.kind !== "number" || parsed.value <= 0) errors[`table.${key}`] = TEXT.positive;
  }
  for (const key of DISTANCES) {
    const parsed = parsedNumber(view.table[key]);
    if (parsed.kind !== "number" || parsed.value <= 0) errors[`table.${key}`] = TEXT.positive;
  }
  const minDistance = parsedNumber(view.table.monitorDistanceMinMm);
  const maxDistance = parsedNumber(view.table.monitorDistanceMaxMm);
  if (
    minDistance.kind === "number" &&
    maxDistance.kind === "number" &&
    minDistance.value > 0 &&
    maxDistance.value > 0 &&
    minDistance.value >= maxDistance.value
  ) {
    errors["table.monitorDistanceMinMm"] = TEXT.distance;
    errors["table.monitorDistanceMaxMm"] = TEXT.distance;
  }
  if (filled(view.table.eyeForwardMm)) {
    const parsed = parsedNumber(view.table.eyeForwardMm);
    if (parsed.kind !== "number" || parsed.value <= 0) errors["table.eyeForwardMm"] = TEXT.positive;
  }
  for (const key of TOLERANCES) {
    const parsed = parsedNumber(view.table.tolerance[key]);
    if (parsed.kind !== "number" || parsed.value < 0) errors[`table.tolerance.${key}`] = TEXT.tolerance;
  }
  return errors;
}

function isDirtyForm(a, b) {
  return !sameJson(a, b);
}

export { draftFromForm, ergoTargets, formFromDraft, heightSamples, isDirtyForm, validateErgonomicsForm };
