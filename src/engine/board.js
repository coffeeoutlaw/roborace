// Board model. Directions: 0=N (y-1), 1=E (x+1), 2=S (y+1), 3=W (x-1).
// y grows southward (screen-down); rotating right = +1 mod 4.
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const DIR_NAMES = ['N', 'E', 'S', 'W'];
export const opposite = (d) => (d + 2) % 4;
export const rotR = (d) => (d + 1) % 4;
export const rotL = (d) => (d + 3) % 4;

export function makeBoard({ name, difficulty = 1, width, height }) {
  const tiles = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push({ x, y, floor: 'plain', belt: null, gear: null, walls: [], pusher: null });
    }
  }
  return { name, difficulty, width, height, tiles, lasers: [], flags: [], docks: [] };
}

export const inBounds = (b, x, y) => x >= 0 && y >= 0 && x < b.width && y < b.height;
export const tileAt = (b, x, y) => (inBounds(b, x, y) ? b.tiles[y * b.width + x] : null);

// A wall on edge `dir` of (x,y) — stored on either adjacent tile — blocks movement and lasers.
export function hasWall(b, x, y, dir) {
  const t = tileAt(b, x, y);
  if (t && t.walls.includes(dir)) return true;
  const n = tileAt(b, x + DX[dir], y + DY[dir]);
  return !!(n && n.walls.includes(opposite(dir)));
}

export function setFloor(b, x, y, floor) { tileAt(b, x, y).floor = floor; }
export function addWall(b, x, y, dir) {
  const t = tileAt(b, x, y);
  if (!t.walls.includes(dir)) t.walls.push(dir);
}
export function addGear(b, x, y, sense) { tileAt(b, x, y).gear = sense; } // 'cw' | 'ccw'

// Wall-mounted laser on edge `wallDir` of (x,y); the beam fires across the board
// in direction opposite(wallDir), starting in the mount cell. count = beams (damage).
export function addLaser(b, x, y, wallDir, count = 1) {
  addWall(b, x, y, wallDir);
  b.lasers.push({ x, y, wallDir, count });
}

// Wall-mounted pusher on edge `wallDir` of (x,y); pushes a robot in that cell toward
// opposite(wallDir) on the register numbers listed (1-based).
export function addPusher(b, x, y, wallDir, registers) {
  addWall(b, x, y, wallDir);
  tileAt(b, x, y).pusher = { wallDir, registers };
}

// Lay a belt along a path of points. Each point except the LAST becomes a belt cell whose
// dir points at the next point. A cell entered while its dir differs from the previous
// cell's dir is a curve: robots carried onto it by a belt rotate in `turn` direction.
export function addBeltPath(b, type, points) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    let dir;
    if (nx === x + 1 && ny === y) dir = 1;
    else if (nx === x - 1 && ny === y) dir = 3;
    else if (nx === x && ny === y + 1) dir = 2;
    else if (nx === x && ny === y - 1) dir = 0;
    else throw new Error(`belt path not adjacent: ${x},${y} -> ${nx},${ny} on ${b.name}`);
    let turn = null;
    if (i > 0) {
      const prev = tileAt(b, points[i - 1][0], points[i - 1][1]).belt;
      if (prev && prev.dir !== dir) turn = dir === rotR(prev.dir) ? 'right' : 'left';
    }
    const t = tileAt(b, x, y);
    t.belt = { type, dir, turn };
  }
}

export function setFlags(b, flags) { b.flags = flags.map(([x, y]) => ({ x, y })); }
export function setDocks(b, docks) { b.docks = docks.map(([x, y], i) => ({ x, y, n: i + 1 })); }

// Sanity checks used by tests and at course load.
export function validateBoard(b) {
  const errs = [];
  if (!b.flags.length) errs.push('no flags');
  if (b.docks.length < 4) errs.push('fewer than 4 docks');
  for (const f of b.flags) {
    const t = tileAt(b, f.x, f.y);
    if (!t) errs.push(`flag off board at ${f.x},${f.y}`);
    else if (t.floor === 'pit') errs.push(`flag on a pit at ${f.x},${f.y}`);
  }
  for (const d of b.docks) {
    const t = tileAt(b, d.x, d.y);
    if (!t) errs.push(`dock off board at ${d.x},${d.y}`);
    else if (t.floor === 'pit') errs.push(`dock on a pit at ${d.x},${d.y}`);
  }
  for (const t of b.tiles) {
    if (t.belt) {
      const nx = t.x + DX[t.belt.dir], ny = t.y + DY[t.belt.dir];
      const n = tileAt(b, nx, ny);
      if (n && n.belt && n.belt.dir === opposite(t.belt.dir)) {
        errs.push(`belts head-on at ${t.x},${t.y}`);
      }
    }
  }
  return errs;
}
