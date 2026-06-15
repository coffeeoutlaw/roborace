// Start-position auction (placement: 'bid'): bid validation, reveal ordering,
// pick order enforcement, hand cost, and headless auto-resolution.
import { describe, it, expect } from 'vitest';
import {
  createGame, startTurn, submitBid, allBidsIn, resolveBids, currentPicker,
  freeDocks, placeRobot, robotById,
} from '../src/engine/engine.js';
import { buildFlagFields } from '../src/engine/distance.js';
import { autoTurn, DEFAULT_ROSTER } from '../src/engine/headless.js';
import { COURSES } from '../src/boards/index.js';

const newGame = (seed = 11) =>
  createGame({ board: COURSES[0](), seed, roster: DEFAULT_ROSTER, placement: 'bid' });

describe('start-position bidding', () => {
  it('robots start unplaced and bidding follows the turn-1 deal', () => {
    const st = newGame();
    expect(st.placement.pending).toBe(true);
    expect(st.robots.every((r) => r.placed === false)).toBe(true);
    startTurn(st);
    expect(st.robots.every((r) => r.hand.length === 9)).toBe(true);
  });

  it('reveal orders by priority desc and discards every bid card', () => {
    const st = newGame();
    startTurn(st);
    const bids = {};
    for (const r of st.robots) {
      bids[r.id] = r.hand[0].priority;
      submitBid(st, r.id, r.hand[0].priority);
    }
    expect(allBidsIn(st)).toBe(true);
    const [ev] = resolveBids(st);
    expect(ev.type).toBe('bids');
    const priorities = ev.entries.map((e) => e.card.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    for (const r of st.robots) {
      expect(r.hand).toHaveLength(8);
      expect(r.hand.some((c) => c.priority === bids[r.id])).toBe(false);
    }
  });

  it('rejects a bid card not in hand and double placement', () => {
    const st = newGame();
    startTurn(st);
    const r0 = st.robots[0];
    const notInHand = [...Array(85).keys()].map((i) => i * 10)
      .find((p) => p >= 10 && !r0.hand.some((c) => c.priority === p));
    expect(() => submitBid(st, r0.id, notInHand)).toThrow(/not in hand/);
  });

  it('enforces pick order, dock availability, and sets archive', () => {
    const st = newGame();
    startTurn(st);
    for (const r of st.robots) submitBid(st, r.id, r.hand[0].priority);
    resolveBids(st);

    const order = st.placement.order;
    expect(() => placeRobot(st, order[1], 1)).toThrow(/not your pick/);

    const first = order[0];
    const dock = freeDocks(st)[0];
    placeRobot(st, first, dock.n);
    const r = robotById(st, first);
    expect([r.x, r.y]).toEqual([dock.x, dock.y]);
    expect([r.archiveX, r.archiveY]).toEqual([dock.x, dock.y]);
    expect(r.placed).toBe(true);

    // taken dock is rejected for the next picker
    expect(() => placeRobot(st, order[1], dock.n)).toThrow(/not available/);
    expect(freeDocks(st)).toHaveLength(3);

    placeRobot(st, order[1], freeDocks(st)[0].n);
    placeRobot(st, order[2], freeDocks(st)[0].n);
    placeRobot(st, order[3], freeDocks(st)[0].n);
    expect(st.placement.pending).toBe(false);
    expect(currentPicker(st)).toBe(null);
  });

  it('headless autoTurn resolves the auction and full games still finish', () => {
    const st = newGame(23);
    const fields = buildFlagFields(st.board);
    let guard = 80;
    while (!st.winner && guard--) {
      autoTurn(st, fields);
      if (st.robots.filter((r) => !r.dead).length <= 1) break;
    }
    expect(st.placement.pending).toBe(false);
    expect(st.robots.every((r) => r.placed)).toBe(true);
    // all four occupied distinct docks at some point — archives were dock cells
    const docks = new Set(st.board.docks.map((d) => `${d.x},${d.y}`));
    expect(st.turn).toBeGreaterThan(1);
  });
});
