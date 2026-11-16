import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createRoom, expireRoom, roomView } from '../src/games.js';
import { legalCard, yachtScore, yachtTotal } from '../public/rules.js';
import { applySoloInput, makeSolo, replayScore, stepSolo } from '../public/solo-model.js';

const players = ['민트', '고양이', '보라'].map((name, index) => ({ id: String(index), name }));
const now = 500_000;

function match(game, count = 2) {
  const room = createRoom('room', game, '테스트', players[0], now);
  const play = (index, input, roll = () => 3) => applyAction(
    room, players[index], { turn: room.turn, revision: room.revision, match: room.match, ...input }, now, roll);
  for (let index = 1; index < count; index++) play(index, { action: 'join' });
  for (let index = 0; index < count; index++) play(index, { action: 'ready', ready: true });
  assert.equal(room.status, 'playing');
  return { room, play };
}

test('맞짱은 상대 선택을 감추고 막힌 공격의 기도 소모한다', () => {
  const { room, play } = match('slap');
  room.players[0].gauge = 3;
  play(0, { action: 'choose', move: 'slap', zone: 0, power: 2 });
  assert.equal(roomView(room, players[1].id).players[0].choice, undefined);
  assert.equal(roomView(room, players[1].id).players[0].submitted, true);
  play(1, { action: 'choose', move: 'block', zone: 0 });
  assert.equal(room.last.blocked, true);
  assert.equal(room.players[0].gauge, 0);
  assert.equal(room.players[1].hp, 6);
  assert.equal(room.index, 1);
  play(0, { action: 'giveup', value: true });
  assert.throws(() => play(1, { action: 'choose', move: 'charge' }), /포기 요청/);
  play(1, { action: 'giveup', value: true });
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.winners, []);
});

test('차오차오 비공개 주사위, 동시 응답과 자동 PASS', () => {
  const { room, play } = match('ciao', 3);
  play(0, { action: 'roll' }, () => 5);
  assert.equal(roomView(room, '0').die, 0);
  assert.equal(roomView(room, '1').die, undefined);
  play(0, { action: 'declare', number: 4 });
  const revision = room.revision;
  play(1, { action: 'pass', revision });
  play(2, { action: 'doubt', revision });
  assert.equal(room.players[0].fallen, 1);
  assert.equal(room.players[2].position, 4);
  play(1, { action: 'roll' });
  play(1, { action: 'declare', number: 3 });
  assert.equal(expireRoom(room, now + 19_999), false);
  assert.equal(expireRoom(room, now + 20_000), true);
  assert.equal(room.players[1].position, 3);
  assert.match(room.last, /자동 PASS/);
});

test('원카드 덱과 상대 패를 감추고 선언, 누적 공격, 무늬 선택을 판정한다', () => {
  const { room, play } = match('onecard');
  assert.equal(new Set([...room.deck, ...room.discard, ...room.players.flatMap(player => player.hand)]).size, 54);
  assert.equal(roomView(room, '0').players[1].hand, undefined);
  assert.equal(roomView(room, '0').discard, undefined);
  assert.equal(roomView(room, '0').deck, undefined);
  assert.equal(legalCard(2, 1, 0, 2), true);
  assert.equal(legalCard(15, 1, 0, 2), false);
  assert.equal(legalCard(52, 53, null, 7), false);
  room.discard = [3];
  room.activeSuit = 0;
  room.players[0].hand = [6, 7];
  const choice = { action: 'play', card: 6, suit: 1 };
  play(0, choice);
  assert.equal(room.activeSuit, 1);
  assert.equal(room.uncalled[0], '0');
  play(1, { action: 'call' });
  assert.equal(room.players[0].hand.length, 2);
  assert.throws(() => play(1, { action: 'call' }), /1초/);
});

test('야추 고정 주사위, 족보와 상단 보너스를 계산한다', () => {
  const { room, play } = match('yacht');
  assert.equal(yachtScore(8, [6, 6, 6, 6, 6]), 30);
  assert.equal(yachtScore(9, [5, 4, 3, 2, 2]), 15);
  assert.equal(yachtScore(10, [6, 5, 4, 3, 2]), 30);
  assert.equal(yachtTotal([3, 6, 9, 12, 15, 18, 50]), 148);
  play(0, { action: 'roll', held: Array(5).fill(false) }, () => 5);
  play(0, { action: 'roll', held: [true, false, true, false, true] }, () => 2);
  assert.deepEqual(room.dice, [6, 3, 6, 3, 6]);
  play(0, { action: 'score', category: 8 });
  assert.equal(room.players[0].scores[8], 24);
  assert.equal(room.index, 1);
  assert.equal(room.rollsUsed, 0);
  assert.throws(() => play(0, { action: 'roll', held: Array(5).fill(false) }), /내 차례/);
});

test('싱글 게임 기록은 브라우저 입력 재생 결과와 일치해야 한다', () => {
  const dodge = makeSolo(1234);
  const events = [[0, 1], [50, 0]];
  while (!dodge.over) {
    const event = events.find(item => item[0] === dodge.tick);
    if (event) applySoloInput(dodge, event[1]);
    stepSolo(dodge);
  }
  assert.equal(replayScore(1234, dodge.tick, events), dodge.score);
  assert.equal(replayScore(1234, dodge.tick + 1, events), null);
  assert.equal(replayScore(1234, dodge.tick, [[0, 4]]), null);
});
