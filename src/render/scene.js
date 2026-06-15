// Three.js scene shell: tilted top-down camera, zoom + drag panning, and a frame
// loop that can ALSO be driven manually via tick(ms) — the Claude preview tab often
// freezes requestAnimationFrame, so nothing may depend on rAF alone.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10141a);

  const camera = new THREE.PerspectiveCamera(
    45, container.clientWidth / container.clientHeight, 0.1, 200,
  );
  camera.position.set(0, 17, 9);
  camera.lookAt(0, 0, -1.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -1.5);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 6;
  controls.maxDistance = 34;
  controls.minPolarAngle = 0.1;
  controls.maxPolarAngle = 1.15;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
  sun.position.set(8, 18, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
  fill.position.set(-6, 10, -8);
  scene.add(fill);

  const tickables = [];
  let lastT = performance.now();

  function frame(dtMs) {
    const dt = Math.min(dtMs, 100) / 1000;
    for (const fn of tickables) fn(dt);
    controls.update();
    renderer.render(scene, camera);
  }

  function rafLoop(now) {
    frame(now - lastT);
    lastT = now;
    requestAnimationFrame(rafLoop);
  }
  requestAnimationFrame((now) => { lastT = now; requestAnimationFrame(rafLoop); });

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return {
    renderer, scene, camera, controls,
    addTickable: (fn) => tickables.push(fn),
    // Manual frame pump for tests / hidden-tab previews (frozen rAF).
    tick: (ms = 16) => frame(ms),
  };
}
