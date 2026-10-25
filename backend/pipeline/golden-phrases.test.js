import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readCatalog, readCommands, readConsultant } from "../config/load.js";
import { interpret } from "../understanding/interpret.js";
import { buildVocabulary } from "./vocabulary.js";

const FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "tests",
  "ai",
  "golden-phrases.json"
);

const ADDED = [
  "добавь мышь",
  "поставь колонки",
  "убери клавиатуру",
  "удобно ли мне?",
  "подходит ли мне этот стол",
  "сколько от мыши до монитора"
];

test("golden phrases parse and every expected sku is in the catalog", () => {
  const rows = JSON.parse(readFileSync(FILE, "utf8"));
  assert.equal(Array.isArray(rows), true);
  assert.equal(rows.length, 36);
  for (const text of ADDED) {
    assert.equal(
      rows.some((row) => row.text === text),
      true,
      text
    );
  }

  const products = readCatalog().products;
  assert.ok(Array.isArray(products));
  const skus = new Set(products.map((item) => item.sku));
  const vocabulary = buildVocabulary({
    commands: readCommands(),
    consultant: readConsultant(),
    catalog: readCatalog()
  });

  for (const row of rows) {
    assert.equal(typeof row.text, "string");
    assert.notEqual(row.text.trim(), "");
    assert.equal(typeof row.expect?.type, "string");
    const intent = interpret({ source: "text", text: row.text }, vocabulary);
    assert.equal(typeof intent?.type, "string");
    const payload = row.expect.payload ?? {};
    if (typeof payload.sku === "string") assert.equal(skus.has(payload.sku), true, payload.sku);
    if (Array.isArray(payload.skus)) {
      for (const sku of payload.skus) assert.equal(skus.has(sku), true, `${row.text} ${sku}`);
    }
  }
});
