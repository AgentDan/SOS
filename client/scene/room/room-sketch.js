import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { PENS, createPen } from "./pen.js";

const PENCIL = 0x4a4c50;
const DRAW_ORDER = ["hatch", "vein", "ghost", "light", "second", "main"];
const X = [1, 0, 0];
const Y = [0, 1, 0];
const Z = [0, 0, 1];
const DOWN = [0, -1, 0];
const SOLID = { breaks: false };

function createRoomSketch(plan, options = {}) {
  const seed = options.seed ?? 7;
  const details = { windows: true, panels: true, ...(options.details ?? {}) };
  const width = plan.width;
  const depth = plan.depth;
  const height = plan.height;
  const hw = width / 2;
  const hd = depth / 2;
  const pen = createPen(seed);
  const walls = Array.isArray(plan.walls) ? plan.walls : [];

  function wall(side) {
    return walls.find((item) => item.side === side) ?? null;
  }

  function pointOnWall(side, along, y) {
    const inset = 0.002;
    if (side === "back") return [along, y, -hd + inset];
    if (side === "front") return [along, y, hd - inset];
    if (side === "left") return [-hw + inset, y, along];
    if (side === "right") return [hw - inset, y, along];
    return [along, y, 0];
  }

  function wallAxes(side) {
    if (side === "left" || side === "right") return Z;
    return X;
  }

  function alongFromStart(side, s) {
    if (side === "left" || side === "right") return -hd + s;
    return -hw + s;
  }

  function wallRun(penName, y, opt) {
    pen.stroke(penName, [-hw, y, -hd], [hw, y, -hd], opt);
    pen.stroke(penName, [hw, y, -hd], [hw, y, hd], opt);
    pen.stroke(penName, [hw, y, hd], [-hw, y, hd], opt);
    pen.stroke(penName, [-hw, y, hd], [-hw, y, -hd], opt);
  }

  function corners() {
    const ghost = { ghost: true };
    for (const [x, z] of [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd]
    ]) {
      pen.stroke("main", [x, 0, z], [x, height, z], { ...ghost, over: 0.09 });
    }
    pen.stroke("main", [-hw, 0, -hd], [hw, 0, -hd], { ...ghost, over: 0.12 });
    pen.stroke("main", [hw, 0, -hd], [hw, 0, hd], { ...ghost, over: 0.1 });
    pen.stroke("main", [hw, 0, hd], [-hw, 0, hd], { ...ghost, over: 0.12 });
    pen.stroke("main", [-hw, 0, hd], [-hw, 0, -hd], { ...ghost, over: 0.1 });
    pen.stroke("main", [-hw, height, -hd], [hw, height, -hd], { ...ghost, over: 0.12 });
    pen.stroke("main", [hw, height, -hd], [hw, height, hd], { ...ghost, over: 0.1 });
    pen.stroke("main", [hw, height, hd], [-hw, height, hd], { ...ghost, over: 0.12 });
    pen.stroke("main", [-hw, height, hd], [-hw, height, -hd], { ...ghost, over: 0.1 });
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
      const z1 = hd - inset;
      pen.stroke("light", [x0, y, z0], [x1, y, z0], { over: 0.03 });
      pen.stroke("light", [x1, y, z0], [x1, y, z1], { over: 0.03 });
      pen.stroke("light", [x1, y, z1], [x0, y, z1], { over: 0.03 });
      pen.stroke("light", [x0, y, z1], [x0, y, z0], { over: 0.03 });
    }
    const y = height - 0.17;
    const margin = 0.05;
    pen.hatchBand([-hw + margin, y, -hd + 0.002], X, DOWN, width - margin * 2, 0.13, {
      step: 0.028,
      slant: -0.3
    });
    pen.hatchBand([-hw + margin, y, hd - 0.002], X, DOWN, width - margin * 2, 0.13, {
      step: 0.028,
      slant: -0.3
    });
    pen.hatchBand([-hw + 0.002, y, -hd + margin], Z, DOWN, depth - margin * 2, 0.11, {
      step: 0.03,
      slant: -0.3
    });
    pen.hatchBand([hw - 0.002, y, -hd + margin], Z, DOWN, depth - margin * 2, 0.11, {
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

  function drawWindow(win, side) {
    if (!win || !(win.width > 0) || !(win.height > 0)) return;
    const axis = wallAxes(side);
    const x0 = win.center - win.width / 2;
    const y0 = win.sill;
    const ww = win.width;
    const wh = win.height;
    pen.rect("main", pointOnWall(side, x0, y0), axis, Y, ww, wh, {
      ghost: true,
      over: 0.035,
      breaks: false
    });
    const frame = 0.05;
    if (ww > frame * 2 && wh > frame * 2) {
      pen.rect("second", pointOnWall(side, x0 + frame, y0 + frame), axis, Y, ww - frame * 2, wh - frame * 2, {
        over: 0.02,
        breaks: false
      });
      pen.stroke("second", pointOnWall(side, win.center, y0 + frame), pointOnWall(side, win.center, y0 + wh - frame), SOLID);
      for (let k = 1; k <= 3; k++) {
        const y = y0 + (wh * k) / 4;
        pen.stroke("light", pointOnWall(side, x0 + frame, y), pointOnWall(side, x0 + ww - frame, y), SOLID);
      }
    }
    pen.stroke("main", pointOnWall(side, x0 - 0.07, win.sill - 0.01), pointOnWall(side, x0 + ww + 0.07, win.sill - 0.01), SOLID);
    pen.stroke(
      "second",
      pointOnWall(side, x0 - 0.07, win.sill - 0.045),
      pointOnWall(side, x0 + ww + 0.07, win.sill - 0.045),
      SOLID
    );
    pen.rect("light", pointOnWall(side, x0 - 0.07, y0), axis, Y, ww + 0.14, wh + 0.08, SOLID);
    const glassH = Math.min(0.2, wh);
    pen.hatchBand(pointOnWall(side, x0, y0 + wh - glassH), axis, Y, ww / 2, glassH, {
      step: 0.04,
      slant: 0.9,
      pen: "ghost",
      fade: false
    });
  }

  function circle(center, radius, axisU, axisV) {
    const steps = 12;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const ang = (i / steps) * Math.PI * 2;
      const c = Math.cos(ang) * radius;
      const s = Math.sin(ang) * radius;
      points.push([
        center[0] + axisU[0] * c + axisV[0] * s,
        center[1] + axisU[1] * c + axisV[1] * s,
        center[2] + axisU[2] * c + axisV[2] * s
      ]);
    }
    pen.polyline("main", points);
  }

  function drawDoor(door, side) {
    if (!door || !(door.width > 0) || !(door.height > 0)) return;
    const axis = wallAxes(side);
    const x0 = door.center - door.width / 2;
    const dw = door.width;
    const dh = door.height;
    const trim = 0.07;
    const lip = 0.08;
    pen.rect("second", pointOnWall(side, x0 - trim, 0), axis, Y, dw + trim * 2, dh + trim, {
      over: 0.02,
      breaks: false
    });
    pen.rect("second", pointOnWall(side, x0, 0), axis, Y, dw, dh, SOLID);
    if (dw > lip * 2 && dh > lip * 2) {
      pen.rect("light", pointOnWall(side, x0 + lip, lip), axis, Y, dw - lip * 2, dh - lip * 2, SOLID);
    }
    const handleAlong = door.center + dw / 2 - 0.12;
    const handleY = Math.min(1.05, dh - 0.15);
    circle(pointOnWall(side, handleAlong, handleY), 0.025, axis, Y);
  }

  function drawPanel(panel, side) {
    const pw = panel.s1 - panel.s0;
    const ph = panel.top - panel.bottom;
    if (!(pw > 0.02) || !(ph > 0.02)) return;
    const axis = wallAxes(side);
    const along = alongFromStart(side, panel.s0);
    pen.rect("second", pointOnWall(side, along, panel.bottom), axis, Y, pw, ph, SOLID);
    const inset = 0.045;
    if (pw > inset * 2 && ph > inset * 2) {
      pen.rect(
        "light",
        pointOnWall(side, alongFromStart(side, panel.s0 + inset), panel.bottom + inset),
        axis,
        Y,
        pw - inset * 2,
        ph - inset * 2,
        SOLID
      );
    }
  }

  function dado(side) {
    pen.stroke("light", pointOnWall(side, -hd, 0.32), pointOnWall(side, hd, 0.32), SOLID);
  }

  function floor() {
    const seamY = 0.001;
    const across = Math.floor((width - 1e-6) / 0.9);
    for (let i = 1; i <= across; i++) {
      const x = -hw + i * 0.9;
      if (x >= hw - 1e-4) break;
      pen.stroke("light", [x, seamY, -hd], [x, seamY, hd], { over: 0 });
    }
    const along = Math.floor((depth - 1e-6) / 0.9);
    for (let i = 1; i <= along; i++) {
      const z = -hd + i * 0.9;
      if (z >= hd - 1e-4) break;
      pen.stroke("light", [-hw, seamY, z], [hw, seamY, z], { over: 0 });
    }

    const veinY = 0.002;
    const veinCount = Math.round((22 * width * depth) / (4.4 * 4.6));
    const xLo = -hw + 0.2;
    const xHi = hw - 0.2;
    const zLo = -hd + 0.2;
    const zHi = hd - 0.2;
    if (veinCount > 0 && xHi > xLo && zHi > zLo) {
      for (let n = 0; n < veinCount; n++) {
        let x = pen.rr(xLo, xHi);
        let z = pen.rr(zLo, zHi);
        let ang = 0.55 + pen.rr(-0.5, 0.5);
        if (pen.rr(0, 1) < 0.5) ang += Math.PI;
        const steps = Math.round(pen.rr(10, 24));
        const points = [[x, veinY, z]];
        for (let s = 0; s < steps; s++) {
          ang += pen.rr(-0.32, 0.32);
          const stepLen = pen.rr(0.06, 0.13);
          const nx = x + Math.cos(ang) * stepLen;
          const nz = z + Math.sin(ang) * stepLen;
          if (nx < -hw || nx > hw || nz < -hd || nz > hd) break;
          x = nx;
          z = nz;
          points.push([x, veinY, z]);
          if (points.length > 3 && pen.rr(0, 1) < 0.08) {
            const sign = pen.rr(0, 1) < 0.5 ? -1 : 1;
            const branchAng = ang + sign * pen.rr(0.6, 1.2);
            const branchLen = pen.rr(0.08, 0.18);
            const bx = x + Math.cos(branchAng) * branchLen;
            const bz = z + Math.sin(branchAng) * branchLen;
            if (bx >= -hw && bx <= hw && bz >= -hd && bz <= hd) {
              pen.polyline("vein", [
                [x, veinY, z],
                [bx, veinY, bz]
              ]);
            }
          }
        }
        if (points.length > 1) pen.polyline("vein", points);
      }
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
  for (const side of ["back", "left", "right", "front"]) {
    const item = wall(side);
    if (!item) continue;
    if (details.windows) {
      for (const win of item.windows ?? []) drawWindow(win, side);
    }
    if (details.panels) {
      for (const panel of item.panels ?? []) drawPanel(panel, side);
      if (side === "left" || side === "right") dado(side);
    }
    for (const door of item.doors ?? []) drawDoor(door, side);
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
