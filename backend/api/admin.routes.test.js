import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { readConfig, readDraft, readEnvelope } from "../config/load.js";
import apiRoutes from "./routes.js";
import { invalidJsonHandler } from "./admin.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceData = path.join(__dirname, "..", "..", "data");
const tempData = mkdtempSync(path.join(tmpdir(), "deskos-admin-data-"));
const tempRuntime = mkdtempSync(path.join(tmpdir(), "deskos-admin-runtime-"));
cpSync(sourceData, tempData, { recursive: true });

const TOKEN = "desk-admin-test-token";
process.env.DESKOS_DATA_DIR = tempData;
process.env.DESKOS_RUNTIME_DIR = tempRuntime;
process.env.ADMIN_TOKEN = TOKEN;

let server;
let base;

function listen(app) {
  return new Promise((resolve) => {
    const http = app.listen(0, "127.0.0.1", () => resolve(http));
  });
}

function close(http) {
  return new Promise((resolve, reject) => {
    http.close((err) => (err ? reject(err) : resolve()));
  });
}

function treeHash(dir) {
  const hash = createHash("sha256");
  const files = [];
  function walk(current) {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk(dir);
  for (const file of files) {
    hash.update(path.relative(dir, file));
    hash.update(readFileSync(file));
  }
  return hash.digest("hex");
}

function journalEntries() {
  const file = path.join(tempRuntime, "admin", "journal.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

async function api(pathname, { method = "GET", token = TOKEN, body, raw } = {}) {
  const headers = {};
  if (token !== false) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = raw;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${pathname}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, json, text };
}

describe("admin API", { concurrency: 1 }, () => {
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api", apiRoutes);
    app.use(invalidJsonHandler);
    server = await listen(app);
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  after(async () => {
    if (server) await close(server);
    delete process.env.DESKOS_DATA_DIR;
    delete process.env.DESKOS_RUNTIME_DIR;
    delete process.env.ADMIN_TOKEN;
    rmSync(tempData, { recursive: true, force: true });
    rmSync(tempRuntime, { recursive: true, force: true });
  });

  test("missing or wrong token is 401 and does not open the client API", async () => {
    assert.equal(existsSync(path.join(tempRuntime, "admin", "journal.jsonl")), false);

    const missing = await api("/admin/sections", { token: false });
    assert.equal(missing.status, 401);
    assert.deepEqual(missing.json, { error: "unauthorized" });

    const wrong = await api("/admin/health", { token: "not-the-admin-token" });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.json, { error: "unauthorized" });
    assert.equal(wrong.text.includes(TOKEN), false);
    assert.equal(wrong.text.includes("not-the-admin-token"), false);

    const catalog = await api("/catalog", { token: false });
    assert.equal(catalog.status, 200);
    assert.ok(Array.isArray(catalog.json.products));
    assert.equal(existsSync(path.join(tempRuntime, "admin", "journal.jsonl")), false);
  });

  test("admin routes are closed when ADMIN_TOKEN is missing or empty", async () => {
    const saved = process.env.ADMIN_TOKEN;
    try {
      delete process.env.ADMIN_TOKEN;
      const missing = await api("/admin/sections", { token: TOKEN });
      assert.equal(missing.status, 503);
      assert.match(missing.json.error, /ADMIN_TOKEN/);

      process.env.ADMIN_TOKEN = "";
      const empty = await api("/admin/knobs", { token: false });
      assert.equal(empty.status, 503);
      assert.match(empty.json.error, /ADMIN_TOKEN/);

      const catalog = await api("/catalog", { token: false });
      assert.equal(catalog.status, 200);
    } finally {
      process.env.ADMIN_TOKEN = saved;
    }
    assert.equal(existsSync(path.join(tempRuntime, "admin", "journal.jsonl")), false);
  });

  test("broken JSON or a body without draft is 400", async () => {
    const broken = await api("/admin/sections/consultant/draft", { method: "PUT", raw: "{bad" });
    assert.equal(broken.status, 400);
    assert.deepEqual(broken.json, { error: "invalid JSON" });

    const missing = await api("/admin/sections/consultant/draft", { method: "PUT", body: {} });
    assert.equal(missing.status, 400);
    assert.deepEqual(missing.json, { error: "draft is required" });
    assert.equal(journalEntries().length, 0);
  });

  test("unknown section is 404", async () => {
    const res = await api("/admin/sections/missing");
    assert.equal(res.status, 404);
    assert.deepEqual(res.json, { error: "unknown section" });
  });

  test("invalid draft reference is 422 and does not touch files or the journal", async () => {
    const hash = treeHash(tempData);
    const section = await api("/admin/sections/questionnaire");
    const draft = structuredClone(section.json.draft);
    draft.inference[0].resultNeed = "missing_need";

    const res = await api("/admin/sections/questionnaire/draft", { method: "PUT", body: { draft } });
    assert.equal(res.status, 422);
    assert.ok(Array.isArray(res.json.errors));
    assert.ok(res.json.errors.some((line) => line.includes('resultNeed "missing_need"')));
    assert.equal(treeHash(tempData), hash);
    assert.equal(journalEntries().length, 0);
  });

  test("a saved draft bumps draftVersion, leaves published catalog, and writes the journal", async () => {
    const catalogBefore = await api("/catalog", { token: false });
    const before = await api("/admin/sections/consultant");
    const draft = structuredClone(before.json.draft);
    draft.greeting = "Здравствуйте";

    const res = await api("/admin/sections/consultant/draft", {
      method: "PUT",
      body: { draft, baseDraftVersion: before.json.draftVersion }
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.draftVersion, before.json.draftVersion + 1);

    const after = await api("/admin/sections/consultant");
    assert.equal(after.json.draft.greeting, "Здравствуйте");
    assert.equal(after.json.published.greeting, before.json.published.greeting);
    assert.equal(after.json.history.some((entry) => Object.hasOwn(entry, "snapshot")), false);

    const catalogAfter = await api("/catalog", { token: false });
    assert.deepEqual(catalogAfter.json, catalogBefore.json);

    const entries = journalEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "draft");
    assert.equal(entries[0].section, "consultant");
    assert.equal(entries[0].detail.draftVersion, res.json.draftVersion);
    assert.equal(JSON.stringify(entries).includes(TOKEN), false);
  });

  test("a stale baseDraftVersion is 409 and writes nothing", async () => {
    const before = await api("/admin/sections/consultant");
    const lines = journalEntries().length;
    const res = await api("/admin/sections/consultant/draft", {
      method: "PUT",
      body: { draft: before.json.draft, baseDraftVersion: before.json.draftVersion - 1 }
    });
    assert.equal(res.status, 409);
    assert.equal(res.json.error, "draft version conflict");
    const after = await api("/admin/sections/consultant");
    assert.equal(after.json.draftVersion, before.json.draftVersion);
    assert.equal(journalEntries().length, lines);
  });

  test("catalog draft write updates the matching sku file only", async () => {
    const sku = "DESK-TOP-1400";
    const other = path.join(tempData, "catalog", "sku", "CHAIR-460.json");
    const otherBefore = readFileSync(other);
    const clientBefore = await api("/catalog", { token: false });
    const section = await api("/admin/sections/catalog");
    const draft = structuredClone(section.json.draft);
    const product = draft.products.find((item) => item.sku === sku);
    const nextPrice = product.priceEur + 1;
    product.priceEur = nextPrice;

    const res = await api("/admin/sections/catalog/draft", { method: "PUT", body: { draft } });
    assert.equal(res.status, 200);
    assert.equal(res.json.draftVersion, section.json.draftVersion + 1);

    const stored = JSON.parse(readFileSync(path.join(tempData, "catalog", "sku", `${sku}.json`), "utf8"));
    assert.equal(stored.priceEur, nextPrice);
    assert.deepEqual(readFileSync(other), otherBefore);
    assert.equal(readEnvelope("catalog").draftVersion, res.json.draftVersion);

    const clientAfter = await api("/catalog", { token: false });
    assert.deepEqual(clientAfter.json, clientBefore.json);
    assert.equal(
      clientAfter.json.products.find((item) => item.sku === sku).priceEur,
      clientBefore.json.products.find((item) => item.sku === sku).priceEur
    );
  });

  test("publish updates the client catalog and rollback restores it", async () => {
    const original = (await api("/catalog", { token: false })).json;
    const lines = journalEntries().length;

    const baseline = await api("/admin/sections/catalog/draft", {
      method: "PUT",
      body: { draft: original }
    });
    assert.equal(baseline.status, 200);
    const published = await api("/admin/sections/catalog/publish", {
      method: "POST",
      body: { description: "baseline" }
    });
    assert.equal(published.status, 200);
    assert.equal(published.json.description, undefined);
    assert.equal(typeof published.json.publishedVersion, "number");
    assert.deepEqual((await api("/catalog", { token: false })).json, original);

    const section = await api("/admin/sections/catalog");
    assert.equal(section.json.history.some((entry) => Object.hasOwn(entry, "snapshot")), false);
    const history = await api("/admin/sections/catalog/history");
    assert.equal(history.json.at(-1).description, "baseline");
    assert.equal(Object.hasOwn(history.json.at(-1), "snapshot"), false);

    const sku = "DESK-TOP-1400";
    const raised = structuredClone(original);
    const product = raised.products.find((item) => item.sku === sku);
    product.priceEur += 5;
    assert.equal((await api("/admin/sections/catalog/draft", { method: "PUT", body: { draft: raised } })).status, 200);
    assert.equal(
      (await api("/catalog", { token: false })).json.products.find((item) => item.sku === sku).priceEur,
      original.products.find((item) => item.sku === sku).priceEur
    );

    const raisedPublish = await api("/admin/sections/catalog/publish", {
      method: "POST",
      body: { description: "raise price" }
    });
    assert.equal(raisedPublish.status, 200);
    assert.ok(raisedPublish.json.publishedVersion > published.json.publishedVersion);
    assert.equal(
      (await api("/catalog", { token: false })).json.products.find((item) => item.sku === sku).priceEur,
      product.priceEur
    );

    const rolled = await api("/admin/sections/catalog/rollback", {
      method: "POST",
      body: { version: published.json.publishedVersion }
    });
    assert.equal(rolled.status, 200);
    assert.deepEqual((await api("/catalog", { token: false })).json, original);

    const failed = await api("/admin/sections/catalog/rollback", {
      method: "POST",
      body: { version: 99999 }
    });
    assert.equal(failed.status, 422);
    assert.match(failed.json.error, /snapshot for version 99999/);
    assert.deepEqual((await api("/catalog", { token: false })).json, original);

    const entries = journalEntries();
    const fresh = entries.slice(lines);
    assert.deepEqual(
      fresh.map((entry) => entry.action),
      ["draft", "publish", "draft", "publish", "rollback"]
    );
    assert.equal(fresh.some((entry) => entry.action === "rollback" && entry.detail.version === published.json.publishedVersion), true);
  });

  test("a publish that fails validation does not write the journal", async () => {
    const file = path.join(tempData, "questionnaire.json");
    const original = readFileSync(file);
    const lines = journalEntries().length;
    try {
      const data = JSON.parse(original);
      data.draft.inference[0].resultNeed = "missing_need";
      writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
      const corrupted = readFileSync(file);
      const version = readEnvelope("questionnaire").publishedVersion;

      const res = await api("/admin/sections/questionnaire/publish", {
        method: "POST",
        body: { description: "should fail" }
      });
      assert.equal(res.status, 422);
      assert.ok(res.json.errors.some((line) => line.includes("missing_need")));
      assert.deepEqual(readFileSync(file), corrupted);
      assert.equal(readEnvelope("questionnaire").publishedVersion, version);
      assert.equal(journalEntries().length, lines);
    } finally {
      writeFileSync(file, original);
    }
  });

  test("knobs can be read, rejected outside bounds, and written into the draft only", async () => {
    const listed = await api("/admin/knobs");
    assert.equal(listed.status, 200);
    const humor = listed.json.find((knob) => knob.id === "consultant-humor");
    const price = listed.json.find((knob) => knob.id === "product-price");
    assert.equal(humor.values.length, 1);
    assert.equal(humor.values[0].at, "humor");
    assert.equal(humor.values[0].value, readDraft("consultant").humor);
    assert.equal(price.values.length, 5);
    assert.ok(price.values.every((item) => typeof item.key === "string" && item.at.includes("priceEur")));

    const lines = journalEntries().length;
    const publishedHumor = readConfig("consultant").humor;
    const tooHigh = await api("/admin/knobs/consultant-humor", {
      method: "PUT",
      body: { at: "humor", value: 9 }
    });
    assert.equal(tooHigh.status, 422);
    assert.ok(tooHigh.json.errors.some((line) => line.includes("above max")));
    assert.equal(readDraft("consultant").humor, humor.values[0].value);
    assert.equal(readConfig("consultant").humor, publishedHumor);
    assert.equal(journalEntries().length, lines);

    const saved = await api("/admin/knobs/consultant-humor", {
      method: "PUT",
      body: { at: "humor", value: 2 }
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.draftVersion, readEnvelope("consultant").draftVersion);
    assert.equal(readDraft("consultant").humor, 2);
    assert.equal(readConfig("consultant").humor, publishedHumor);
    const knobLine = journalEntries().at(-1);
    assert.equal(knobLine.action, "knob");
    assert.equal(knobLine.section, "consultant");
    assert.equal(knobLine.detail.id, "consultant-humor");
    assert.equal(knobLine.detail.at, "humor");
    assert.equal(knobLine.detail.from, humor.values[0].value);
    assert.equal(knobLine.detail.to, 2);

    const unknown = await api("/admin/knobs/missing-knob", {
      method: "PUT",
      body: { at: "humor", value: 1 }
    });
    assert.equal(unknown.status, 404);

    const target = price.values.find((item) => item.key === "DESK-TOP-1400");
    const other = price.values.find((item) => item.key === "CHAIR-460");
    const clientBefore = (await api("/catalog", { token: false })).json;
    const nextPrice = target.value + 1;
    const changed = await api("/admin/knobs/product-price", {
      method: "PUT",
      body: { at: target.at, value: nextPrice }
    });
    assert.equal(changed.status, 200);
    assert.equal(readDraft("catalog").products.find((item) => item.sku === "DESK-TOP-1400").priceEur, nextPrice);
    assert.equal(readDraft("catalog").products.find((item) => item.sku === "CHAIR-460").priceEur, other.value);
    assert.equal(
      JSON.parse(readFileSync(path.join(tempData, "catalog", "sku", "DESK-TOP-1400.json"), "utf8")).priceEur,
      nextPrice
    );
    const clientAfter = (await api("/catalog", { token: false })).json;
    assert.deepEqual(clientAfter, clientBefore);
    assert.equal(journalEntries().at(-1).action, "knob");
    assert.equal(journalEntries().at(-1).detail.at, target.at);
  });

  test("health reports data errors and still responds", async () => {
    const healthy = await api("/admin/health");
    assert.equal(healthy.status, 200);
    assert.equal(healthy.json.draft.ok, true);
    assert.deepEqual(healthy.json.draft.errors, []);
    assert.equal(healthy.json.published.ok, true);
    assert.equal(healthy.json.knobs.ok, true);
    assert.equal(typeof healthy.json.dataVersion, "number");

    const file = path.join(tempData, "questionnaire.json");
    const original = readFileSync(file);
    try {
      const data = JSON.parse(original);
      data.draft.inference[0].resultNeed = "missing_need";
      writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
      const broken = await api("/admin/health");
      assert.equal(broken.status, 200);
      assert.equal(broken.json.draft.ok, false);
      assert.ok(broken.json.draft.errors.some((line) => line.includes("missing_need")));
      assert.equal(typeof broken.json.dataVersion, "number");
    } finally {
      writeFileSync(file, original);
    }

    const knobsFile = path.join(tempData, "knobs.json");
    const knobsOriginal = readFileSync(knobsFile);
    try {
      const registry = JSON.parse(knobsOriginal);
      registry.knobs.push({
        id: "ghost-knob",
        layer: "dialog",
        section: "director",
        path: "no.such.path",
        label: "Пустой путь",
        type: "number",
        min: 0,
        max: 1,
        description: "Этой ручки нет в данных."
      });
      writeFileSync(knobsFile, `${JSON.stringify(registry, null, 2)}\n`);
      const brokenKnobs = await api("/admin/health");
      assert.equal(brokenKnobs.status, 200);
      assert.equal(brokenKnobs.json.knobs.ok, false);
      assert.ok(brokenKnobs.json.knobs.errors.some((line) => line.includes("finds no value")));
    } finally {
      writeFileSync(knobsFile, knobsOriginal);
    }
  });

  test("journal limit returns the latest lines", async () => {
    const all = await api("/admin/journal?limit=50");
    assert.ok(all.json.length >= 2);
    const one = await api("/admin/journal?limit=1");
    assert.equal(one.json.length, 1);
    assert.deepEqual(one.json[0], all.json.at(-1));
  });
});
