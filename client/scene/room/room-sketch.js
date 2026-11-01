import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { PENS, createPen } from "./pen.js";

const PENCIL = 0x2a2825;
const DRAW_ORDER = ["hatch", "vein", "ghost", "light", "second", "main"];
const X = [1, 0, 0];
const Y = [0, 1, 0];
const Z = [0, 0, 1];
const DOWN = [0, -1, 0];

function createRoomSketch(plan, options = {}) {
  const seed = options.seed ?? 7;
  const details = { windows: true, panels: true, ...(options.details ?? {}) };
  const width = plan.width;
  const depth = plan.depth;
  const height = plan.height;
  const hw = width / 2;
  const hd = depth / 2;
  const zF = hd + 0.6;
  const pen = createPen(seed);
  const walls = Array.isArray(plan.walls) ? plan.walls : [];

  function wall(side) {
    return walls.find((item) => item.side === side) ?? null;
  }

  function wallRun(penName, y, opt) {
    pen.stroke(penName, [-hw, y, -hd], [hw, y, -hd], opt);
    pen.stroke(penName, [-hw, y, -hd], [-hw, y, zF], opt);
    pen.stroke(penName, [hw, y, -hd], [hw, y, zF], opt);
  }

  function corners() {
    const ghost = { ghost: true };
    pen.stroke("main", [-hw, 0, -hd], [-hw, height, -hd], { ...ghost, over: 0.09 });
    pen.stroke("main", [hw, 0, -hd], [hw, height, -hd], { ...ghost, over: 0.09 });
    pen.stroke("main", [-hw, 0, -hd], [hw, 0, -hd], { ...ghost, over: 0.12 });
    pen.stroke("main", [-hw, height, -hd], [hw, height, -hd], { ...ghost, over: 0.12 });
    pen.stroke("main", [-hw, 0, -hd], [-hw, 0, zF], { ...ghost, over: 0.1 });
    pen.stroke("main", [hw, 0, -hd], [hw, 0, zF], { ...ghost, over: 0.1 });
    pen.stroke("main", [-hw, height, -hd], [-hw, height, zF], { ...ghost, over: 0.1 });
    pen.stroke("main", [hw, height, -hd], [hw, height, zF], { ...ghost, over: 0.1 });
  }

  function cornice() {
    const bands = [
      { drop: 0.055, penName: "light" },
      { drop: 0.1, penName: "light" },
      { drop: 0.16, penName: "second" }
    ];
    for (const band of bands) wallRun(band.penName, height - band.drop, { over: 0.04 });
    for (const inset of [0.06, 0.12]) {
      const y = height - 0.001;
      const x0 = -hw + inset;
      const x1 = hw - inset;
      const z0 = -hd + inset;
      pen.stroke("light", [x0, y, z0], [x1, y, z0], { over: 0.03 });
      pen.stroke("light", [x0, y, z0], [x0, y, zF], { over: 0.03 });
      pen.stroke("light", [x1, y, z0], [x1, y, zF], { over: 0.03 });
    }
    pen.hatchBand([-hw + 0.05, height - 0.17, -hd + 0.002], X, DOWN, width - 0.1, 0.13, {
      step: 0.028,
      slant: -0.3
    });
    pen.hatchBand([-hw + 0.002, height - 0.17, -hd + 0.05], Z, DOWN, 2.6, 0.11, {
      step: 0.03,
      slant: -0.3
    });
    pen.hatchBand([hw - 0.002, height - 0.17, -hd + 0.05], Z, DOWN, 2.6, 0.11, {
      step: 0.03,
      slant: -0.3
    });
  }

  function rosette(radius, penName) {
    const phase = pen.rr(0, 6.28);
    const y = height - 0.001;
    const points = [];
    for (let i = 0; i < 50; i++) {
      const ang = phase + (i / 48) * Math.PI * 2;
      const rad = radius * (1 + pen.rr(-0.012, 0.012));
      points.push([Math.cos(ang) * rad, y, 0.1 + Math.sin(ang) * rad]);
    }
    pen.polyline(penName, points);
  }

  function baseboard() {
    wallRun("light", 0.075, { over: 0.03 });
    wallRun("second", 0.1, { over: 0.03 });
  }

  function drawWindow(win) {
    if (!win || !(win.width > 0) || !(win.height > 0)) return;
    const z = -hd + 0.002;
    const x0 = win.center - win.width / 2;
    const y0 = win.sill;
    const ww = win.width;
    const wh = win.height;
    pen.rect("main", [x0, y0, z], X, Y, ww, wh, { ghost: true, over: 0.035, breaks: false });
    const frame = 0.05;
    if (ww > frame * 2 && wh > frame * 2) {
      pen.rect("second", [x0 + frame, y0 + frame, z], X, Y, ww - frame * 2, wh - frame * 2, {
        over: 0.02
      });
      pen.stroke("second", [win.center, y0 + frame, z], [win.center, y0 + wh - frame, z]);
      for (let k = 1; k <= 3; k++) {
        const y = y0 + (wh * k) / 4;
        pen.stroke("light", [x0 + frame, y, z], [x0 + ww - frame, y, z]);
      }
    }
    pen.stroke("main", [x0 - 0.07, win.sill - 0.01, z], [x0 + ww + 0.07, win.sill - 0.01, z]);
    pen.stroke("second", [x0 - 0.07, win.sill - 0.045, z], [x0 + ww + 0.07, win.sill - 0.045, z]);
    pen.rect("light", [x0 - 0.07, y0, z], X, Y, ww + 0.14, wh + 0.08);
    const glassH = Math.min(0.2, wh);
    pen.hatchBand([x0, y0 + wh - glassH, z], X, Y, ww / 2, glassH, {
      step: 0.04,
      slant: 0.9,
      pen: "ghost",
      fade: false
    });
  }

  function drawSide(sideWall, x) {
    if (!sideWall) return;
    pen.stroke("light", [x, 0.32, -hd], [x, 0.32, zF]);
    for (const panel of sideWall.panels ?? []) {
      const z0 = -hd + panel.s0;
      const pw = panel.s1 - panel.s0;
      const ph = panel.top - panel.bottom;
      if (!(pw > 0.02) || !(ph > 0.02)) continue;
      pen.rect("second", [x, panel.bottom, z0], Z, Y, pw, ph);
      const inset = 0.045;
      if (pw > inset * 2 && ph > inset * 2) {
        pen.rect("light", [x, panel.bottom + inset, z0 + inset], Z, Y, pw - inset * 2, ph - inset * 2);
      }
    }
  }

  function floor() {
    const seamY = 0.001;
    const across = Math.floor((width - 1e-6) / 0.9);
    for (let i = 1; i <= across; i++) {
      const x = -hw + i * 0.9;
      if (x >= hw - 1e-4) break;
      pen.stroke("light", [x, seamY, -hd], [x, seamY, zF], { over: 0 });
    }
    const along = Math.floor((zF + hd - 1e-6) / 0.9);
    for (let i = 1; i <= along; i++) {
      const z = -hd + i * 0.9;
      if (z >= zF - 1e-4) break;
      pen.stroke("light", [-hw, seamY, z], [hw, seamY, z], { over: 0 });
    }

    const veinY = 0.002;
    for (let n = 0; n < 22; n++) {
      let x = pen.rr(-hw + 0.2, hw - 0.2);
      let z = pen.rr(-hd + 0.2, zF - 0.4);
      let ang = 0.55 + pen.rr(-0.5, 0.5);
      if (pen.rr(0, 1) < 0.5) ang += Math.PI;
      const steps = Math.round(pen.rr(10, 24));
      const points = [[x, veinY, z]];
      for (let s = 0; s < steps; s++) {
        ang += pen.rr(-0.32, 0.32);
        const stepLen = pen.rr(0.06, 0.13);
        const nx = x + Math.cos(ang) * stepLen;
        const nz = z + Math.sin(ang) * stepLen;
        if (nx < -hw || nx > hw || nz < -hd || nz > zF) break;
        x = nx;
        z = nz;
        points.push([x, veinY, z]);
        if (points.length > 3 && pen.rr(0, 1) < 0.08) {
          const sign = pen.rr(0, 1) < 0.5 ? -1 : 1;
          const branchAng = ang + sign * pen.rr(0.6, 1.2);
          const branchLen = pen.rr(0.08, 0.18);
          const bx = x + Math.cos(branchAng) * branchLen;
          const bz = z + Math.sin(branchAng) * branchLen;
          if (bx >= -hw && bx <= hw && bz >= -hd && bz <= zF) {
            pen.polyline("vein", [
              [x, veinY, z],
              [bx, veinY, bz]
            ]);
          }
        }
      }
      if (points.length > 1) pen.polyline("vein", points);
    }

    pen.hatchBand([-hw + 0.1, 0.0015, -hd + 0.01], X, Z, width - 0.2, 0.06, {
      step: 0.04,
      slant: -0.4
    });
  }

  corners();
  cornice();
  rosette(0.2, "second");
  rosette(0.26, "second");
  rosette(0.4, "light");
  baseboard();
  if (details.windows) {
    for (const win of wall("back")?.windows ?? []) drawWindow(win);
  }
  if (details.panels) {
    drawSide(wall("left"), -hw + 0.002);
    drawSide(wall("right"), hw - 0.002);
  }
  floor();

  const drawn = pen.result();
  const group = new THREE.Group();
  const materials = [];
  const geometries = [];
  for (const name of DRAW_ORDER) {
    const positions = drawn[name];
    if (!positions || positions.length < 6 || !PENS[name]) continue;
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({
      color: PENCIL,
      linewidth: PENS[name].width,
      transparent: true,
      opacity: PENS[name].opacity,
      depthWrite: false
    });
    group.add(new LineSegments2(geometry, material));
    geometries.push(geometry);
    materials.push(material);
  }

  function setResolution(widthPx, heightPx) {
    for (const material of materials) material.resolution.set(widthPx, heightPx);
  }

  function dispose() {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  return { group, setResolution, dispose };
}

export { createRoomSketch };
