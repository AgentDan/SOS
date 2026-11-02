import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { canPlace, canReplace } from "./placement.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(relative) {
  return JSON.parse(readFileSync(path.join(root, relative), "utf8"));
}

const catalog = {
  types: readJson("data/catalog/types.json"),
  products: [
    "DESK-LEGS-1400",
    "DESK-TOP-1400",
    "DESK-TOP-1800",
    "MON-613-366",
    "CHAIR-460",
    "KB-440",
    "MOUSE-65",
    "SPK-100"
  ].map((sku) => readJson(`data/catalog/sku/${sku}.json`))
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

test("two monitors plus two speakers fit on DESK-TOP-1800 and not on DESK-TOP-1400", () => {
  const narrow = ["DESK-LEGS-1400", "DESK-TOP-1400", "MON-613-366", "MON-613-366"];
  const wide = ["DESK-LEGS-1400", "DESK-TOP-1800", "MON-613-366", "MON-613-366"];
  const refused = place(narrow, "SPK-100");
  assert.equal(refused.ok, false);
  assert.equal(refused.reasonCode, "host_full");
  assert.equal(refused.sku, "SPK-100");
  assert.equal(place(wide, "SPK-100").ok, true);
  assert.equal(place(wide.concat("SPK-100"), "SPK-100").ok, true);
});

test("a mouse without a keyboard is allowed", () => {
  assert.deepEqual(place(["DESK-LEGS-1400", "DESK-TOP-1800"], "MOUSE-65"), { ok: true });
});

test("a top that is too shallow for the front row refuses the keyboard", () => {
  const shallow = {
    ...catalog,
    products: catalog.products.map((product) => {
      if (product.sku !== "DESK-TOP-1400") return product;
      const next = { ...product, dimensions: { ...product.dimensions, depth: 200 } };
      delete next.modelSizeMm;
      return next;
    })
  };
  const result = canPlace({
    catalog: shallow,
    sceneSkus: ["DESK-LEGS-1400", "DESK-TOP-1400", "MON-613-366"],
    sku: "KB-440"
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "host_full");
});

test("replacing the desk rechecks the speakers beside the monitors", () => {
  const wide = {
    sku: "TOP-WIDE",
    type: "desk_top",
    dimensions: { width: 1800, depth: 800, height: 30 }
  };
  const narrow = {
    sku: "TOP-NARROW",
    type: "desk_top",
    dimensions: { width: 1600, depth: 800, height: 30 }
  };
  const monitor = {
    sku: "MON",
    type: "monitor",
    dimensions: { width: 613, depth: 205, height: 366 }
  };
  const column = {
    sku: "SPK",
    type: "speaker",
    dimensions: { width: 100, depth: 110, height: 200 }
  };
  const local = {
    types: catalog.types,
    products: [
      ...catalog.products,
      wide,
      narrow,
      monitor,
      column,
      { sku: "LEGS", type: "desk_legs", dimensions: { width: 1400, depth: 700, height: 1000 } }
    ]
  };
  const scene = ["LEGS", "TOP-WIDE", "MON", "MON", "SPK", "SPK"];
  const kept = canReplace({ catalog: local, sceneSkus: scene, sku: "TOP-WIDE", withSku: "TOP-WIDE" });
  assert.equal(kept.reasonCode === "host_full", false);
  const swapped = canReplace({
    catalog: local,
    sceneSkus: scene,
    sku: "TOP-WIDE",
    withSku: "TOP-NARROW"
  });
  assert.equal(swapped.ok, false);
  assert.equal(swapped.reasonCode, "host_full");
});

test("canPlace uses model size and falls back to the card", () => {
  const top = {
    sku: "TOP",
    type: "desk_top",
    dimensions: { width: 1400, depth: 800, height: 40 },
    modelSizeMm: { width: 1800, height: 40, depth: 800 }
  };
  const monitor = {
    sku: "MON",
    type: "monitor",
    dimensions: { width: 2000, depth: 200, height: 400 },
    modelSizeMm: { width: 500, height: 400, depth: 200 }
  };
  const keyboard = {
    sku: "KB",
    type: "keyboard",
    dimensions: { width: 440, depth: 100, height: 25 },
    modelSizeMm: { width: 440, height: 25, depth: 700 }
  };
  const local = { types: catalog.types, products: [top, monitor, keyboard] };
  assert.equal(canPlace({ catalog: local, sceneSkus: ["TOP"], sku: "MON" }).ok, true);
  assert.equal(canPlace({ catalog: local, sceneSkus: ["TOP"], sku: "KB" }).ok, false);

  const cards = {
    types: catalog.types,
    products: [
      { sku: "TOP", type: "desk_top", dimensions: { width: 1400, depth: 800, height: 40 } },
      { sku: "MON", type: "monitor", dimensions: { width: 2000, depth: 200, height: 400 } },
      { sku: "KB", type: "keyboard", dimensions: { width: 440, depth: 100, height: 25 } }
    ]
  };
  assert.equal(canPlace({ catalog: cards, sceneSkus: ["TOP"], sku: "MON" }).ok, false);
  assert.equal(canPlace({ catalog: cards, sceneSkus: ["TOP"], sku: "KB" }).ok, true);

  const broken = {
    types: catalog.types,
    products: [
      { sku: "TOP", type: "desk_top", dimensions: { width: 1400, depth: 800, height: 40 } },
      {
        sku: "MON",
        type: "monitor",
        dimensions: { width: 2000, depth: 200, height: 400 },
        modelSizeMm: { width: -1, height: 400, depth: 200 }
      }
    ]
  };
  assert.equal(canPlace({ catalog: broken, sceneSkus: ["TOP"], sku: "MON" }).ok, false);
});
