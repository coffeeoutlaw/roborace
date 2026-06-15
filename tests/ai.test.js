import { describe, it, expect } from 'vitest';
import { COURSES } from '../src/boards/index.js';
import { createGame, startTurn, programRobot, isLocked, robotById } from '../src/engine/engine.js';
import { buildFlagFields } from '../src/engine/distance.js';
import { chooseProgram } from '../src/engine/ai.js';
import { runHeadlessGame, DEFAULT_ROSTER } from '../src/engine/headless.js';

describe('AI', () => {
  it('produces a legal program quickly', () => {
    const board = COURSES[0]();
    const state = createGame({ board, seed: 3, roster: DEFAULT_ROSTER });
    const fields = buildFlagFields(board);
    startTurn(state);
    const t0 = performance.now();
    const cards = chooseProgram(state, 'crusher', fields);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(1000);
    expect(cards.length).toBe(5);
    // legal: all cards from hand, no duplicates
    const hand = robotById(state, 'crusher').hand;
    const ps = new Set(cards.map((c) => c.priority));
    expect(ps.size).toBe(5);
    for (const c of cards) expect(hand.some((h) => h.priority === c.priority)).toBe(true);
    expect(() => programRobot(state, 'crusher', cards)).not.toThrow();
  });

  it('handles locked registers (damaged robot programs fewer cards)', () => {
    const board = COURSES[0]();
    const state = createGame({ board, seed: 5, roster: DEFAULT_ROSTER });
    const fields = buildFlagFields(board);
    robotById(state, 'turbo').damage = 6; // registers 4,5 locked
    startTurn(state);
    const cards = chooseProgram(state, 'turbo', fields);
    expect(cards.length).toBe(3);
    expect(() => programRobot(state, 'turbo', cards)).not.toThrow();
  });

  it('AI-only games on every course produce a winner within 80 turns', () => {
    for (let ci = 0; ci < COURSES.length; ci++) {
      const result = runHeadlessGame(COURSES[ci](), 11 + ci, 80);
      expect(result.winner, `course ${ci + 1} seed ${11 + ci}`).toBeTruthy();
    }
  }, 60000);

  it('is deterministic for a fixed seed', () => {
    const a = runHeadlessGame(COURSES[0](), 42, 80);
    const b = runHeadlessGame(COURSES[0](), 42, 80);
    expect(a.winner).toBe(b.winner);
    expect(a.turns).toBe(b.turns);
  });
});
