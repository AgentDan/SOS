import test from "node:test";
import assert from "node:assert/strict";
import { createBodyFromCatalogItem } from "./bodies.js";

test("createBodyFromCatalogItem requires collider parts", () => {
  const item = {
    sku: "CHAIR-460",
    type: "chair",
    dimensions: { width: 460, depth: 520, height: 900 }
  };
  assert.throws(() => createBodyFromCatalogItem(item), /CHAIR-460/);
  assert.throws(() => createBodyFromCatalogItem(item, { parts: [] }), /нет частей коллайдера/);
  assert.throws(
    () =>
      createBodyFromCatalogItem(item, {
        parts: [{ half: { x: 0.1, y: 0.1, z: 0.1 }, local: { x: 0, y: 0, z: 0 } }]
      }),
    /Physics world not initialized/
  );
});
