// BFS distance fields used by the AI: walls respected, pits impassable.
import { DX, DY, tileAt, inBounds, hasWall } from './board.js';

export function distanceField(board, target) {
  const dist = Array.from({ length: board.height }, () => new Array(board.width).fill(Infinity));
  const queue = [[target.x, target.y]];
  dist[target.y][target.x] = 0;
  let head = 0;
  while (head < queue.length) {
    const [x, y] = queue[head++];
    for (let d = 0; d < 4; d++) {
      if (hasWall(board, x, y, d)) continue;
      const nx = x + DX[d], ny = y + DY[d];
      if (!inBounds(board, nx, ny)) continue;
      if (tileAt(board, nx, ny).floor === 'pit') continue;
      if (dist[ny][nx] <= dist[y][x] + 1) continue;
      dist[ny][nx] = dist[y][x] + 1;
      queue.push([nx, ny]);
    }
  }
  return dist;
}

export function buildFlagFields(board) {
  return board.flags.map((f) => distanceField(board, f));
}
