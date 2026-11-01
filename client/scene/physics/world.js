import RAPIER from "@dimforge/rapier3d-compat";

let world = null;
let accumulator = 0;
const MAX_STEPS = 5;

async function initWorld() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  accumulator = 0;
  return world;
}

function getWorld() {
  if (!world) {
    throw new Error("Physics world not initialized yet - call initWorld() first");
  }
  return world;
}

function step(deltaSeconds) {
  const current = getWorld();
  if (typeof deltaSeconds !== "number" || !Number.isFinite(deltaSeconds)) {
    current.step();
    return;
  }
  const dt = current.timestep;
  if (!(dt > 0)) {
    current.step();
    return;
  }
  accumulator += Math.max(0, deltaSeconds);
  const cap = dt * MAX_STEPS;
  if (accumulator > cap) accumulator = cap;
  let steps = 0;
  while (accumulator >= dt && steps < MAX_STEPS) {
    current.step();
    accumulator -= dt;
    steps += 1;
  }
}

function disposeWorld() {
  if (!world) return;
  world.free();
  world = null;
  accumulator = 0;
}

export { RAPIER, initWorld, getWorld, step, disposeWorld };
