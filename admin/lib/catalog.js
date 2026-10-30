import { sameJson } from "./edits.js";

const AXES = ["width", "depth", "height"];
const TYPE_FIELDS = new Set(["id", "label", "canBeHost", "canHostOn", "maxOnScene"]);

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function textOf(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function copyDraft(draft) {
  if (!draft || typeof draft !== "object") return { types: [], needs: [], products: [] };
  return structuredClone(draft);
}

function parseDecimal(value) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return { empty: true, ok: false };
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(raw)) return { empty: false, ok: false };
  const number = Number(raw);
  if (!Number.isFinite(number)) return { empty: false, ok: false };
  return { empty: false, ok: true, value: number };
}

function splitWords(text) {
  const seen = new Set();
  const words = [];
  for (const part of String(text ?? "").split(/[,\n\r]+/)) {
    const word = part.trim();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }
  return words;
}

function joinWords(list) {
  if (!Array.isArray(list)) return "";
  return splitWords(list.join("\n")).join(", ");
}

function productRows(draft, published) {
  const labels = new Map();
  for (const type of asList(draft && draft.types)) {
    if (!type || typeof type.id !== "string" || !type.id) continue;
    labels.set(type.id, typeof type.label === "string" && type.label ? type.label : type.id);
  }
  const publishedBySku = new Map();
  for (const product of asList(published && published.products)) {
    if (product && typeof product.sku === "string" && product.sku) publishedBySku.set(product.sku, product);
  }
  const rows = [];
  for (const product of asList(draft && draft.products)) {
    if (!product || typeof product !== "object" || typeof product.sku !== "string" || !product.sku) continue;
    const type = typeof product.type === "string" ? product.type : "";
    const dimensions = product.dimensions && typeof product.dimensions === "object" ? product.dimensions : {};
    const publishedProduct = publishedBySku.get(product.sku);
    rows.push({
      sku: product.sku,
      name: typeof product.name === "string" ? product.name : "",
      label: typeof product.label === "string" ? product.label : "",
      type,
      typeLabel: labels.get(type) || type,
      width: numberOrNull(dimensions.width),
      depth: numberOrNull(dimensions.depth),
      height: numberOrNull(dimensions.height),
      priceEur: typeof product.priceEur === "number" && Number.isFinite(product.priceEur) ? product.priceEur : null,
      movable: type === "person" ? null : product.movable !== false,
      modelListed: Boolean(product.media && product.media.model3d),
      unpublished: !publishedProduct || !sameJson(product, publishedProduct),
      words: asList(product.words).filter((word) => typeof word === "string")
    });
  }
  return rows;
}

function filterRows(rows, query) {
  const type = query && typeof query.type === "string" ? query.type : "";
  const text = query && query.text != null ? String(query.text).trim().toLowerCase() : "";
  return asList(rows).filter((row) => {
    if (!row || typeof row !== "object") return false;
    if (type && row.type !== type) return false;
    if (!text) return true;
    const words = asList(row.words).join("\n");
    const haystack = [row.sku, row.name, row.label, words].join("\n").toLowerCase();
    return haystack.includes(text);
  });
}

function productToForm(product) {
  const empty = {
    sku: "",
    type: "",
    name: "",
    label: "",
    width: "",
    depth: "",
    height: "",
    priceEur: "",
    words: "",
    movable: true,
    seatHeightMm: "",
    hostSku: ""
  };
  if (!product || typeof product !== "object") return empty;
  const dimensions = product.dimensions && typeof product.dimensions === "object" ? product.dimensions : {};
  const placement = product.placement && typeof product.placement === "object" ? product.placement : {};
  return {
    sku: textOf(product.sku),
    type: textOf(product.type),
    name: textOf(product.name),
    label: textOf(product.label),
    width: dimensions.width == null ? "" : String(dimensions.width),
    depth: dimensions.depth == null ? "" : String(dimensions.depth),
    height: dimensions.height == null ? "" : String(dimensions.height),
    priceEur: product.priceEur == null ? "" : String(product.priceEur),
    words: joinWords(product.words),
    movable: product.type === "person" ? true : product.movable !== false,
    seatHeightMm: placement.seatHeightMm == null ? "" : String(placement.seatHeightMm),
    hostSku: textOf(placement.hostSku)
  };
}

function formToProduct(form, original) {
  const source = form && typeof form === "object" ? form : {};
  const isNew = !original || typeof original !== "object" || typeof original.sku !== "string" || original.sku.length === 0;
  const base = isNew ? {} : structuredClone(original);
  const type = String(source.type ?? "").trim();
  const sku = String(source.sku ?? "").trim();
  const isPerson = type === "person";
  base.sku = sku;
  base.type = type;

  const name = String(source.name ?? "").trim();
  if (name) base.name = name;
  else delete base.name;

  const label = String(source.label ?? "").trim();
  if (label) base.label = label;
  else delete base.label;

  const dimensions =
    base.dimensions && typeof base.dimensions === "object" && !Array.isArray(base.dimensions) ? base.dimensions : {};
  for (const key of AXES) {
    const parsed = parseDecimal(source[key]);
    if (parsed.ok) dimensions[key] = parsed.value;
  }
  base.dimensions = dimensions;

  if (isPerson) delete base.priceEur;
  else {
    const price = parseDecimal(source.priceEur);
    if (price.ok) base.priceEur = price.value;
  }

  base.words = splitWords(source.words);

  if (!isPerson) {
    const wantOn = source.movable !== false;
    const hadFlag = !isNew && Object.hasOwn(original, "movable");
    if (!wantOn) base.movable = false;
    else if (hadFlag) base.movable = true;
    else delete base.movable;
  }

  const placement =
    base.placement && typeof base.placement === "object" && !Array.isArray(base.placement) ? base.placement : {};
  const seat = String(source.seatHeightMm ?? "").trim();
  const host = String(source.hostSku ?? "").trim();
  if (!seat) delete placement.seatHeightMm;
  else if (/^\d+$/.test(seat)) placement.seatHeightMm = Number(seat);
  if (!host) delete placement.hostSku;
  else placement.hostSku = host;
  if (Object.keys(placement).length === 0) delete base.placement;
  else base.placement = placement;

  if (isNew) base.media = { model3d: `${sku}.glb` };
  return base;
}

function validateProductForm(form, options = {}) {
  const source = form && typeof form === "object" ? form : {};
  const existingSkus = asList(options.existingSkus).filter((sku) => typeof sku === "string");
  const typeIds = asList(options.typeIds).filter((id) => typeof id === "string");
  const productSkus = asList(options.productSkus).filter((sku) => typeof sku === "string");
  const errors = {};
  const sku = String(source.sku ?? "").trim();
  const type = String(source.type ?? "").trim();
  const taken = new Set(existingSkus);
  if (!options.isNew) taken.delete(sku);

  if (!sku) errors.sku = "Укажите артикул";
  else if (taken.has(sku)) errors.sku = "Такой артикул уже есть";

  if (!type) errors.type = "Выберите тип";
  else if (!typeIds.includes(type)) errors.type = "Такого типа нет";

  const label = String(source.label ?? "");
  if (label.length > 0 && label.trim() === "") errors.label = "Подпись не может быть пустой";

  const sizeNames = [
    ["width", "Укажите ширину"],
    ["depth", "Укажите глубину"],
    ["height", "Укажите высоту"]
  ];
  for (const [key, emptyText] of sizeNames) {
    const parsed = parseDecimal(source[key]);
    if (parsed.empty) errors[key] = emptyText;
    else if (!parsed.ok || !(parsed.value > 0)) errors[key] = "Нужно положительное число";
  }

  if (type !== "person") {
    const price = parseDecimal(source.priceEur);
    if (price.empty) errors.priceEur = "Укажите цену";
    else if (!price.ok) errors.priceEur = "Нужно число";
    else if (price.value < 0) errors.priceEur = "Цена не может быть отрицательной";
    if (splitWords(source.words).length === 0) errors.words = "Добавьте хотя бы одно слово";
  }

  const seat = String(source.seatHeightMm ?? "").trim();
  if (seat && !/^\d+$/.test(seat)) errors.seatHeightMm = "Нужно целое число от нуля";

  const host = String(source.hostSku ?? "").trim();
  if (host) {
    if (host === sku) errors.hostSku = "Нельзя выбрать этот же товар";
    else if (!productSkus.includes(host)) errors.hostSku = "Такого товара нет";
  }

  return errors;
}

function replaceProduct(draft, sku, product) {
  const next = copyDraft(draft);
  const products = asList(next.products);
  const index = products.findIndex((item) => item && item.sku === sku);
  if (index >= 0) products[index] = structuredClone(product);
  next.products = products;
  return next;
}

function addProduct(draft, product) {
  const next = copyDraft(draft);
  const products = asList(next.products);
  products.push(structuredClone(product));
  next.products = products;
  return next;
}

function removeProduct(draft, sku) {
  const next = copyDraft(draft);
  next.products = asList(next.products).filter((item) => !item || item.sku !== sku);
  return next;
}

function replaceItem(draft, key, id, item) {
  const next = copyDraft(draft);
  const list = asList(next[key]);
  const index = list.findIndex((entry) => entry && entry.id === id);
  if (index < 0) {
    next[key] = list;
    return next;
  }
  list[index] = structuredClone(item);
  next[key] = list;
  return next;
}

function compareSizes(sizeMm, catalogMm, toleranceMm = 2) {
  const tolerance = typeof toleranceMm === "number" && Number.isFinite(toleranceMm) ? toleranceMm : 2;
  const modelBox = sizeMm && typeof sizeMm === "object" ? sizeMm : {};
  const catalogBox = catalogMm && typeof catalogMm === "object" ? catalogMm : {};
  return AXES.map((axis) => {
    const model = modelBox[axis];
    const catalog = catalogBox[axis];
    const modelOk = typeof model === "number" && Number.isFinite(model);
    const catalogOk = typeof catalog === "number" && Number.isFinite(catalog);
    const diff = modelOk && catalogOk ? model - catalog : null;
    return { axis, model, catalog, diff, ok: diff != null && Math.abs(diff) <= tolerance };
  });
}

function matchingNeeds(product, needs) {
  if (!product || typeof product !== "object" || product.type === "person") return [];
  return asList(needs).filter((need) => {
    const criteria = need && need.criteria;
    if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) return false;
    if (criteria.type !== product.type || criteria.type === "person") return false;
    if (criteria.minWidth != null && criteria.minWidth !== "") {
      const width = product.dimensions && product.dimensions.width;
      if (typeof width !== "number" || !(width >= Number(criteria.minWidth))) return false;
    }
    return typeof criteria.type === "string" && criteria.type.length > 0;
  });
}

function typeFacts(typeId, types) {
  const list = asList(types);
  const type = list.find((item) => item && item.id === typeId);
  if (!type) return null;
  const hosts = asList(type.canHostOn);
  return {
    label: typeof type.label === "string" && type.label ? type.label : typeId,
    canBeHost: type.canBeHost === true,
    canHostOn: hosts.map((id) => {
      const host = list.find((item) => item && item.id === id);
      return { id, label: host && typeof host.label === "string" && host.label ? host.label : id };
    }),
    maxOnScene: type.maxOnScene
  };
}

function typeExtra(type) {
  const extra = {};
  if (!type || typeof type !== "object") return extra;
  for (const [key, value] of Object.entries(type)) {
    if (TYPE_FIELDS.has(key)) continue;
    extra[key] = value;
  }
  return extra;
}

function typeToForm(type) {
  const source = type && typeof type === "object" ? type : {};
  return {
    label: typeof source.label === "string" ? source.label : "",
    canBeHost: source.canBeHost === true,
    canHostOn: asList(source.canHostOn).filter((id) => typeof id === "string"),
    maxOnScene: source.maxOnScene == null || source.maxOnScene === "" ? "" : String(source.maxOnScene),
    extraText: JSON.stringify(typeExtra(source), null, 2)
  };
}

function applyTypeFields(original, fields) {
  const source = fields && typeof fields === "object" ? fields : {};
  const next = original && typeof original === "object" ? structuredClone(original) : {};
  const extra = source.extra && typeof source.extra === "object" && !Array.isArray(source.extra) ? source.extra : {};
  next.label = typeof source.label === "string" ? source.label : "";
  next.canBeHost = source.canBeHost === true;
  next.canHostOn = asList(source.canHostOn).slice();
  if (source.maxOnScene == null || source.maxOnScene === "") delete next.maxOnScene;
  else next.maxOnScene = source.maxOnScene;
  for (const key of Object.keys(next)) {
    if (!TYPE_FIELDS.has(key)) delete next[key];
  }
  for (const [key, value] of Object.entries(extra)) {
    if (TYPE_FIELDS.has(key)) continue;
    next[key] = structuredClone(value);
  }
  return next;
}

function parseObjectText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { ok: true, value: {} };
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Некорректный JSON" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Нужен JSON-объект" };
  return { ok: true, value };
}

function validateTypeForm(form, extraText) {
  const source = form && typeof form === "object" ? form : {};
  const errors = {};
  if (!String(source.label ?? "").trim()) errors.label = "Укажите название";
  const max = String(source.maxOnScene ?? "").trim();
  if (max && (!/^\d+$/.test(max) || Number(max) < 1)) errors.maxOnScene = "Нужно целое число от 1";
  const extra = parseObjectText(extraText);
  if (!extra.ok) errors.extra = extra.error;
  return errors;
}

function needToForm(need) {
  const source = need && typeof need === "object" ? need : {};
  const criteria = source.criteria && typeof source.criteria === "object" && !Array.isArray(source.criteria) ? source.criteria : {};
  return {
    name: typeof source.name === "string" ? source.name : "",
    why: typeof source.why === "string" ? source.why : "",
    type: typeof criteria.type === "string" ? criteria.type : "",
    minWidth: criteria.minWidth == null || criteria.minWidth === "" ? "" : String(criteria.minWidth)
  };
}

function applyNeedFields(original, fields) {
  const source = fields && typeof fields === "object" ? fields : {};
  const next = original && typeof original === "object" ? structuredClone(original) : {};
  next.name = typeof source.name === "string" ? source.name : "";
  next.why = typeof source.why === "string" ? source.why : "";
  const criteria =
    next.criteria && typeof next.criteria === "object" && !Array.isArray(next.criteria) ? next.criteria : {};
  criteria.type = typeof source.type === "string" ? source.type : "";
  if (source.minWidth == null || source.minWidth === "") delete criteria.minWidth;
  else criteria.minWidth = source.minWidth;
  next.criteria = criteria;
  return next;
}

function validateNeedForm(form) {
  const source = form && typeof form === "object" ? form : {};
  const errors = {};
  if (!String(source.name ?? "").trim()) errors.name = "Укажите название";
  if (!String(source.type ?? "").trim()) errors.type = "Выберите тип";
  const min = String(source.minWidth ?? "").trim();
  if (min && (!/^\d+$/.test(min) || Number(min) < 0)) errors.minWidth = "Нужно целое число от нуля";
  return errors;
}

export {
  productRows,
  filterRows,
  productToForm,
  formToProduct,
  splitWords,
  joinWords,
  validateProductForm,
  replaceProduct,
  addProduct,
  removeProduct,
  replaceItem,
  compareSizes,
  matchingNeeds,
  typeFacts,
  typeExtra,
  typeToForm,
  applyTypeFields,
  parseObjectText,
  validateTypeForm,
  needToForm,
  applyNeedFields,
  validateNeedForm
};
