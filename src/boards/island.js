// "Island" — official classic board, transcribed from spacebug's 2016 reskin
// (.boardrefs/island.jpg). Pit clusters in every corner and a moated center
// island; belt rivers shuttle robots between six gears.
import {
  makeBoard, setFloor, addWall, addGear, addBeltPath, setFlags, setDocks,
} from '../engine/board.js';

export function island() {
  const b = makeBoard({ name: 'Island', difficulty: 2, width: 12, height: 16 });
  b.blurb = 'A moated island, corner pit fields, and gear-to-gear belt rivers. Flag 1 is the island.';

  // belts
  addBeltPath(b, 'normal', [[3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2]]); // into the pit
  addBeltPath(b, 'normal', [[7, 3], [6, 3]]); // feeder beside the NE gear
  addBeltPath(b, 'normal', [[6, 5], [6, 4], [6, 3], [5, 3], [4, 3], [3, 3]]);
  addBeltPath(b, 'normal', [[2, 8], [2, 7], [2, 6], [2, 5], [2, 4], [2, 3], [2, 2]]);
  addBeltPath(b, 'normal', [[3, 4], [3, 5], [3, 6], [3, 7], [3, 8]]);
  addBeltPath(b, 'normal', [[8, 7], [8, 6], [8, 5], [8, 4], [8, 3]]);
  addBeltPath(b, 'normal', [[9, 3], [9, 4], [9, 5], [9, 6], [9, 7], [9, 8], [9, 9], [9, 10]]); // into the pit
  addBeltPath(b, 'normal', [[4, 8], [5, 8]]); // feeder beside the SW gear
  addBeltPath(b, 'normal', [[5, 6], [5, 7], [5, 8], [6, 8], [7, 8], [8, 8]]);
  addBeltPath(b, 'normal', [[8, 9], [7, 9], [6, 9], [5, 9], [4, 9], [3, 9], [2, 9]]);

  // gears
  addGear(b, 2, 2, 'ccw');
  addGear(b, 3, 3, 'cw');
  addGear(b, 8, 3, 'cw');
  addGear(b, 3, 8, 'cw');
  addGear(b, 8, 8, 'cw');
  addGear(b, 2, 9, 'ccw');

  // pits — corner clusters + the island moat
  for (const [x, y] of [
    [1, 1], [2, 1], [1, 2], [9, 1], [10, 1], [10, 2],
    [4, 4], [5, 4], [4, 5], [7, 6], [6, 7], [7, 7],
    [1, 9], [1, 10], [2, 10], [10, 9], [9, 10], [10, 10],
  ]) setFloor(b, x, y, 'pit');

  // energy pads from the 2016 art; the island center is promoted to an upgrade site
  for (const [x, y] of [[0, 0], [9, 11]]) setFloor(b, x, y, 'repair');
  setFloor(b, 5, 5, 'upgrade');

  // walls
  for (const [x, y, d] of [
    [2, 0, 0], [4, 0, 0], [7, 0, 0], [9, 0, 0],
    [0, 2, 3], [0, 4, 3], [0, 7, 3], [0, 9, 3],
    [11, 2, 1], [11, 4, 1], [11, 7, 1], [11, 9, 1],
    [2, 11, 2], [4, 11, 2], [7, 11, 2], [9, 11, 2],
    [6, 2, 2], [2, 6, 1], [9, 6, 3],
  ]) addWall(b, x, y, d);

  setFlags(b, [[6, 6], [1, 7], [10, 4]]);
  setDocks(b, [[1, 13], [4, 13], [7, 13], [10, 13]]);
  return b;
}
