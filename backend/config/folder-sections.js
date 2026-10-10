import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

function isFolderSection(sectionDir) {
  try {
    return statSync(sectionDir).isDirectory() && existsSync(path.join(sectionDir, "_envelope.json"));
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    throw err;
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf-8"));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function compareLoaded(typeOrder, a, b) {
  const aRank = typeOrder.has(a.product?.type) ? typeOrder.get(a.product.type) : Number.MAX_SAFE_INTEGER;
  const bRank = typeOrder.has(b.product?.type) ? typeOrder.get(b.product.type) : Number.MAX_SAFE_INTEGER;
  if (aRank !== bRank) return aRank - bRank;
  const aSku = String(a.product?.sku ?? "");
  const bSku = String(b.product?.sku ?? "");
  if (aSku < bSku) return -1;
  if (aSku > bSku) return 1;
  return 0;
}

function readFolderEnvelope(sectionDir) {
  const stored = readJson(path.join(sectionDir, "_envelope.json"));
  const types = readJson(path.join(sectionDir, "types.json"));
  const needs = readJson(path.join(sectionDir, "needs.json"));
  const skuDir = path.join(sectionDir, "sku");
  const loaded = readdirSync(skuDir)
    .filter((name) => name.endsWith(".json"))
    .map((fileName) => ({
      fileName,
      product: readJson(path.join(skuDir, fileName))
    }));
  const typeOrder = new Map(
    (Array.isArray(types) ? types : []).map((type, index) => [type && type.id, index])
  );
  loaded.sort((a, b) => compareLoaded(typeOrder, a, b));

  const envelope = {
    section: stored.section,
    draftVersion: stored.draftVersion,
    publishedVersion: stored.publishedVersion,
    history: stored.history,
    published: stored.published,
    draft: {
      types,
      needs,
      products: loaded.map((item) => item.product)
    }
  };
  Object.defineProperty(envelope, "skuFileNames", {
    value: loaded.map((item) => item.fileName),
    enumerable: false,
    configurable: true
  });
  return envelope;
}

function writeFolderEnvelope(sectionDir, envelope) {
  writeJson(path.join(sectionDir, "_envelope.json"), {
    section: envelope.section,
    draftVersion: envelope.draftVersion,
    publishedVersion: envelope.publishedVersion,
    history: envelope.history,
    published: envelope.published
  });
}

function writeFolderDraft(sectionDir, draft) {
  writeJson(path.join(sectionDir, "types.json"), draft.types);
  writeJson(path.join(sectionDir, "needs.json"), draft.needs);
  const skuDir = path.join(sectionDir, "sku");
  mkdirSync(skuDir, { recursive: true });
  const keep = new Set();
  for (const product of draft.products ?? []) {
    const fileName = `${product.sku}.json`;
    keep.add(fileName);
    writeJson(path.join(skuDir, fileName), product);
  }
  for (const name of readdirSync(skuDir)) {
    if (name.endsWith(".json") && !keep.has(name)) unlinkSync(path.join(skuDir, name));
  }
}

export { isFolderSection, readFolderEnvelope, writeFolderDraft, writeFolderEnvelope };
