// Renju (RIF) rules on a 15 × 15 board. Black moves first and only an unbroken five wins for Black;
// double-three, double-four and overline are forbidden to Black. White has no restrictions and also wins with an overline.
export const size = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const columns = 'ABCDEFGHIJKLMNO';
export const pointName = index => columns[index % size] + (size - Math.floor(index / size));

const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
const depthLimit = 6;
const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
const at = (board, x, y) => inside(x, y) ? board[y * size + x] : -1;

// Length of the unbroken run of `color` through (x, y) along one direction.
function run(board, x, y, dx, dy, color) {
  let count = 1;
  for (let step = 1; at(board, x + dx * step, y + dy * step) === color; step++) count++;
  for (let step = 1; at(board, x - dx * step, y - dy * step) === color; step++) count++;
  return count;
}

// Offsets of the empty points on this line that would turn Black's run through (x, y) into exactly five.
function fivePoints(board, x, y, dx, dy) {
  const points = [];
  for (let step = -4; step <= 4; step++) {
    const px = x + dx * step;
    const py = y + dy * step;
    if (at(board, px, py) !== EMPTY) continue;
    board[py * size + px] = BLACK;
    if (run(board, x, y, dx, dy, BLACK) === 5) points.push(step);
    board[py * size + px] = EMPTY;
  }
  return points;
}

// A straight four has two ends that both make five; otherwise each point that makes five is its own four.
function fours(board, x, y, dx, dy) {
  const points = fivePoints(board, x, y, dx, dy);
  return points.length === 2 && points[1] - points[0] === 5 ? 1 : Math.min(points.length, 2);
}

const straightFour = (board, x, y, dx, dy) => {
  const points = fivePoints(board, x, y, dx, dy);
  return points.length === 2 && points[1] - points[0] === 5;
};

// A real three can become a straight four with one more black stone that Black is allowed to play.
function three(board, x, y, dx, dy, depth) {
  for (let step = -4; step <= 4; step++) {
    const px = x + dx * step;
    const py = y + dy * step;
    if (at(board, px, py) !== EMPTY) continue;
    board[py * size + px] = BLACK;
    const real = straightFour(board, x, y, dx, dy) && !forbiddenAfter(board, px, py, depth + 1);
    board[py * size + px] = EMPTY;
    if (real) return true;
  }
  return false;
}

// Reason the black stone just placed at (x, y) is forbidden, or null. Making five always wins.
function forbiddenAfter(board, x, y, depth = 0) {
  if (depth > depthLimit) return null;
  const lengths = directions.map(([dx, dy]) => run(board, x, y, dx, dy, BLACK));
  if (lengths.includes(5)) return null;
  if (lengths.some(length => length > 5)) return '장목';
  let fourCount = 0;
  let threeCount = 0;
  for (const [dx, dy] of directions) {
    const found = fours(board, x, y, dx, dy);
    fourCount += found;
    if (!found && three(board, x, y, dx, dy, depth)) threeCount++;
  }
  if (fourCount >= 2) return '4-4';
  if (threeCount >= 2) return '3-3';
  return null;
}

export function forbiddenReason(board, index) {
  if (board[index] !== EMPTY) return null;
  const work = [...board];
  work[index] = BLACK;
  return forbiddenAfter(work, index % size, Math.floor(index / size));
}

// The winning row through the stone at `index`, or null: exactly five for Black, five or more for White.
export function winningLine(board, index) {
  const color = board[index];
  if (color !== BLACK && color !== WHITE) return null;
  const x = index % size;
  const y = Math.floor(index / size);
  for (const [dx, dy] of directions) {
    const length = run(board, x, y, dx, dy, color);
    if (color === BLACK ? length !== 5 : length < 5) continue;
    let start = 0;
    while (at(board, x - dx * (start + 1), y - dy * (start + 1)) === color) start++;
    return Array.from({ length }, (_, step) => (y - dy * start + dy * step) * size + x - dx * start + dx * step);
  }
  return null;
}
