import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runtimeDir() {
  if (process.env.DESKOS_RUNTIME_DIR) return path.resolve(process.env.DESKOS_RUNTIME_DIR);
  return path.join(__dirname, "..", "..", "runtime");
}

function journalPath() {
  return path.join(runtimeDir(), "admin", "journal.jsonl");
}

function appendJournal({ action, section, detail }) {
  const file = journalPath();
  mkdirSync(path.dirname(file), { recursive: true });
  const entry = {
    ts: new Date().toISOString(),
    action,
    section,
    detail
  };
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
  return entry;
}

function readJournal(limit = 50) {
  const file = journalPath();
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line.length > 0);
  const parsed = lines.map((line) => JSON.parse(line));
  const requested = Number(limit);
  const size = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 500) : 50;
  return parsed.slice(-size);
}

export { appendJournal, readJournal, journalPath };
