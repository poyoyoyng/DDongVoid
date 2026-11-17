import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createRoom, expireRoom, roomView } from '../src/games.js';
import { games, legalCard, yachtScore, yachtTotal } from '../public/rules.js';
import { applySoloInput, makeSolo, replayScore, stepSolo } from '../public/solo-model.js';
import { roomPage } from '../public/views.js';

const players = ['민트', '고양이', '보라'].map((name, index) => ({ id: String(index), name }));
const now = 500_000;

function match(game, count = 2) {
  const room = createRoom('room', game, '테스트', players[0], now);
  const play = (index, input, roll = () => 3) => applyAction(
    room, players[index], { turn: room.turn, revision: room.revision, match: room.match, seatEpoch: room.seatEpoch, ...input }, now, roll);
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

test('차오차오는 순서 없이 응답하고 먼저 들어온 의심으로 판정한다', () => {
  const { room, play } = match('ciao', 3);
  play(0, { action: 'roll' }, () => 2);
  play(0, { action: 'declare', number: 4 });
  const revision = room.revision;
  play(2, { action: 'doubt', revision });
  assert.match(room.last, /보라 의심 성공/);
  assert.throws(() => play(1, { action: 'doubt', revision }), /이미 응답했거나/);
  play(1, { action: 'roll' });
  play(1, { action: 'declare', number: 2 });
  play(0, { action: 'pass' });
  assert.equal(room.phase, 'respond');
  play(2, { action: 'pass' });
  assert.equal(room.phase, 'roll');
  assert.match(room.last, /모두 PASS/);
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
  assert.throws(() => play(0, { action: 'call' }), /방금 누군가/);
  assert.throws(() => play(1, { action: 'call' }), /방금 누군가/);
});

test('원카드 버튼은 누군가 누른 뒤 0.5초 동안 아무도 누를 수 없다', () => {
  const { room } = match('onecard');
  const call = (index, at) => applyAction(room, players[index], { action: 'call', match: room.match, seatEpoch: room.seatEpoch }, at);
  call(0, now);
  assert.throws(() => call(1, now + 499), /방금 누군가/);
  call(1, now + 500);
  assert.throws(() => call(1, now + 1_200), /1초/);
  call(0, now + 1_200);
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

test('네 대전 게임에서 관전자와 참가자가 경기 중 같은 자리를 이어받는다', () => {
  for (const game of ['slap', 'ciao', 'onecard', 'yacht']) {
    const { room, play } = match(game);
    if (game === 'slap') play(0, { action: 'choose', move: 'charge' });
    if (game === 'ciao') play(0, { action: 'roll' });
    if (game === 'yacht') play(0, { action: 'roll', held: Array(5).fill(false) });
    if (game === 'onecard') room.uncalled = ['0'];
    const originalSeat = structuredClone(room.players[0]);
    const phase = { index: room.index, turn: room.turn, die: room.die, dice: room.dice };

    play(2, { action: 'watch' });
    const publicView = roomView(room, '2');
    assert.equal(publicView.players[0].hand, undefined);
    assert.equal(publicView.players[0].choice, undefined);
    assert.equal(publicView.die, undefined);
    assert.match(roomPage(publicView, '2', { held: Array(5).fill(false), card: null }), /관전자 1명/);
    assert.throws(() => play(2, { action: 'ready', ready: true }), /참가자/);

    assert.throws(() => play(2, { action: 'join' }), /빈 참가 자리/);
    play(0, { action: 'spectate' });
    assert.equal(roomView(room, '0').paused, true);
    assert.equal(roomView(room, '2').players[0].previousPlayerId, undefined);
    assert.throws(() => play(1, { action: 'roll' }), /빈 자리에 참가자가/);
    play(2, { action: 'join' });

    assert.deepEqual(room.players[0], { ...originalSeat, ...players[2] });
    assert.deepEqual(room.spectators, [players[0]]);
    assert.deepEqual({ index: room.index, turn: room.turn, die: room.die, dice: room.dice }, phase);
    assert.equal(room.hostId, '0');
    assert.equal(room.substituted, true);
    assert.equal(roomView(room, '2').paused, false);
    assert.equal(roomView(room, '0').players[0].hand, undefined);
    assert.deepEqual(roomView(room, '2').players[0].hand, originalSeat.hand);
    if (game === 'onecard') assert.deepEqual(room.uncalled, ['2']);
    if (game === 'ciao') {
      assert.equal(roomView(room, '0').die, undefined);
      assert.equal(roomView(room, '2').die, phase.die);
    }
    if (game === 'yacht') {
      const page = roomPage(roomView(room, '2'), '2', { held: Array(5).fill(false), card: null });
      assert.equal(room.rollCount, 1);
      assert.equal((page.match(/data-roll-face/g) ?? []).length, 5);
      assert.match(page, /yacht-versus/);
      assert.match(page, /상단 소계/);
      assert.match(page, /하단<\/th>/);
    }
  }
});

test('차오차오 응답 시간은 빈자리에서 멈추고 채워지면 남은 시간부터 이어진다', () => {
  const { room, play } = match('ciao');
  play(0, { action: 'roll' });
  play(0, { action: 'declare', number: 3 });
  applyAction(room, players[1], { action: 'spectate' }, now + 8000);
  assert.equal(room.deadline, null);
  assert.equal(expireRoom(room, now + 25000), false);
  applyAction(room, players[1], { action: 'join' }, now + 25000);
  assert.equal(room.deadline, now + 37000);
  assert.equal(room.substituted, false);
  assert.equal(expireRoom(room, now + 37000), true);
});

test('관전자는 대기 중 빈 자리에 앉거나 관전석으로 돌아갈 수 있다', () => {
  const room = createRoom('room', 'yacht', '테스트', players[0], now);
  applyAction(room, players[1], { action: 'watch' }, now);
  applyAction(room, players[0], { action: 'spectate' }, now);
  assert.deepEqual(room.players, []);
  assert.equal(room.status, 'waiting');
  applyAction(room, players[1], { action: 'join' }, now);
  assert.deepEqual(room.players.map(player => player.id), ['1']);
  applyAction(room, players[0], { action: 'leave' }, now);
  assert.equal(room.hostId, '1');
  applyAction(room, players[1], { action: 'leave' }, now);
  assert.equal(room.status, 'deleted');
});

test('방장은 시작 전 참가자만 강퇴할 수 있고 강퇴된 사람도 다시 들어올 수 있다', () => {
  const room = createRoom('room', 'onecard', '테스트', players[0], now);
  applyAction(room, players[1], { action: 'join' }, now);
  applyAction(room, players[2], { action: 'watch' }, now);
  applyAction(room, players[1], { action: 'ready', ready: true }, now);
  assert.throws(() => applyAction(room, players[1], { action: 'kick', target: '0' }, now), /방장만/);
  assert.throws(() => applyAction(room, players[0], { action: 'kick', target: '2' }, now), /찾을 수 없습니다/);
  assert.throws(() => applyAction(room, players[0], { action: 'kick', target: '0' }, now), /찾을 수 없습니다/);
  const host = roomPage(roomView(room, '0'), '0', { connected: true, held: [] });
  assert.match(host, /data-action="[^"]*kick[^"]*1/);
  assert.doesNotMatch(roomPage(roomView(room, '1'), '1', { connected: true, held: [] }), /kick-button/);
  applyAction(room, players[0], { action: 'kick', target: '1' }, now);
  assert.deepEqual(room.players.map(player => player.id), ['0']);
  assert.deepEqual(room.spectators.map(spectator => spectator.id), ['2']);
  applyAction(room, players[1], { action: 'watch' }, now);
  applyAction(room, players[1], { action: 'join' }, now);
  assert.deepEqual(room.players.map(player => player.id), ['0', '1']);
  applyAction(room, players[0], { action: 'kick', target: '1' }, now);
  applyAction(room, players[2], { action: 'join' }, now);
  applyAction(room, players[0], { action: 'ready', ready: true }, now);
  applyAction(room, players[2], { action: 'ready', ready: true }, now);
  assert.equal(room.status, 'playing');
  assert.throws(() => applyAction(room, players[0], { action: 'kick', target: '2' }, now), /경기 중/);
  assert.doesNotMatch(roomPage(roomView(room, '0'), '0', { connected: true, held: [] }), /kick-button/);
});

test('포요용은 입장하지 않은 방도 삭제할 수 있고 다른 사람은 방장만 삭제할 수 있다', () => {
  const room = createRoom('room', 'slap', '테스트', players[0], now);
  applyAction(room, players[1], { action: 'join' }, now);
  assert.throws(() => applyAction(room, players[2], { action: 'delete' }, now), /방장만/);
  applyAction(room, { id: 'admin', name: '포요용' }, { action: 'delete' }, now);
  assert.equal(room.status, 'deleted');
  assert.deepEqual(room.players, []);
});

test('모든 게임에 게임설명이 있다', async () => {
  const { guide } = await import('../public/guide.js');
  for (const game of Object.keys(games)) {
    const page = guide(game);
    assert.ok(!page.includes('설명을 준비하고 있어요'), game + ' 설명 누락');
    assert.ok(page.includes(`href="#${games[game].max === 1 ? 'play' : 'lobby'}/${game}"`), game + ' 바로가기 오류');
  }
});
