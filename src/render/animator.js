// Plays the engine's event stream as a queue of tweened steps. Never teleports a
// robot: every move/rotate/fall/respawn is animated. Driven by scene tickables, so it
// advances under rAF OR manual __game.tick() pumping (frozen-rAF preview safe).
import * as THREE from 'three';

const easeInOut = (t) => t * t * (3 - 2 * t);
const yawForDir = (d) => -d * Math.PI / 2;

// shortest-arc yaw target
function nearestYaw(from, toDir) {
  let to = yawForDir(toDir);
  while (to - from > Math.PI) to -= Math.PI * 2;
  while (from - to > Math.PI) to += Math.PI * 2;
  return to;
}

export class Animator {
  constructor({ scene, boardView, robotViews, onEvent }) {
    this.scene = scene;
    this.boardView = boardView;
    this.robotViews = robotViews; // Map id -> RobotView
    this.onEvent = onEvent || (() => {});
    this.queue = [];
    this.current = null;
    this.speed = 1; // 1, 2, or Infinity (skip)
    this._resolve = null;
  }

  get busy() { return !!this.current || this.queue.length > 0; }

  play(events) {
    for (const e of events) this.#enqueue(e);
    return new Promise((res) => {
      if (!this.busy) { res(); return; }
      const prev = this._resolve;
      this._resolve = () => { if (prev) prev(); res(); };
      if (this.speed === Infinity) this.update(0); // drain immediately
    });
  }

  update(dt) {
    if (this.speed === Infinity) {
      while (this.current || this.queue.length) this.#step(1e9);
      if (this._resolve) { const r = this._resolve; this._resolve = null; r(); }
      return;
    }
    this.#step(dt * this.speed);
    if (!this.busy && this._resolve) {
      const r = this._resolve; this._resolve = null; r();
    }
  }

  #step(dt) {
    if (!this.current) {
      this.current = this.queue.shift() || null;
      if (!this.current) return;
      this.current.t = 0;
      if (this.current.start) this.current.start();
      // fire the event callback at step start so HUD/log track the animation
      if (this.current.event) this.onEvent(this.current.event);
    }
    const c = this.current;
    c.t += dt;
    const k = c.dur > 0 ? Math.min(1, c.t / c.dur) : 1;
    if (c.apply) c.apply(easeInOut(k), k);
    if (k >= 1) {
      if (c.end) c.end();
      this.current = null;
      if (this.queue.length) this.#step(0); // chain zero-length steps same frame
    }
  }

  #push(step) { this.queue.push(step); }

  #rv(id) { return this.robotViews.get(id); }

  #enqueue(e) {
    const bv = this.boardView;
    switch (e.type) {
      case 'move': {
        const v = this.#rv(e.id);
        const fx = bv.worldX(e.fx), fz = bv.worldZ(e.fy);
        const tx = bv.worldX(e.tx), tz = bv.worldZ(e.ty);
        this.#push({
          dur: e.cause === 'push' ? 0.22 : 0.28, event: e,
          apply: (t) => {
            v.group.position.x = fx + (tx - fx) * t;
            v.group.position.z = fz + (tz - fz) * t;
          },
          end: () => { v.group.position.x = tx; v.group.position.z = tz; },
        });
        break;
      }
      case 'rotate': {
        const v = this.#rv(e.id);
        this.#push({
          dur: 0.24, event: e,
          start() { this.from = v.group.rotation.y; this.to = nearestYaw(this.from, e.to); },
          apply(t) { v.group.rotation.y = this.from + (this.to - this.from) * t; },
          end: () => { v.group.rotation.y = yawForDir(e.to); },
        });
        break;
      }
      case 'belts': {
        const moves = e.moves.map((m) => ({
          v: this.#rv(m.id),
          fx: bv.worldX(m.fx), fz: bv.worldZ(m.fy),
          tx: bv.worldX(m.tx), tz: bv.worldZ(m.ty),
        }));
        this.#push({
          dur: 0.3, event: e,
          apply: (t) => {
            for (const m of moves) {
              m.v.group.position.x = m.fx + (m.tx - m.fx) * t;
              m.v.group.position.z = m.fz + (m.tz - m.fz) * t;
            }
          },
          end: () => {
            for (const m of moves) { m.v.group.position.x = m.tx; m.v.group.position.z = m.tz; }
          },
        });
        break;
      }
      case 'pusherFire': {
        const p = bv.firePusher(e.x, e.y);
        if (!p) break;
        const ext = 0.55;
        this.#push({
          dur: 0.25, event: e,
          apply: (t) => {
            const k = t < 0.5 ? t * 2 : (1 - t) * 2;
            p.piston.position.set(
              p.rest.x + [0, 1, 0, -1][p.dir] * ext * k,
              p.rest.y,
              p.rest.z + [-1, 0, 1, 0][p.dir] * ext * k,
            );
          },
          end: () => p.piston.position.copy(p.rest),
        });
        break;
      }
      case 'laser': {
        // draw board beams always; robot beams only when they hit
        if (e.kind === 'robot' && !e.targetId) { this.#push({ dur: 0, event: e }); break; }
        const color = e.kind === 'board' ? 0xff3322 : 0xff8833;
        let beam = null, spark = null;
        const self = this;
        this.#push({
          dur: 0.28, event: e,
          start() {
            beam = bv.makeBeam(e.sx, e.sy, e.ex, e.ey, color, 0.9, e.damage >= 2 ? e.damage : 1);
            self.scene.add(beam);
            if (e.targetId) {
              spark = new THREE.Mesh(
                new THREE.SphereGeometry(0.16, 8, 8),
                new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true }),
              );
              spark.position.set(bv.worldX(e.ex), 0.35, bv.worldZ(e.ey));
              self.scene.add(spark);
            }
          },
          apply(t, raw) {
            beam.children.forEach((m) => { m.material.opacity = 0.95 * (1 - raw * raw); });
            if (spark) spark.scale.setScalar(1 + raw * 2);
            if (spark) spark.material.opacity = 1 - raw;
          },
          end() { self.scene.remove(beam); if (spark) self.scene.remove(spark); },
        });
        break;
      }
      case 'destroyed': {
        const v = this.#rv(e.id);
        const pit = e.cause === 'pit' || e.cause === 'edge';
        this.#push({
          dur: 0.55, event: e,
          start() { this.y0 = v.group.position.y; },
          apply: (t, raw) => {
            if (pit) {
              v.group.position.y = -1.4 * raw * raw;
              v.group.rotation.y += 0.15;
              v.group.scale.setScalar(Math.max(0.05, 1 - raw * 0.7));
            } else {
              const k = 1 + Math.sin(raw * Math.PI) * 0.6;
              v.group.scale.setScalar(k);
            }
          },
          end: () => {
            v.setVisible(false);
            v.group.position.y = 0;
            v.group.scale.setScalar(1);
          },
        });
        break;
      }
      case 'respawn': {
        const v = this.#rv(e.id);
        this.#push({
          dur: 0.4, event: e,
          start: () => {
            v.setGridPos(e.x, e.y);
            v.setDir(e.dir);
            v.setVisible(true);
            v.setPoweredDown(e.poweredDown);
            v.group.scale.setScalar(0.01);
          },
          apply: (t) => v.group.scale.setScalar(Math.max(0.01, t)),
          end: () => v.group.scale.setScalar(1),
        });
        break;
      }
      case 'placed': { // start-position pick: deploy onto the chosen dock
        const v = this.#rv(e.id);
        this.#push({
          dur: 0.45, event: e,
          start: () => {
            v.setGridPos(e.x, e.y);
            v.setDir(e.dir);
            v.setVisible(true);
            v.group.scale.setScalar(0.01);
          },
          apply: (t) => v.group.scale.setScalar(Math.max(0.01, t)),
          end: () => v.group.scale.setScalar(1),
        });
        break;
      }
      case 'flag': {
        const fm = bv.bounceFlag(e.flag - 1);
        this.#push({
          dur: 0.5, event: e,
          apply: (t, raw) => {
            if (fm) fm.position.y = Math.sin(raw * Math.PI) * 0.45;
            if (fm) fm.rotation.y = raw * Math.PI * 2;
          },
          end: () => { if (fm) { fm.position.y = 0; fm.rotation.y = 0; } },
        });
        break;
      }
      case 'powerdown': {
        const v = this.#rv(e.id);
        this.#push({ dur: 0.2, event: e, end: () => v.setPoweredDown(true) });
        break;
      }
      case 'powerup': {
        const v = this.#rv(e.id);
        this.#push({ dur: 0.2, event: e, end: () => v.setPoweredDown(false) });
        break;
      }
      case 'register':
        this.#push({ dur: 0.25, event: e });
        break;
      case 'reveal':
        this.#push({ dur: 0.3, event: e });
        break;
      default:
        // damage, shield, repair, option, archive, turn, cleanup, win, eliminated, …
        this.#push({ dur: 0, event: e });
    }
  }
}
