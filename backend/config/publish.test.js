import { mkdtempSync, cpSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { publish } from "./publish.js";
import { readConfig, readDraft } from "./load.js";

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
      description: "test publish"
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
    const envelope = readJson("catalog");
    assert.deepEqual(readConfig("catalog", "published"), envelope.published);
    assert.deepEqual(readConfig("catalog"), envelope.published);
    assert.deepEqual(readDraft("catalog"), envelope.draft);
  });
});
