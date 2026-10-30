/* Разбор объекта настроек на поля формы. Экран только показывает то, что вернули эти функции. */

const FIELD_LABELS = {
  name: "Имя консультанта",
  greeting: "Приветствие",
  commandsIntro: "Подводка к командам",
  replies: "Ответы по ситуациям",
  inserts: "Вставки в речь",
  faq: "Частые вопросы",
  closing: "Завершение продажи",
  loyalty: "Постоянные клиенты",
  gains: "Как меняется терпение",
  reaction: "Реакция",
  bridge: "Мостик",
  tip: "Совет",
  pause: "Пауза",
  story: "История",
  decline: "Отказ",
  confirm: "Подтверждение"
};

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function describeValue(value) {
  if (typeof value === "string") {
    if (value.length > 80 || value.includes("\n")) return "longtext";
    return "text";
  }
  if (typeof value === "number") return Number.isFinite(value) ? "number" : "unknown";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) return "strings";
    if (value.some((item) => isPlainObject(item))) return "objects";
    return "unknown";
  }
  if (isPlainObject(value)) return "group";
  return "unknown";
}

function pathKey(path) {
  if (!Array.isArray(path)) return "";
  return path.map((part) => String(part)).join(".");
}

function miss(path, index) {
  const here = pathKey(path.slice(0, index + 1));
  return new Error(here ? `В данных нет пути ${here}` : "Путь не задан");
}

function setAtPath(root, path, value) {
  if (!Array.isArray(path) || path.length === 0) throw new Error("Путь не задан");
  return writeAt(root, path, 0, value);
}

function writeAt(node, path, index, value) {
  const key = path[index];
  const last = index === path.length - 1;
  if (Array.isArray(node)) {
    if (typeof key !== "number" || !Number.isInteger(key) || key < 0 || key >= node.length) {
      throw miss(path, index);
    }
    const copy = node.slice();
    copy[key] = last ? value : writeAt(node[key], path, index + 1, value);
    return copy;
  }
  if (isPlainObject(node)) {
    if (typeof key !== "string" || !Object.hasOwn(node, key)) throw miss(path, index);
    const copy = { ...node };
    copy[key] = last ? value : writeAt(node[key], path, index + 1, value);
    return copy;
  }
  throw miss(path, index);
}

function getAtPath(root, path) {
  if (!Array.isArray(path)) return undefined;
  let node = root;
  for (const key of path) {
    if (Array.isArray(node)) {
      if (typeof key !== "number" || !Number.isInteger(key) || key < 0 || key >= node.length) return undefined;
      node = node[key];
      continue;
    }
    if (!isPlainObject(node) || (typeof key !== "string" && typeof key !== "number") || !Object.hasOwn(node, key)) {
      return undefined;
    }
    node = node[key];
  }
  return node;
}

function knobsForSection(knobs, section) {
  if (!Array.isArray(knobs) || typeof section !== "string") return [];
  return knobs.filter((knob) => {
    if (!knob || typeof knob !== "object") return false;
    if (knob.section !== section) return false;
    if (typeof knob.path !== "string" || knob.path.length === 0) return false;
    return !knob.path.includes("*");
  });
}

function knobPath(knob) {
  if (!knob || typeof knob.path !== "string" || knob.path.length === 0) return [];
  return knob.path.split(".").flatMap((part) => {
    if (part.length === 0) return [];
    return [/^\d+$/.test(part) ? Number(part) : part];
  });
}

function readNumber(raw) {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false };
  }
  if (typeof raw !== "string") return { ok: false };
  const text = raw.trim();
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return { ok: false };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false };
  return { ok: true, value };
}

function boundsMessage(knob) {
  const hasMin = typeof knob.min === "number";
  const hasMax = typeof knob.max === "number";
  if (hasMin && hasMax) return `от ${knob.min} до ${knob.max}`;
  if (hasMin) return `не меньше ${knob.min}`;
  if (hasMax) return `не больше ${knob.max}`;
  return "Число вне границ";
}

function checkKnobValue(knob, raw) {
  if (!knob || typeof knob !== "object") {
    return { ok: false, value: raw, message: "Ручка указана неверно" };
  }
  if (knob.type === "number") {
    const parsed = readNumber(raw);
    if (!parsed.ok) return { ok: false, value: raw, message: "Введите число" };
    const hasMin = typeof knob.min === "number" && parsed.value < knob.min;
    const hasMax = typeof knob.max === "number" && parsed.value > knob.max;
    if (hasMin || hasMax) {
      return { ok: false, value: parsed.value, message: boundsMessage(knob) };
    }
    return { ok: true, value: parsed.value, message: "" };
  }
  if (knob.type === "enum") {
    const options = Array.isArray(knob.options) ? knob.options : [];
    if (!options.includes(raw)) return { ok: false, value: raw, message: "Нет такого варианта" };
    return { ok: true, value: raw, message: "" };
  }
  if (knob.type === "boolean") {
    if (typeof raw !== "boolean") return { ok: false, value: raw, message: "Нужно да или нет" };
    return { ok: true, value: raw, message: "" };
  }
  return { ok: false, value: raw, message: "Неизвестный тип ручки" };
}

function valueText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) return value.join("\n");
    return "";
  }
  return "";
}

function leafMatches(label, key, value, query) {
  if (query == null) return true;
  const needle = String(query).trim().toLowerCase();
  if (needle === "") return true;
  const hay = [label, key, valueText(value)].map((item) => String(item ?? "").toLowerCase());
  return hay.some((item) => item.includes(needle));
}

function labelFor(path, knobs) {
  if (!Array.isArray(path) || path.length === 0) return "";
  const joined = pathKey(path);
  const key = String(path[path.length - 1]);
  if (Array.isArray(knobs)) {
    for (const knob of knobs) {
      if (!knob || typeof knob.path !== "string" || knob.path.includes("*")) continue;
      if (knob.path !== joined) continue;
      if (typeof knob.label !== "string" || knob.label.trim() === "") continue;
      return knob.label.trim();
    }
  }
  if (Object.hasOwn(FIELD_LABELS, key)) return FIELD_LABELS[key];
  return key;
}

export {
  FIELD_LABELS,
  describeValue,
  setAtPath,
  getAtPath,
  pathKey,
  knobsForSection,
  knobPath,
  checkKnobValue,
  leafMatches,
  labelFor
};
