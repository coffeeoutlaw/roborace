// "Cross" — official classic board, transcribed from spacebug's 2016 reskin
// (.boardrefs/cross.jpg). A 5-tile plus-shaped pit cluster at center with four
// conveyor runs circulating around it; lasers guard two corridors.
import {
  makeBoard, setFloor, addWall, addLaser, addBeltPath, setFlags, setDocks,
} from '../engine/board.js';

export function cross() {
  const b = makeBoard({ name: 'Cross', difficulty: 2, width: 12, height: 16 });
  b.blurb = 'The classic crossroads: belts whirl around a plus-shaped pit. Don’t get carried away.';

  // belts (all normal speed on this board)
  addBeltPath(b, 'normal', [[1, 0], [1, 1], [0, 1], [-1, 1]]);
  addBeltPath(b, 'normal', [
    [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [4, 4], [4, 5], [3, 5], [2, 5], [1, 5], [0, 5], [-1, 5],
  ]);
  addBeltPath(b, 'normal', [
    [11, 1], [10, 1], [10, 2], [10, 3], [10, 4], [10, 5], [9, 5], [8, 5], [7, 5], [6, 5],
    [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], [6, -1],
  ]);
  addBeltPath(b, 'normal', [[0, 6], [1, 6]]); // west-edge feeder into the staircase
  addBeltPath(b, 'normal', [
    [0, 10], [1, 10], [1, 9], [1, 8], [1, 7], [1, 6], [2, 6], [3, 6], [3, 7], [4, 7],
    [4, 8], [5, 8], [5, 9], [5, 10], [5, 11], [5, 12],
  ]);
  addBeltPath(b, 'normal', [
    [6, 11], [6, 10], [6, 9], [6, 8], [6, 7], [7, 7], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6],
  ]);
  addBeltPath(b, 'normal', [[10, 11], [10, 10], [11, 10], [12, 10]]);

  // pits: the central plus + scattered hazards
  for (const [x, y] of [
    [5, 5], [4, 6], [5, 6], [6, 6], [5, 7],
    [2, 2], [8, 2], [4, 9], [4, 10], [10, 9], [11, 11],
  ]) setFloor(b, x, y, 'pit');

  // repair pads (energy spaces on the 2016 art; one promoted to an upgrade site)
  for (const [x, y] of [[0, 0], [3, 9], [9, 11]]) setFloor(b, x, y, 'repair');
  setFloor(b, 7, 2, 'upgrade');

  // walls — board-edge baffles (dir: 0=N 1=E 2=S 3=W)
  for (const [x, y, d] of [
    [2, 0, 0], [4, 0, 0], [7, 0, 0], [9, 0, 0],
    [0, 2, 3], [0, 4, 3], [0, 7, 3], [0, 9, 3],
    [11, 2, 1], [11, 4, 1], [11, 7, 1], [11, 9, 1],
    [2, 11, 2], [4, 11, 2], [9, 11, 2],
  ]) addWall(b, x, y, d);
  // interior walls and L-baffles
  for (const [x, y, d] of [
    [1, 3, 1], [4, 2, 1], [7, 1, 3], [8, 3, 0],
    [3, 4, 1], [3, 4, 2], [7, 4, 3], [7, 4, 2],
    [3, 10, 0], [3, 10, 1], [8, 7, 3], [8, 7, 2],
    [7, 11, 0], [7, 11, 3], [9, 9, 0],
  ]) addWall(b, x, y, d);

  // lasers
  addLaser(b, 3, 3, 1, 2); // double beam firing west along row 3
  addLaser(b, 8, 4, 2, 1); // firing north up column 8
  addLaser(b, 2, 7, 1, 1); // firing west along row 7
  addLaser(b, 8, 9, 2, 1); // firing north up column 8 (lower)

  setFlags(b, [[3, 2], [9, 9], [2, 8]]);
  setDocks(b, [[1, 13], [4, 13], [7, 13], [10, 13]]);
  return b;
}
