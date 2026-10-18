// Rewrites models/<sku>.glb so each file carries COL_* nodes.
// Type comes from data/catalog/sku. Nothing is written to data/catalog/colliders.

import { existsSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { addCollidersToGlb, ColliderError } from "../backend/colliders/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = path.join(root, "models");
const legacyDir = path.join(root, "data", "catalog", "colliders");

function readCatalog(skuDir) {
  const bySku = new Map();
  if (!existsSync(skuDir)) return bySku;
  const files = readdirSync(skuDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  for (const name of files) {
    const product = JSON.parse(readFileSync(path.join(skuDir, name), "utf8"));
    if (product && product.sku) bySku.set(product.sku, product);
  }
  return bySku;
}

function catalogMm(product) {
  const dimensions = product && product.dimensions;
  if (!dimensions) return null;
  return {
    width: Number(dimensions.width),
    depth: Number(dimensions.depth),
    height: Number(dimensions.height)
  };
}

function formatMm(size) {
  if (!size || ![size.width, size.depth, size.height].every((value) => Number.isFinite(value))) return "—";
  return `${size.width}×${size.depth}×${size.height}`;
}

function writeAtomic(filePath, buffer) {
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  );
  try {
    writeFileSync(temporary, buffer);
    renameSync(temporary, filePath);
  } catch (err) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file may already have been renamed.
    }
    throw err;
  }
}

function cell(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function printTable(rows) {
  const header = ["SKU", "частей", "размер GLB (Ш×Г×В мм)", "размер в каталоге (Ш×Г×В мм)", "статус"];
  const widths = header.map((title, index) => {
    let width = title.length;
    for (const row of rows) width = Math.max(width, String(row[index]).length);
    return width;
  });
  const line = (values) => values.map((value, index) => cell(value, widths[index])).join("  ");
  console.log(line(header));
  for (const row of rows) console.log(line(row));
}

function buildAll() {
  rmSync(legacyDir, { recursive: true, force: true });
  if (!existsSync(modelsDir)) {
    console.error(`Нет папки моделей: ${modelsDir}`);
    process.exit(1);
  }

  const catalog = readCatalog(path.join(root, "data", "catalog", "sku"));
  const files = readdirSync(modelsDir)
    .filter((name) => name.endsWith(".glb"))
    .sort();
  const rows = [];
  let failed = 0;

  for (const fileName of files) {
    const sku = fileName.slice(0, -".glb".length);
    const product = catalog.get(sku);
    const catalogSize = catalogMm(product);
    const filePath = path.join(modelsDir, fileName);
    try {
      const built = addCollidersToGlb(readFileSync(filePath), {
        type: (product && product.type) || ""
      });
      writeAtomic(filePath, built.glb);
      rows.push([sku, String(built.parts.length), formatMm(built.sizeMm), formatMm(catalogSize), "ok"]);
    } catch (err) {
      failed += 1;
      const message = err instanceof ColliderError ? err.message : err && err.message ? err.message : String(err);
      rows.push([sku, "—", "—", formatMm(catalogSize), message]);
    }
  }

  printTable(rows);
  if (failed > 0) process.exit(1);
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  const left = path.resolve(entry);
  const right = fileURLToPath(import.meta.url);
  if (process.platform === "win32") return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

if (invokedDirectly()) buildAll();
