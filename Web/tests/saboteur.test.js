import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createRoom, expireRoom, roomView } from '../src/games.js';
import {
  E, N, S, W, cards, handSize, placements, saboteurCounts, turnTime,
} from '../public/saboteur.js';
import { roomPage } from '../public/views.js';
import { guide } from '../public/guide.js';

const players = ['민트', '고양이', '보라', '하늘', '노을'].map((name, index) => ({ id: String(index), name }));
const now = 1_000_000;
const find = (match, from = 0) => cards.findIndex((card, index) => index >= from && match(card));
const straight = find(card => card.type === 'path' && !card.dead && card.open === (E | W));
const cross = find(card => card.type === 'path' && !card.dead && card.open === 15);
const vertical = find(card => card.type === 'path' && !card.dead && card.open === (N | S));
const deadStraight = find(card => card.type === 'path' && card.dead && card.open === (E | W));
const breakPick = find(card => card.type === 'break' && card.tools[0] === 'pick');
const fixPickLantern = find(card => card.type === 'fix' && card.tools.length === 2 && card.tools.includes('pick') && card.tools.includes('lantern'));
const map = find(card => card.type === 'map');
const rockfall = find(card => card.type === 'rockfall');

function table(count = 3) {
  const room = createRoom('room', 'saboteur', '사보타지 한 판', players[0], now);
  const play = (index, input, at = now) => applyAction(room, players[index],
    { turn: room.turn, revision: room.revision, match: room.match, seatEpoch: room.seatEpoch, ...input }, at, () => 0);
  for (let index = 1; index < count; index++) play(index, { action: 'join' });
  for (let index = 0; index < count; index++) play(index, { action: 'ready', ready: true });
  assert.equal(room.status, 'playing');
  return { room, play };
}

// A straight tunnel from the start card up to the column before the goals.
const tunnelTo = (room, last) => {
  for (let x = 1; x <= last; x++) room.board.push({ x, y: 0, kind: 'path', card: straight, rot: 0 });
};

test('카드 구성은 길 40장(막다른 길 9장), 행동 27장이다', () => {
  const paths = cards.filter(card => card.type === 'path');
  assert.equal(paths.length, 40);
  assert.equal(paths.filter(card => card.dead).length, 9);
  const actions = cards.filter(card => card.type !== 'path');
  assert.equal(actions.length, 27);
  const count = (type, size) => actions.filter(card => card.type === type && (!size || card.tools.length === size)).length;
  assert.deepEqual([count('break'), count('fix', 1), count('fix', 2), count('map'), count('rockfall')], [9, 6, 3, 6, 3]);
});

test('방해꾼은 규칙대로 3·4명 1, 5·6명 2, 7~9명 3, 10명 4명이고 손패는 6·5·4장이다', () => {
  assert.deepEqual([3, 4, 5, 6, 7, 8, 9, 10].map(count => saboteurCounts[count]), [1, 1, 2, 2, 3, 3, 3, 4]);
  assert.deepEqual([3, 5, 6, 7, 8, 10].map(handSize), [6, 6, 5, 5, 4, 4]);
});

test('2명으로는 시작하지 않고 3명이 모두 준비하면 역할과 손패를 나눈다', () => {
  const room = createRoom('room', 'saboteur', '두 명', players[0], now);
  applyAction(room, players[1], { action: 'join' }, now);
  applyAction(room, players[0], { action: 'ready', ready: true }, now);
  applyAction(room, players[1], { action: 'ready', ready: true }, now);
  assert.equal(room.status, 'waiting');
  const { room: started } = table(3);
  assert.ok(started.players.every(player => player.hand.length === 6));
  assert.deepEqual(started.players.map(player => player.role).sort(), ['digger', 'digger', 'saboteur'], '3명이면 언제나 광부 2명, 방해꾼 1명');
  assert.equal(started.deck.length, cards.length - 18);
  assert.equal(started.board.length, 4);
});

test('길은 맞닿는 변이 모두 맞고 시작 카드와 이어져야 하며, 막다른 길은 지나갈 수 없다', () => {
  const { room } = table();
  const at = spots => spots.map(({ x, y }) => x + ',' + y);
  assert.ok(at(placements(room.board, straight, 0)).includes('1,0'));
  assert.ok(!at(placements(room.board, vertical, 0)).includes('1,0'), '세로 길의 벽은 시작 카드의 길과 맞지 않는다');
  assert.ok(at(placements(room.board, vertical, 0)).includes('0,1'));
  room.board.push({ x: 1, y: 0, kind: 'path', card: deadStraight, rot: 0 });
  assert.ok(!at(placements(room.board, cross, 0)).includes('2,0'), '막다른 길 너머로는 이어지지 않는다');
});

test('광산은 세로 5줄이고 시작 카드가 왼쪽 끝이다', () => {
  const { room } = table();
  assert.ok(!placements(room.board, cross, 0).some(({ x }) => x < 0), '시작 카드 왼쪽에는 놓을 수 없다');
  room.board.push({ x: 0, y: 1, kind: 'path', card: cross, rot: 0 }, { x: 0, y: 2, kind: 'path', card: cross, rot: 0 });
  room.board.push({ x: 0, y: -1, kind: 'path', card: cross, rot: 0 }, { x: 0, y: -2, kind: 'path', card: cross, rot: 0 });
  const spots = placements(room.board, cross, 0);
  assert.ok(spots.some(({ y }) => y === 2) && spots.every(({ x, y }) => x >= 0 && y >= -2 && y <= 2), '맨 위·아래 줄 바깥에는 놓을 수 없다');
});

test('길이 금에 닿으면 바로 끝나고 광부 팀 모두 이기며, 방해꾼이 이어도 광부 팀이 이긴다', () => {
  for (const finder of [0, 2]) {
    const { room, play } = table();
    room.goals = ['stone-up', 'gold', 'stone-down'];
    room.players.forEach((player, seat) => { player.role = seat === 2 ? 'saboteur' : 'digger'; });
    tunnelTo(room, 6);
    room.index = finder;
    room.players[finder].hand[0] = straight;
    play(finder, { action: 'path', card: straight, x: 7, y: 0, rot: 0 });
    assert.equal(room.status, 'finished');
    assert.equal(room.result.winner, 'digger');
    assert.equal(room.board.find(cell => cell.kind === 'goal' && cell.goal === 1).face, 'gold');
    assert.deepEqual(room.winners, ['0', '1']);
    const view = roomView(room, '1');
    assert.equal(view.players[2].role, 'saboteur', '게임이 끝나면 역할을 공개한다');
    assert.deepEqual(view.goals, room.goals);
  }
});

test('돌 목적지는 뒤집혀 길에 맞게 놓이고 게임은 계속된다', () => {
  const { room, play } = table();
  room.goals = ['gold', 'stone-up', 'stone-down'];
  tunnelTo(room, 6);
  room.players[0].hand[0] = straight;
  play(0, { action: 'path', card: straight, x: 7, y: 0, rot: 0 });
  const goal = room.board.find(cell => cell.kind === 'goal' && cell.goal === 1);
  assert.equal(goal.face, 'stone-up');
  assert.equal(goal.rot, 0, '왼쪽으로 열린 돌은 그대로 놓는다');
  assert.equal(room.phase, 'play');
  assert.equal(room.index, 1);
  assert.equal(room.players[0].hand.length, 6, '쓴 만큼 한 장을 뽑는다');
});

test('부서진 도구가 있으면 길 카드를 못 내고, 같은 도구는 또 부술 수 없으며, 복합 카드는 하나만 고친다', () => {
  const { room, play } = table();
  room.players[0].hand[0] = breakPick;
  play(0, { action: 'break', card: breakPick, target: 1 });
  assert.deepEqual(room.players[1].broken, ['pick']);
  room.players[1].hand[0] = straight;
  assert.throws(() => play(1, { action: 'path', card: straight, x: 1, y: 0, rot: 0 }), /부서진 도구/);
  room.players[1].hand[1] = breakPick;
  room.players[2].broken = ['pick'];
  assert.throws(() => play(1, { action: 'break', card: breakPick, target: 2 }), /이미 부서져/);
  assert.throws(() => play(1, { action: 'break', card: breakPick, target: 1 }), /다른 사람/);
  room.players[1].hand[1] = fixPickLantern;
  room.players[1].broken = ['pick', 'lantern'];
  play(1, { action: 'fix', card: fixPickLantern, target: 1, tool: 'lantern' });
  assert.deepEqual(room.players[1].broken, ['pick']);
});

test('지도로 본 목적지는 나만 알고, 낙석은 길 카드만 치운다', () => {
  const { room, play } = table();
  room.goals = ['stone-down', 'stone-up', 'gold'];
  room.players[0].hand[0] = map;
  play(0, { action: 'map', card: map, goal: 2 });
  assert.deepEqual(roomView(room, '0').players[0].peeks, { 2: 'gold' });
  assert.equal(roomView(room, '1').players[0].peeks, undefined);
  assert.equal(roomView(room, '1').goals, undefined);
  room.board.push({ x: 1, y: 0, kind: 'path', card: straight, rot: 0 });
  room.players[1].hand[0] = rockfall;
  assert.throws(() => play(1, { action: 'rockfall', card: rockfall, x: 0, y: 0 }), /길 카드/);
  play(1, { action: 'rockfall', card: rockfall, x: 1, y: 0 });
  assert.equal(room.board.length, 4);
});

test('다른 사람의 손패·역할·카드 더미는 보이지 않는다', () => {
  const { room } = table(4);
  const view = roomView(room, '1');
  assert.equal(view.deck, undefined);
  assert.equal(view.deckCount, room.deck.length);
  assert.equal(view.players[0].hand, undefined);
  assert.equal(view.players[0].role, undefined);
  assert.equal(view.players[0].handCount, 6);
  assert.ok(view.players[1].hand.length && view.players[1].role);
});

test('카드가 모두 떨어지면 방해꾼 팀 모두 이긴다', () => {
  const { room, play } = table(5);
  room.players.forEach((player, seat) => {
    player.role = seat < 2 ? 'saboteur' : 'digger';
    player.hand = seat === 0 ? [straight] : [];
  });
  room.deck = [];
  play(0, { action: 'discard', card: straight });
  assert.equal(room.status, 'finished');
  assert.equal(room.result.winner, 'saboteur');
  assert.deepEqual(room.winners, ['0', '1']);
});

test('인원마다 언제나 규칙의 방해꾼 수만큼 나오고 나머지는 광부다', () => {
  for (let count = 3; count <= 5; count++) {
    for (let trial = 0; trial < 50; trial++) {
      const room = createRoom('room', 'saboteur', '역할', players[0], now);
      for (let index = 1; index < count; index++) applyAction(room, players[index], { action: 'join' }, now);
      for (let index = 0; index < count; index++) applyAction(room, players[index], { action: 'ready', ready: true }, now);
      const roles = room.players.map(player => player.role);
      assert.equal(roles.filter(role => role === 'saboteur').length, saboteurCounts[count]);
      assert.equal(roles.filter(role => role === 'digger').length, count - saboteurCounts[count]);
    }
  }
});

test('손패가 없는 사람은 건너뛰고, 시간이 지나면 첫 카드를 버리고 패스한다', () => {
  const { room } = table();
  room.deck = [];
  room.players[1].hand = [];
  const card = room.players[0].hand[0];
  assert.ok(expireRoom(room, now + turnTime, () => 0));
  assert.ok(!room.players[0].hand.includes(card));
  assert.equal(room.index, 2);
});

test('방 화면은 고른 길 카드를 놓을 수 있는 칸과 이긴 팀을 표시하고 게임설명은 모든 카드를 보여 준다', () => {
  const { room } = table();
  room.players[0].hand[0] = straight;
  const html = roomPage(roomView(room, '0'), '0', { sabCard: straight, sabRot: 0, sabZoom: 1, peeked: new Set() });
  assert.match(html, /sab-cell spot/);
  assert.match(html, /이 카드 버리고 패스/);
  const other = roomPage(roomView(room, '1'), '1', { sabCard: null, sabRot: 0, sabZoom: 1, peeked: new Set() });
  assert.doesNotMatch(other, /sab-cell spot/);
  room.goals = ['stone-up', 'gold', 'stone-down'];
  room.players.forEach((player, seat) => { player.role = seat === 2 ? 'saboteur' : 'digger'; });
  tunnelTo(room, 6);
  applyAction(room, players[0], { action: 'path', card: straight, x: 7, y: 0, rot: 0, turn: room.turn, match: room.match, seatEpoch: room.seatEpoch }, now);
  assert.match(roomPage(roomView(room, '2'), '2', { peeked: new Set() }), /광부 팀 승리! 졌어요/);
  assert.match(roomPage(roomView(room, '1'), '1', { peeked: new Set() }), /광부 팀 승리! 이겼어요!/);
  assert.match(guide('saboteur'), /행동 카드 \(27장\)/);
});
