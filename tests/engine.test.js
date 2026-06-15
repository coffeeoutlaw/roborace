import { describe, it, expect } from 'vitest';
import {
  makeBoard, setFloor, addWall, addGear, addLaser, addPusher, addBeltPath,
  setFlags, setDocks, hasWall,
} from '../src/engine/board.js';
import { buildDeck } from '../src/engine/cards.js';
import {
  createGame, startTurn, programRobot, executeRegisters, executeRegister,
  executeCleanup, announcePowerDown, isLocked, handSize, robotById, traceBeam,
  applyDamage,
} from '../src/engine/engine.js';

// ---------- helpers ----------

// 10x10 empty test board, docks along the bottom.
function testBoard(mutate) {
  const b = makeBoard({ name: 'test', width: 10, height: 10 });
  setFlags(b, [[5, 0]]);
  setDocks(b, [[1, 9], [3, 9], [5, 9], [7, 9]]);
  if (mutate) mutate(b);
  return b;
}

const ROSTER = [
  { id: 'p', name: 'Player', color: '#fff' },
  { id: 'a', name: 'A', color: '#f00', isAI: true },
  { id: 'b', name: 'B', color: '#0f0', isAI: true },
  { id: 'c', name: 'C', color: '#00f', isAI: true },
];

function game(boardMutate, seed = 7) {
  const state = createGame({ board: testBoard(boardMutate), seed, roster: ROSTER });
  return state;
}

function place(state, id, x, y, dir = 0) {
  const r = robotById(state, id);
  r.x = x; r.y = y; r.dir = dir;
  return r;
}

function park(state, ids) {
  // move robots out of the way (far corner, off the action)
  const spots = [[9, 9], [8, 9], [9, 8], [8, 8]];
  ids.forEach((id, i) => place(state, id, spots[i][0], spots[i][1]));
}

const card = (type, priority) => ({ type, priority });

// give a robot a specific program directly (bypassing deal/hand for unit tests)
function forceProgram(state, id, cards) {
  const r = robotById(state, id);
  r.registers = [...cards, null, null, null, null].slice(0, 5);
}

// ---------- deck ----------

describe('program deck', () => {
  it('has exactly 84 cards with unique priorities 10..840 step 10', () => {
    const deck = buildDeck();
    expect(deck.length).toBe(84);
    const ps = deck.map((c) => c.priority).sort((x, y) => x - y);
    expect(ps[0]).toBe(10);
    expect(ps[83]).toBe(840);
    expect(new Set(ps).size).toBe(84);
  });
  it('has the classic counts per type', () => {
    const deck = buildDeck();
    const count = (t) => deck.filter((c) => c.type === t).length;
    expect(count('uturn')).toBe(6);
    expect(count('left')).toBe(18);
    expect(count('right')).toBe(18);
    expect(count('backup')).toBe(6);
    expect(count('move1')).toBe(18);
    expect(count('move2')).toBe(12);
    expect(count('move3')).toBe(6);
  });
});

// ---------- priority ordering ----------

describe('priority ordering', () => {
  it('higher priority moves first (and can push the slower robot)', () => {
    const state = game();
    park(state, ['b', 'c']);
    // p at (2,5) facing E with high priority; a at (3,5) would have walked away W->... give
    // a a lower-priority move that would matter only if it still stands there.
    place(state, 'p', 2, 5, 1); // facing E
    place(state, 'a', 3, 5, 0); // facing N
    forceProgram(state, 'p', [card('move1', 800)]);
    forceProgram(state, 'a', [card('move1', 500)]);
    const ev = [];
    executeRegister(state, 0, ev);
    // p moved first into (3,5), pushing a east to (4,5); then a executed its own Move 1
    // north to (4,4). If a had moved first it would have walked away and never been pushed.
    expect(robotById(state, 'p').x).toBe(3);
    expect(robotById(state, 'p').y).toBe(5);
    expect(robotById(state, 'a').x).toBe(4);
    expect(robotById(state, 'a').y).toBe(4);
  });
});

// ---------- pushing ----------

describe('pushing', () => {
  it('chain-pushes multiple robots', () => {
    const state = game();
    park(state, ['c']);
    place(state, 'p', 2, 5, 1);
    place(state, 'a', 3, 5, 0);
    place(state, 'b', 4, 5, 0);
    forceProgram(state, 'p', [card('move1', 800)]);
    const ev = [];
    executeRegister(state, 0, ev);
    expect(robotById(state, 'p').x).toBe(3);
    expect(robotById(state, 'a').x).toBe(4);
    expect(robotById(state, 'b').x).toBe(5);
  });

  it('a wall stops the whole chain with no damage', () => {
    const state = game((b) => addWall(b, 4, 5, 1)); // wall on east edge of (4,5)
    park(state, ['c']);
    place(state, 'p', 2, 5, 1);
    place(state, 'a', 3, 5, 0);
    place(state, 'b', 4, 5, 0);
    forceProgram(state, 'p', [card('move2', 700)]);
    const ev = [];
    executeRegister(state, 0, ev);
    // nobody moved: b blocked by wall, so a blocked, so p blocked (both steps)
    expect(robotById(state, 'p').x).toBe(2);
    expect(robotById(state, 'a').x).toBe(3);
    expect(robotById(state, 'b').x).toBe(4);
    expect(robotById(state, 'b').damage).toBe(0);
  });

  it('pushing a robot into a pit destroys it; pusher keeps moving', () => {
    const state = game((b) => setFloor(b, 4, 5, 'pit'));
    park(state, ['b', 'c']);
    place(state, 'p', 2, 5, 1);
    place(state, 'a', 3, 5, 0);
    forceProgram(state, 'p', [card('move2', 700)]);
    const ev = [];
    executeRegister(state, 0, ev);
    const a = robotById(state, 'a');
    expect(a.destroyed).toBe(true);
    expect(a.lives).toBe(2);
    // p continued: step1 to (3,5) (a pushed into pit), step2 into (4,5)... which is the pit!
    // p follows into the pit and dies too — movement into a pit destroys.
    expect(robotById(state, 'p').destroyed).toBe(true);
  });
});

// ---------- movement misc ----------

describe('movement', () => {
  it('back up moves 1 backward without changing facing', () => {
    const state = game();
    park(state, ['a', 'b', 'c']);
    const p = place(state, 'p', 5, 5, 1); // facing E
    forceProgram(state, 'p', [card('backup', 450)]);
    executeRegister(state, 0, []);
    expect(p.x).toBe(4);
    expect(p.dir).toBe(1);
  });

  it('driving off the board edge destroys the robot mid-Move 3', () => {
    const state = game();
    park(state, ['a', 'b', 'c']);
    const p = place(state, 'p', 1, 5, 3); // facing W, 1 step to edge
    forceProgram(state, 'p', [card('move3', 800)]);
    executeRegister(state, 0, []);
    expect(p.destroyed).toBe(true);
    expect(p.lives).toBe(2);
  });

  it('rotations always succeed in place', () => {
    const state = game();
    park(state, ['a', 'b', 'c']);
    const p = place(state, 'p', 5, 5, 0);
    forceProgram(state, 'p', [card('uturn', 30)]);
    executeRegister(state, 0, []);
    expect(p.dir).toBe(2);
    expect(p.x).toBe(5);
  });
});

// ---------- conveyors ----------

describe('conveyors', () => {
  it('normal belt carries a robot 1 space; express carries 2 (express then all)', () => {
    const state = game((b) => {
      addBeltPath(b, 'express', [[2, 5], [3, 5], [4, 5], [5, 5]]);
      addBeltPath(b, 'normal', [[2, 7], [3, 7], [4, 7]]);
    });
    park(state, ['b', 'c']);
    place(state, 'p', 2, 5, 0); // on express
    place(state, 'a', 2, 7, 0); // on normal
    executeRegister(state, 0, []);
    expect(robotById(state, 'p').x).toBe(4); // express moved in both belt steps
    expect(robotById(state, 'a').x).toBe(3); // normal moved only in step 2
  });

  it('two robots converging on the same space both stall', () => {
    const state2 = game((b) => {
      addBeltPath(b, 'normal', [[3, 5], [4, 5]]);
      addBeltPath(b, 'normal', [[4, 4], [4, 5]]);
      // [4,5] is only a path endpoint — the two source cells both feed into it
    });
    park(state2, ['b', 'c']);
    place(state2, 'p', 3, 5, 0);
    place(state2, 'a', 4, 4, 0);
    executeRegister(state2, 0, []);
    expect(robotById(state2, 'p').x).toBe(3); // stalled
    expect(robotById(state2, 'a').y).toBe(4); // stalled
  });

  it('a belt never pushes a stationary robot; the carried robot stalls', () => {
    const state = game((b) => addBeltPath(b, 'normal', [[3, 5], [4, 5]]));
    park(state, ['b', 'c']);
    place(state, 'p', 3, 5, 0); // on belt
    place(state, 'a', 4, 5, 0); // stationary on plain floor at belt's destination
    executeRegister(state, 0, []);
    expect(robotById(state, 'p').x).toBe(3);
    expect(robotById(state, 'a').x).toBe(4);
  });

  it('rotates a robot carried onto a curve, but not one that walked on', () => {
    const state = game((b) => {
      // belt going E along y=5 then turning S at (5,5)
      addBeltPath(b, 'normal', [[3, 5], [4, 5], [5, 5], [5, 6]]);
    });
    park(state, ['b', 'c']);
    // carried case: robot on (4,5) gets belt-moved onto curve (5,5) -> rotates right (E->S)
    const p = place(state, 'p', 4, 5, 0); // facing N
    // walked case: robot drives itself onto the curve, must NOT rotate
    const a = place(state, 'a', 5, 3, 2); // facing S, two north of curve... walk 1 onto (5,4)? no
    // put a directly north of curve: (5,4) facing S, Move 1 onto the curve
    a.x = 5; a.y = 4;
    forceProgram(state, 'a', [card('move1', 600)]);
    const ev = [];
    executeRegister(state, 0, ev);
    // a walked onto (5,5) first (priority phase), then belts move: a gets carried S to (5,6)
    // WITHOUT the curve rotation (it walked on). p carried from (4,5) to (5,5) onto the
    // curve -> rotated right N->E. Wait: a occupied (5,5) until belts moved a away in the
    // same simultaneous step — p and a both belt-move: a to (5,6), p onto vacated (5,5).
    const pNow = robotById(state, 'p');
    const aNow = robotById(state, 'a');
    expect(aNow.x).toBe(5);
    expect(aNow.y).toBe(6);
    expect(aNow.dir).toBe(2); // unchanged facing (walked onto curve, then carried straight off)
    expect(pNow.x).toBe(5);
    expect(pNow.y).toBe(5);
    expect(pNow.dir).toBe(1); // rotated by the curve: N -> E
  });

  it('belts can carry a robot into a pit', () => {
    const state = game((b) => {
      addBeltPath(b, 'normal', [[3, 5], [4, 5]]);
      setFloor(b, 4, 5, 'pit');
    });
    park(state, ['a', 'b', 'c']);
    const p = place(state, 'p', 3, 5, 0);
    executeRegister(state, 0, []);
    expect(p.destroyed).toBe(true);
  });
});

// ---------- pushers & gears ----------

describe('pushers and gears', () => {
  it('pusher fires only on its labeled registers', () => {
    const state = game((b) => addPusher(b, 5, 5, 0, [1, 3, 5])); // on N wall, pushes S
    park(state, ['a', 'b', 'c']);
    const p = place(state, 'p', 5, 5, 0);
    executeRegister(state, 0, []); // register 1: active
    expect(p.y).toBe(6);
    p.x = 5; p.y = 5;
    executeRegister(state, 1, []); // register 2: inactive
    expect(p.y).toBe(5);
  });

  it('gears rotate 90 in their direction', () => {
    const state = game((b) => { addGear(b, 4, 4, 'cw'); addGear(b, 6, 6, 'ccw'); });
    park(state, ['b', 'c']);
    const p = place(state, 'p', 4, 4, 0);
    const a = place(state, 'a', 6, 6, 0);
    executeRegister(state, 0, []);
    expect(p.dir).toBe(1);
    expect(a.dir).toBe(3);
  });
});

// ---------- lasers ----------

describe('lasers', () => {
  it('board laser hits only the closest robot; walls block', () => {
    const state = game((b) => addLaser(b, 0, 5, 3, 1)); // mounted W wall of (0,5), fires E
    park(state, ['c']);
    place(state, 'p', 3, 5, 0);
    place(state, 'a', 6, 5, 0);
    place(state, 'b', 8, 8, 0);
    executeRegister(state, 0, []);
    expect(robotById(state, 'p').damage).toBe(1); // closest gets hit
    // a is behind p: blocked... but robot lasers also fire: p faces N (no one), a faces N.
    expect(robotById(state, 'a').damage).toBe(0);
  });

  it('robot lasers fire forward and are blocked by walls', () => {
    const state = game((b) => addWall(b, 5, 4, 0)); // wall north edge of (5,4)
    park(state, ['b', 'c']);
    place(state, 'p', 5, 6, 0); // facing N
    place(state, 'a', 5, 2, 2); // facing S — wall between them at (5,4)N
    executeRegister(state, 0, []);
    // p's beam: (5,5) -> (5,4) stops at wall (north edge). a's beam: (5,3) -> wall on
    // (5,4)'s north edge blocks entry into... beam at (5,3) checks wall S edge: none; moves
    // to (5,4); checks wall S of (5,4): none; moves to (5,5)... WAIT the wall is on the N
    // edge of (5,4): a's southward beam crosses that edge between (5,3) and (5,4).
    expect(robotById(state, 'p').damage).toBe(0);
    expect(robotById(state, 'a').damage).toBe(0);
  });

  it('a robot blocks the beam for the robot behind it', () => {
    const state = game();
    park(state, ['c']);
    place(state, 'p', 5, 6, 0);  // facing N
    place(state, 'a', 5, 4, 2);  // facing S -> shoots p
    place(state, 'b', 5, 2, 2);  // facing S -> beam blocked by a
    executeRegister(state, 0, []);
    expect(robotById(state, 'p').damage).toBe(1); // hit by a only
    expect(robotById(state, 'a').damage).toBe(2); // hit by p and b
  });

  it('laser damage is positional: only end-of-element position matters', () => {
    // robot drives THROUGH a board laser lane and ends outside it: no damage
    const state = game((b) => addLaser(b, 5, 0, 0, 1)); // N wall of (5,0), fires S down col 5
    park(state, ['a', 'b', 'c']);
    const p = place(state, 'p', 4, 5, 1); // facing E, will cross column 5
    forceProgram(state, 'p', [card('move2', 700)]);
    executeRegister(state, 0, []);
    expect(p.x).toBe(6);
    expect(p.damage).toBe(0);
  });
});

// ---------- damage, locking, destruction ----------

describe('damage and locking', () => {
  it('hand size = 9 - damage; registers lock from 5 down', () => {
    const state = game();
    const p = robotById(state, 'p');
    p.damage = 5;
    expect(handSize(p)).toBe(4);
    expect(isLocked(p, 4)).toBe(true);
    expect(isLocked(p, 3)).toBe(false);
    p.damage = 8;
    expect(handSize(p)).toBe(1);
    expect(isLocked(p, 1)).toBe(true);
    expect(isLocked(p, 0)).toBe(false);
  });

  it('10th damage destroys; robot loses a life', () => {
    const state = game();
    const p = robotById(state, 'p');
    p.damage = 9;
    applyDamage(state, p, 1, 'test', []);
    expect(p.destroyed).toBe(true);
    expect(p.lives).toBe(2);
  });

  it('locked register cards stay through cleanup and are excluded from the next deal', () => {
    const state = game();
    park(state, ['a', 'b', 'c']);
    const p = robotById(state, 'p');
    p.damage = 6; // locks registers 4 and 5 (idx 3,4)
    const locked1 = card('move1', 500), locked2 = card('left', 90);
    p.registers = [card('move1', 510), card('move1', 520), card('move1', 530), locked1, locked2];
    executeCleanup(state, {});
    expect(p.registers[3]).toEqual(locked1);
    expect(p.registers[4]).toEqual(locked2);
    expect(p.registers[0]).toBeNull();
    const ev = startTurn(state);
    expect(p.hand.length).toBe(3); // 9 - 6
    const handPs = new Set(p.hand.map((c) => c.priority));
    expect(handPs.has(500)).toBe(false);
    expect(handPs.has(90)).toBe(false);
  });

  it('repairing at cleanup unlocks and discards the freed card', () => {
    const state = game();
    park(state, ['a', 'b', 'c']);
    const p = robotById(state, 'p');
    place(state, 'p', 2, 2);
    state.board.tiles[2 * 10 + 2].floor = 'repair';
    p.damage = 5; // register 5 locked
    p.registers = [null, null, null, null, card('move3', 800)];
    executeCleanup(state, {});
    expect(p.damage).toBe(4);
    // register 5 unlocked by the repair -> its card is wiped with the others
    expect(p.registers[4]).toBeNull();
  });
});

// ---------- respawn ----------

describe('respawn', () => {
  it('re-enters at archive with 2 damage, chosen facing', () => {
    const state = game();
    park(state, ['a', 'b', 'c']);
    const p = place(state, 'p', 1, 5, 3);
    p.archiveX = 7; p.archiveY = 7;
    forceProgram(state, 'p', [card('move3', 800)]); // drives off the W edge
    executeRegister(state, 0, []);
    expect(p.destroyed).toBe(true);
    executeCleanup(state, { p: { dir: 1 } });
    expect(p.destroyed).toBe(false);
    expect(p.x).toBe(7);
    expect(p.y).toBe(7);
    expect(p.dir).toBe(1);
    expect(p.damage).toBe(2);
  });

  it('respawns adjacent if the archive space is occupied', () => {
    const state = game();
    park(state, ['b', 'c']);
    const p = place(state, 'p', 1, 5, 3);
    p.archiveX = 7; p.archiveY = 7;
    place(state, 'a', 7, 7, 0); // squatting on p's archive
    forceProgram(state, 'p', [card('move3', 800)]);
    executeRegister(state, 0, []);
    executeCleanup(state, { p: { dir: 0 } });
    expect(p.destroyed).toBe(false);
    expect(Math.abs(p.x - 7) <= 1 && Math.abs(p.y - 7) <= 1).toBe(true);
    expect(p.x === 7 && p.y === 7).toBe(false);
  });
});

// ---------- power down ----------

describe('power down', () => {
  it('clears all damage at the start of the powered-down turn; no cards dealt', () => {
    const state = game();
    const p = robotById(state, 'p');
    p.damage = 6;
    expect(announcePowerDown(state, 'p', true)).toBe(true);
    startTurn(state);
    expect(p.poweredDown).toBe(true);
    expect(p.damage).toBe(0);
    expect(p.hand.length).toBe(0);
  });

  it('undamaged robots cannot announce power down', () => {
    const state = game();
    expect(announcePowerDown(state, 'p', true)).toBe(false);
  });

  it('powered-down robot does not execute cards but board elements still move it', () => {
    const state = game((b) => addBeltPath(b, 'normal', [[3, 5], [4, 5], [5, 5]]));
    park(state, ['a', 'b', 'c']);
    const p = place(state, 'p', 3, 5, 0);
    p.damage = 2;
    announcePowerDown(state, 'p', true);
    startTurn(state);
    executeRegister(state, 0, []);
    expect(p.x).toBe(4); // belt moved it
    expect(p.poweredDown).toBe(true);
  });

  it('stays down only if chosen at cleanup', () => {
    const state = game();
    const p = robotById(state, 'p');
    p.damage = 1;
    announcePowerDown(state, 'p', true);
    startTurn(state);
    executeCleanup(state, { p: { stayDown: true } });
    expect(p.poweredDown).toBe(true);
    executeCleanup(state, {});
    expect(p.poweredDown).toBe(false);
  });
});

// ---------- flags & winning ----------

describe('flags', () => {
  it('flags must be touched in order; touching the last flag wins', () => {
    const state = game((b) => setFlags(b, [[2, 2], [8, 2]]));
    park(state, ['a', 'b', 'c']);
    const p = place(state, 'p', 2, 3, 0); // south of flag 1, facing N
    forceProgram(state, 'p', [card('move1', 600)]);
    executeRegister(state, 0, []);
    expect(p.nextFlag).toBe(1);
    expect(p.archiveX).toBe(2); // archive updated on the flag
    // jump to flag 2
    place(state, 'p', 8, 3, 0);
    forceProgram(state, 'p', [card('move1', 600)]);
    executeRegister(state, 0, []);
    expect(p.nextFlag).toBe(2);
    expect(state.winner).toBe('p');
  });

  it('touching a later flag out of order does nothing', () => {
    const state = game((b) => setFlags(b, [[2, 2], [8, 2]]));
    park(state, ['a', 'b', 'c']);
    const p = place(state, 'p', 8, 3, 0);
    forceProgram(state, 'p', [card('move1', 600)]);
    executeRegister(state, 0, []);
    expect(p.nextFlag).toBe(0);
    expect(state.winner).toBeNull();
  });
});

// ---------- full turn smoke ----------

describe('full turn integration', () => {
  it('deal -> program -> execute -> cleanup runs without error and conserves cards', () => {
    const state = game();
    const ev0 = startTurn(state);
    for (const r of state.robots) {
      expect(r.hand.length).toBe(9);
      programRobot(state, r.id, r.hand.slice(0, 5));
    }
    const ev1 = executeRegisters(state);
    expect(ev1.filter((e) => e.type === 'register').length).toBe(5);
    executeCleanup(state, {});
    // next turn deals fresh hands again
    startTurn(state);
    for (const r of state.robots) {
      if (!r.destroyed && !r.dead && !r.poweredDown) {
        expect(r.hand.length).toBe(9 - r.damage);
      }
    }
  });
});
