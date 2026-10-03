import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const DIALOG = path.join(ROOT, "backend", "dialog");
const SALES = path.join(ROOT, "backend", "sales");
const AI = path.join(ROOT, "backend", "ai");
const API = path.join(ROOT, "backend", "api");
const CLIENT = path.join(ROOT, "client");
const BACKEND = path.join(ROOT, "backend");

function isInside(file, dir) {
  const rel = path.relative(dir, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function walkJs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(full, acc);
    else if (entry.name.endsWith(".js")) acc.push(full);
  }
  return acc;
}

function importSpecifiers(source) {
  const specs = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  return path.normalize(path.join(path.dirname(fromFile), spec));
}

function violations() {
  const found = [];
  const files = [...walkJs(BACKEND), ...walkJs(CLIENT)];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const spec of importSpecifiers(source)) {
      const resolved = resolveSpecifier(file, spec);
      if (!resolved) continue;

      const dialogOrSales = isInside(file, DIALOG) || isInside(file, SALES);
      if (dialogOrSales && isInside(resolved, AI)) {
        found.push(`${file} imports ${spec}`);
      }
      if (isInside(file, AI) && (isInside(resolved, API) || isInside(resolved, CLIENT))) {
        found.push(`${file} imports ${spec}`);
      }
      if (isInside(file, CLIENT) && isInside(resolved, BACKEND)) {
        found.push(`${file} imports ${spec}`);
      }
    }
  }

  return found;
}

test("dialog, sales, ai, and client honor dependency rules", () => {
  const found = violations();
  assert.deepEqual(found, [], found.join("\n"));
});
