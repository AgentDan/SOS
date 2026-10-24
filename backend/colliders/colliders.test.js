import test from "node:test";
import assert from "node:assert/strict";
import { addCollidersToGlb, ColliderError, parseGlb, summarizeGlb } from "./index.js";
import { encodeGlb } from "./glb.js";

function pad4(bytes, fill) {
  const extra = (4 - (bytes.length % 4)) % 4;
  if (extra === 0) return bytes;
  const out = Buffer.alloc(bytes.length + extra, fill);
  bytes.copy(out);
  return out;
}

function corners(hx, hy, hz) {
  const points = [];
  for (const x of [-hx, hx]) {
    for (const y of [-hy, hy]) {
      for (const z of [-hz, hz]) points.push([x, y, z]);
    }
  }
  return points;
}

function meshGlb(specs) {
  const positions = [];
  const accessors = [];
  const bufferViews = [];
  const meshes = [];
  const nodes = specs.map((spec) => {
    const node = { name: spec.name };
    if (spec.translation) node.translation = spec.translation.slice();
    if (spec.rotation) node.rotation = spec.rotation.slice();
    if (spec.scale) node.scale = spec.scale.slice();
    if (spec.corners) {
      const start = positions.length;
      for (const point of spec.corners) positions.push(point[0], point[1], point[2]);
      const count = spec.corners.length;
      bufferViews.push({
        buffer: 0,
        byteOffset: start * 4,
        byteLength: count * 12
      });
      accessors.push({
        bufferView: accessors.length,
        componentType: spec.componentType || 5126,
        count,
        type: spec.accessorType || "VEC3"
      });
      meshes.push({ primitives: [{ attributes: { POSITION: meshes.length } }] });
      node.mesh = meshes.length - 1;
    }
    return node;
  });

  const byName = new Map(specs.map((spec, index) => [spec.name, index]));
  specs.forEach((spec, index) => {
    if (!spec.children) return;
    nodes[index].children = spec.children.map((name) => byName.get(name));
  });

  const bin = pad4(Buffer.from(new Float32Array(positions).buffer), 0);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: specs.flatMap((spec, index) => (spec.root === false ? [] : [index])) }],
    nodes,
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }]
  };
  return { json, bin, glb: encodeGlb(json, bin) };
}

function near(actual, expected, epsilon = 1e-5) {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) < epsilon,
      `${actual.join(",")} vs ${expected.join(",")} at ${index}`
    );
  }
}

function thrown(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  assert.fail("expected ColliderError");
}

function partNamed(parts, name) {
  const found = parts.find((part) => part.name === name);
  assert.ok(found, name);
  return found;
}

function assertContainer(glb) {
  assert.equal(glb.readUInt32LE(0), 0x46546c67);
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length);
  const jsonLength = glb.readUInt32LE(12);
  assert.equal(jsonLength % 4, 0);
  assert.equal(glb.readUInt32LE(16), 0x4e4f534a);
  const chunk = glb.subarray(20, 20 + jsonLength);
  const text = chunk.toString("utf8");
  const end = text.trimEnd().length;
  for (let index = end; index < chunk.length; index += 1) assert.equal(chunk[index], 0x20);
  const binHeader = 20 + jsonLength;
  const binLength = glb.readUInt32LE(binHeader);
  assert.equal(glb.readUInt32LE(binHeader + 4), 0x004e4942);
  assert.equal(binHeader + 8 + binLength, glb.length);
}

function assertIndices(json) {
  const count = json.nodes.length;
  for (const node of json.nodes) {
    for (const child of (node && node.children) || []) {
      assert.equal(Number.isInteger(child) && child >= 0 && child < count, true);
    }
  }
  for (const scene of json.scenes || []) {
    for (const index of (scene && scene.nodes) || []) {
      assert.equal(Number.isInteger(index) && index >= 0 && index < count, true);
    }
  }
  for (const skin of json.skins || []) {
    if (skin.skeleton != null) {
      assert.equal(skin.skeleton >= 0 && skin.skeleton < count, true);
    }
    for (const joint of skin.joints || []) {
      assert.equal(joint >= 0 && joint < count, true);
    }
  }
  for (const animation of json.animations || []) {
    for (const channel of (animation && animation.channels) || []) {
      const node = channel && channel.target && channel.target.node;
      if (node == null) continue;
      assert.equal(node >= 0 && node < count, true);
    }
  }
}

test("world AABB follows translation, rotation and parent scale", () => {
  const quarter = Math.sin(Math.PI / 4);
  const { glb } = meshGlb([
    {
      name: "Slab",
      translation: [3, 4, 5],
      rotation: [0, 0, quarter, quarter],
      corners: corners(1, 0.1, 0.1)
    },
    {
      name: "Arm",
      translation: [1, 0, 0],
      children: ["Mast"]
    },
    {
      name: "Mast",
      root: false,
      translation: [0, 2, 0],
      scale: [2, 1, 1],
      corners: corners(0.5, 0.5, 0.5)
    }
  ]);

  const built = addCollidersToGlb(glb, { type: "desk_top" });
  const slab = partNamed(built.parts, "Slab");
  const mast = partNamed(built.parts, "Mast");
  near(slab.center, [3, 4, 5]);
  near(slab.size, [0.2, 2, 0.2]);
  near(mast.center, [1, 2, 0]);
  near(mast.size, [2, 1, 1]);
  assert.ok(slab.size[0] < slab.size[1]);
});

test("old COL_* nodes, including meshes and children, are replaced", () => {
  const fixture = meshGlb([
    { name: "Body", corners: corners(0.5, 0.5, 0.5), children: ["Knob"] },
    { name: "Knob", root: false, corners: corners(0.2, 0.2, 0.2) },
    { name: "COL_Old", corners: corners(50, 50, 50), children: ["Screw"] },
    { name: "Screw", root: false, corners: corners(50, 50, 50) }
  ]);
  fixture.json.skins = [{ joints: [0, 3], skeleton: 2 }];
  fixture.json.animations = [
    {
      channels: [
        { sampler: 0, target: { node: 2, path: "translation" } },
        { sampler: 0, target: { node: 0, path: "translation" } }
      ],
      samplers: [{ input: 0, output: 0, interpolation: "LINEAR" }]
    }
  ];
  const original = encodeGlb(fixture.json, fixture.bin);
  const built = addCollidersToGlb(original, { type: "desk_top" });
  assertContainer(built.glb);
  const parsed = parseGlb(built.glb);
  assert.deepEqual(parsed.bin, fixture.bin);
  assertIndices(parsed.json);

  const names = parsed.json.nodes.map((node) => node.name);
  assert.deepEqual(
    names.filter((name) => name && name.startsWith("COL_")).sort(),
    ["COL_Body", "COL_Knob"]
  );
  assert.equal(names.includes("COL_Old"), false);
  assert.equal(names.includes("Screw"), false);
  assert.equal(new Set(names).size, names.length);
  assert.equal(parsed.json.nodes[0].children[0], 1);
  assert.deepEqual(parsed.json.skins[0].joints, [0]);
  assert.equal(parsed.json.skins[0].skeleton, undefined);
  assert.equal(parsed.json.animations[0].channels.length, 1);
  assert.equal(parsed.json.animations[0].channels[0].target.node, 0);
  assert.deepEqual(
    built.parts.map((part) => part.name),
    ["Body", "Knob"]
  );
  assert.equal(built.sizeMm.width, 1000);
  assert.equal(built.sizeMm.height, 1000);
  assert.equal(built.sizeMm.depth, 1000);

  for (const node of parsed.json.nodes) {
    if (!node.name || !node.name.startsWith("COL_")) continue;
    assert.equal(node.mesh, undefined);
    assert.equal(node.rotation, undefined);
    assert.equal(node.extras.collider, "box");
    assert.equal(node.scale.length, 3);
  }
});

test("processing a file twice keeps the same parts", () => {
  const { glb } = meshGlb([
    { name: "Top", translation: [2, 0, 0], corners: corners(0.4, 0.1, 0.2) },
    { name: "Top_Lip", translation: [2, 0.2, 0], corners: corners(0.4, 0.02, 0.2) }
  ]);
  const once = addCollidersToGlb(glb, { type: "desk_top" });
  const twice = addCollidersToGlb(once.glb, { type: "desk_top" });
  assert.equal(once.parts.length, 1);
  assert.deepEqual(twice.parts, once.parts);
  assert.deepEqual(summarizeGlb(twice.glb).colliderNames, ["COL_Top"]);
});

test("broken files and missing parts throw ColliderError", () => {
  const notGlb = thrown(() => addCollidersToGlb(Buffer.from("hello"), { type: "desk_top" }));
  assert.ok(notGlb instanceof ColliderError);
  assert.match(notGlb.message, /GLB/);

  const empty = meshGlb([{ name: "Empty" }]);
  const noGeometry = thrown(() => addCollidersToGlb(empty.glb, { type: "monitor" }));
  assert.ok(noGeometry instanceof ColliderError);
  assert.match(noGeometry.message, /геометр/);

  const flat = meshGlb([{ name: "Sheet", corners: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]] }]);
  const zero = thrown(() => addCollidersToGlb(flat.glb, { type: "desk_top" }));
  assert.ok(zero instanceof ColliderError);
  assert.match(zero.message, /Нулевой размер/);

  const badAccessor = meshGlb([{ name: "Box", corners: corners(0.2, 0.2, 0.2), componentType: 5124 }]);
  const accessor = thrown(() => addCollidersToGlb(badAccessor.glb, { type: "monitor" }));
  assert.ok(accessor instanceof ColliderError);
  assert.match(accessor.message, /неподдерживаемый тип компонента/);

  const chair = meshGlb([
    { name: "Wheel_0", corners: corners(0.03, 0.03, 0.03) },
    { name: "Screen", corners: corners(0.2, 0.2, 0.02) }
  ]);
  const chairError = thrown(() => addCollidersToGlb(chair.glb, { type: "chair" }));
  assert.ok(chairError instanceof ColliderError);
  assert.match(chairError.message, /Seat/);
  assert.match(chairError.message, /Back/);
  assert.match(chairError.message, /Base/);
  assert.match(chairError.message, /Wheel_0/);
  assert.match(chairError.message, /Screen/);

  const legs = meshGlb([{ name: "Top", corners: corners(0.5, 0.02, 0.3) }]);
  const legsError = thrown(() => addCollidersToGlb(legs.glb, { type: "desk_legs" }));
  assert.ok(legsError instanceof ColliderError);
  assert.match(legsError.message, /стойк/);
  assert.match(legsError.message, /Top/);

  const names = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda", "Mu", "Nu"];
  const many = meshGlb(names.map((name, index) => ({ name, translation: [index, 0, 0], corners: corners(0.1, 0.1, 0.1) })));
  const manyError = thrown(() => addCollidersToGlb(many.glb, { type: "monitor" }));
  assert.ok(manyError instanceof ColliderError);
  assert.match(manyError.message, /13/);
  assert.match(manyError.message, /12/);
  assert.match(manyError.message, /нельзя/);
});

test("a chair keeps Seat, Back and Base and drops wheels", () => {
  const { glb } = meshGlb([
    { name: "Seat_Cushion", corners: corners(0.2, 0.02, 0.2) },
    { name: "Backrest_Main", translation: [0, 0.4, 0.2], corners: corners(0.2, 0.3, 0.02) },
    { name: "Hub", translation: [0, -0.2, 0], corners: corners(0.05, 0.05, 0.05) },
    { name: "Wheel_0", translation: [0.2, -0.4, 0], corners: corners(0.03, 0.03, 0.03) }
  ]);
  const built = addCollidersToGlb(glb, { type: "chair" });
  assert.deepEqual(
    built.parts.map((part) => part.name),
    ["Back", "Base", "Seat"]
  );
});

test("summarizeGlb reports size and collider names", () => {
  const { glb } = meshGlb([{ name: "Top", corners: corners(0.5, 0.5, 0.5) }]);
  const summary = summarizeGlb(glb);
  assert.deepEqual(summary.colliderNames, []);
  assert.deepEqual(summary.sizeMm, { width: 1000, height: 1000, depth: 1000 });
});
