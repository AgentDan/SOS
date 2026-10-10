import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonText } from "./json-text.js";

test("parseJsonText returns the value when the text is JSON", () => {
  const parsed = parseJsonText('{\n  "low": 35\n}\n');
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, { low: 35 });
});

test("parseJsonText points at an unclosed object", () => {
  const parsed = parseJsonText("{");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.line, 1);
  assert.equal(parsed.column, 2);
  assert.equal(parsed.position, 1);
  assert.match(parsed.message, /строка 1/);
  assert.match(parsed.message, /позиция 2/);
});

test("parseJsonText points at a missing value", () => {
  const parsed = parseJsonText('{"a": }');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.line, 1);
  assert.equal(parsed.column, 7);
  assert.equal(parsed.position, 6);
  assert.match(parsed.message, /строка 1, позиция 7/);
});

test("parseJsonText counts lines", () => {
  const parsed = parseJsonText("{\n  \"a\": \n}");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.line, 3);
  assert.equal(parsed.column, 1);
  assert.match(parsed.message, /строка 3, позиция 1/);
});

test("parseJsonText points at a trailing comma", () => {
  const parsed = parseJsonText("[1,]");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.line, 1);
  assert.equal(parsed.column, 4);
  assert.match(parsed.message, /лишняя запятая/i);
});

test("parseJsonText rejects empty text", () => {
  const parsed = parseJsonText("");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.line, 1);
  assert.equal(parsed.column, 1);
  assert.match(parsed.message, /пустой текст/i);
});
