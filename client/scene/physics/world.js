import RAPIER from "@dimforge/rapier3d-compat";

let world = null;

async function initWorld() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  return world;
}

function getWorld() {
  if (!world) {
    throw new Error("Physics world not initialized yet - call initWorld() first");
  }
  return world;
}

function step() {
  getWorld().step();
}

export { RAPIER, initWorld, getWorld, step };
