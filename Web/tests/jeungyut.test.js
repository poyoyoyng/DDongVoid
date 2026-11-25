import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createRoom, isRoomGame, roomView } from '../src/games.js';
import { home, roomPage } from '../public/views.js';
import { guide } from '../public/guide.js';
import { botAction, position } from '../public/jeung-yut/engine.mjs';

const accounts = Array.from({ length: 5 }, (_, seat) => ({ id: `u${seat}`, name: `플레이어 ${seat + 1}` }));
function match(count) {
  let seed = 127;
  const roll = maximum => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 0x100000000 * maximum); };
  const room = createRoom('12345678-1234-1234-1234-123456789abc', 'jeungyut', '증윷 테스트', accounts[0], 1000);
  const play = (seat, input) => applyAction(room, accounts[seat], {
    match: room.match, seatEpoch: room.seatEpoch, gameRevision: room.yut?.revision, ...input,
  }, 1000, roll);
  for (let i = 1; i < count; i++) play(i, { action: 'join' });
  for (let i = 0; i < count; i++) play(i, { action: 'ready', ready: true });
  return { room, play, roll };
}

for (const count of [2, 3, 4]) test(`기존 대기방의 ${count}인 증윷: 준비·차례·완주·승자 연동`, () => {
  assert.equal(isRoomGame('jeungyut'), true);
  const { room, play } = match(count);
  assert.equal(room.status, 'playing');
  assert.equal(room.yut.players.length, count);
  let actions = 0;
  while (room.status === 'playing' && actions++ < 2500) {
    const move = botAction(room.yut, () => .8);
    play(room.index, { action: 'yut', move });
    assert.equal(room.index, room.yut.active);
    assert.equal(room.turn, room.yut.round);
  }
  assert.ok(actions < 2500);
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.winners, [room.players[room.yut.winner].id]);
  assert.equal(room.endReason, room.yut.winReason);
  for (let i = 0; i < count; i++) play(i, { action: 'ready', ready: true });
  assert.equal(room.status, 'playing');
  assert.equal(room.match, 2);
  assert.ok(room.yut.players.every(p => p.augments.length === 0));
});

test('증윷은 상대 차례·관전자 조작·이전 판의 중복 요청을 거부한다', () => {
  const { room, play } = match(4);
  const active = room.index;
  play(4, { action: 'watch' });
  assert.throws(() => play(4, { action: 'yut', move: { type: 'roll' } }), /참가자/);
  assert.throws(() => play((active + 1) % 4, { action: 'yut', move: { type: 'roll' } }), /내 차례/);
  const revision = room.yut.revision;
  play(active, { action: 'yut', move: { type: 'roll' } });
  assert.throws(() => play(room.index, { action: 'yut', gameRevision: revision, move: { type: 'roll' } }), /판이 바뀌/);
});

test('증윷도 기존 빈자리 대기·자리 승계·관전을 사용한다', () => {
  const { room, play } = match(3);
  const active = room.index, old = structuredClone(room.yut);
  play(active, { action: 'spectate' });
  assert.equal(roomView(room, accounts[4].id).paused, true);
  assert.throws(() => play((active + 1) % 3, { action: 'yut', move: { type: 'roll' } }), /빈 자리/);
  play(4, { action: 'join' });
  assert.equal(roomView(room, accounts[4].id).paused, false);
  const view = roomView(room, accounts[4].id);
  assert.equal(view.yut.players[active].name, accounts[4].name);
  assert.deepEqual(view.yut.players[active].tokens, old.players[active].tokens);
  assert.equal(room.substituted, true);
});

test('웹 게임 목록·게임설명·방 화면에서 실제 증윷 게임판으로 이동한다', () => {
  const { room } = match(2);
  assert.match(home(), /#lobby\/jeungyut/);
  const explanation = guide('jeungyut');
  for (const name of ['증윷', '도파민장아찌', '어쩌라고아줌마', '반찬맨', '드래그 알까기']) assert.ok(explanation.includes(name));
  assert.match(roomPage(roomView(room, accounts[0].id), accounts[0].id, {}), /jeung-yut\/index\.html\?room=/);
});

test('운영 방에서도 드래그 알까기 빗나감은 발사한 말을 대기로 보낸다', () => {
  const { room, play } = match(2);
  const active = room.index;
  room.yut.players[active].tokens[0].path = ['o1'];
  room.yut.players[1 - active].tokens[0].path = ['o4'];
  room.yut.phase = 'flick';
  play(active, { action: 'yut', move: { type: 'flick', token: 0, pullX: -90, pullY: 0 } });
  assert.equal(position(room.yut.players[active].tokens[0]), 'home');
  assert.equal(position(room.yut.players[1 - active].tokens[0]), 'o4');
  assert.equal(room.yut.flick.outcome, 'miss');
});
