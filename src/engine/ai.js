// AI opponents. Each AI programs its registers by beam-searching candidate programs,
// simulating them register-by-register on the REAL rules engine (opponents assumed
// stationary), then scoring outcomes with a personality weight vector. No cheating:
// the AI sees only its own hand and public state.
import { executeRegister, robotById, isLocked, NUM_REGISTERS, freeDocks } from './engine.js';
import { tileAt, inBounds, DX, DY, opposite } from './board.js';

export const PERSONALITIES = {
  crusher: {
    label: 'Crusher', flag: 110, dist: -3.2, damage: -10, death: -170,
    shot: 22, kill: 60, hazard: -3, pdThresh: 7, pickHigh: true, respawnDown: false,
  },
  prudence: {
    label: 'Prudence', flag: 100, dist: -3.0, damage: -22, death: -320,
    shot: 3, kill: 8, hazard: -10, pdThresh: 4, pickHigh: false, respawnDown: true,
  },
  turbo: {
    label: 'Turbo', flag: 170, dist: -5.5, damage: -7, death: -150,
    shot: 2, kill: 5, hazard: -2.5, pdThresh: 6, pickHigh: true, respawnDown: false,
  },
};

const BEAM_WIDTH = 48;

// Lightweight clone for simulation: board and card objects are shared (never mutated).
function cloneSim(state) {
  return {
    board: state.board,
    robots: state.robots.map((r) => ({
      ...r,
      registers: [...r.registers],
      options: r.options.map((o) => ({ ...o })),
      hand: [],
    })),
    winner: state.winner,
    destroyedThisTurn: [],
    optionDeck: [],
    turn: state.turn,
  };
}

// Cells covered by board lasers (ignoring robots), for hazard scoring.
export function laserLanes(board) {
  const lanes = new Set();
  for (const l of board.lasers) {
    const dir = opposite(l.wallDir);
    let cx = l.x, cy = l.y;
    for (;;) {
      lanes.add(`${cx},${cy}`);
      if (!inBounds(board, cx + DX[dir], cy + DY[dir])) break;
      // hasWall is on board.js but avoiding the import cycle cost here is pointless:
      if (wallBlocked(board, cx, cy, dir)) break;
      cx += DX[dir]; cy += DY[dir];
    }
  }
  return lanes;
}
function wallBlocked(board, x, y, dir) {
  const t = tileAt(board, x, y);
  if (t && t.walls.includes(dir)) return true;
  const n = tileAt(board, x + DX[dir], y + DY[dir]);
  return !!(n && n.walls.includes(opposite(dir)));
}

function evaluate(sim, ev, ctx) {
  const { me0, weights: w, fields, lanes, board } = ctx;
  const me = sim.robots.find((r) => r.id === me0.id);
  let s = 0;

  const flagsGained = me.nextFlag - me0.nextFlag;
  s += w.flag * flagsGained;

  const fi = Math.min(me.nextFlag, fields.length - 1);
  const px = me.destroyed || me.dead ? me.archiveX : me.x;
  const py = me.destroyed || me.dead ? me.archiveY : me.y;
  let dist = fields[fi][py] ? fields[fi][py][px] : Infinity;
  if (!isFinite(dist)) dist = 60;
  s += w.dist * dist;

  s += w.damage * Math.max(0, me.damage - me0.damage);
  if (me.dead) s += w.death * 3;
  else if (me.destroyed) s += w.death * (me0.lives <= 1 ? 2.5 : 1);

  for (const e of ev) {
    if (e.type === 'laser' && e.kind === 'robot' && e.ownerId === me.id && e.targetId) {
      s += w.shot * e.damage;
    }
    if (e.type === 'destroyed' && e.id !== me.id) s += w.kill;
  }

  if (!me.destroyed && !me.dead) {
    let hz = 0;
    const t = tileAt(board, me.x, me.y);
    if (t && t.belt) hz += 1;
    if (lanes.has(`${me.x},${me.y}`)) hz += 2;
    for (let d = 0; d < 4; d++) {
      const nx = me.x + DX[d], ny = me.y + DY[d];
      const nt = tileAt(board, nx, ny);
      if (!nt || nt.floor === 'pit') hz += 1.2;
    }
    s += w.hazard * hz;
  }
  return s;
}

// Choose cards for the unlocked registers. Returns an array sized to the free slots.
export function chooseProgram(state, robotId, fields) {
  const me0 = robotById(state, robotId);
  const weights = PERSONALITIES[me0.personality] || PERSONALITIES.turbo;
  const lanes = laserLanes(state.board);
  const ctx = { me0, weights, fields, lanes, board: state.board };

  const freeSlots = [];
  for (let i = 0; i < NUM_REGISTERS; i++) if (!isLocked(me0, i)) freeSlots.push(i);

  // base sim: opponents stay put (no programs); my locked cards stay in place
  const base = cloneSim(state);
  for (const r of base.robots) {
    if (r.id !== robotId) {
      for (let i = 0; i < NUM_REGISTERS; i++) if (!isLocked(r, i)) r.registers[i] = null;
    }
  }

  let beam = [{ sim: base, used: [], ev: [] }];
  for (let reg = 0; reg < NUM_REGISTERS; reg++) {
    const slotIdx = freeSlots.indexOf(reg);
    const next = [];
    for (const node of beam) {
      const meNow = node.sim.robots.find((r) => r.id === robotId);
      if (slotIdx === -1 || meNow.destroyed || meNow.dead) {
        // locked register (card already set) or robot gone: no branching
        if (slotIdx !== -1) node.used.push(pickAnyRemaining(me0.hand, node.used));
        const child = { sim: cloneSim(node.sim), used: [...node.used], ev: [...node.ev] };
        child.sim.destroyedThisTurn = [];
        executeRegister(child.sim, reg, child.ev);
        next.push(child);
        continue;
      }
      const seenTypes = new Set();
      for (let h = 0; h < me0.hand.length; h++) {
        if (node.used.includes(h)) continue;
        const type = me0.hand[h].type;
        if (seenTypes.has(type)) continue;
        seenTypes.add(type);
        const child = { sim: cloneSim(node.sim), used: [...node.used, h], ev: [...node.ev] };
        child.sim.destroyedThisTurn = [];
        const meC = child.sim.robots.find((r) => r.id === robotId);
        meC.registers[reg] = me0.hand[h];
        executeRegister(child.sim, reg, child.ev);
        next.push(child);
      }
    }
    for (const n of next) n.score = evaluate(n.sim, n.ev, ctx);
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, BEAM_WIDTH);
  }

  const best = beam[0];
  // Map chosen hand indices to concrete cards: re-pick instances by priority preference
  // (aggressive personalities take the high-priority copy to move first).
  const remaining = me0.hand.map((c, i) => ({ c, i }));
  const cards = [];
  for (const h of best.used) {
    const type = me0.hand[h].type;
    const ofType = remaining.filter((e) => e.c.type === type);
    ofType.sort((a, b) => (weights.pickHigh ? b.c.priority - a.c.priority : a.c.priority - b.c.priority));
    const pick = ofType[0];
    remaining.splice(remaining.indexOf(pick), 1);
    cards.push(pick.c);
  }
  return cards;
}

function pickAnyRemaining(hand, used) {
  for (let h = 0; h < hand.length; h++) if (!used.includes(h)) return h;
  return -1;
}

export function decidePowerDown(state, robotId) {
  const r = robotById(state, robotId);
  const w = PERSONALITIES[r.personality] || PERSONALITIES.turbo;
  return r.damage >= w.pdThresh;
}

// Start-position bid, in character: Crusher burns its best card to pick first,
// Turbo keeps the big movers and bids its best non-move card, Prudence bids low
// and happily picks last.
export function chooseBid(state, robotId) {
  const r = robotById(state, robotId);
  const hand = [...r.hand].sort((a, b) => b.priority - a.priority);
  if (r.personality === 'prudence') return hand[hand.length - 1].priority;
  if (r.personality === 'turbo') {
    const nonMove = hand.filter((c) => !c.type.startsWith('move'));
    return (nonMove[0] || hand[hand.length - 1]).priority;
  }
  return hand[0].priority;
}

// Pick the free dock closest (BFS) to flag 1.
export function chooseDock(state, robotId, fields) {
  const free = freeDocks(state);
  const f0 = fields[0];
  let best = free[0];
  let bd = Infinity;
  for (const d of free) {
    const v = f0?.[d.y]?.[d.x] ?? 9999;
    if (v < bd) { bd = v; best = d; }
  }
  return best.n;
}

export function respawnChoice(state, robotId, fields) {
  const r = robotById(state, robotId);
  const w = PERSONALITIES[r.personality] || PERSONALITIES.turbo;
  const fi = Math.min(r.nextFlag, fields.length - 1);
  let bestDir = 0, bestDist = Infinity;
  for (let d = 0; d < 4; d++) {
    const nx = r.archiveX + DX[d], ny = r.archiveY + DY[d];
    const t = tileAt(state.board, nx, ny);
    if (!t || t.floor === 'pit') continue;
    const dist = fields[fi][ny][nx];
    if (dist < bestDist) { bestDist = dist; bestDir = d; }
  }
  return { dir: bestDir, powerDown: !!w.respawnDown };
}

export function decideStayDown(state, robotId) {
  const r = robotById(state, robotId);
  return r.damage >= 3;
}
