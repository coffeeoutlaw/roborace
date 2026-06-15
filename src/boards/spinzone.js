// "Spin Zone" — official classic board, transcribed from spacebug's 2016 reskin
// (.boardrefs/spinzone.jpg). Four clockwise express-belt rings, gears everywhere
// (counter-clockwise inside the rings, clockwise outside), four short lasers.
import {
  makeBoard, setFloor, addWall, addGear, addLaser, addBeltPath, setFlags, setDocks,
} from '../engine/board.js';

const ring = (b, x0, y0) => addBeltPath(b, 'express', [
  [x0, y0], [x0 + 1, y0], [x0 + 2, y0], [x0 + 3, y0],
  [x0 + 3, y0 + 1], [x0 + 3, y0 + 2], [x0 + 3, y0 + 3],
  [x0 + 2, y0 + 3], [x0 + 1, y0 + 3], [x0, y0 + 3],
  [x0, y0 + 2], [x0, y0 + 1], [x0, y0], [x0 + 1, y0], // close the loop
]);

export function spinzone() {
  const b = makeBoard({ name: 'Spin Zone', difficulty: 3, width: 12, height: 16 });
  b.blurb = 'Four express merry-go-rounds and sixteen gears. Plan two turns ahead or spin forever.';

  ring(b, 1, 1);
  ring(b, 7, 1);
  ring(b, 1, 7);
  ring(b, 7, 7);

  // gears: ccw inside the rings, cw scattered outside
  for (const [x, y] of [[2, 2], [3, 3], [8, 2], [9, 3], [2, 8], [3, 9], [8, 8], [9, 9]]) {
    addGear(b, x, y, 'ccw');
  }
  for (const [x, y] of [[5, 2], [4, 5], [6, 4], [9, 5], [2, 6], [5, 7], [7, 6], [6, 9]]) {
    addGear(b, x, y, 'cw');
  }

  // energy pads from the 2016 art; one promoted to an upgrade site
  for (const [x, y] of [[2, 3], [8, 3], [9, 8]]) setFloor(b, x, y, 'repair');
  setFloor(b, 3, 8, 'upgrade');

  for (const [x, y, d] of [
    [2, 0, 0], [4, 0, 0], [7, 0, 0], [9, 0, 0],
    [0, 2, 3], [0, 4, 3], [0, 7, 3], [0, 9, 3],
    [11, 2, 1], [11, 4, 1], [11, 7, 1], [11, 9, 1],
    [2, 11, 2], [4, 11, 2], [7, 11, 2], [9, 11, 2],
    [3, 2, 2], [5, 3, 3], [6, 8, 1], [8, 8, 2], // laser blockers
  ]) addWall(b, x, y, d);

  addLaser(b, 5, 3, 1, 1); // 1-tile beam firing west
  addLaser(b, 3, 6, 2, 1); // firing north up column 3
  addLaser(b, 8, 5, 0, 1); // firing south down column 8
  addLaser(b, 6, 8, 3, 1); // 1-tile beam firing east

  setFlags(b, [[5, 5], [1, 5], [10, 6]]);
  setDocks(b, [[1, 13], [4, 13], [7, 13], [10, 13]]);
  return b;
}
