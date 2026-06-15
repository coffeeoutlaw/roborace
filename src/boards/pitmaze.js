// "Pit Maze" — official classic board, transcribed from spacebug's 2005-style
// scan (.boardrefs/pitmaze.jpg). Two dozen pits, serpentine belts threading the
// gaps, a closed belt loop, and a guarded laser corridor down column 6.
import {
  makeBoard, setFloor, addWall, addLaser, addBeltPath, setFlags, setDocks,
} from '../engine/board.js';

export function pitmaze() {
  const b = makeBoard({ name: 'Pit Maze', difficulty: 3, width: 12, height: 16 });
  b.blurb = 'Two dozen pits and belts that thread the needle. One wrong Move 3 and it’s over.';

  // belts
  addBeltPath(b, 'normal', [
    [5, 0], [5, 1], [5, 2], [4, 2], [4, 3], [4, 4], [3, 4], [3, 5], [2, 5], [1, 5], [0, 5], [-1, 5],
  ]);
  addBeltPath(b, 'normal', [
    [10, 10], [9, 10], [9, 9], [9, 8], [9, 7], [8, 7], [8, 6], [8, 5], [7, 5],
    [7, 4], [7, 3], [7, 2], [7, 1], [7, 0], [6, 0], [6, -1],
  ]);
  addBeltPath(b, 'normal', [[11, 1], [10, 1], [10, 0], [10, -1]]);
  addBeltPath(b, 'normal', [[11, 5], [10, 5], [10, 4], [9, 4], [9, 3], [9, 2], [10, 2], [10, 1]]);
  // closed counter-clockwise loop in the south-west
  addBeltPath(b, 'normal', [
    [6, 9], [5, 9], [4, 9], [4, 10], [4, 11], [5, 11], [6, 11], [6, 10], [6, 9], [5, 9],
  ]);
  addBeltPath(b, 'normal', [[0, 10], [1, 10], [1, 11], [1, 12]]);
  addBeltPath(b, 'normal', [[11, 6], [12, 6]]);

  // pits — the maze itself
  for (const [x, y] of [
    [0, 0], [3, 1], [1, 3], [3, 3], [6, 1], [9, 1], [11, 0], [10, 3], [8, 4], [9, 5],
    [2, 6], [2, 8], [4, 8], [2, 10], [3, 10], [0, 11], [5, 10],
    [6, 6], [9, 6], [6, 8], [8, 8], [10, 8], [7, 10], [10, 11],
  ]) setFloor(b, x, y, 'pit');

  setFloor(b, 2, 2, 'repair');
  setFloor(b, 11, 11, 'repair');
  setFloor(b, 5, 5, 'upgrade');
  setFloor(b, 8, 3, 'upgrade');
  setFloor(b, 5, 8, 'upgrade');

  for (const [x, y, d] of [
    [2, 1, 3], [0, 2, 3], [0, 4, 3], [4, 2, 0], [8, 2, 0], [8, 2, 3], [11, 2, 0],
    [0, 7, 0], [0, 7, 3], [1, 7, 0], [1, 7, 1],
    [0, 9, 0], [0, 9, 3], [1, 9, 0], [1, 9, 1],
    [3, 6, 2], [5, 6, 1], [7, 6, 2], [6, 8, 2],
  ]) addWall(b, x, y, d);

  addLaser(b, 6, 3, 0, 1); // upper corridor segment, firing south
  addLaser(b, 6, 6, 0, 1); // lower corridor segment, firing south into the pits

  setFlags(b, [[4, 6], [10, 7], [2, 4]]);
  setDocks(b, [[1, 13], [4, 13], [7, 13], [10, 13]]);
  return b;
}
