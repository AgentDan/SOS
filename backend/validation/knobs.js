import { isPlainObject } from "./envelope.js";

const LAYERS = new Set(["dialog", "product", "acquisition", "production"]);
const TYPES = new Set(["number", "string", "boolean", "enum"]);
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const BANNED = new Set(["__proto__", "prototype", "constructor"]);

function childKey(child, inherited) {
  if (isPlainObject(child) && typeof child.sku === "string") return child.sku;
  return inherited;
}

function locate(draft, pathTemplate) {
  const tokens = String(pathTemplate).split(".");
  const found = [];

  function visit(node, index, parts, key) {
    if (index === tokens.length) {
      const item = { at: parts.join("."), value: node };
      if (key !== undefined) item.key = key;
      found.push(item);
      return;
    }

    const token = tokens[index];
    if (BANNED.has(token) || token === "") return;

    if (token === "*") {
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i += 1) {
          visit(node[i], index + 1, parts.concat(String(i)), childKey(node[i], key));
        }
      } else if (isPlainObject(node)) {
        for (const prop of Object.keys(node)) {
          if (BANNED.has(prop)) continue;
          visit(node[prop], index + 1, parts.concat(prop), childKey(node[prop], key));
        }
      }
      return;
    }

    if (Array.isArray(node)) {
      if (!/^\d+$/.test(token)) return;
      const i = Number(token);
      if (i >= node.length) return;
      visit(node[i], index + 1, parts.concat(String(i)), childKey(node[i], key));
      return;
    }

    if (!isPlainObject(node) || !Object.hasOwn(node, token)) return;
    const child = node[token];
    visit(child, index + 1, parts.concat(token), childKey(child, key));
  }

  visit(draft, 0, [], undefined);
  return found;
}

function matchesTemplate(template, at) {
  if (typeof template !== "string" || typeof at !== "string") return false;
  const expected = template.split(".");
  const actual = at.split(".");
  if (expected.length !== actual.length || expected.some((part) => BANNED.has(part))) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (BANNED.has(actual[i]) || actual[i] === "") return false;
    if (expected[i] === "*") continue;
    if (expected[i] !== actual[i]) return false;
  }
  return true;
}

function valueErrors(knob, value, at) {
  const where = `knobs: "${knob.id}" at "${at}"`;
  if (knob.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return [`${where} must be a number`];
    }
    if (typeof knob.min === "number" && value < knob.min) {
      return [`${where} value ${value} is below min ${knob.min}`];
    }
    if (typeof knob.max === "number" && value > knob.max) {
      return [`${where} value ${value} is above max ${knob.max}`];
    }
    return [];
  }
  if (knob.type === "string") {
    return typeof value === "string" ? [] : [`${where} must be a string`];
  }
  if (knob.type === "boolean") {
    return typeof value === "boolean" ? [] : [`${where} must be a boolean`];
  }
  if (knob.type === "enum") {
    if (!Array.isArray(knob.options) || !knob.options.includes(value)) {
      return [`${where} value ${JSON.stringify(value)} is not in options`];
    }
    return [];
  }
  return [`knobs: "${knob.id}" type "${knob.type}" is not allowed`];
}

function knobErrors(registry, sections) {
  const errors = [];
  if (!registry || typeof registry !== "object" || !Array.isArray(registry.knobs)) {
    errors.push('knobs: missing "knobs" array');
    return errors;
  }

  const known = new Set(Object.keys(sections ?? {}));
  const seen = new Set();

  for (const knob of registry.knobs) {
    if (!knob || typeof knob !== "object" || Array.isArray(knob)) {
      errors.push("knobs: entry must be an object");
      continue;
    }

    const id = typeof knob.id === "string" ? knob.id : "<unknown>";
    if (typeof knob.id !== "string" || !ID_RE.test(knob.id)) {
      errors.push(`knobs: id "${id}" must be latin`);
    } else if (seen.has(knob.id)) {
      errors.push(`knobs: duplicate id "${knob.id}"`);
    } else {
      seen.add(knob.id);
    }

    if (typeof knob.label !== "string" || knob.label.length === 0) {
      errors.push(`knobs: "${id}" label is missing`);
    }
    if (typeof knob.description !== "string" || knob.description.length === 0) {
      errors.push(`knobs: "${id}" description is missing`);
    }
    if (!LAYERS.has(knob.layer)) {
      errors.push(`knobs: "${id}" layer "${knob.layer}" is not allowed`);
    }
    if (!TYPES.has(knob.type)) {
      errors.push(`knobs: "${id}" type "${knob.type}" is not allowed`);
    }
    if (knob.type === "number") {
      if (knob.min !== undefined && typeof knob.min !== "number") {
        errors.push(`knobs: "${id}" min must be a number`);
      }
      if (knob.max !== undefined && typeof knob.max !== "number") {
        errors.push(`knobs: "${id}" max must be a number`);
      }
    }
    if (knob.type === "enum" && !Array.isArray(knob.options)) {
      errors.push(`knobs: "${id}" options must be an array`);
    }

    if (typeof knob.path !== "string" || knob.path.length === 0) {
      errors.push(`knobs: "${id}" path is missing`);
      continue;
    }
    if (knob.path.split(".").some((part) => BANNED.has(part) || part === "")) {
      errors.push(`knobs: "${id}" path is not allowed`);
      continue;
    }
    if (typeof knob.section !== "string" || !known.has(knob.section)) {
      errors.push(`knobs: "${id}" section "${knob.section}" does not exist`);
      continue;
    }

    const draft = sections[knob.section] && sections[knob.section].draft;
    const found = locate(draft, knob.path);
    if (found.length === 0) {
      errors.push(`knobs: "${id}" path "${knob.path}" finds no value`);
      continue;
    }
    for (const item of found) {
      errors.push(...valueErrors(knob, item.value, item.at));
    }
  }

  return errors;
}

function validateKnobs(registry, sections) {
  const errors = knobErrors(registry, sections);
  if (errors.length > 0) {
    throw new Error(`Knobs validation failed:\n  - ${errors.join("\n  - ")}`);
  }
  return true;
}

export { locate, matchesTemplate, valueErrors, knobErrors, validateKnobs };
