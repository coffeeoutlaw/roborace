// "Exchange" — official classic board, transcribed from spacebug's 2016 reskin
// (.boardrefs/exchange.jpg). Express lines trade cargo with normal belts via
// five gears; light hazards, heavy logistics.
import {
  makeBoard, setFloor, addWall, addGear, addLaser, addBeltPath, setFlags, setDocks,
} from '../engine/board.js';

export function exchange() {
  const b = makeBoard({ name: 'Exchange', difficulty: 2, width: 12, height: 16 });
  b.blurb = 'A freight yard of crossing belts and express lines. Ride them right and fly.';

  // normal belts
  addBeltPath(b, 'normal', [[1, 0], [1, 1]]);
  addBeltPath(b, 'normal', [[0, 1], [-1, 1]]);
  addBeltPath(b, 'normal', [[3, 2], [3, 1], [3, 0], [3, -1]]);
  addBeltPath(b, 'normal', [[0, 3], [1, 3], [2, 3], [3, 3]]);
  addBeltPath(b, 'normal', [[5, 1], [5, 2], [5, 3], [5, 4], [5, 5]]);
  addBeltPath(b, 'normal', [[8, 0], [8, 1], [8, 2], [8, 3]]);
  addBeltPath(b, 'normal', [[9, 3], [10, 3], [11, 3], [12, 3]]);
  addBeltPath(b, 'normal', [[10, 5], [9, 5], [8, 5], [7, 5], [6, 5]]);
  addBeltPath(b, 'normal', [[0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6]]);
  addBeltPath(b, 'normal', [[3, 11], [3, 10], [3, 9], [3, 8], [3, 7]]);
  addBeltPath(b, 'normal', [[5, 7], [5, 8], [5, 9], [5, 10], [5, 11]]);
  addBeltPath(b, 'normal', [[0, 10], [1, 10]]);
  addBeltPath(b, 'normal', [[1, 11], [1, 12]]);
  addBeltPath(b, 'normal', [[7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6]]);
  addBeltPath(b, 'normal', [[6, 11], [6, 10], [6, 9], [6, 8], [6, 7], [6, 6]]);
  addBeltPath(b, 'normal', [[11, 8], [10, 8], [9, 8], [8, 8]]);
  addBeltPath(b, 'normal', [[8, 9], [8, 10], [8, 11], [8, 12]]);
  addBeltPath(b, 'normal', [[11, 10], [12, 10]]);

  // express lines
  addBeltPath(b, 'express', [[5, 5], [4, 5], [3, 5], [2, 5], [1, 5], [0, 5], [-1, 5]]);
  addBeltPath(b, 'express', [[6, 4], [6, 3], [6, 2], [6, 1], [6, 0], [6, -1]]);
  addBeltPath(b, 'express', [[2, 8], [1, 8], [0, 8], [-1, 8]]);

  addGear(b, 1, 1, 'ccw');
  addGear(b, 3, 3, 'cw');
  addGear(b, 8, 3, 'cw');
  addGear(b, 1, 10, 'ccw');
  addGear(b, 8, 8, 'cw');

  setFloor(b, 11, 1, 'pit');
  setFloor(b, 9, 10, 'pit');
  setFloor(b, 0, 0, 'repair');
  setFloor(b, 11, 11, 'repair');
  setFloor(b, 4, 4, 'upgrade');

  for (const [x, y, d] of [
    [2, 0, 0], [4, 0, 0], [9, 0, 0], [10, 1, 0],
    [0, 2, 3], [0, 4, 3], [1, 2, 2], [11, 2, 1], [11, 4, 1],
    [7, 4, 3], [7, 4, 2], [0, 7, 3], [4, 7, 0], [4, 7, 1],
    [2, 9, 1], [2, 11, 2], [4, 11, 2],
    [7, 7, 0], [7, 7, 3], [11, 7, 1], [11, 9, 1], [7, 11, 2], [9, 11, 2],
  ]) addWall(b, x, y, d);

  addLaser(b, 0, 9, 3, 1); // fires east along row 9

  setFlags(b, [[9, 7], [2, 7], [10, 2]]);
  setDocks(b, [[1, 13], [4, 13], [7, 13], [10, 13]]);
  return b;
}
