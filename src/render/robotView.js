// Robot views: the player's own FBX models (see CREDITS.md) loaded over instant
// primitive placeholders — if a model fails to load, the placeholder stays.
// Identity comes from the colored base ring + beacon, not from tinting the model.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const yawForDir = (d) => -d * Math.PI / 2;
const fbxLoader = new FBXLoader();
const texLoader = new THREE.TextureLoader();

// Models are chosen by the robot's MARKER COLOUR so the 3D bot always matches its
// coloured ring + HUD card. Keying on colour (not personality) means it works for
// AI seats AND every human player — humans all have personality:null but each gets a
// distinct colour from the server, so colour is the reliable seat identity.
// name -> assets/robots/<name>.fbx + <name>_basecolor.jpg.
// standX cancels FBXLoader's 90° axis tilt (stand upright); yaw turns the model so
// its front faces -Z (north) — these Tripo meshes face +X (east), so +90° CCW.
const MODELS_BY_COLOR = {
  '#4da6ff': { name: 'futuristic', standX: -Math.PI / 2, yaw: Math.PI / 2, height: 0.95, hover: 0 }, // blue
  '#ff5544': { name: 'cute', standX: -Math.PI / 2, yaw: Math.PI / 2, height: 0.85, hover: 0 }, // red
  '#66dd77': { name: 'screw', standX: -Math.PI / 2, yaw: Math.PI / 2, height: 0.8, hover: 0 }, // green
  '#ffcc33': { name: 'classic', standX: -Math.PI / 2, yaw: Math.PI / 2, height: 0.85, hover: 0 }, // yellow
};
const FALLBACK_MODEL = MODELS_BY_COLOR['#4da6ff'];

export class RobotView {
  constructor(scene, boardView, robot) {
    this.boardView = boardView;
    this.id = robot.id;
    this.group = new THREE.Group();
    this.bodyTint = [];
    this.dimmables = [];
    this.mixer = null;
    this.poweredDown = false;

    // instant placeholder primitives
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.#buildPlaceholder(robot);

    // colored base ring + beacon for identification at a glance
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.44, 24),
      new THREE.MeshBasicMaterial({ color: robot.color, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    this.group.add(ring);
    this.beaconColor = new THREE.Color(robot.color);
    this.beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 8),
      new THREE.MeshBasicMaterial({ color: robot.color }),
    );
    this.beacon.position.set(0, 0.95, 0);
    this.group.add(this.beacon);

    this.setGridPos(robot.x, robot.y);
    this.setDir(robot.dir);
    scene.add(this.group);

    this.#loadModel(robot);
  }

  #loadModel(robot) {
    const spec = MODELS_BY_COLOR[(robot.color || '').toLowerCase()] || FALLBACK_MODEL;
    const base = `assets/robots/${spec.name}`;
    fbxLoader.load(`${base}.fbx`, (model) => {
      // bind the (downscaled) basecolor texture explicitly — don't rely on the
      // FBX's internal texture paths, which point at the original author's disk.
      const tex = texLoader.load(`${base}_basecolor.jpg`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = spec.flipY ?? true; // FBX UVs expect a flipped texture

      const dims = [];
      model.traverse((m) => {
        if (m.isMesh) {
          m.castShadow = true;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            if (!mat) continue;
            mat.map = tex;
            if (mat.color) mat.color.set(0xffffff);
            mat.needsUpdate = true;
            dims.push(mat);
          }
        }
      });

      // 1) Stand the model upright. FBXLoader tips Tripo meshes 90° onto their
      //    side; `standX` cancels that so the model's tall axis is vertical again.
      const upright = new THREE.Group();
      upright.add(model);
      upright.rotation.x = spec.standX || 0;
      upright.updateMatrixWorld(true);

      // 2) Measure the now-standing model and recentre: feet on floor, centred x/z.
      const box = new THREE.Box3().setFromObject(upright);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      upright.position.set(-center.x, -box.min.y, -center.z);

      // 3) Scale to target height and face the right way (yaw) in an outer holder.
      const holder = new THREE.Group();
      holder.add(upright);
      holder.scale.setScalar((spec.height || 0.85) / (size.y || 1));
      holder.rotation.y = spec.yaw || 0;
      holder.position.y = spec.hover || 0;

      this.group.remove(this.body);
      this.body = holder;
      this.dimmables = dims;
      this.group.add(holder);
      this.setPoweredDown(this.poweredDown);
    }, undefined, () => { /* keep the primitive placeholder on load failure */ });
  }

  // advance idle animation (driven from the scene tick)
  tick(dt) {
    if (this.mixer) this.mixer.update(dt);
  }

  #mat(color) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 });
    this.bodyTint.push(m);
    return m;
  }

  #buildPlaceholder(robot) {
    const color = new THREE.Color(robot.color);
    const dark = color.clone().multiplyScalar(0.55);
    const g = this.body;
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.42), this.#mat(color));
    trunk.position.y = 0.25;
    g.add(trunk);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.14, 12), this.#mat(dark));
    head.position.y = 0.5;
    g.add(head);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.32, -0.4);
    g.add(barrel);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.dimmables = this.bodyTint;
  }

  setGridPos(x, y) {
    this.group.position.x = this.boardView.worldX(x);
    this.group.position.z = this.boardView.worldZ(y);
  }

  setDir(dir) {
    this.group.rotation.y = yawForDir(dir);
  }

  setPoweredDown(on) {
    this.poweredDown = on;
    for (const m of this.dimmables) {
      m.opacity = on ? 0.45 : 1;
      m.transparent = on;
    }
    if (on) this.beacon.material.color.set(0x555555);
    else this.beacon.material.color.copy(this.beaconColor);
  }

  setVisible(v) { this.group.visible = v; }
}
