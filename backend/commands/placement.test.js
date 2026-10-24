import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { canPlace } from "./placement.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(relative) {
  return JSON.parse(readFileSync(path.join(root, relative), "utf8"));
}

const catalog = {
  types: readJson("data/catalog/types.json"),
  products: ["DESK-LEGS-1400", "DESK-TOP-1400", "DESK-TOP-1800", "MON-613-366", "CHAIR-460"].map(
    (sku) => readJson(`data/catalog/sku/${sku}.json`)
  )
};

function place(sceneSkus, sku) {
  const before = sceneSkus.slice();
  const result = canPlace({ catalog, sceneSkus, sku });
  assert.deepEqual(sceneSkus, before);
  return result;
}

test("a monitor without a desk is no_host", () => {
  assert.deepEqual(place(["DESK-LEGS-1400"], "MON-613-366"), {
    ok: false,
    reasonCode: "no_host",
    facts: {},
    sku: "MON-613-366"
  });
});

test("one monitor fits on DESK-TOP-1400 and a second does not", () => {
  assert.deepEqual(place(["DESK-LEGS-1400", "DESK-TOP-1400"], "MON-613-366"), { ok: true });
  assert.deepEqual(
    place(["DESK-LEGS-1400", "DESK-TOP-1400", "MON-613-366"], "MON-613-366"),
    {
      ok: false,
      reasonCode: "host_full",
      facts: { hostSku: "DESK-TOP-1400", inRow: 1, fits: 1 },
      sku: "MON-613-366"
    }
  );
});

test("two monitors fit on DESK-TOP-1800 and a third does not", () => {
  assert.deepEqual(
    place(["DESK-LEGS-1400", "DESK-TOP-1800", "MON-613-366"], "MON-613-366"),
    { ok: true }
  );
  assert.deepEqual(
    place(
      ["DESK-LEGS-1400", "DESK-TOP-1800", "MON-613-366", "MON-613-366"],
      "MON-613-366"
    ),
    {
      ok: false,
      reasonCode: "host_full",
      facts: { hostSku: "DESK-TOP-1800", inRow: 2, fits: 2 },
      sku: "MON-613-366"
    }
  );
});

test("an item with an empty canHostOn is placed without checks", () => {
  assert.deepEqual(place([], "CHAIR-460"), { ok: true });
});
