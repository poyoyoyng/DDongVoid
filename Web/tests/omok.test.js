import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createRoom } from '../src/games.js';
import { BLACK, WHITE, forbiddenReason, pointName, size, winningLine } from '../public/omok.js';

const at = (x, y) => y * size + x;

function board(black = [], white = []) {
  const cells = Array(size * size).fill(0);
  for (const [x, y] of black) cells[at(x, y)] = BLACK;
  for (const [x, y] of white) cells[at(x, y)] = WHITE;
  return cells;
}

test('point names follow the renju board labels', () => {
  assert.equal(pointName(at(7, 7)), 'H8');
  assert.equal(pointName(at(0, 0)), 'A15');
});

test('two open threes are a forbidden double-three', () => {
  assert.equal(forbiddenReason(board([[7, 5], [7, 6], [5, 7], [6, 7]]), at(7, 7)), '3-3');
});

test('two fours are a forbidden double-four, also on one line', () => {
  assert.equal(forbiddenReason(board([[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]]), at(7, 7)), '4-4');
  assert.equal(forbiddenReason(board([[1, 7], [3, 7], [5, 7], [7, 7]]), at(4, 7)), '4-4');
});

test('six or more in a row is a forbidden overline for black', () => {
  assert.equal(forbiddenReason(board([[2, 7], [3, 7], [4, 7], [6, 7], [7, 7]]), at(5, 7)), '장목');
});

test('four-three is allowed', () => {
  assert.equal(forbiddenReason(board([[4, 7], [5, 7], [6, 7], [7, 5], [7, 6]]), at(7, 7)), null);
});

test('a three that cannot become a straight four does not count', () => {
  assert.equal(forbiddenReason(board([[7, 5], [7, 6], [5, 7], [6, 7]], [[4, 7]]), at(7, 7)), null);
});

test('making five wins even when it also makes forbidden shapes', () => {
  const cells = board([[3, 7], [4, 7], [5, 7], [6, 7], [7, 5], [7, 6], [8, 8], [9, 9]]);
  assert.equal(forbiddenReason(cells, at(7, 7)), null);
  cells[at(7, 7)] = BLACK;
  assert.deepEqual(winningLine(cells, at(7, 7)), [at(3, 7), at(4, 7), at(5, 7), at(6, 7), at(7, 7)]);
});

test('white wins with an overline, black does not', () => {
  const black = board([[2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7]]);
  assert.equal(winningLine(black, at(4, 7)), null);
  const white = board([], [[2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7]]);
  assert.equal(winningLine(white, at(4, 7)).length, 6);
});

const players = ['민트', '고양이'].map((name, index) => ({ id: String(index), name }));

function omokMatch() {
  const room = createRoom('room', 'omok', '오목 한 판', players[0], 0);
  const play = (index, input) => applyAction(room, players[index],
    { turn: room.turn, revision: room.revision, match: room.match, seatEpoch: room.seatEpoch, ...input }, 0);
  const ready = () => players.forEach((_, index) => play(index, { action: 'ready', ready: true }));
  play(1, { action: 'join' });
  ready();
  return { room, play, ready };
}

test('black moves first and the colors swap every match', () => {
  const { room, play, ready } = omokMatch();
  assert.equal(room.blackSeat, 0);
  assert.equal(room.index, 0);
  assert.throws(() => play(1, { action: 'place', x: 7, y: 7 }), /내 차례가 아닙니다/);
  play(0, { action: 'place', x: 7, y: 7 });
  assert.equal(room.board[at(7, 7)], BLACK);
  play(1, { action: 'resign' });
  assert.deepEqual(room.winners, ['0']);
  ready();
  assert.equal(room.blackSeat, 1);
  assert.equal(room.index, 1);
  assert.ok(room.board.every(stone => !stone));
});

test('black cannot play a forbidden point and five in a row wins', () => {
  const { room, play } = omokMatch();
  const moves = [[[7, 5], [0, 0]], [[7, 6], [0, 2]], [[5, 7], [0, 4]], [[6, 7], [0, 6]]];
  for (const [black, white] of moves) {
    play(0, { action: 'place', x: black[0], y: black[1] });
    play(1, { action: 'place', x: white[0], y: white[1] });
  }
  assert.throws(() => play(0, { action: 'place', x: 7, y: 7 }), /3-3 금수/);
  play(0, { action: 'place', x: 7, y: 4 });
  play(1, { action: 'place', x: 0, y: 8 });
  play(0, { action: 'place', x: 7, y: 3 });
  play(1, { action: 'place', x: 0, y: 10 });
  play(0, { action: 'place', x: 7, y: 7 });
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.winners, ['0']);
  assert.match(room.endReason, /오목 완성/);
});
