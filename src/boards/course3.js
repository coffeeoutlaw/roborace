// Course 3 — "The Gauntlet" (hard): a pit belt across the middle with two guarded
// gaps, a triple-beam laser corridor, express highway, 4 flags.
import {
  makeBoard, setFloor, addWall, addGear, addLaser, addPusher, addBeltPath,
  setFlags, setDocks,
} from '../engine/board.js';

export function course3() {
  const b = makeBoard({ name: 'The Gauntlet', difficulty: 3, width: 12, height: 16 });
  b.blurb = 'A wall of pits with two guarded gaps, then a triple-beam laser corridor. Good luck.';

  // pit wall across row 6 with gaps at x=3 and x=8
  for (const x of [0, 1, 2, 4, 5, 6, 7, 9, 10, 11]) setFloor(b, x, 6, 'pit');
  // pushers guarding the gaps, shoving crossers toward the pits on registers 2/4
  addPusher(b, 3, 5, 0, [2, 4]);  // north wall of the north gap cell, pushes S
  addPusher(b, 8, 7, 2, [2, 4]);  // south wall of the south gap cell, pushes N
  // extra pits scattered north
  setFloor(b, 5, 2, 'pit');
  setFloor(b, 0, 4, 'pit');

  // express highway up the middle to the pit gap at x=3... runs x=3 from y=10 to y=7
  addBeltPath(b, 'express', [[3, 10], [3, 9], [3, 8], [3, 7]]);
  // northern belt slide along row 1 (eastbound) with a curve dropping to flag 2
  addBeltPath(b, 'normal', [[2, 1], [3, 1], [4, 1], [4, 2]]);
  // southern curve feeding the highway
  addBeltPath(b, 'normal', [[1, 10], [2, 10], [3, 10]]);
  // eastern descent past the laser corridor
  addBeltPath(b, 'normal', [[10, 3], [10, 4], [10, 5]]);

  addGear(b, 6, 9, 'cw');
  addGear(b, 8, 3, 'ccw');
  addGear(b, 1, 7, 'ccw');

  // the laser corridor: triple-beam firing west across row 3, walls funnel you through it
  addLaser(b, 11, 3, 1, 3);
  addWall(b, 6, 2, 2);
  addWall(b, 7, 2, 2);
  addWall(b, 6, 4, 0);
  addWall(b, 7, 4, 0);
  // single-beam lasers
  addLaser(b, 0, 8, 3, 1);  // fires east across row 8
  addLaser(b, 5, 11, 2, 1); // fires north up column 5

  addWall(b, 3, 6, 3);  // keeps the north-gap crossing honest
  addWall(b, 8, 6, 1);
  addWall(b, 2, 3, 0);
  addWall(b, 9, 9, 3);

  setFloor(b, 11, 7, 'repair');
  setFloor(b, 0, 9, 'repair');
  setFloor(b, 6, 0, 'upgrade');

  setFlags(b, [[3, 4], [4, 2], [9, 1], [1, 9]]);
  setDocks(b, [[1, 13], [4, 13], [7, 13], [10, 13]]);
  return b;
}
