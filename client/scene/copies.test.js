import test from "node:test";
import assert from "node:assert/strict";
import { copyOffsetX } from "./copies.js";
import { enumerateInstances, instanceKey } from "./physics/registry.js";

test("instance keys number each copy of a sku", () => {
  assert.equal(instanceKey("MON-613-366", 1), "MON-613-366#1");
  assert.deepEqual(
    enumerateInstances(["MON-613-366", "CHAIR-460", "MON-613-366"]).map((item) => item.id),
    ["MON-613-366#1", "CHAIR-460#1", "MON-613-366#2"]
  );
});

test("the first copy stays on the offset and the next one sits beside it", () => {
  const occupied = [{ x: 0, width: 400 }];
  const options = { offsetX: 0, itemWidth: 400, hostWidth: 2000, occupied };
  assert.equal(copyOffsetX(1, options), 0);
  assert.equal(copyOffsetX(2, options), -400);
});

test("a copy with no free span stays on the offset", () => {
  const options = {
    offsetX: 0,
    itemWidth: 400,
    hostWidth: 500,
    occupied: [{ x: 0, width: 400 }]
  };
  assert.equal(copyOffsetX(2, options), 0);
});
