import { randomBytes } from "node:crypto";
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEnvelope } from "../config/load.js";
import { addCollidersToGlb, ColliderError, dimensionsMismatch } from "../colliders/index.js";
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
  appendJournal({
    action: "model",
    section: "catalog",
    detail: { sku: product.sku, bytes: built.glb.length, parts: parts.length }
  });
  return {
    sku: product.sku,
    bytes: built.glb.length,
    parts,
    sizeMm: built.sizeMm,
    catalogMm,
    mismatch: dimensionsMismatch(built.sizeMm, catalogMm)
  };
}

export { modelsDirectory, uploadModel };
