import * as THREE from "three";
import { all } from "./physics/registry.js";
import { getWorld } from "./physics/world.js";

const MAX_DRAG_SPEED_M_S = 4;

function productEntry(object) {
  let current = object;
  while (current) {
    for (const [id, entry] of all()) {
      if (id === "floor" || entry.mesh !== current || !entry.rigidBody) continue;
      return entry;
    }
    current = current.parent;
  }
  return null;
}

function createDrag({ canvas, camera, controls }) {
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line.threshold = 0.02;
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();
  const listeners = new Set();
  const state = {
    entry: null,
    offsetX: 0,
    offsetZ: 0,
    y: 0,
    target: { x: 0, y: 0, z: 0 },
    pointerId: null,
    notified: false
  };

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    pointer.x = ((event.clientX - rect.left) / width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / height) * 2 + 1;
  }

  function shown(object) {
    let current = object;
    while (current) {
      if (current.visible === false) return false;
      current = current.parent;
    }
    return true;
  }

  function canDrag(entry) {
    if (!entry || !entry.rigidBody) return false;
    if (typeof entry.rigidBody.isValid === "function" && !entry.rigidBody.isValid()) return false;
    if (typeof entry.rigidBody.isFixed === "function" && entry.rigidBody.isFixed()) return false;
    if (entry.product && entry.product.movable === false) return false;
    return true;
  }

  function pick() {
    raycaster.setFromCamera(pointer, camera);
    const meshes = [];
    for (const [id, entry] of all()) {
      if (id !== "floor" && entry.mesh) meshes.push(entry.mesh);
    }
    if (meshes.length === 0) return null;
    const hits = raycaster.intersectObjects(meshes, true);
    for (const hit of hits) {
      if (!shown(hit.object)) continue;
      const entry = productEntry(hit.object);
      if (!canDrag(entry)) return null;
      return { entry, point: hit.point };
    }
    return null;
  }

  function releaseCapture() {
    if (state.pointerId === null) return;
    try {
      if (canvas.hasPointerCapture(state.pointerId)) canvas.releasePointerCapture(state.pointerId);
    } catch {
      // A synthetic pointer has no capture to release.
    }
    state.pointerId = null;
    state.notified = false;
  }

  function endDrag() {
    const entry = state.entry;
    state.entry = null;
    releaseCapture();
    if (controls) controls.enabled = true;
    canvas.style.cursor = "";
    if (!entry || !entry.rigidBody || !entry.rigidBody.isValid()) return;
    const body = entry.rigidBody;
    body.setGravityScale(1, true);
    body.setEnabledRotations(true, true, true, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  function onPointerDown(event) {
    if (event.button !== 0 || state.entry) return;
    setPointer(event);
    const hit = pick();
    if (!hit || !hit.entry.rigidBody.isValid()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const body = hit.entry.rigidBody;
    const pos = body.translation();
    state.entry = hit.entry;
    state.offsetX = pos.x - hit.point.x;
    state.offsetZ = pos.z - hit.point.z;
    state.y = pos.y;
    state.target.x = pos.x;
    state.target.y = pos.y;
    state.target.z = pos.z;
    state.pointerId = event.pointerId;
    state.notified = false;
    plane.constant = -hit.point.y;
    body.setGravityScale(0, true);
    body.setEnabledRotations(false, false, false, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (controls) controls.enabled = false;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // A real pointer can be captured. A synthetic one still drags through canvas events.
    }
    canvas.style.cursor = "grabbing";
  }

  function onPointerMove(event) {
    setPointer(event);
    if (!state.entry) {
      canvas.style.cursor = pick() ? "grab" : "";
      return;
    }
    if (event.pointerId !== state.pointerId) return;
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;
    const nextX = hitPoint.x + state.offsetX;
    const nextZ = hitPoint.z + state.offsetZ;
    if (!state.notified && (nextX !== state.target.x || nextZ !== state.target.z)) {
      state.notified = true;
      state.entry.moved = true;
      notify();
    }
    state.target.x = nextX;
    state.target.y = state.y;
    state.target.z = nextZ;
  }

  function onPointerUp(event) {
    if (!state.entry || event.pointerId !== state.pointerId) return;
    endDrag();
  }

  function apply() {
    if (!state.entry) return;
    const body = state.entry.rigidBody;
    if (!body || !body.isValid()) {
      state.entry = null;
      releaseCapture();
      if (controls) controls.enabled = true;
      canvas.style.cursor = "";
      return;
    }
    const pos = body.translation();
    const px = pos.x;
    const py = pos.y;
    const pz = pos.z;
    const dt = getWorld().timestep || 1 / 60;
    let vx = (state.target.x - px) / dt;
    let vy = (state.target.y - py) / dt;
    let vz = (state.target.z - pz) / dt;
    const speed = Math.hypot(vx, vy, vz);
    if (speed > MAX_DRAG_SPEED_M_S) {
      const scale = MAX_DRAG_SPEED_M_S / speed;
      vx *= scale;
      vy *= scale;
      vz *= scale;
    }
    body.setLinvel({ x: vx, y: vy, z: vz }, true);
  }

  function dispose() {
    endDrag();
    canvas.removeEventListener("pointerdown", onPointerDown, true);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
  }

  canvas.addEventListener("pointerdown", onPointerDown, true);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  return { apply, dispose, subscribe };
}

export { createDrag };
