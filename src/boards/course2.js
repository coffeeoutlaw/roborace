// Course 2 — "Spin Cycle" (medium): a clockwise express ring dominates the floor;
// flags sit inside and outside it. Conveyor-heavy, 3 flags.
import {
  makeBoard, setFloor, addWall, addGear, addLaser, addPusher, addBeltPath,
  setFlags, setDocks,
} from '../engine/board.js';

export function course2() {
  const b = makeBoard({ name: 'Spin Cycle', difficulty: 2, width: 12, height: 16 });
  b.blurb = 'A clockwise express ring with curves at every corner. Get on, get around, get off.';

  // clockwise express ring (corners are curves; closing the loop fixes the start corner)
  addBeltPath(b, 'express', [
    [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3],
    [8, 4], [8, 5], [8, 6], [8, 7], [8, 8],
    [7, 8], [6, 8], [5, 8], [4, 8], [3, 8],
    [3, 7], [3, 6], [3, 5], [3, 4], [3, 3],
    [4, 3],
  ]);
  // on-ramps (normal belts feeding the ring)
  addBeltPath(b, 'normal', [[0, 5], [1, 5], [2, 5], [3, 5]]);
  addBeltPath(b, 'normal', [[11, 6], [10, 6], [9, 6], [8, 6]]);
  addBeltPath(b, 'normal', [[5, 11], [5, 10], [5, 9], [5, 8]]);
  // off-ramp toward flag 3 in the north
  addBeltPath(b, 'normal', [[6, 2], [6, 1]]);

  addGear(b, 2, 2, 'cw');
  addGear(b, 9, 2, 'ccw');
  addGear(b, 2, 9, 'ccw');
  addGear(b, 9, 9, 'cw');

  // pits inside the ring — the ring slings you past them
  setFloor(b, 5, 5, 'pit');
  setFloor(b, 6, 6, 'pit');
  // outer pit punishing a sloppy north approach
  setFloor(b, 0, 1, 'pit');

  setFloor(b, 0, 11, 'repair');
  setFloor(b, 11, 0, 'upgrade');
  setFloor(b, 11, 11, 'repair');

  addWall(b, 5, 0, 2);
  addWall(b, 6, 4, 3);
  addWall(b, 1, 8, 0);
  addWall(b, 10, 3, 3);
  addWall(b, 6, 1, 1); // shields flag 3's east side

  addLaser(b, 0, 2, 3, 1);   // fires east across row 2
  addLaser(b, 7, 11, 2, 1);  // fires north up column 7

  addPusher(b, 5, 0, 0, [1, 3, 5]); // pushes south into the ring approach
  addPusher(b, 6, 11, 2, [2, 4]);   // pushes north

  setFlags(b, [[10, 6], [1, 5], [6, 1]]);
  setDocks(b, [[1, 13], [4, 13], [7, 13], [10, 13]]);
  return b;
}
