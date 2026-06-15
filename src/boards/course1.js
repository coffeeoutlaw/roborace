// Course 1 — "Proving Grounds" (easy intro): one belt river, a feeder curve, light
// hazards, 2 flags. 12x12 factory floor + 4-row docking bay (y 12..15).
import {
  makeBoard, setFloor, addWall, addGear, addLaser, addPusher, addBeltPath,
  setFlags, setDocks,
} from '../engine/board.js';

export function course1() {
  const b = makeBoard({ name: 'Proving Grounds', difficulty: 1, width: 12, height: 16 });
  b.blurb = 'A gentle first factory: ride the river east, mind the laser, two flags.';

  // belt river flowing east across the middle
  addBeltPath(b, 'normal', [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7]]);
  // feeder belt curving into an eastbound run on row 5
  addBeltPath(b, 'normal', [[1, 2], [1, 3], [1, 4], [2, 4], [3, 4]]);
  // short express taxi toward flag 1
  addBeltPath(b, 'express', [[9, 5], [9, 4], [9, 3]]);

  addGear(b, 3, 2, 'cw');
  addGear(b, 8, 9, 'ccw');

  setFloor(b, 6, 4, 'pit');
  setFloor(b, 2, 9, 'repair');
  setFloor(b, 9, 9, 'repair');
  setFloor(b, 6, 10, 'upgrade');

  // walls making little chokepoints (dir: 0=N 1=E 2=S 3=W)
  addWall(b, 5, 2, 1);
  addWall(b, 6, 2, 1);
  addWall(b, 2, 6, 0);
  addWall(b, 9, 6, 0);
  addWall(b, 4, 10, 1);
  addWall(b, 9, 2, 2); // shields flag 1 from the south

  // one single-beam laser across row 5 (mounted east wall of (11,5), firing west)
  addLaser(b, 11, 5, 1, 1);
  // one pusher, active on registers 1/3/5 (mounted west wall of (0,9), pushing east)
  addPusher(b, 0, 9, 3, [1, 3, 5]);

  setFlags(b, [[9, 2], [2, 3]]);
  setDocks(b, [[1, 13], [4, 13], [7, 13], [10, 13]]);
  return b;
}
