import { randomBytes } from "node:crypto";
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEnvelope, sectionDir } from "../config/load.js";
import { writeFolderDraft, writeFolderEnvelope } from "../config/folder-sections.js";
import { addCollidersToGlb, ColliderError, summarizeGlb } from "../colliders/index.js";
import { adminError } from "./auth.js";
import { appendJournal } from "./journal.js";

const SAFE_SKU = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function modelsDirectory() {
  if (process.env.SOS_MODELS_DIR) return path.resolve(process.env.SOS_MODELS_DIR);
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "models");
}

function findProduct(sku) {
  const envelope = readEnvelope("catalog");
  for (const layer of [envelope.draft, envelope.published]) {
    const products = layer && Array.isArray(layer.products) ? layer.products : [];
    const found = products.find((item) => item && item.sku === sku);
    if (found) return found;
  }
  return null;
}

function catalogMillimeters(product) {
  const dimensions = (product && product.dimensions) || {};
  return {
    width: Number(dimensions.width),
    height: Number(dimensions.height),
    depth: Number(dimensions.depth)
  };
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function recenteredParts(parts, bounds) {
  const origin = [0, 1, 2].map((index) => (bounds.min[index] + bounds.max[index]) / 2);
  return parts.map((part) => ({
    name: part.name,
    center: part.center.map((value, index) => round6(value - origin[index])),
    size: part.size.slice()
  }));
}

function measuredSize(sizeMm) {
  if (!sizeMm || typeof sizeMm !== "object" || Array.isArray(sizeMm)) return null;
  const width = sizeMm.width;
  const height = sizeMm.height;
  const depth = sizeMm.depth;
  if (![width, height, depth].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)) {
    return null;
  }
  return { width, height, depth };
}

function assignModelSize(products, sku, size) {
  if (!Array.isArray(products)) return false;
  let found = false;
  for (const product of products) {
    if (!product || product.sku !== sku) continue;
    product.modelSizeMm = size;
    found = true;
  }
  return found;
}

function saveMeasuredSizes(records) {
  const list = Array.isArray(records) ? records : [];
  const envelope = readEnvelope("catalog");
  const draftVersion = envelope.draftVersion;
  const publishedVersion = envelope.publishedVersion;
  const history = envelope.history;
  const saved = [];
  for (const record of list) {
    const size = measuredSize(record && record.sizeMm);
    if (!size || !record || typeof record.sku !== "string") continue;
    const inDraft = assignModelSize(envelope.draft && envelope.draft.products, record.sku, size);
    const inPublished = assignModelSize(envelope.published && envelope.published.products, record.sku, size);
    if (inDraft || inPublished) saved.push(record.sku);
  }
  if (saved.length === 0) return saved;
  if (envelope.draftVersion !== draftVersion || envelope.publishedVersion !== publishedVersion || envelope.history !== history) {
    throw new Error("model size must not change catalog versions");
  }
  const dir = sectionDir("catalog");
  writeFolderDraft(dir, envelope.draft);
  writeFolderEnvelope(dir, envelope);
  return saved;
}

function saveModel(sku, buffer) {
  if (typeof sku !== "string" || !SAFE_SKU.test(sku)) {
    throw adminError(404, { error: "unknown sku" });
  }
  const dir = modelsDirectory();
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${sku}.glb`);
  const temporary = path.join(dir, `.${sku}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    writeFileSync(temporary, buffer);
    renameSync(temporary, target);
  } catch (err) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file may already have been renamed.
    }
    throw err;
  }
}

function uploadModel(sku, body) {
  const product = findProduct(sku);
  if (!product) throw adminError(404, { error: "unknown sku" });
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw adminError(400, { error: "expected a GLB body" });
  }

  if (product.type === "person") {
    let summary;
    try {
      summary = summarizeGlb(body);
    } catch (err) {
      if (err instanceof ColliderError) throw adminError(422, { error: err.message });
      throw err;
    }
    saveModel(product.sku, body);
    const saved = saveMeasuredSizes([{ sku: product.sku, sizeMm: summary.sizeMm }]);
    appendJournal({
      action: "model",
      section: "catalog",
      detail: { sku: product.sku, bytes: body.length, parts: 0, sizeMm: summary.sizeMm }
    });
    return {
      sku: product.sku,
      bytes: body.length,
      parts: [],
      sizeMm: summary.sizeMm,
      catalogMm: catalogMillimeters(product),
      modelSizeMm: summary.sizeMm,
      savedToCatalog: saved.includes(product.sku)
    };
  }

  let built;
  try {
    built = addCollidersToGlb(body, { type: typeof product.type === "string" ? product.type : "" });
  } catch (err) {
    if (err instanceof ColliderError) throw adminError(422, { error: err.message });
    throw err;
  }

  saveModel(product.sku, built.glb);
  const catalogMm = catalogMillimeters(product);
  const parts = recenteredParts(built.parts, built.bounds);
  const saved = saveMeasuredSizes([{ sku: product.sku, sizeMm: built.sizeMm }]);
  appendJournal({
    action: "model",
    section: "catalog",
    detail: { sku: product.sku, bytes: built.glb.length, parts: parts.length, sizeMm: built.sizeMm }
  });
  return {
    sku: product.sku,
    bytes: built.glb.length,
    parts,
    sizeMm: built.sizeMm,
    catalogMm,
    modelSizeMm: built.sizeMm,
    savedToCatalog: saved.includes(product.sku)
  };
}

export { modelsDirectory, uploadModel, saveMeasuredSizes };
