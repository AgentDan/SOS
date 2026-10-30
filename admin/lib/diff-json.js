const TEXT_LIMIT = 80;
const ID_KEYS = ["sku", "id", "name"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isScalar(value) {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isIdValue(value) {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function same(was, now) {
  if (was === now) return true;
  if (typeof was !== typeof now) return false;
  if (was === null || now === null) return false;
  if (typeof was !== "object") return false;
  if (Array.isArray(was) || Array.isArray(now)) {
    if (!Array.isArray(was) || !Array.isArray(now) || was.length !== now.length) return false;
    for (let index = 0; index < was.length; index += 1) {
      if (!same(was[index], now[index])) return false;
    }
    return true;
  }
  const keys = Object.keys(was);
  if (keys.length !== Object.keys(now).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(now, key) || !same(was[key], now[key])) return false;
  }
  return true;
}

function clip(text) {
  if (text.length <= TEXT_LIMIT) return text;
  return `${text.slice(0, TEXT_LIMIT - 1)}…`;
}

function scalarText(value) {
  if (value === null) return "null";
  if (typeof value === "string") return clip(value);
  return String(value);
}

function valueText(value) {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return clip(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.length} шт.]`;
  if (isPlainObject(value)) return "{…}";
  return clip(String(value));
}

function joinedScalars(items) {
  return items.map(scalarText).join(", ");
}

function row(path, kind, was, now) {
  return { path, kind, was: valueText(was), now: valueText(now) };
}

function joinKey(path, key) {
  return path ? `${path}.${key}` : key;
}

function arrayKind(items) {
  if (items.length === 0) return "empty";
  if (items.every(isScalar)) return "scalar";
  if (items.every(isPlainObject)) return "object";
  return "mixed";
}

function sideHasId(items, key) {
  if (items.length === 0) return true;
  return items.every((item) => isPlainObject(item) && Object.hasOwn(item, key) && isIdValue(item[key]));
}

function sharedIdKey(was, now) {
  for (const key of ID_KEYS) {
    if (sideHasId(was, key) && sideHasId(now, key)) return key;
  }
  return null;
}

function diffById(was, now, key, path, out) {
  const wasMap = new Map();
  const nowMap = new Map();
  for (const item of was) {
    const id = String(item[key]);
    if (!wasMap.has(id)) wasMap.set(id, item);
  }
  for (const item of now) {
    const id = String(item[key]);
    if (!nowMap.has(id)) nowMap.set(id, item);
  }
  const order = [];
  const seen = new Set();
  for (const item of [...was, ...now]) {
    const id = String(item[key]);
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  for (const id of order) {
    const child = `${path}[${id}]`;
    const before = wasMap.get(id);
    const after = nowMap.get(id);
    if (before && !after) out.push(row(child, "removed", before, undefined));
    else if (!before && after) out.push(row(child, "added", undefined, after));
    else walk(before, after, child, out);
  }
}

function diffByIndex(was, now, path, out) {
  const length = Math.max(was.length, now.length);
  for (let index = 0; index < length; index += 1) {
    const child = `${path}[${index}]`;
    if (index >= was.length) out.push(row(child, "added", undefined, now[index]));
    else if (index >= now.length) out.push(row(child, "removed", was[index], undefined));
    else walk(was[index], now[index], child, out);
  }
}

function diffArrays(was, now, path, out) {
  const wasKind = arrayKind(was);
  const nowKind = arrayKind(now);
  const scalarPair =
    (wasKind === "scalar" || wasKind === "empty") && (nowKind === "scalar" || nowKind === "empty");
  if (scalarPair && (wasKind === "scalar" || nowKind === "scalar")) {
    out.push({
      path: path || "(значение)",
      kind: "changed",
      was: joinedScalars(was),
      now: joinedScalars(now)
    });
    return;
  }
  if (wasKind === "scalar" || nowKind === "scalar") {
    out.push(row(path || "(значение)", "changed", was, now));
    return;
  }
  const key = sharedIdKey(was, now);
  if (key && wasKind !== "mixed" && nowKind !== "mixed") {
    diffById(was, now, key, path, out);
    return;
  }
  diffByIndex(was, now, path, out);
}

function walk(was, now, path, out) {
  if (same(was, now)) return;
  if (isPlainObject(was) && isPlainObject(now)) {
    const keys = [...new Set([...Object.keys(was), ...Object.keys(now)])].sort();
    for (const key of keys) {
      const child = joinKey(path, key);
      const hasWas = Object.hasOwn(was, key);
      const hasNow = Object.hasOwn(now, key);
      if (!hasWas) out.push(row(child, "added", undefined, now[key]));
      else if (!hasNow) out.push(row(child, "removed", was[key], undefined));
      else walk(was[key], now[key], child, out);
    }
    return;
  }
  if (Array.isArray(was) && Array.isArray(now)) {
    diffArrays(was, now, path, out);
    return;
  }
  out.push(row(path || "(значение)", "changed", was, now));
}

function readLimit(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 500;
  return Math.max(0, Math.floor(value));
}

function diffJson(published, draft, options) {
  const limit = readLimit(options && options.limit);
  if (published === undefined) {
    const found = [{ path: "(весь раздел)", kind: "added", was: "—", now: "ещё не публиковался" }];
    const rows = found.slice(0, limit);
    return { rows, total: found.length, truncated: found.length > rows.length };
  }
  const found = [];
  walk(published, draft, "", found);
  const rows = found.slice(0, limit);
  return { rows, total: found.length, truncated: found.length > rows.length };
}

export { diffJson };
