import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readKnobs } from "../backend/config/load.js";
import { loadSections, toDialogData } from "../backend/admin-api/sections.js";
import { validateDialogData } from "../backend/validation/index.js";
import { validateKnobs } from "../backend/validation/knobs.js";
import { ColliderError, dimensionsMismatch, summarizeGlb } from "../backend/colliders/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function checkModels(sections) {
  const published = sections.catalog && sections.catalog.published;
  const products = published && Array.isArray(published.products) ? published.products : [];
  const errors = [];
  const warnings = [];
  for (const product of products) {
    const model3d = product && product.media && product.media.model3d;
    if (typeof model3d !== "string" || model3d.trim() === "") continue;
    const sku = product.sku;
    const file = path.join(root, "models", `${sku}.glb`);
    if (!existsSync(file)) {
      errors.push(`${sku}: нет файла models/${sku}.glb`);
      continue;
    }
    let summary;
    try {
      summary = summarizeGlb(readFileSync(file));
    } catch (err) {
      const message = err instanceof ColliderError || (err && err.message) ? err.message : String(err);
      errors.push(`${sku}: ${message}`);
      continue;
    }
    const count = summary.colliderNames.length;
    if (count < 1) errors.push(`${sku}: в models/${sku}.glb нет узлов COL_*`);
    else if (count > 12) errors.push(`${sku}: в models/${sku}.glb узлов COL_* ${count}, максимум 12`);
    const catalogMm = {
      width: product.dimensions && product.dimensions.width,
      height: product.dimensions && product.dimensions.height,
      depth: product.dimensions && product.dimensions.depth
    };
    if (summary.sizeMm && dimensionsMismatch(summary.sizeMm, catalogMm)) {
      const glb = summary.sizeMm;
      warnings.push(
        `${sku}: размеры GLB ${glb.width}×${glb.depth}×${glb.height} мм и каталога ${catalogMm.width}×${catalogMm.depth}×${catalogMm.height} мм расходятся больше чем на 2%`
      );
    }
  }
  return { errors, warnings };
}

try {
  const sections = loadSections();
  validateDialogData(toDialogData(sections));
  validateKnobs(readKnobs(), sections);
  const models = checkModels(sections);
  for (const warning of models.warnings) console.warn(`warning: ${warning}`);
  if (models.errors.length > 0) {
    console.error(models.errors.join("\n"));
    process.exit(1);
  }
  console.log("OK");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
