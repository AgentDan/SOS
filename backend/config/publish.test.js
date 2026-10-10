import { mkdtempSync, cpSync, renameSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { publish, rollback } from "./publish.js";
import { readConfig, readDataVersion, readDraft, readEnvelope } from "./load.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceData = path.join(__dirname, "..", "..", "data");
const tempData = mkdtempSync(path.join(tmpdir(), "deskos-publish-"));
cpSync(sourceData, tempData, { recursive: true });
process.env.DESKOS_DATA_DIR = tempData;

after(() => {
  delete process.env.DESKOS_DATA_DIR;
  rmSync(tempData, { recursive: true, force: true });
});

function readJson(name) {
  return JSON.parse(readFileSync(path.join(tempData, `${name}.json`), "utf-8"));
}

function writeJson(name, data) {
  writeFileSync(path.join(tempData, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

describe("publish", { concurrency: 1 }, () => {
  test("publish() copies draft into published and increments publishedVersion", () => {
    const before = readJson("questionnaire");
    before.history = Array.from({ length: 20 }, (_, index) => ({
      version: index + 1,
      date: "2020-01-01T00:00:00.000Z",
      description: `old ${index}`
    }));
    writeJson("questionnaire", before);

    const result = publish("questionnaire", "test publish");
    const after = readJson("questionnaire");

    assert.deepEqual(after.published, before.draft);
    assert.notEqual(after.published, after.draft);
    assert.equal(after.publishedVersion, before.publishedVersion + 1);
    assert.deepEqual(after.draft, before.draft);
    assert.equal(result.publishedVersion, after.publishedVersion);
    assert.equal(result.date, after.history.at(-1).date);
    assert.equal(after.history.length, 20);
    assert.equal(after.history[0].description, "old 1");
    assert.deepEqual(after.history.at(-1), {
      version: after.publishedVersion,
      date: result.date,
      description: "test publish",
      snapshot: before.draft
    });
  });

  test("publish() throws when inference references an unknown question", () => {
    const file = path.join(tempData, "questionnaire.json");
    const snapshot = readFileSync(file, "utf-8");
    const broken = JSON.parse(snapshot);
    broken.draft.inference[0].when.questionId = "missing_question";
    writeFileSync(file, `${JSON.stringify(broken, null, 2)}\n`);

    try {
      assert.throws(
        () => publish("questionnaire", "bad"),
        (err) =>
          err instanceof Error &&
          /Dialog data validation failed/.test(err.message) &&
          /when\.questionId references unknown question "missing_question"/.test(err.message)
      );
      const after = readJson("questionnaire");
      assert.equal(after.publishedVersion, broken.publishedVersion);
      assert.deepEqual(after.published, broken.published);
      assert.deepEqual(after.history, broken.history);
    } finally {
      writeFileSync(file, snapshot);
    }
  });

  test("readConfig returns the published layer after publish()", () => {
    publish("catalog", "for read");
    const envelope = readEnvelope("catalog");
    assert.deepEqual(readConfig("catalog", "published"), envelope.published);
    assert.deepEqual(readConfig("catalog"), envelope.published);
    assert.deepEqual(readDraft("catalog"), envelope.draft);
  });

  test("a sku draft edit is hidden until the catalog is published", () => {
    const file = path.join(tempData, "catalog", "sku", "CHAIR-460.json");
    const product = JSON.parse(readFileSync(file, "utf-8"));
    const publishedName = readConfig("catalog").products.find((item) => item.sku === "CHAIR-460").name;
    product.name = "Черновик кресла";
    writeFileSync(file, `${JSON.stringify(product, null, 2)}\n`);

    assert.equal(
      readConfig("catalog").products.find((item) => item.sku === "CHAIR-460").name,
      publishedName
    );
    assert.equal(
      readDraft("catalog").products.find((item) => item.sku === "CHAIR-460").name,
      "Черновик кресла"
    );

    publish("catalog", "chair name");
    assert.equal(
      readConfig("catalog").products.find((item) => item.sku === "CHAIR-460").name,
      "Черновик кресла"
    );
  });

  test("catalog keeps one version and product order", () => {
    const before = readEnvelope("catalog").publishedVersion;
    publish("catalog", "whole catalog");
    const envelope = readEnvelope("catalog");
    const skus = ["DESK-LEGS-1400", "DESK-TOP-1400", "DESK-TOP-1800", "MON-613-366", "CHAIR-460"];
    assert.equal(envelope.publishedVersion, before + 1);
    assert.equal(envelope.draftVersion, readEnvelope("catalog").draftVersion);
    assert.deepEqual(envelope.draft.products.map((item) => item.sku), skus);
    assert.deepEqual(envelope.published.products.map((item) => item.sku), skus);
    assert.deepEqual(readConfig("catalog").products.map((item) => item.sku), skus);
    const stored = JSON.parse(readFileSync(path.join(tempData, "catalog", "_envelope.json"), "utf-8"));
    assert.equal(stored.draft, undefined);
    assert.equal(stored.publishedVersion, envelope.publishedVersion);
  });

  test("publish rejects a sku file whose name is not <sku>.json", () => {
    const skuDir = path.join(tempData, "catalog", "sku");
    const from = path.join(skuDir, "CHAIR-460.json");
    const to = path.join(skuDir, "chair.json");
    const envelopeFile = path.join(tempData, "catalog", "_envelope.json");
    const before = readFileSync(envelopeFile);
    renameSync(from, to);
    try {
      assert.throws(
        () => publish("catalog", "bad file"),
        (err) => err instanceof Error && err.message.includes('file name must be "CHAIR-460.json"')
      );
      assert.deepEqual(readFileSync(envelopeFile), before);
    } finally {
      renameSync(to, from);
    }
  });

  test("rollback restores published and draft and records rolledBackTo", () => {
    publish("catalog", "baseline");
    const baselineVersion = readEnvelope("catalog").publishedVersion;
    const baseline = readDraft("catalog");

    const file = path.join(tempData, "catalog", "sku", "DESK-LEGS-1400.json");
    const product = JSON.parse(readFileSync(file, "utf-8"));
    product.name = "Временные ножки";
    writeFileSync(file, `${JSON.stringify(product, null, 2)}\n`);
    publish("catalog", "temporary");
    assert.equal(readDraft("catalog").products[0].name, "Временные ножки");

    const result = rollback("catalog", baselineVersion);
    const envelope = readEnvelope("catalog");
    assert.deepEqual(readDraft("catalog"), baseline);
    assert.deepEqual(readConfig("catalog"), baseline);
    assert.equal(result.publishedVersion, baselineVersion + 2);
    assert.equal(envelope.publishedVersion, baselineVersion + 2);
    assert.deepEqual(envelope.history.at(-1), {
      version: result.publishedVersion,
      date: result.date,
      description: `rollback to v${baselineVersion}`,
      rolledBackTo: baselineVersion,
      snapshot: baseline
    });
  });

  test("rollback to a missing version changes nothing", () => {
    const envelopeFile = path.join(tempData, "catalog", "_envelope.json");
    const skuFile = path.join(tempData, "catalog", "sku", "CHAIR-460.json");
    const beforeEnv = readFileSync(envelopeFile);
    const beforeSku = readFileSync(skuFile);
    assert.throws(
      () => rollback("catalog", 9999),
      (err) => err instanceof Error && /snapshot for version 9999 is missing/.test(err.message)
    );
    assert.deepEqual(readFileSync(envelopeFile), beforeEnv);
    assert.deepEqual(readFileSync(skuFile), beforeSku);
  });

  test("rollback restores a file section", () => {
    publish("sales", "marker");
    const version = readEnvelope("sales").publishedVersion;
    const snapshot = readDraft("sales");
    const sales = readJson("sales");
    sales.draft = { replaced: true };
    writeJson("sales", sales);

    const result = rollback("sales", version);
    const after = readJson("sales");
    assert.deepEqual(after.draft, snapshot);
    assert.deepEqual(after.published, snapshot);
    assert.equal(result.publishedVersion, version + 1);
    assert.equal(after.history.at(-1).description, `rollback to v${version}`);
    assert.equal(after.history.at(-1).rolledBackTo, version);
    assert.deepEqual(after.history.at(-1).snapshot, snapshot);
  });

  test("dataVersion grows on publish and rollback", () => {
    const before = readDataVersion();
    publish("commands", "bump");
    assert.equal(readDataVersion(), before + 1);
    const version = readEnvelope("commands").publishedVersion;
    rollback("commands", version);
    assert.equal(readDataVersion(), before + 2);
  });
});
