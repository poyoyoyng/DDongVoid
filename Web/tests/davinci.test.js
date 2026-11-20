import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createRoom, expireRoom, roomView } from '../src/games.js';
import { insertSlots, joker, stepTime, tileColor, tileValue } from '../public/davinci.js';
import { roomPage } from '../public/views.js';
import { guide } from '../public/guide.js';

const players = ['민트', '고양이', '보라', '하늘', '노을'].map((name, index) => ({ id: String(index), name }));
const now = 1_000_000;
// A tile is number × 2 + color (0 black, 1 white); 24 and 25 are the jokers.
const B = value => value * 2;
const W = value => value * 2 + 1;
const hand = (...tiles) => tiles.map(tile => ({ tile, open: false, misses: [] }));

function table(count = 2) {
  const room = createRoom('room', 'davinci', '다빈치 한 판', players[0], now);
  const play = (index, input, at = now) => applyAction(room, players[index],
    { turn: room.turn, revision: room.revision, match: room.match, seatEpoch: room.seatEpoch, ...input }, at, () => 0);
  for (let index = 1; index < count; index++) play(index, { action: 'join' });
  for (let index = 0; index < count; index++) play(index, { action: 'ready', ready: true });
  assert.equal(room.status, 'playing');
  return { room, play };
}

// Replaces the dealt hands and the pile, with seat 0 about to start its turn.
function deal(room, hands, pile = { black: [], white: [] }) {
  hands.forEach((tiles, seat) => { room.players[seat].tiles = hand(...tiles); });
  room.pile = pile;
  Object.assign(room, { index: 0, drawn: null, slots: null, streak: 0, phase: pile.black.length || pile.white.length ? 'draw' : 'guess' });
}

test('2~3명은 4장, 4명은 3장씩 조커 없이 정렬해서 받고 조커는 더미에 들어간다', () => {
  for (const [count, size] of [[2, 4], [3, 4], [4, 3]]) {
    const { room } = table(count);
    const dealt = room.players.flatMap(player => player.tiles.map(entry => entry.tile));
    for (const player of room.players) {
      assert.equal(player.tiles.length, size);
      const tiles = player.tiles.map(entry => entry.tile);
      assert.deepEqual(tiles, [...tiles].sort((a, b) => a - b));
    }
    assert.ok(dealt.every(tile => tile < 24));
    assert.equal(room.pile.black.length + room.pile.white.length, 26 - count * size);
    assert.ok(room.pile.black.includes(24) && room.pile.white.includes(25));
    assert.ok(room.pile.black.every(tile => tileColor(tile) === 'black') && room.pile.white.every(tile => tileColor(tile) === 'white'));
    assert.equal(new Set([...dealt, ...room.pile.black, ...room.pile.white]).size, 26);
    assert.equal(room.phase, 'draw');
  }
});

test('숫자가 같으면 검은 패가 왼쪽이고, 조커는 아무 자리나, 조커 옆 숫자는 자리를 고른다', () => {
  assert.deepEqual(insertSlots(hand(B(1), W(3), B(7)), W(1)), [1]);
  assert.deepEqual(insertSlots(hand(W(1), W(3)), B(1)), [0]);
  assert.deepEqual(insertSlots(hand(B(1), W(3)), 24), [0, 1, 2]);
  assert.deepEqual(insertSlots(hand(B(1), 25, B(7)), W(4)), [1, 2]);
  assert.deepEqual(insertSlots(hand(24, 25), B(0)), [0, 1, 2]);
  assert.deepEqual(insertSlots(hand(B(1), 24), W(11)), [1, 2]);
  assert.equal(tileValue(25), joker);
});

test('상대의 숨긴 패는 색만 보이고, 내 패와 공개된 패는 숫자가 보인다', () => {
  const { room, play } = table(3);
  deal(room, [[B(1), W(5)], [B(2), W(8)], [W(0), B(9)]], { black: [B(4)], white: [] });
  room.players[1].tiles[0].open = true;
  play(0, { action: 'draw', color: 'black' });
  const mine = roomView(room, '0');
  assert.deepEqual(mine.players[0].tiles.map(entry => entry.tile), [B(1), B(4), W(5)]);
  assert.equal(mine.drawn, B(4));
  assert.deepEqual(mine.players[1].tiles.map(entry => [entry.color, entry.tile]), [['black', B(2)], ['white', undefined]]);
  assert.deepEqual(mine.pileCount, { black: 0, white: 0 });
  assert.equal(mine.pile, undefined);
  const other = roomView(room, '1');
  assert.equal(other.drawn, undefined);
  assert.deepEqual(other.players[0].tiles.map(entry => entry.tile), [undefined, undefined, undefined]);
  assert.equal(other.players[0].tiles[1].fresh, true);
  const spectator = roomView(room, 'nobody');
  assert.ok(spectator.players.every(player => player.tiles.every(entry => entry.open || entry.tile === undefined)));
});

test('틀리면 가져온 패가 공개되고 차례가 넘어간다', () => {
  const { room, play } = table(2);
  deal(room, [[B(1), W(5)], [B(2), W(8)]], { black: [B(6)], white: [W(10)] });
  assert.throws(() => play(1, { action: 'draw', color: 'black' }), /내 차례가 아닙니다/);
  assert.throws(() => play(0, { action: 'guess', target: 1, index: 0, value: 2 }), /추리할 때가 아닙니다/);
  play(0, { action: 'draw', color: 'white' });
  assert.equal(room.phase, 'guess');
  assert.throws(() => play(0, { action: 'guess', target: 0, index: 0, value: 1 }), /상대의 숨겨진 패/);
  assert.throws(() => play(0, { action: 'stop' }), /맞힌 뒤에/);
  play(0, { action: 'guess', target: 1, index: 1, value: 9 });
  assert.equal(room.players[0].tiles.find(entry => entry.tile === W(10)).open, true);
  assert.deepEqual(room.players[1].tiles[1].misses, [9]);
  assert.equal(room.index, 1);
  assert.equal(room.phase, 'draw');
  assert.ok(room.players[0].tiles.every(entry => !entry.fresh));
  assert.match(room.log.at(-2), /고양이님의 왼쪽에서 2번째 흰 패는 9\? · 틀림/);
});

test('맞히면 계속 추리하거나 멈출 수 있고, 멈추면 가져온 패는 숨긴 채로 남는다', () => {
  const { room, play } = table(3);
  deal(room, [[B(1), W(5)], [B(2), W(8), B(11)], [W(0), B(9)]], { black: [B(6)], white: [] });
  play(0, { action: 'draw', color: 'black' });
  play(0, { action: 'guess', target: 1, index: 1, value: 8 });
  assert.equal(room.players[1].tiles[1].open, true);
  assert.equal(room.streak, 1);
  assert.equal(room.index, 0);
  assert.equal(room.phase, 'guess');
  const stale = room.turn - 1;
  assert.throws(() => applyAction(room, players[0], { action: 'stop', turn: stale, match: room.match, seatEpoch: room.seatEpoch }, now), /방 상태가 바뀌었습니다/);
  play(0, { action: 'guess', target: 2, index: 0, value: 0 });
  assert.equal(room.streak, 2);
  play(0, { action: 'stop' });
  assert.equal(room.players[0].tiles.find(entry => entry.tile === B(6)).open, false);
  assert.equal(room.index, 1);
  assert.equal(room.phase, 'guess');
});

test('모든 패가 공개되면 탈락하고 마지막 한 명이 이긴다', () => {
  const { room, play } = table(3);
  deal(room, [[B(1), W(5)], [B(2)], [W(0), B(9)]]);
  room.players[2].tiles[0].open = true;
  play(0, { action: 'guess', target: 1, index: 0, value: 2 });
  assert.equal(room.players[1].out, true);
  assert.equal(room.status, 'playing');
  assert.throws(() => play(0, { action: 'guess', target: 1, index: 0, value: 2 }), /상대의 숨겨진 패/);
  play(0, { action: 'guess', target: 2, index: 1, value: 9 });
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.winners, ['0']);
  assert.deepEqual(room.players.map(player => player.place), [1, 3, 2]);
  assert.match(room.endReason, /민트님이 마지막까지/);
  const view = roomView(room, '1');
  assert.deepEqual(view.players[0].tiles.map(entry => entry.tile), [B(1), W(5)]);
  assert.match(roomPage(view, '1', { connected: true, held: [] }), /1위 · 승리/);
});

test('탈락한 사람은 차례를 건너뛴다', () => {
  const { room, play } = table(3);
  deal(room, [[B(1), W(5)], [B(2)], [W(0), B(9)]], { black: [B(6)], white: [] });
  play(0, { action: 'draw', color: 'black' });
  play(0, { action: 'guess', target: 1, index: 0, value: 2 });
  play(0, { action: 'guess', target: 2, index: 0, value: 3 });
  assert.equal(room.index, 2);
});

test('가져온 조커는 원하는 자리에 놓는다', () => {
  const { room, play } = table(2);
  deal(room, [[B(1), W(5)], [B(2), W(8)]], { black: [24], white: [] });
  play(0, { action: 'draw', color: 'black' });
  assert.equal(room.phase, 'place');
  assert.deepEqual(room.slots, [0, 1, 2]);
  assert.throws(() => play(0, { action: 'place', slot: 3 }), /놓을 자리/);
  const page = roomPage(roomView(room, '0'), '0', { connected: true, held: [] });
  assert.equal(page.match(/dv-gap/g).length, 3);
  play(0, { action: 'place', slot: 1 });
  assert.deepEqual(room.players[0].tiles.map(entry => entry.tile), [B(1), 24, W(5)]);
  assert.equal(room.phase, 'guess');
  play(0, { action: 'guess', target: 1, index: 0, value: joker });
  assert.deepEqual(room.players[1].tiles[0].misses, [joker]);
  assert.equal(room.players[0].tiles[1].open, true);
  assert.match(room.log.at(-1), /검은 조커 공개/);
});

test('더미가 비면 바로 추리하고, 틀리면 내 숨긴 패 하나를 골라 공개한다', () => {
  const { room, play } = table(2);
  deal(room, [[B(1), W(5)], [B(2), W(8)]]);
  assert.equal(room.phase, 'guess');
  play(0, { action: 'guess', target: 1, index: 0, value: 3 });
  assert.equal(room.phase, 'reveal');
  assert.equal(room.index, 0);
  assert.throws(() => play(0, { action: 'reveal', index: 7 }), /공개할 내 숨겨진 패/);
  play(0, { action: 'reveal', index: 1 });
  assert.equal(room.players[0].tiles[1].open, true);
  assert.equal(room.index, 1);
});

test('시간이 지나면 많은 쪽 패를 가져오고, 추리를 안 했으면 틀린 것으로, 맞힌 뒤면 멈춘 것으로 처리한다', () => {
  const { room, play } = table(2);
  deal(room, [[B(1), W(5)], [B(2), W(8)]], { black: [B(6)], white: [W(9), W(10)] });
  room.deadline = now + stepTime;
  assert.equal(expireRoom(room, now + stepTime - 1), false);
  assert.equal(expireRoom(room, now + stepTime), true);
  assert.equal(room.drawn, W(10));
  assert.equal(room.phase, 'guess');
  expireRoom(room, room.deadline);
  assert.equal(room.players[0].tiles.find(entry => entry.tile === W(10)).open, true);
  assert.equal(room.index, 1);
  play(1, { action: 'draw', color: 'black' });
  play(1, { action: 'guess', target: 0, index: 0, value: 1 }, room.deadline - 10);
  expireRoom(room, room.deadline);
  assert.equal(room.index, 0);
  assert.equal(room.players[1].tiles.find(entry => entry.tile === B(6)).open, false);
  assert.match(room.log.at(-1), /멈추고 차례 넘기기 \(시간 초과\)/);
});

test('공개 단계에서 시간이 지나면 가장 왼쪽 숨긴 패를 공개한다', () => {
  const { room, play } = table(2);
  deal(room, [[B(1), W(5)], [B(2), W(8)]]);
  play(0, { action: 'guess', target: 1, index: 0, value: 2 });
  play(0, { action: 'guess', target: 1, index: 1, value: 3 });
  assert.equal(room.phase, 'reveal');
  expireRoom(room, room.deadline);
  assert.equal(room.players[0].tiles[0].open, true);
  assert.equal(room.index, 1);
});

test('다빈치 코드 화면과 게임설명을 그린다', () => {
  const { room, play } = table(3);
  deal(room, [[B(1), W(5)], [B(2), W(8)], [W(0), B(9)]], { black: [B(6)], white: [W(3)] });
  const ui = { connected: true, held: [] };
  let page = roomPage(roomView(room, '0'), '0', ui);
  assert.match(page, /검은 패 가져오기/);
  assert.match(page, /3명 생존/);
  play(0, { action: 'draw', color: 'white' });
  page = roomPage(roomView(room, '0'), '0', ui);
  assert.equal(page.match(/data-dv-pick/g).length, 4);
  page = roomPage(roomView(room, '0'), '0', { ...ui, dvPick: { key: '1:1', turn: room.turn } });
  assert.match(page, /고양이님의 왼쪽에서 2번째 흰 패는\?/);
  assert.equal(page.match(/&quot;action&quot;:&quot;guess&quot;/g).length, 13);
  // A pick from an earlier step no longer opens the pad.
  assert.doesNotMatch(roomPage(roomView(room, '0'), '0', { ...ui, dvPick: { key: '1:1', turn: room.turn - 1 } }), /패는\?/);
  const watching = roomPage(roomView(room, '1'), '1', ui);
  assert.doesNotMatch(watching, /data-dv-pick/);
  assert.match(watching, /민트님이 추리하는 중/);
  assert.match(guide('davinci'), /다빈치 코드 쉽게 배우기/);
});

test('추리할 때마다 횟수와 정답 여부를 남겨 방 전체에 정답!/실패!를 띄울 수 있다', () => {
  const { room, play } = table(2);
  assert.equal(room.guesses, 0);
  deal(room, [[B(1), W(5)], [B(2), W(8)]], { black: [B(6)], white: [] });
  play(0, { action: 'draw', color: 'black' });
  play(0, { action: 'guess', target: 1, index: 0, value: 2 });
  assert.deepEqual([room.guesses, room.lastHit], [1, true]);
  play(0, { action: 'guess', target: 1, index: 1, value: 3 });
  assert.deepEqual([room.guesses, room.lastHit], [2, false]);
  assert.deepEqual([roomView(room, '1').guesses, roomView(room, '1').lastHit], [2, false]);
  // Running out of time is not a guess.
  play(1, { action: 'guess', target: 0, index: 0, value: 1 });
  expireRoom(room, room.deadline);
  assert.equal(room.guesses, 3);
});
