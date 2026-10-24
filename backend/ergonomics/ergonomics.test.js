import test from "node:test";
import assert from "node:assert/strict";
import { ergo } from "./ergonomics.js";

const TABLE = {
  seatHeightFactor: 2.6,
  deskHeightFactor: 4.15,
  eyeAboveSeatFactor: 4.57,
  monitorDistanceFactor: 3.4,
  monitorDistanceMinMm: 500,
  monitorDistanceMaxMm: 700,
  eyeForwardMm: 150,
  tolerance: { deskHeightMm: 60, monitorDistanceMm: 100, monitorTopMm: 80 }
};

function product(sku, type, dimensions) {
  return { sku, type, dimensions };
}

function place(sku, y, z, rotY = 0) {
  return { sku, x: 0, y, z, rotY };
}

const chairProduct = product("CHAIR-460", "chair", { width: 460, depth: 520, height: 900 });
const chairPlace = place("CHAIR-460", 0, 760, 180);

function measure(body, placements, products, ergonomics = { table: TABLE }) {
  return ergo({
    catalog: { products },
    ergonomics,
    body,
    placements
  });
}

function mmOf(cm) {
  const targets = measure({ heightCm: cm, hand: "right" }, [chairPlace], [chairProduct]).targets;
  return [
    targets.seatHeightMm,
    targets.deskHeightMm,
    targets.eyeHeightMm,
    targets.monitorDistanceMm,
    targets.monitorTopMm
  ];
}

test("175 cm sets targets 455, 726, 1255 and 595 mm", () => {
  // 175×4.15 = 726.25 → 726. Глаза: 455 + 175×4.57 = 1254.75 → 1255.
  const result = measure({ heightCm: 175, hand: "right" }, [chairPlace], [chairProduct]);
  assert.deepEqual(result.targets, {
    seatHeightMm: 455,
    deskHeightMm: 726,
    eyeHeightMm: 1255,
    monitorDistanceMm: 595,
    monitorTopMm: 1255,
    hand: "right"
  });
  assert.deepEqual(result.issues, []);
});

test("targets grow from 160 cm to 190 cm and monitor distance stays inside 500..700", () => {
  const low = mmOf(160);
  const mid = mmOf(175);
  const high = mmOf(190);
  for (let index = 0; index < low.length; index += 1) {
    assert.ok(low[index] < mid[index] && mid[index] < high[index]);
  }
  assert.equal(mmOf(100)[3], 500);
  assert.equal(mmOf(250)[3], 700);
  assert.deepEqual(low, [416, 664, 1147, 544, 1147]);
  assert.deepEqual(high, [494, 789, 1362, 646, 1362]);
});

test("a 1030 mm surface is desk_too_high by 304 mm and 726 mm is within tolerance", () => {
  const top = product("DESK-TOP-1400", "desk_top", { width: 1400, depth: 700, height: 30 });
  const high = measure(
    { heightCm: 175, hand: "right" },
    [place("DESK-TOP-1400", 1000, 0), chairPlace],
    [top, chairProduct]
  );
  assert.deepEqual(high.issues, [
    {
      code: "desk_too_high",
      sku: "DESK-TOP-1400",
      actualMm: 1030,
      targetMm: 726,
      deltaMm: 304
    }
  ]);

  const fit = measure(
    { heightCm: 175, hand: "right" },
    [place("DESK-TOP-1400", 696, 0), chairPlace],
    [top, chairProduct]
  );
  assert.deepEqual(fit.issues, []);

  const edge = measure(
    { heightCm: 175, hand: "right" },
    [place("DESK-TOP-1400", 756, 0), chairPlace],
    [top, chairProduct]
  );
  assert.deepEqual(edge.issues, []);

  const over = measure(
    { heightCm: 175, hand: "right" },
    [place("DESK-TOP-1400", 757, 0), chairPlace],
    [top, chairProduct]
  );
  assert.equal(over.issues[0].code, "desk_too_high");
  assert.equal(over.issues[0].deltaMm, 61);

  const low = measure(
    { heightCm: 175, hand: "right" },
    [place("DESK-TOP-1400", 635, 0), chairPlace],
    [top, chairProduct]
  );
  assert.equal(low.issues[0].code, "desk_too_low");
  assert.equal(low.issues[0].deltaMm, -61);
});

test("monitor distance and height issues keep the worst of several screens", () => {
  const screen = (sku) => product(sku, "monitor", { width: 600, depth: 100, height: 100 });
  const desk = product("DESK-TOP-1400", "desk_top", { width: 1400, depth: 700, height: 30 });
  const products = [chairProduct, desk, screen("MON-A"), screen("MON-B")];
  const body = { heightCm: 175, hand: "right" };
  const base = [place("DESK-TOP-1400", 696, 0), chairPlace];

  // Кресло z=760, глаза на 150 мм ближе к столу: z=610. Глубина монитора 100 мм.
  const far = measure(body, [...base, place("MON-A", 1155, -200)], products);
  assert.deepEqual(far.issues, [
    {
      code: "monitor_too_far",
      sku: "MON-A",
      actualMm: 760,
      targetMm: 595,
      deltaMm: 165
    }
  ]);

  const close = measure(body, [...base, place("MON-A", 1155, 510)], products);
  assert.deepEqual(close.issues, [
    {
      code: "monitor_too_close",
      sku: "MON-A",
      actualMm: 50,
      targetMm: 595,
      deltaMm: -545
    }
  ]);

  const worstDistance = measure(
    body,
    [...base, place("MON-A", 1155, 160), place("MON-B", 1155, -400)],
    products
  );
  assert.equal(worstDistance.issues.length, 1);
  assert.equal(worstDistance.issues[0].code, "monitor_too_far");
  assert.equal(worstDistance.issues[0].sku, "MON-B");
  assert.equal(worstDistance.issues[0].deltaMm, 365);

  const worstHeight = measure(
    body,
    [...base, place("MON-A", 1255, -35), place("MON-B", 0, -35)],
    products
  );
  assert.equal(worstHeight.issues.length, 1);
  assert.equal(worstHeight.issues[0].code, "monitor_too_low");
  assert.equal(worstHeight.issues[0].sku, "MON-B");

  const quiet = measure(body, [...base, place("MON-A", 1155, -35)], products);
  assert.deepEqual(quiet.issues, []);
});

test("eyes move toward the desk and eyeForwardMm defaults to 150", () => {
  const screen = product("MON-A", "monitor", { width: 600, depth: 100, height: 100 });
  const desk = product("DESK-TOP-1400", "desk_top", { width: 1400, depth: 700, height: 30 });
  const products = [chairProduct, desk, screen];
  const body = { heightCm: 175, hand: "right" };
  const placements = [
    place("DESK-TOP-1400", 696, 0),
    place("CHAIR-460", 0, -800, 180),
    place("MON-A", 1155, 2000)
  ];
  const towardDesk = measure(body, placements, products);
  assert.equal(towardDesk.issues[0].code, "monitor_too_far");
  assert.equal(towardDesk.issues[0].actualMm, 2600);

  const { eyeForwardMm, ...rest } = TABLE;
  const pose = [place("DESK-TOP-1400", 696, 0), chairPlace, place("MON-A", 1155, -400)];
  const omitted = measure(body, pose, products, { table: rest });
  const shifted = measure(body, pose, products, { table: { ...TABLE, eyeForwardMm: 300 } });
  assert.equal(omitted.issues[0].actualMm, 960);
  assert.equal(shifted.issues[0].actualMm, 810);
  assert.equal(eyeForwardMm, 150);
});

test("the legs-1000 pose reports desk, distance and monitor height", () => {
  const result = measure(
    { heightCm: 175, hand: "right" },
    [
      place("DESK-LEGS-1400", 0, 0),
      place("DESK-TOP-1800", 1000, 0),
      place("MON-613-366", 1030, -197.5),
      chairPlace
    ],
    [
      product("DESK-LEGS-1400", "desk_legs", { width: 1400, depth: 700, height: 1000 }),
      product("DESK-TOP-1800", "desk_top", { width: 1800, depth: 800, height: 30 }),
      product("MON-613-366", "monitor", { width: 613, depth: 205, height: 366 }),
      chairProduct
    ]
  );
  assert.deepEqual(result.issues, [
    {
      code: "desk_too_high",
      sku: "DESK-TOP-1800",
      actualMm: 1030,
      targetMm: 726,
      deltaMm: 304
    },
    {
      code: "monitor_too_far",
      sku: "MON-613-366",
      actualMm: 705,
      targetMm: 595,
      deltaMm: 110
    },
    {
      code: "monitor_too_high",
      sku: "MON-613-366",
      actualMm: 1396,
      targetMm: 1255,
      deltaMm: 141
    }
  ]);
});

test("ergo is null without a table, a height, or a chair", () => {
  const body = { heightCm: 175, hand: "right" };
  assert.equal(measure(body, [chairPlace], [chairProduct], {}), null);
  assert.equal(
    ergo({ catalog: { products: [chairProduct] }, body, placements: [chairPlace] }),
    null
  );
  assert.equal(measure({}, [chairPlace], [chairProduct]), null);
  assert.equal(measure({ heightCm: 0, hand: "right" }, [chairPlace], [chairProduct]), null);
  assert.equal(measure(body, [], [chairProduct]), null);
  assert.equal(
    measure(body, [place("DESK-TOP-1400", 1000, 0)], [
      product("DESK-TOP-1400", "desk_top", { width: 1400, depth: 700, height: 30 })
    ]),
    null
  );
});

test("the working hand is copied onto targets and does not change the numbers", () => {
  const right = measure({ heightCm: 175, hand: "right" }, [chairPlace], [chairProduct]);
  const left = measure({ heightCm: 175, hand: "left" }, [chairPlace], [chairProduct]);
  assert.equal(left.targets.hand, "left");
  assert.deepEqual({ ...left.targets, hand: "right" }, right.targets);
});
