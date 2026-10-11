import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

function initScene(canvas, { onFrame } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.01,
    100
  );
  camera.position.set(1.8, 2.2, 1.8);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.0, 0);
  controls.enableDamping = true;

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(2, 3, 2);
  scene.add(dirLight);

  const grid = new THREE.GridHelper(4, 40, 0x444444, 0x2a2a2a);
  scene.add(grid);

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  let running = true;
  let frameId = 0;
  function tick() {
    if (!running) return;
    frameId = requestAnimationFrame(tick);
    controls.update(); //для orbit controls
    if (onFrame) onFrame();
    renderer.render(scene, camera);
  }
  frameId = requestAnimationFrame(tick);

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    running = false;
    cancelAnimationFrame(frameId);
    window.removeEventListener("resize", onResize);
    controls.dispose();
    const materials = new Set();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const list = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const item of list) {
        if (!item || materials.has(item)) continue;
        materials.add(item);
        item.dispose();
      }
    });
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { scene, camera, controls, dispose };
}

export { initScene };
