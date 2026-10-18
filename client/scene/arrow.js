import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

const COLOR = 0xf5c542;
const HEAD_M = 0.04;

function overlayMaterial(kind) {
  const options = {
    color: COLOR,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false
  };
  return kind === "line" ? new THREE.LineBasicMaterial(options) : new THREE.MeshBasicMaterial(options);
}

function arrowHead(at, direction, height) {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(height * 0.28, height, 8), overlayMaterial("mesh"));
  cone.renderOrder = 1000;
  cone.frustumCulled = false;
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  cone.position.copy(at).addScaledVector(direction, -height / 2);
  return cone;
}

function plainLabel() {
  return { style: {}, setAttribute() {}, parentNode: null };
}

function labelElement(label, element) {
  const el = element ?? (typeof document !== "undefined" ? document.createElement("div") : plainLabel());
  el.textContent = label;
  el.style.padding = "2px 6px";
  el.style.borderRadius = "4px";
  el.style.background = "rgba(18, 18, 18, 0.92)";
  el.style.color = "#f5c542";
  el.style.font = "13px system-ui, sans-serif";
  el.style.whiteSpace = "nowrap";
  el.style.pointerEvents = "none";
  return el;
}

function createArrow(pointA, pointB, label, element) {
  const group = new THREE.Group();
  group.name = "distance-arrow";
  group.frustumCulled = false;
  const a = new THREE.Vector3(pointA.x, pointA.y, pointA.z);
  const b = new THREE.Vector3(pointB.x, pointB.y, pointB.z);
  const delta = new THREE.Vector3().subVectors(b, a);
  const length = delta.length();

  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geometry, overlayMaterial("line"));
  line.renderOrder = 1000;
  line.frustumCulled = false;
  group.add(line);

  if (length > 1e-4) {
    const direction = delta.multiplyScalar(1 / length);
    const head = Math.min(HEAD_M, length * 0.35);
    if (head > 0.004) {
      group.add(arrowHead(a, direction.clone().negate(), head));
      group.add(arrowHead(b, direction, head));
    }
  }

  const labelObject = new CSS2DObject(labelElement(label, element));
  labelObject.position.copy(a).add(b).multiplyScalar(0.5);
  labelObject.renderOrder = 1000;
  group.add(labelObject);
  return group;
}

function disposeArrow(group) {
  if (!group) return;
  const geometries = new Set();
  const materials = new Set();
  group.traverse((obj) => {
    if (obj.geometry) geometries.add(obj.geometry);
    const list = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const material of list) materials.add(material);
    if (obj.element && obj.element.parentNode) obj.element.parentNode.removeChild(obj.element);
  });
  if (group.parent) group.parent.remove(group);
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function createDistanceLayer({ scene, camera, host, domElement }) {
  const element = domElement ?? document.createElement("div");
  const renderer = new CSS2DRenderer({ element });
  element.style.position = "absolute";
  element.style.left = "0";
  element.style.top = "0";
  element.style.pointerEvents = "none";
  host.appendChild(element);

  let current = null;
  let disposed = false;
  const size = { w: 0, h: 0 };

  function resize() {
    const width = host.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 1);
    const height = host.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 1);
    if (width === size.w && height === size.h) return;
    size.w = width;
    size.h = height;
    renderer.setSize(width, height);
  }

  function clear() {
    if (!current) return;
    disposeArrow(current);
    current = null;
  }

  function show({ pointA, pointB, label }) {
    clear();
    current = createArrow(pointA, pointB, label);
    scene.add(current);
  }

  function render() {
    if (disposed) return;
    resize();
    renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
    if (element.parentNode) element.parentNode.removeChild(element);
  }

  resize();
  return { show, clear, render, dispose };
}

export { createArrow, disposeArrow, createDistanceLayer };
