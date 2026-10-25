import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function usageFile() {
  const override = process.env.AI_USAGE_FILE;
  if (typeof override === "string" && override.trim() !== "") return path.resolve(override.trim());
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "runtime", "ai-usage.jsonl");
}

function empty() {
  return { calls: 0, ok: 0, fail: 0, in: 0, out: 0 };
}

function add(bucket, row) {
  bucket.calls += 1;
  if (row.ok === true) bucket.ok += 1;
  else bucket.fail += 1;
  bucket.in += typeof row.in === "number" && Number.isFinite(row.in) ? row.in : 0;
  bucket.out += typeof row.out === "number" && Number.isFinite(row.out) ? row.out : 0;
}

function cell(value, width) {
  return String(value).padStart(width);
}

function printRow(purpose, row) {
  console.log(
    `${String(purpose).padEnd(12)}${cell(row.calls, 7)}${cell(row.ok, 7)}${cell(row.fail, 7)}${cell(row.in, 10)}${cell(row.out, 10)}`
  );
}

function main() {
  let raw = "";
  try {
    raw = readFileSync(usageFile(), "utf8");
  } catch {
    raw = "";
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  const byPurpose = new Map();
  const total = empty();
  for (const line of raw.split(/\n/)) {
    if (line.trim() === "") continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const purpose = row.purpose === "parse" || row.purpose === "voice" ? row.purpose : "—";
    const bucket = byPurpose.get(purpose) ?? empty();
    add(bucket, row);
    add(total, row);
    byPurpose.set(purpose, bucket);
  }

  console.log(`${"purpose".padEnd(12)}${cell("calls", 7)}${cell("ok", 7)}${cell("fail", 7)}${cell("in", 10)}${cell("out", 10)}`);
  for (const purpose of [...byPurpose.keys()].sort()) printRow(purpose, byPurpose.get(purpose));
  printRow("итого", total);
}

main();
