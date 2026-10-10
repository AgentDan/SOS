const LAYER_ORDER = ["dialog", "product", "acquisition", "production"];

const LAYER_TITLES = {
  dialog: "Ручки диалога",
  product: "Ручки продукта",
  acquisition: "Ручки привлечения",
  production: "Ручки производства"
};

function groupKnobsByLayer(knobs) {
  const buckets = new Map(LAYER_ORDER.map((layer) => [layer, []]));
  const extra = new Map();
  const list = Array.isArray(knobs) ? knobs : [];
  for (const knob of list) {
    if (!knob || typeof knob !== "object") continue;
    if (buckets.has(knob.layer)) {
      buckets.get(knob.layer).push(knob);
      continue;
    }
    const key = typeof knob.layer === "string" ? knob.layer : "";
    if (!extra.has(key)) extra.set(key, []);
    extra.get(key).push(knob);
  }

  const groups = [];
  for (const layer of LAYER_ORDER) {
    const items = buckets.get(layer);
    if (items.length > 0) groups.push({ layer, title: LAYER_TITLES[layer], knobs: items });
  }
  for (const [layer, items] of extra) {
    if (items.length === 0) continue;
    groups.push({
      layer,
      title: layer ? `Ручки: ${layer}` : "Ручки без слоя",
      knobs: items
    });
  }
  return groups;
}

function describeKnobValues(knob) {
  const raw = knob && Array.isArray(knob.values) ? knob.values : [];
  const values = raw.filter((item) => item && typeof item === "object");
  if (values.length === 0) return { broken: true, multiple: false, rows: [] };

  const multiple = values.length > 1 || (typeof knob.path === "string" && knob.path.includes("*"));
  const rows = values.map((item, index) => {
    const at = typeof item.at === "string" ? item.at : "";
    const key = item.key == null || item.key === "" ? "" : String(item.key);
    return {
      at,
      value: item.value,
      key,
      label: key || at || `Значение ${index + 1}`,
      applicable: at.length > 0
    };
  });
  return { broken: false, multiple, rows };
}

function boundsText(knob) {
  if (!knob || typeof knob !== "object") return "";
  if (knob.type === "number") {
    const hasMin = typeof knob.min === "number";
    const hasMax = typeof knob.max === "number";
    if (hasMin && hasMax) return `от ${knob.min} до ${knob.max}`;
    if (hasMin) return `не меньше ${knob.min}`;
    if (hasMax) return `не больше ${knob.max}`;
    return "";
  }
  if (knob.type === "enum" && Array.isArray(knob.options) && knob.options.length > 0) {
    return knob.options.map((option) => String(option)).join(", ");
  }
  if (knob.type === "boolean") return "да или нет";
  return "";
}

function checkKnobValue(knob, value) {
  if (!knob || typeof knob !== "object") return ["Ручка указана неверно"];
  if (knob.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return ["Нужно число"];
    const errors = [];
    if (typeof knob.min === "number" && value < knob.min) errors.push(`Меньше минимума ${knob.min}`);
    if (typeof knob.max === "number" && value > knob.max) errors.push(`Больше максимума ${knob.max}`);
    return errors;
  }
  if (knob.type === "string") return typeof value === "string" ? [] : ["Нужна строка"];
  if (knob.type === "boolean") return typeof value === "boolean" ? [] : ["Нужно да или нет"];
  if (knob.type === "enum") {
    if (!Array.isArray(knob.options) || !knob.options.includes(value)) return ["Нет такого варианта"];
    return [];
  }
  return ["Неизвестный тип ручки"];
}

function knobTitle(knob) {
  if (knob && typeof knob.label === "string" && knob.label.trim()) return knob.label.trim();
  if (knob && typeof knob.id === "string" && knob.id) return knob.id;
  return "Ручка";
}

function readEnumValue(knob, raw) {
  const options = knob && Array.isArray(knob.options) ? knob.options : [];
  const found = options.find((option) => option === raw || String(option) === String(raw));
  return found === undefined ? raw : found;
}

export {
  LAYER_ORDER,
  LAYER_TITLES,
  groupKnobsByLayer,
  describeKnobValues,
  boundsText,
  checkKnobValue,
  knobTitle,
  readEnumValue
};
