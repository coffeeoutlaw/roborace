// Hover tooltips for board elements: raycasts the mouse onto the board plane and
// describes whatever occupies that cell (belts, gears, lasers, flags, robots, ...).
import * as THREE from 'three';
import { DX, DY, opposite, tileAt, inBounds, hasWall } from '../engine/board.js';

const DIR_NAME = ['north', 'east', 'south', 'west'];
const DIR_ARROW = ['↑', '→', '↓', '←'];

export class BoardTooltip {
  constructor(sceneCtl, app) {
    this.sceneCtl = sceneCtl;
    this.app = app;
    this.el = document.createElement('div');
    this.el.id = 'tooltip';
    this.el.className = 'hidden';
    document.body.appendChild(this.el);
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();
    this.ndc = new THREE.Vector2();
    this.beams = null;
    this.beamBoard = null;

    const canvas = sceneCtl.renderer.domElement;
    canvas.addEventListener('mousemove', (e) => this.update(e));
    canvas.addEventListener('mouseleave', () => this.hide());
    canvas.addEventListener('mousedown', () => this.hide()); // don't follow pans/rotates
  }

  hide() { this.el.classList.add('hidden'); }

  // Which cells does each wall-laser beam cross? Rebuilt when the board changes.
  #beamMap(board) {
    if (this.beamBoard === board) return this.beams;
    const map = new Map();
    const add = (x, y, count, mount) => {
      const k = `${x},${y}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push({ count, mount });
    };
    for (const l of board.lasers) {
      const dir = opposite(l.wallDir);
      let x = l.x, y = l.y;
      add(x, y, l.count, true);
      while (!hasWall(board, x, y, dir) && inBounds(board, x + DX[dir], y + DY[dir])) {
        x += DX[dir]; y += DY[dir];
        add(x, y, l.count, false);
      }
    }
    this.beamBoard = board;
    this.beams = map;
    return map;
  }

  // Board cell under a mouse event, or null. Also used for click-to-pick flows.
  cellAt(e) {
    const board = this.app.view?.board;
    if (!board) return null;
    const rect = this.sceneCtl.renderer.domElement.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.ndc, this.sceneCtl.camera);
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return null;
    const x = Math.round(this.hit.x + board.width / 2 - 0.5);
    const y = Math.round(this.hit.z + board.height / 2 - 0.5);
    if (!inBounds(board, x, y)) return null;
    return { x, y };
  }

  update(e) {
    const { app } = this;
    if (!app.view || !app.boardView) return this.hide();
    const board = app.view.board;
    const cell = this.cellAt(e);
    if (!cell) return this.hide();
    const { x, y } = cell;

    const lines = this.#describe(board, x, y);
    if (!lines.length) return this.hide();
    this.el.innerHTML = lines.map(([title, body]) =>
      `<div class="tip-item"><b>${title}</b>${body ? ` — ${body}` : ''}</div>`).join('');
    this.el.classList.remove('hidden');
    const pad = 14;
    let left = e.clientX + pad;
    let top = e.clientY + pad;
    if (left + this.el.offsetWidth > innerWidth - 4) left = e.clientX - this.el.offsetWidth - pad;
    if (top + this.el.offsetHeight > innerHeight - 4) top = e.clientY - this.el.offsetHeight - pad;
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  #describe(board, x, y) {
    const lines = [];
    const t = tileAt(board, x, y);
    const { app } = this;

    // Robots — use on-screen positions so it matches what you see mid-animation.
    for (const r of app.view.robots.values()) {
      const v = app.robotViews.get(r.id);
      if (!v || !v.group.visible) continue;
      const rx = Math.round(v.group.position.x + board.width / 2 - 0.5);
      const ry = Math.round(v.group.position.z + board.height / 2 - 0.5);
      if (rx === x && ry === y) {
        lines.push([`🤖 ${r.name}`,
          `damage ${r.damage}/10 · ${'♥'.repeat(r.lives) || '☠'} · next flag ${r.nextFlag + 1}`
          + (r.poweredDown ? ' · powered down' : '')]);
      }
    }

    const fi = board.flags.findIndex((f) => f.x === x && f.y === y);
    if (fi >= 0) {
      lines.push([`⚑ Flag ${fi + 1}`,
        'touch the flags in numeric order to win the race. Ending a register here also moves your archive (respawn point) here']);
    }

    if (t) {
      if (t.floor === 'pit') lines.push(['⚫ Pit', 'robots that move or get pushed in are destroyed (−1 life)']);
      if (t.floor === 'repair') lines.push(['🔧 Repair site', 'end the turn here to repair 1 damage. Standing here updates your archive (respawn point)']);
      if (t.floor === 'upgrade') lines.push(['⚒ Upgrade site', 'end the turn here to repair 1 damage AND draw an Option card (blocks 1 damage later). Updates your archive']);
      if (t.belt) {
        const express = t.belt.type === 'express';
        lines.push([`${express ? '⏩ Express conveyor' : '▶ Conveyor belt'} ${DIR_ARROW[t.belt.dir]}`,
          (express
            ? 'after every register it carries robots 1 space, then 1 more with the normal belts (2 total)'
            : 'after every register it carries robots 1 space')
          + `, heading ${DIR_NAME[t.belt.dir]}`]);
        if (t.belt.turn) {
          lines.push(['↩ Curved section',
            `robots carried onto this space by a belt also rotate 90° ${t.belt.turn}`]);
        }
      }
      if (t.gear) {
        lines.push([t.gear === 'cw' ? '⟳ Gear (clockwise)' : '⟲ Gear (counter-clockwise)',
          'rotates any robot standing on it 90° after every register']);
      }
      if (t.pusher) {
        lines.push([`⤇ Pusher [${t.pusher.registers.join('·')}]`,
          `on registers ${t.pusher.registers.join(', ')} it shoves robots 1 space ${DIR_NAME[opposite(t.pusher.wallDir)]}`]);
      }
    }

    for (const b of this.#beamMap(board).get(`${x},${y}`) || []) {
      lines.push([b.mount
        ? `🔴 Wall laser (${b.count} beam${b.count > 1 ? 's' : ''})`
        : `〰 Laser beam (${b.count}×)`,
      `robots still in the beam after board elements move take ${b.count} damage`]);
    }

    const dock = board.docks.find((d) => d.x === x && d.y === y);
    if (dock) lines.push([`◎ Dock ${dock.n}`, 'starting position — robots begin the race here']);

    const wallDirs = [0, 1, 2, 3].filter((d) => hasWall(board, x, y, d));
    if (wallDirs.length) {
      lines.push(['▬ Wall', `on the ${wallDirs.map((d) => DIR_NAME[d]).join(' & ')} edge — blocks movement and lasers (bumping it is harmless)`]);
    }

    return lines;
  }
}
