// Pure, deterministic, renderer-free rules engine for classic Robo Rally.
// Every state change is emitted as an event so the animator can replay it visually.
import { buildDeck } from './cards.js';
import { buildOptionDeck } from './options.js';
import { mulberry32, shuffleInPlace } from './rng.js';
import { DX, DY, opposite, rotR, rotL, tileAt, inBounds, hasWall } from './board.js';

export const NUM_REGISTERS = 5;

// ---------- state ----------

// placement: 'auto' docks robots by roster order (classic); 'bid' leaves them
// unplaced — after the turn-1 deal each robot bids a card from its hand, highest
// priority picks a dock first (bid cards are discarded). See RULINGS.md (variant).
export function createGame({ board, seed = 1, roster, placement = 'auto' }) {
  const bid = placement === 'bid';
  const state = {
    board,
    rand: mulberry32(seed),
    seed,
    allCards: buildDeck(),
    optionDeck: null,
    robots: roster.map((r, i) => {
      const dock = board.docks[i];
      return {
        id: r.id, name: r.name, color: r.color, isAI: !!r.isAI, personality: r.personality || null,
        x: dock.x, y: dock.y, dir: 0,
        archiveX: dock.x, archiveY: dock.y,
        damage: 0, lives: 3, nextFlag: 0,
        poweredDown: false, announced: false,
        registers: new Array(NUM_REGISTERS).fill(null),
        hand: [],
        options: [], autoShield: true,
        destroyed: false, dead: false,
        placed: !bid,
      };
    }),
    turn: 0,
    winner: null,
    destroyedThisTurn: [],
    placement: bid ? { pending: true, bids: {}, order: null, pickIdx: 0 } : null,
  };
  state.optionDeck = shuffleInPlace(buildOptionDeck(), state.rand);
  return state;
}

// ---------- start-position bidding (placement: 'bid') ----------

export function submitBid(state, id, priority) {
  const p = state.placement;
  if (!p?.pending || p.order) throw new Error('not in the bidding phase');
  if (p.bids[id]) return false;
  const r = robotById(state, id);
  const card = r.hand.find((c) => c.priority === priority);
  if (!card) throw new Error(`${id}: bid card p${priority} not in hand`);
  p.bids[id] = card;
  return true;
}

export const allBidsIn = (state) =>
  state.robots.every((r) => r.dead || state.placement.bids[r.id]);

// Reveal: order by bid priority (all unique), discard every bid card from its hand.
export function resolveBids(state) {
  const p = state.placement;
  if (!p?.pending || p.order) throw new Error('bids already resolved');
  const entries = state.robots
    .filter((r) => !r.dead)
    .map((r) => ({ id: r.id, card: p.bids[r.id] }))
    .sort((a, b) => b.card.priority - a.card.priority);
  for (const e of entries) {
    const r = robotById(state, e.id);
    r.hand = r.hand.filter((c) => c.priority !== e.card.priority);
  }
  p.order = entries.map((e) => e.id);
  p.pickIdx = 0;
  return [{ type: 'bids', entries }];
}

export const currentPicker = (state) =>
  state.placement?.order?.[state.placement.pickIdx] ?? null;

export const freeDocks = (state) =>
  state.board.docks.filter((d) =>
    !state.robots.some((r) => r.placed && r.x === d.x && r.y === d.y));

export function placeRobot(state, id, dockN) {
  const p = state.placement;
  if (currentPicker(state) !== id) throw new Error(`${id}: not your pick`);
  const dock = freeDocks(state).find((d) => d.n === dockN);
  if (!dock) throw new Error(`dock ${dockN} is not available`);
  const r = robotById(state, id);
  r.x = dock.x; r.y = dock.y; r.dir = 0;
  r.archiveX = dock.x; r.archiveY = dock.y;
  r.placed = true;
  p.pickIdx += 1;
  if (p.pickIdx >= p.order.length) p.pending = false;
  return [{ type: 'placed', id, x: dock.x, y: dock.y, dir: 0, dock: dock.n }];
}

export const activeRobots = (state) => state.robots.filter((r) => !r.dead && !r.destroyed);
export const robotAt = (state, x, y) =>
  state.robots.find((r) => !r.dead && !r.destroyed && r.x === x && r.y === y) || null;
export const robotById = (state, id) => state.robots.find((r) => r.id === id);

// Registers lock from #5 downward as damage passes 4: locked when index >= 5 - max(0, damage - 4).
export const lockedCount = (damage) => Math.max(0, Math.min(NUM_REGISTERS, damage - 4));
export const isLocked = (robot, regIdx) => regIdx >= NUM_REGISTERS - lockedCount(robot.damage);
export const handSize = (robot) =>
  Math.max(0, 9 - robot.damage + (robot.options.some((o) => o.id === 'extra-memory') ? 1 : 0));

// ---------- turn phases ----------

export function startTurn(state) {
  const ev = [];
  state.turn++;
  state.destroyedThisTurn = [];
  ev.push({ type: 'turn', n: state.turn });

  for (const r of state.robots) {
    if (r.dead) continue;
    if (r.announced) {
      r.announced = false;
      r.poweredDown = true;
      ev.push({ type: 'powerdown', id: r.id });
    }
    if (r.poweredDown && r.damage > 0) {
      r.damage = 0;
      ev.push({ type: 'repair', id: r.id, amount: 99, total: 0, source: 'powerdown' });
    }
  }

  // Rebuild and shuffle the deck each turn, minus every card still held in a register
  // (locked cards, plus powered-down robots' kept programs — prevents duplicates).
  const heldPriorities = new Set();
  for (const r of state.robots) {
    if (r.dead) continue;
    r.registers.forEach((c) => { if (c) heldPriorities.add(c.priority); });
  }
  const pool = state.allCards.filter((c) => !heldPriorities.has(c.priority));
  shuffleInPlace(pool, state.rand);

  for (const r of state.robots) {
    if (r.dead || r.poweredDown) { r.hand = []; continue; }
    r.hand = pool.splice(0, handSize(r));
    // A register that became locked without a card in it gets a random card (rulebook
    // power-down edge case, generalized — see RULINGS.md).
    for (let i = 0; i < NUM_REGISTERS; i++) {
      if (isLocked(r, i) && !r.registers[i]) r.registers[i] = pool.shift() || null;
    }
  }
  return ev;
}

// cards: array filling the unlocked registers in order. Leftover hand is discarded.
export function programRobot(state, id, cards) {
  const r = robotById(state, id);
  const slots = [];
  for (let i = 0; i < NUM_REGISTERS; i++) if (!isLocked(r, i)) slots.push(i);
  if (cards.length !== slots.length) {
    throw new Error(`${id}: need ${slots.length} cards, got ${cards.length}`);
  }
  const hand = [...r.hand];
  for (const c of cards) {
    const idx = hand.findIndex((h) => h.priority === c.priority);
    if (idx < 0) throw new Error(`${id}: card p${c.priority} not in hand`);
    hand.splice(idx, 1);
  }
  slots.forEach((slot, i) => { r.registers[slot] = cards[i]; });
  r.hand = [];
}

export function announcePowerDown(state, id, on) {
  const r = robotById(state, id);
  if (on && r.damage <= 0) return false; // only a damaged robot may power down
  r.announced = !!on;
  return r.announced;
}

// ---------- register execution ----------

export function executeRegisters(state) {
  const ev = [];
  for (let reg = 0; reg < NUM_REGISTERS; reg++) {
    if (state.winner) break;
    executeRegister(state, reg, ev);
  }
  return ev;
}

export function executeRegister(state, reg, ev) {
  ev.push({ type: 'register', n: reg + 1 });

  // A. reveal + B. robots move, highest priority first
  const movers = activeRobots(state)
    .filter((r) => !r.poweredDown && r.registers[reg])
    .sort((a, b) => b.registers[reg].priority - a.registers[reg].priority);
  ev.push({
    type: 'reveal', n: reg + 1,
    cards: movers.map((r) => ({ id: r.id, card: r.registers[reg] })),
  });
  for (const r of movers) {
    if (r.destroyed || r.dead) continue;
    executeCard(state, r, r.registers[reg], ev);
  }

  // C. board elements, in exactly this order
  runBelts(state, true, ev);
  runBelts(state, false, ev);
  runPushers(state, reg + 1, ev);
  runGears(state, ev);

  // D. lasers, then E. flags & repair sites (archive only)
  fireLasers(state, ev);
  touchFlags(state, ev);
}

function executeCard(state, robot, card, ev) {
  switch (card.type) {
    case 'uturn': rotateRobot(robot, 2, 'card', ev); break;
    case 'left': rotateRobot(robot, 3, 'card', ev); break;
    case 'right': rotateRobot(robot, 1, 'card', ev); break;
    case 'backup': tryMove(state, robot, opposite(robot.dir), ev, 'card'); break;
    case 'move1': moveSteps(state, robot, 1, ev); break;
    case 'move2': moveSteps(state, robot, 2, ev); break;
    case 'move3': moveSteps(state, robot, 3, ev); break;
    default: throw new Error(`unknown card ${card.type}`);
  }
}

function moveSteps(state, robot, n, ev) {
  for (let i = 0; i < n; i++) {
    if (robot.destroyed) break;
    if (!tryMove(state, robot, robot.dir, ev, 'card')) break; // wall: remaining movement lost
  }
}

function rotateRobot(robot, quarterTurns, cause, ev) {
  const from = robot.dir;
  robot.dir = (robot.dir + quarterTurns) % 4;
  ev.push({ type: 'rotate', id: robot.id, from, to: robot.dir, cause });
}

// One-step move with chain pushing. Returns true if the robot moved.
function tryMove(state, robot, dir, ev, cause) {
  if (hasWall(state.board, robot.x, robot.y, dir)) return false;
  const tx = robot.x + DX[dir], ty = robot.y + DY[dir];
  const occupant = robotAt(state, tx, ty);
  if (occupant) {
    if (!tryMove(state, occupant, dir, ev, 'push')) return false; // chain blocked by wall
  }
  const fx = robot.x, fy = robot.y;
  robot.x = tx; robot.y = ty;
  ev.push({ type: 'move', id: robot.id, fx, fy, tx, ty, dir, cause });
  checkDeadlyTile(state, robot, ev);
  return true;
}

function checkDeadlyTile(state, robot, ev) {
  if (!inBounds(state.board, robot.x, robot.y)) destroyRobot(state, robot, 'edge', ev);
  else if (tileAt(state.board, robot.x, robot.y).floor === 'pit') destroyRobot(state, robot, 'pit', ev);
}

function destroyRobot(state, robot, cause, ev) {
  robot.destroyed = true;
  robot.lives--;
  state.destroyedThisTurn.push(robot.id);
  if (robot.options.length) robot.options.pop(); // a destroyed robot loses one option
  ev.push({ type: 'destroyed', id: robot.id, x: robot.x, y: robot.y, cause, lives: robot.lives });
  if (robot.lives <= 0) {
    robot.dead = true;
    ev.push({ type: 'eliminated', id: robot.id });
  }
}

// ---------- board elements ----------

// Belt movement is simultaneous and never pushes: converging/swapping/blocked moves stall.
function runBelts(state, expressOnly, ev) {
  const b = state.board;
  const proposals = new Map(); // id -> {robot, tx, ty}
  for (const r of activeRobots(state)) {
    const t = tileAt(b, r.x, r.y);
    if (!t || !t.belt) continue;
    if (expressOnly && t.belt.type !== 'express') continue;
    const d = t.belt.dir;
    if (hasWall(b, r.x, r.y, d)) continue; // wall blocks the belt
    proposals.set(r.id, { robot: r, tx: r.x + DX[d], ty: r.y + DY[d] });
  }
  // cancel conflicts until stable
  let changed = true;
  while (changed) {
    changed = false;
    const byDest = new Map();
    for (const [id, p] of proposals) {
      const k = `${p.tx},${p.ty}`;
      if (!byDest.has(k)) byDest.set(k, []);
      byDest.get(k).push(id);
    }
    for (const ids of byDest.values()) {
      if (ids.length > 1) { ids.forEach((id) => proposals.delete(id)); changed = true; }
    }
    for (const [id, p] of proposals) {
      const occ = robotAt(state, p.tx, p.ty);
      if (!occ) continue;
      const occProp = proposals.get(occ.id);
      const swap = occProp && occProp.tx === p.robot.x && occProp.ty === p.robot.y;
      if (!occProp || swap) {
        proposals.delete(id);
        if (swap) proposals.delete(occ.id);
        changed = true;
        break;
      }
    }
  }
  if (!proposals.size) return;
  const moves = [];
  for (const { robot, tx, ty } of proposals.values()) {
    moves.push({ id: robot.id, fx: robot.x, fy: robot.y, tx, ty });
    robot.x = tx; robot.y = ty;
  }
  ev.push({ type: 'belts', express: expressOnly, moves });
  for (const { robot } of proposals.values()) {
    if (robot.destroyed) continue;
    if (!inBounds(b, robot.x, robot.y) || tileAt(b, robot.x, robot.y).floor === 'pit') {
      checkDeadlyTile(state, robot, ev);
      continue;
    }
    const t = tileAt(b, robot.x, robot.y);
    if (t.belt && t.belt.turn) {
      rotateRobot(robot, t.belt.turn === 'right' ? 1 : 3, 'belt', ev);
    }
  }
}

function runPushers(state, regNum, ev) {
  const b = state.board;
  for (const t of b.tiles) {
    if (!t.pusher || !t.pusher.registers.includes(regNum)) continue;
    const r = robotAt(state, t.x, t.y);
    if (!r) continue;
    ev.push({ type: 'pusherFire', x: t.x, y: t.y, wallDir: t.pusher.wallDir });
    tryMove(state, r, opposite(t.pusher.wallDir), ev, 'pusher');
  }
}

function runGears(state, ev) {
  for (const r of activeRobots(state)) {
    const t = tileAt(state.board, r.x, r.y);
    if (t && t.gear) rotateRobot(r, t.gear === 'cw' ? 1 : 3, 'gear', ev);
  }
}

// ---------- lasers & damage ----------

// Walk a beam from (sx,sy) toward dir until it hits a robot (not selfId) or a wall.
export function traceBeam(state, sx, sy, dir, selfId = null) {
  const b = state.board;
  let cx = sx, cy = sy;
  for (;;) {
    const r = robotAt(state, cx, cy);
    if (r && r.id !== selfId) return { ex: cx, ey: cy, target: r };
    if (hasWall(b, cx, cy, dir)) return { ex: cx, ey: cy, target: null };
    const nx = cx + DX[dir], ny = cy + DY[dir];
    if (!inBounds(b, nx, ny)) return { ex: cx, ey: cy, target: null };
    cx = nx; cy = ny;
  }
}

function fireLasers(state, ev) {
  // board lasers: compute all, then apply
  const hits = [];
  for (const l of state.board.lasers) {
    const dir = opposite(l.wallDir);
    const { ex, ey, target } = traceBeam(state, l.x, l.y, dir);
    ev.push({
      type: 'laser', kind: 'board', sx: l.x, sy: l.y, ex, ey, dir,
      targetId: target ? target.id : null, damage: l.count,
    });
    if (target) hits.push({ robot: target, n: l.count });
  }
  for (const h of hits) applyDamage(state, h.robot, h.n, 'board-laser', ev);

  // robot lasers fire simultaneously among survivors (powered-down robots still fire — RAW)
  const shots = [];
  for (const r of activeRobots(state)) {
    const dirs = [r.dir];
    if (r.options.some((o) => o.id === 'rear-laser')) dirs.push(opposite(r.dir));
    for (let i = 0; i < dirs.length; i++) {
      const dmg = i === 0 && r.options.some((o) => o.id === 'double-laser') ? 2 : 1;
      const { ex, ey, target } = traceBeam(state, r.x, r.y, dirs[i], r.id);
      ev.push({
        type: 'laser', kind: 'robot', ownerId: r.id, sx: r.x, sy: r.y, ex, ey, dir: dirs[i],
        targetId: target ? target.id : null, damage: dmg,
      });
      if (target) shots.push({ robot: target, n: dmg, by: r.id });
    }
  }
  for (const s of shots) applyDamage(state, s.robot, s.n, `laser:${s.by}`, ev);
}

export function applyDamage(state, robot, n, source, ev) {
  if (robot.poweredDown && robot.options.some((o) => o.id === 'pd-shield') && n > 0) {
    n -= 1;
    ev.push({ type: 'shield', id: robot.id, option: 'pd-shield' });
  }
  for (let i = 0; i < n; i++) {
    if (robot.destroyed || robot.dead) break;
    const coat = robot.options.find((o) => o.id === 'ablative-coat' && o.uses > 0);
    if (coat) {
      coat.uses--;
      if (coat.uses <= 0) robot.options.splice(robot.options.indexOf(coat), 1);
      ev.push({ type: 'shield', id: robot.id, option: 'ablative-coat' });
      continue;
    }
    // Generic rule: discard any option to prevent the damage (auto policy: always if it
    // would destroy us, else when it would start locking registers).
    const lethal = robot.damage >= 9;
    if (robot.options.length && (lethal || (robot.autoShield && robot.damage >= 4))) {
      const opt = robot.options.pop();
      ev.push({ type: 'shield', id: robot.id, option: opt.id });
      continue;
    }
    robot.damage++;
    ev.push({ type: 'damage', id: robot.id, total: robot.damage, source });
    if (robot.damage >= 10) destroyRobot(state, robot, 'damage', ev);
  }
}

// ---------- flags, archive ----------

function touchFlags(state, ev) {
  for (const r of activeRobots(state)) {
    const flagIdx = state.board.flags.findIndex((f) => f.x === r.x && f.y === r.y);
    if (flagIdx === r.nextFlag) {
      r.nextFlag++;
      ev.push({ type: 'flag', id: r.id, flag: flagIdx + 1, of: state.board.flags.length });
      if (r.nextFlag >= state.board.flags.length && !state.winner) {
        state.winner = r.id;
        ev.push({ type: 'win', id: r.id });
      }
    }
    const t = tileAt(state.board, r.x, r.y);
    if (flagIdx >= 0 || t.floor === 'repair' || t.floor === 'upgrade') {
      if (r.archiveX !== r.x || r.archiveY !== r.y) {
        r.archiveX = r.x; r.archiveY = r.y;
        ev.push({ type: 'archive', id: r.id, x: r.x, y: r.y });
      }
    }
  }
}

// ---------- cleanup ----------

export const needsRespawnChoice = (state) =>
  state.robots.filter((r) => r.destroyed && !r.dead);
export const needsStayDownChoice = (state) =>
  state.robots.filter((r) => !r.dead && !r.destroyed && r.poweredDown);

// choices: { [robotId]: { dir, powerDown, stayDown } }
export function executeCleanup(state, choices = {}) {
  const ev = [];
  ev.push({ type: 'cleanup' });

  // repairs & upgrades
  for (const r of activeRobots(state)) {
    const t = tileAt(state.board, r.x, r.y);
    if (t.floor === 'repair' || t.floor === 'upgrade') {
      if (r.damage > 0) {
        r.damage--;
        ev.push({ type: 'repair', id: r.id, amount: 1, total: r.damage, source: t.floor });
      }
      if (t.floor === 'upgrade' && state.optionDeck.length) {
        const opt = state.optionDeck.pop();
        r.options.push({ ...opt });
        ev.push({ type: 'option', id: r.id, option: opt.id, name: opt.name });
      }
    }
  }

  // wipe unlocked registers (but never wipe a powered-down robot's registers)
  for (const r of state.robots) {
    if (r.dead || r.poweredDown) continue;
    if (r.destroyed) { r.registers.fill(null); continue; }
    for (let i = 0; i < NUM_REGISTERS; i++) if (!isLocked(r, i)) r.registers[i] = null;
  }

  // destroyed robots re-enter at their archive marker, in the order they were destroyed
  const justRespawned = new Set();
  for (const id of state.destroyedThisTurn) {
    const r = robotById(state, id);
    if (!r || r.dead || !r.destroyed) continue;
    justRespawned.add(id);
    const c = choices[id] || {};
    const spot = findRespawnSpot(state, r.archiveX, r.archiveY);
    r.x = spot.x; r.y = spot.y;
    r.dir = c.dir ?? 0;
    r.destroyed = false;
    r.damage = r.options.some((o) => o.id === 'superior-archive') ? 0 : 2;
    r.poweredDown = !!c.powerDown;
    ev.push({
      type: 'respawn', id: r.id, x: r.x, y: r.y, dir: r.dir,
      damage: r.damage, poweredDown: r.poweredDown,
    });
  }

  // powered-down robots decide whether to stay down
  for (const r of activeRobots(state)) {
    if (!r.poweredDown || justRespawned.has(r.id)) continue;
    const c = choices[r.id] || {};
    if (!c.stayDown) {
      r.poweredDown = false;
      r.registers.fill(null); // registers wipe on power-up
      ev.push({ type: 'powerup', id: r.id });
    }
  }
  return ev;
}

// Archive space, or — if occupied — the first free non-pit adjacent space (orthogonal
// first, then diagonal; deterministic order). See RULINGS.md.
function findRespawnSpot(state, ax, ay) {
  if (!robotAt(state, ax, ay)) return { x: ax, y: ay };
  const ring = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [dx, dy] of ring) {
    const x = ax + dx, y = ay + dy;
    const t = tileAt(state.board, x, y);
    if (t && t.floor !== 'pit' && !robotAt(state, x, y)) return { x, y };
  }
  // pathological: scan the whole board
  for (const t of state.board.tiles) {
    if (t.floor !== 'pit' && !robotAt(state, t.x, t.y)) return { x: t.x, y: t.y };
  }
  return { x: ax, y: ay };
}
