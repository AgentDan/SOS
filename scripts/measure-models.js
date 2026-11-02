// Measures models/<sku>.glb and can store modelSizeMm on the catalog product.
// Without flags it only prints. --write stores the size in the draft and the published layer.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeGlb } from "../backend/colliders/index.js";
import { saveMeasuredSizes } from "../backend/admin-api/models.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = path.join(root, "models");
const skuDir = path.join(root, "data", "catalog", "sku");

function readCatalog() {
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

function cardSize(product) {
  const dimensions = product && product.dimensions;
  if (!dimensions || typeof dimensions !== "object") return null;
  return {
    width: Number(dimensions.width),
    height: Number(dimensions.height),
    depth: Number(dimensions.depth)
  };
}

function formatSize(size) {
  if (!size || ![size.width, size.height, size.depth].every((value) => Number.isFinite(value))) return "—";
  return `${size.width}×${size.height}×${size.depth}`;
}

function cell(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function printTable(rows) {
  const header = ["SKU", "размер модели (Ш×В×Г)", "размер карточки (Ш×В×Г)"];
  const widths = header.map((title, index) => {
    let width = title.length;
    for (const row of rows) width = Math.max(width, String(row[index]).length);
    return width;
  });
  const line = (values) => values.map((value, index) => cell(value, widths[index])).join("  ");
  console.log(line(header));
  for (const row of rows) console.log(line(row));
}

function measureAll(write) {
  if (!existsSync(modelsDir)) {
    console.error(`Нет папки моделей: ${modelsDir}`);
    process.exit(1);
  }

  const catalog = readCatalog();
  const files = readdirSync(modelsDir)
    .filter((name) => name.endsWith(".glb"))
    .sort();
  const rows = [];
  const records = [];
  let failed = 0;

  for (const fileName of files) {
    const sku = fileName.slice(0, -".glb".length);
    const product = catalog.get(sku);
    if (!product) {
      console.error(`${sku}: нет товара в каталоге, пропуск`);
      continue;
    }
    try {
      const summary = summarizeGlb(readFileSync(path.join(modelsDir, fileName)));
      rows.push([sku, formatSize(summary.sizeMm), formatSize(cardSize(product))]);
      if (summary.sizeMm) records.push({ sku, sizeMm: summary.sizeMm });
      else {
        failed += 1;
        console.error(`${sku}: размер модели не посчитан`);
      }
    } catch (err) {
      failed += 1;
      const message = err && err.message ? err.message : String(err);
      rows.push([sku, "—", formatSize(cardSize(product))]);
      console.error(`${sku}: ${message}`);
    }
  }

  printTable(rows);
  if (write) {
    const saved = saveMeasuredSizes(records);
    console.log(`Записано modelSizeMm: ${saved.length}`);
  } else {
    console.log("Только просмотр. Запись: node scripts/measure-models.js --write");
  }
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

if (invokedDirectly()) measureAll(process.argv.includes("--write"));
