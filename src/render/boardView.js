// Builds the 3D board from primitives and runs its ambient animations
// (scrolling belts, spinning gears, pulsing laser beams).
import * as THREE from 'three';
import { DX, DY, opposite, tileAt, inBounds, hasWall } from '../engine/board.js';
import {
  beltTexture, glyphTexture, curveTexture, plateTexture, hazardTexture, iconPlateTexture,
} from './textures.js';

const TILE = 1;
const yawForDir = (d) => -d * Math.PI / 2;

export class BoardView {
  constructor(scene, board) {
    this.board = board;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.gears = [];
    this.pushers = new Map(); // "x,y" -> piston mesh
    this.flagMeshes = [];
    this.beltNormalTex = beltTexture(false);
    this.beltExpressTex = beltTexture(true);
    this.beamPulse = [];
    this.#build();
  }

  worldX(x) { return x - this.board.width / 2 + 0.5; }
  worldZ(y) { return y - this.board.height / 2 + 0.5; }

  #build() {
    const b = this.board;
    const floorMat = new THREE.MeshStandardMaterial({ map: plateTexture(0), roughness: 0.85 });
    const altMat = new THREE.MeshStandardMaterial({ map: plateTexture(1), roughness: 0.85 });
    const dockMat = new THREE.MeshStandardMaterial({ map: plateTexture(2), roughness: 0.85 });
    const tileGeo = new THREE.BoxGeometry(TILE * 0.98, 0.12, TILE * 0.98);

    for (const t of b.tiles) {
      if (t.floor === 'pit') { this.#addPit(t); continue; }
      const isDock = t.y >= b.height - 4;
      const mat = isDock ? dockMat : ((t.x + t.y) % 2 ? floorMat : altMat);
      const mesh = new THREE.Mesh(tileGeo, mat);
      mesh.position.set(this.worldX(t.x), -0.06, this.worldZ(t.y));
      mesh.receiveShadow = true;
      this.group.add(mesh);

      if (t.belt) this.#addBelt(t);
      if (t.gear) this.#addGear(t);
      if (t.floor === 'repair') this.#addDecal(t.x, t.y, iconPlateTexture('🔧'), 0.8);
      if (t.floor === 'upgrade') this.#addDecal(t.x, t.y, iconPlateTexture('⚒'), 0.8);
      if (t.pusher) this.#addPusher(t);
    }

    // dock numbers
    b.docks.forEach((d) => this.#addDecal(d.x, d.y, glyphTexture(String(d.n), { fg: '#9fdcb0' })));

    // walls (draw each stored edge)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9b53c, roughness: 0.5 });
    for (const t of this.board.tiles) {
      for (const d of t.walls) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(
          d % 2 === 0 ? TILE * 0.95 : 0.12, 0.4, d % 2 === 0 ? 0.12 : TILE * 0.95,
        ), wallMat);
        w.position.set(
          this.worldX(t.x) + DX[d] * TILE * 0.45,
          0.2,
          this.worldZ(t.y) + DY[d] * TILE * 0.45,
        );
        w.castShadow = true;
        this.group.add(w);
      }
    }

    // wall lasers: emitter + persistent faint beam (to first wall, ignoring robots)
    for (const l of b.lasers) {
      const dir = opposite(l.wallDir);
      const emitter = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x771111 }),
      );
      emitter.position.set(
        this.worldX(l.x) + DX[l.wallDir] * 0.42, 0.25, this.worldZ(l.y) + DY[l.wallDir] * 0.42,
      );
      this.group.add(emitter);
      let ex = l.x, ey = l.y;
      while (!hasWall(b, ex, ey, dir) && inBounds(b, ex + DX[dir], ey + DY[dir])) {
        ex += DX[dir]; ey += DY[dir];
      }
      const beam = this.makeBeam(l.x, l.y, ex, ey, 0xff4444, 0.28, l.count);
      this.group.add(beam);
      this.beamPulse.push(beam);
    }

    // flags
    b.flags.forEach((f, i) => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8),
        new THREE.MeshStandardMaterial({ color: 0xcccccc }),
      );
      pole.position.y = 0.55;
      g.add(pole);
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.4),
        new THREE.MeshStandardMaterial({
          map: glyphTexture(String(i + 1), { bg: '#1d7a3a', fg: '#ffffff' }),
          side: THREE.DoubleSide,
        }),
      );
      banner.position.set(0.28, 0.88, 0);
      g.add(banner);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.42, 24),
        new THREE.MeshBasicMaterial({ color: 0x2ecc60, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      g.add(ring);
      g.position.set(this.worldX(f.x), 0, this.worldZ(f.y));
      this.group.add(g);
      this.flagMeshes.push(g);
    });
  }

  // A pit: a recessed shaft (open top, dark walls + floor) ringed by a thin hazard
  // lip. Reads as a hole / missing tile, and robots tumble into real depth.
  #addPit(t) {
    const x = this.worldX(t.x), z = this.worldZ(t.y);
    const depth = 0.85;
    if (!this._pit) {
      this._pit = {
        shaft: new THREE.BoxGeometry(TILE * 0.98, depth, TILE * 0.98),
        wall: new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.95, side: THREE.BackSide }),
        floorGeo: new THREE.PlaneGeometry(TILE * 0.98, TILE * 0.98),
        floorMat: new THREE.MeshStandardMaterial({ color: 0x04060a, roughness: 1 }),
        barH: new THREE.BoxGeometry(TILE * 0.98, 0.05, 0.1),
        barV: new THREE.BoxGeometry(0.1, 0.05, TILE * 0.98 - 0.18),
        rim: new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6 }),
      };
    }
    const P = this._pit;
    // inverted box: top is open, we see the inner walls + bottom
    const shaft = new THREE.Mesh(P.shaft, P.wall);
    shaft.position.set(x, -depth / 2, z);
    this.group.add(shaft);
    const floor = new THREE.Mesh(P.floorGeo, P.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, -depth + 0.02, z);
    this.group.add(floor);
    // hazard lip: four thin bars around the opening
    const edge = TILE * 0.5 - 0.05;
    for (const oz of [edge, -edge]) {
      const m = new THREE.Mesh(P.barH, P.rim);
      m.position.set(x, 0.01, z + oz);
      this.group.add(m);
    }
    for (const ox of [edge, -edge]) {
      const m = new THREE.Mesh(P.barV, P.rim);
      m.position.set(x + ox, 0.01, z);
      this.group.add(m);
    }
  }

  #addBelt(t) {
    const tex = (t.belt.type === 'express' ? this.beltExpressTex : this.beltNormalTex);
    const geo = new THREE.PlaneGeometry(TILE * 0.96, TILE * 0.96);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    mesh.rotation.y = yawForDir(t.belt.dir);
    mesh.position.set(this.worldX(t.x), 0.01, this.worldZ(t.y));
    this.group.add(mesh);
    if (t.belt.turn) {
      const icon = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.5),
        new THREE.MeshBasicMaterial({ map: curveTexture(t.belt.turn), transparent: true }),
      );
      icon.rotation.x = -Math.PI / 2;
      icon.position.set(this.worldX(t.x), 0.03, this.worldZ(t.y));
      this.group.add(icon);
    }
  }

  #addGear(t) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.06, 24),
      // board-art colors: red/orange = clockwise, green = counter-clockwise
      new THREE.MeshStandardMaterial({ color: t.gear === 'cw' ? 0xb8431f : 0x4d9c33, roughness: 0.6 }),
    );
    g.add(base);
    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.08, 0.14),
        new THREE.MeshStandardMaterial({ color: 0xc9cdd3 }),
      );
      const a = (i / 6) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * 0.42, 0.02, Math.sin(a) * 0.42);
      g.add(tooth);
    }
    g.position.set(this.worldX(t.x), 0.04, this.worldZ(t.y));
    this.group.add(g);
    this.gears.push({ mesh: g, sense: t.gear === 'cw' ? -1 : 1 });
  }

  #addDecal(x, y, tex, size = 0.6) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(this.worldX(x), 0.025, this.worldZ(y));
    this.group.add(m);
  }

  #addPusher(t) {
    const d = t.pusher.wallDir;
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(d % 2 === 0 ? 0.7 : 0.22, 0.3, d % 2 === 0 ? 0.22 : 0.7),
      new THREE.MeshStandardMaterial({ color: 0x8844aa, roughness: 0.5 }),
    );
    housing.position.set(
      this.worldX(t.x) + DX[d] * 0.42, 0.15, this.worldZ(t.y) + DY[d] * 0.42,
    );
    this.group.add(housing);
    const piston = new THREE.Mesh(
      new THREE.BoxGeometry(d % 2 === 0 ? 0.5 : 0.1, 0.18, d % 2 === 0 ? 0.1 : 0.5),
      new THREE.MeshStandardMaterial({ color: 0xbb77dd }),
    );
    piston.position.copy(housing.position);
    this.group.add(piston);
    this.pushers.set(`${t.x},${t.y}`, { piston, dir: opposite(d), rest: housing.position.clone() });
    // register label
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({
        map: glyphTexture(t.pusher.registers.join(''), { fg: '#dd99ff', size: 52 }),
        transparent: true,
      }),
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(housing.position.x, 0.32, housing.position.z);
    this.group.add(label);
  }

  // A laser beam segment between two cells (used persistent + for flashes).
  makeBeam(x1, y1, x2, y2, color, opacity, count = 1) {
    const ax = this.worldX(x1), az = this.worldZ(y1);
    const bx = this.worldX(x2), bz = this.worldZ(y2);
    const len = Math.hypot(bx - ax, bz - az) + 0.5;
    const group = new THREE.Group();
    const horizontal = Math.abs(bx - ax) > Math.abs(bz - az);
    const offsets = count === 1 ? [0] : count === 2 ? [-0.12, 0.12] : [-0.18, 0, 0.18];
    for (const off of offsets) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(horizontal ? len : 0.05, 0.05, horizontal ? 0.05 : len),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity }),
      );
      m.position.set(
        (ax + bx) / 2 + (horizontal ? 0 : off), 0.3, (az + bz) / 2 + (horizontal ? off : 0),
      );
      group.add(m);
    }
    return group;
  }

  pulseGearsAndBelts(dt) {
    const t = performance.now() / 1000;
    this.beltNormalTex.offset.y -= dt * 0.6;
    this.beltExpressTex.offset.y -= dt * 1.3;
    for (const g of this.gears) g.mesh.rotation.y += g.sense * dt * 0.8;
    for (const beam of this.beamPulse) {
      const o = 0.2 + 0.12 * Math.sin(t * 5);
      beam.children.forEach((m) => { m.material.opacity = o; });
    }
    for (const ring of this.dockHighlights || []) {
      ring.material.opacity = 0.55 + 0.4 * Math.sin(t * 4);
      ring.scale.setScalar(1 + 0.12 * Math.sin(t * 4));
    }
  }

  firePusher(x, y) {
    const p = this.pushers.get(`${x},${y}`);
    return p || null;
  }

  // Pulsing rings on selectable docks during the start-position pick.
  highlightDocks(docks) {
    this.clearDockHighlights();
    this.dockHighlights = docks.map((d) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.46, 24),
        new THREE.MeshBasicMaterial({ color: 0x55ff88, side: THREE.DoubleSide, transparent: true }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(this.worldX(d.x), 0.03, this.worldZ(d.y));
      this.group.add(ring);
      return ring;
    });
  }

  clearDockHighlights() {
    for (const r of this.dockHighlights || []) this.group.remove(r);
    this.dockHighlights = [];
  }

  bounceFlag(i) {
    return this.flagMeshes[i] || null;
  }
}
