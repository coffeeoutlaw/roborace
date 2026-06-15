// "Laser Maze" — official classic board, transcribed from spacebug's 2005-style
// scan (.boardrefs/lasermaze.jpg). Twenty lasers (up to triple beams), a serpent
// belt that threads the beams straight into a pit, and three pushers.
import {
  makeBoard, setFloor, addWall, addLaser, addPusher, addBeltPath, setFlags, setDocks,
} from '../engine/board.js';

export function lasermaze() {
  const b = makeBoard({ name: 'Laser Maze', difficulty: 3, width: 12, height: 16 });
  b.blurb = 'Twenty lasers and one long, treacherous belt. Every shortcut is a firing lane.';

  // belts
  addBeltPath(b, 'normal', [
    [6, 11], [6, 10], [6, 9], [7, 9], [7, 8], [6, 8], [6, 7], [6, 6], [6, 5], [6, 4],
    [6, 3], [7, 3], [7, 2], [6, 2], [6, 1], [6, 0], [5, 0], [5, 1], // ends in the pit
  ]);
  addBeltPath(b, 'normal', [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [0, 5], [-1, 5]]);
  addBeltPath(b, 'normal', [[0, 1], [-1, 1]]);
  addBeltPath(b, 'normal', [[11, 1], [10, 1], [10, 0], [9, 0], [8, 0], [7, 0], [6, 0]]);
  addBeltPath(b, 'normal', [[11, 5], [10, 5], [10, 4], [11, 4]]); // dumps into the triple laser
  addBeltPath(b, 'normal', [[0, 6], [1, 6], [1, 7], [1, 8]]); // ends in the pit
  addBeltPath(b, 'normal', [[0, 10], [1, 10], [1, 11], [1, 12]]);
  addBeltPath(b, 'normal', [[5, 10], [5, 11], [5, 12]]);
  addBeltPath(b, 'normal', [
    [10, 11], [10, 10], [10, 9], [10, 8], [10, 7], [10, 6], [11, 6], [12, 6],
  ]);
  addBeltPath(b, 'normal', [[11, 10], [12, 10]]);

  // pits
  for (const [x, y] of [
    [5, 1], [11, 0], [9, 4], [1, 8], [4, 10], [4, 11], [9, 8], [7, 10], [7, 11],
  ]) setFloor(b, x, y, 'pit');

  setFloor(b, 3, 0, 'repair');
  setFloor(b, 11, 11, 'repair');
  setFloor(b, 5, 4, 'upgrade');
  setFloor(b, 7, 7, 'upgrade');

  // walls (laser blockers and baffles)
  for (const [x, y, d] of [
    [2, 1, 2], [2, 1, 3], [2, 2, 3], [3, 2, 0], [2, 4, 3],
    [4, 3, 2], [4, 4, 2], [7, 1, 2], [9, 1, 3], [8, 3, 2], [11, 4, 3],
    [8, 5, 0], [8, 5, 3], [2, 7, 3], [3, 7, 2], [4, 7, 2],
    [1, 9, 2], [3, 9, 2], [5, 8, 3], [2, 10, 3],
    [6, 6, 0], [10, 6, 3], [8, 6, 2],
  ]) addWall(b, x, y, d);

  // lasers: addLaser(x, y, wallDir, beams) — fires away from the wall
  addLaser(b, 2, 0, 0, 2);
  addLaser(b, 0, 2, 3, 1);
  addLaser(b, 0, 4, 3, 2);
  addLaser(b, 4, 3, 2, 2);
  addLaser(b, 4, 4, 0, 1);
  addLaser(b, 4, 5, 2, 2);
  addLaser(b, 7, 0, 0, 3);
  addLaser(b, 8, 1, 3, 2);
  addLaser(b, 10, 2, 3, 2);
  addLaser(b, 8, 3, 0, 2);
  addLaser(b, 11, 4, 1, 3);
  addLaser(b, 2, 6, 3, 1);
  addLaser(b, 2, 11, 2, 1); // the long column-2 beam
  addLaser(b, 1, 9, 0, 1);
  addLaser(b, 3, 9, 0, 1);
  addLaser(b, 5, 8, 1, 2);
  addLaser(b, 6, 7, 2, 1);
  addLaser(b, 9, 6, 3, 2);
  addLaser(b, 11, 7, 3, 1);
  addLaser(b, 8, 8, 2, 1);
  addLaser(b, 9, 9, 3, 1);

  // pushers (registers as printed)
  addPusher(b, 1, 1, 1, [2, 4]);
  addPusher(b, 10, 10, 3, [2, 4]);
  addPusher(b, 8, 11, 3, [1, 3, 5]);

  setFlags(b, [[9, 2], [2, 8], [11, 8]]);
  setDocks(b, [[1, 13], [4, 13], [7, 13], [10, 13]]);
  return b;
}
