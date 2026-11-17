// 사보타지 (Saboteur, AMIGO 2004): 3~10 dwarves dig from the start card toward three face-down goal cards; one hides the gold.
// Rules follow the base game as described on 나무위키 and Wikipedia; the board, cards and roles are shared by server and browser.
// One round decides the game (단판제); the original plays three.
export const rounds = 1;
export const turnTime = 60_000;
export const breakTime = 20_000;

export const tools = ['pick', 'lantern', 'cart'];
export const toolNames = { pick: '곡괭이', lantern: '랜턴', cart: '수레' };
export const roleNames = { digger: '광부', saboteur: '방해꾼' };

// Tunnel sides as bits. Path cards stand upright and may only be turned 180°.
export const N = 1, E = 2, S = 4, W = 8;
export const sides = [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]];
export const opposite = side => side <= 2 ? side * 4 : side / 4;
export const rotate = (open, rot) => rot ? ((open << 2) | (open >> 2)) & 15 : open;

// 40 path cards: 31 open tunnels and 9 dead ends whose stubs do not meet in the middle.
const pathSpecs = [
  [N | S, 4], [E | W, 3], [N | E, 4], [N | W, 5], [N | E | S, 5], [E | S | W, 5], [N | E | S | W, 5],
  ...[N, W, N | S, E | W, N | E, N | W, N | E | S, E | S | W, N | E | S | W].map(open => [open, 1, true]),
];
// 27 action cards: 9 broken tools, 9 repairs (3 of them fix either of two tools), 6 maps and 3 rockfalls.
const actionSpecs = [
  ...tools.map(tool => [{ type: 'break', tools: [tool] }, 3]),
  ...tools.map(tool => [{ type: 'fix', tools: [tool] }, 2]),
  [{ type: 'fix', tools: ['pick', 'lantern'] }, 1], [{ type: 'fix', tools: ['pick', 'cart'] }, 1], [{ type: 'fix', tools: ['lantern', 'cart'] }, 1],
  [{ type: 'map' }, 6], [{ type: 'rockfall' }, 3],
];
// A card in a hand or on the board is its index here.
export const cards = [
  ...pathSpecs.flatMap(([open, count, dead = false]) => Array.from({ length: count }, () => ({ type: 'path', open, dead }))),
  ...actionSpecs.flatMap(([card, count]) => Array.from({ length: count }, () => card)),
];

// [saboteurs, gold diggers]: one more role card than players, and the spare stays face down.
export const roleCounts = { 3: [1, 3], 4: [1, 4], 5: [2, 4], 6: [2, 5], 7: [3, 5], 8: [3, 6], 9: [3, 7], 10: [4, 7] };
export const handSize = count => count <= 5 ? 6 : count <= 7 ? 5 : 4;
export const saboteurReward = count => count === 1 ? 4 : count <= 3 ? 3 : 2;
export const goldCards = [...Array(16).fill(1), ...Array(8).fill(2), ...Array(4).fill(3)];

// The start card sits at 0,0; the goals stand 7 cards to its right, one card apart.
export const goalX = 8;
export const goalYs = [-2, 0, 2];
export const goalNames = ['위', '가운데', '아래'];
export const bounds = { left: -6, right: 14, top: -6, bottom: 6 };
export const goalFaces = ['gold', 'stone-up', 'stone-down'];
const goalOpen = { gold: N | E | S | W, 'stone-up': N | W, 'stone-down': S | W };
export const goalFaceName = face => face === 'gold' ? '금' : '돌';

const key = (x, y) => x + ',' + y;
const at = board => new Map(board.map(cell => [key(cell.x, cell.y), cell]));

// Open sides of a placed card; a face-down goal has none known yet (null).
export function shape(cell) {
  if (cell.kind === 'start') return { open: N | E | S | W, dead: false };
  if (cell.kind === 'goal') return cell.face ? { open: rotate(goalOpen[cell.face], cell.rot), dead: false } : null;
  const card = cards[cell.card];
  return { open: rotate(card.open, cell.rot), dead: card.dead };
}

// Every tunnel end ("x,y,side") an unbroken path from the start card reaches.
export function reachable(board) {
  const cells = at(board);
  const seen = new Set();
  const queue = [];
  const visit = (cell, side) => {
    const id = key(cell.x, cell.y) + ',' + side;
    if (!seen.has(id)) {
      seen.add(id);
      queue.push([cell, side]);
    }
  };
  const start = board.find(cell => cell.kind === 'start');
  for (const [side] of sides) visit(start, side);
  while (queue.length) {
    const [cell, side] = queue.pop();
    const { open, dead } = shape(cell);
    if (!dead) for (const [other] of sides) if (open & other) visit(cell, other);
    const [, dx, dy] = sides.find(([candidate]) => candidate === side);
    const next = cells.get(key(cell.x + dx, cell.y + dy));
    const nextShape = next && shape(next);
    if (nextShape && nextShape.open & opposite(side)) visit(next, opposite(side));
  }
  return seen;
}

const inBounds = (x, y) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;

// Where a path card may go: every touching side must match, and one tunnel must join the path from the start card.
// A face-down goal card may sit next to anything.
export function placements(board, card, rot) {
  const info = cards[card];
  if (info?.type !== 'path') return [];
  const cells = at(board);
  const live = reachable(board);
  const open = rotate(info.open, rot);
  const spots = new Map();
  for (const cell of board) {
    for (const [, dx, dy] of sides) spots.set(key(cell.x + dx, cell.y + dy), [cell.x + dx, cell.y + dy]);
  }
  const result = [];
  for (const [id, [x, y]] of spots) {
    if (cells.has(id) || !inBounds(x, y)) continue;
    let linked = false;
    let fits = true;
    for (const [side, dx, dy] of sides) {
      const next = cells.get(key(x + dx, y + dy));
      const nextShape = next && shape(next);
      if (!nextShape) continue;
      const theirs = Boolean(nextShape.open & opposite(side));
      if (theirs !== Boolean(open & side)) fits = false;
      if (theirs && live.has(key(next.x, next.y) + ',' + opposite(side))) linked = true;
    }
    if (fits && linked) result.push({ x, y });
  }
  return result;
}

export const canPlace = (board, card, rot, x, y) => placements(board, card, rot).some(spot => spot.x === x && spot.y === y);

// Face-down goals that a tunnel from the start card now touches, with the side it arrives on.
export function reachedGoals(board) {
  const cells = at(board);
  const live = reachable(board);
  const reached = [];
  for (const goal of board) {
    if (goal.kind !== 'goal' || goal.face) continue;
    for (const [side, dx, dy] of sides) {
      const next = cells.get(key(goal.x + dx, goal.y + dy));
      const nextShape = next && shape(next);
      if (nextShape && nextShape.open & opposite(side) && live.has(key(next.x, next.y) + ',' + opposite(side))) {
        reached.push({ goal, side });
        break;
      }
    }
  }
  return reached;
}

// A turned-over goal is turned so its tunnel meets the path that reached it.
export const goalRotation = (face, side) => goalOpen[face] & side ? 0 : 1;

const shapeNames = { 15: '십자 길', 7: '세 갈래 길', 14: '세 갈래 길', 5: '세로 길', 10: '가로 길', 3: '꺾인 길', 9: '꺾인 길', 1: '한쪽 길', 8: '한쪽 길' };

export function cardName(card) {
  const info = cards[card];
  if (!info) return '카드';
  if (info.type === 'path') return (info.dead ? '막다른 ' : '') + shapeNames[info.open];
  if (info.type === 'break') return toolNames[info.tools[0]] + ' 부수기';
  if (info.type === 'fix') return info.tools.map(tool => toolNames[tool]).join('·') + (info.tools.length > 1 ? ' 중 하나 고치기' : ' 고치기');
  return info.type === 'map' ? '지도' : '낙석';
}

export function cardHelp(card) {
  const info = cards[card];
  if (info.type === 'path') return info.dead ? '길이 가운데에서 막혀 있어요. 붙은 길은 이어지지만 지나갈 수 없어요.' : '맞닿는 길이 모두 맞도록 이어 놓아요. 180° 돌릴 수 있어요.';
  if (info.type === 'break') return `다른 사람의 ${toolNames[info.tools[0]]}를 부숴요. 도구가 하나라도 부서지면 길 카드를 못 내요.`;
  if (info.type === 'fix') return `나 또는 다른 사람의 부서진 ${info.tools.map(tool => toolNames[tool]).join(' 또는 ')}를 고쳐요.`;
  if (info.type === 'map') return '목적지 카드 한 장을 나만 몰래 봐요.';
  return '시작·목적지 카드를 뺀 길 카드 한 장을 무너뜨려 치워요.';
}
