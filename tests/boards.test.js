import { describe, it, expect } from 'vitest';
import { COURSES } from '../src/boards/index.js';
import { validateBoard, tileAt } from '../src/engine/board.js';
import { buildFlagFields } from '../src/engine/distance.js';

describe('courses', () => {
  for (const make of COURSES) {
    const b = make();
    describe(b.name, () => {
      it('passes structural validation', () => {
        expect(validateBoard(b)).toEqual([]);
      });
      it('every flag is reachable from every dock and from every other flag', () => {
        const fields = buildFlagFields(b);
        for (const field of fields) {
          for (const d of b.docks) {
            expect(field[d.y][d.x]).toBeLessThan(Infinity);
          }
          for (const f of b.flags) {
            expect(field[f.y][f.x]).toBeLessThan(Infinity);
          }
        }
      });
      it('has 2-4 flags and 4 docks', () => {
        expect(b.flags.length).toBeGreaterThanOrEqual(2);
        expect(b.flags.length).toBeLessThanOrEqual(4);
        expect(b.docks.length).toBe(4);
      });
      it('has repair and upgrade sites', () => {
        const floors = b.tiles.map((t) => t.floor);
        expect(floors).toContain('repair');
        expect(floors).toContain('upgrade');
      });
    });
  }

  it('across all courses: both pusher labels, both gear senses, both belt types, curves, multi-beam laser, pits', () => {
    const boards = COURSES.map((m) => m());
    const all = boards.flatMap((b) => b.tiles);
    const pusherRegs = all.filter((t) => t.pusher).map((t) => t.pusher.registers.join(','));
    expect(pusherRegs).toContain('1,3,5');
    expect(pusherRegs).toContain('2,4');
    const gears = all.filter((t) => t.gear).map((t) => t.gear);
    expect(gears).toContain('cw');
    expect(gears).toContain('ccw');
    const belts = all.filter((t) => t.belt);
    expect(belts.some((t) => t.belt.type === 'express')).toBe(true);
    expect(belts.some((t) => t.belt.type === 'normal')).toBe(true);
    expect(belts.some((t) => t.belt.turn === 'left')).toBe(true);
    expect(belts.some((t) => t.belt.turn === 'right')).toBe(true);
    const lasers = boards.flatMap((b) => b.lasers);
    expect(lasers.some((l) => l.count >= 2)).toBe(true);
    expect(lasers.some((l) => l.count === 1)).toBe(true);
    expect(all.some((t) => t.floor === 'pit')).toBe(true);
  });
});
