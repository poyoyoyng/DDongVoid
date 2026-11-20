import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createRoom, expireRoom, roomView } from '../src/games.js';
import {
  COLUMBIA, DONATE, FUND, ISLAND, SPACE, cellPlace, estateValue, fundFee, keys, maxRounds, salary, spaceFee, spaces, startMoney, toll, turnTime, won,
} from '../public/bluemarble.js';
import { roomPage } from '../public/views.js';
import { guide } from '../public/guide.js';

const players = ['민트', '고양이', '보라', '하늘'].map((name, index) => ({ id: String(index), name }));
const now = 1_000_000;
const keyOf = (type, match = () => true) => keys.findIndex(card => card.type === type && match(card));

// Dice come from the queue; everything else (shuffles) gets 0.
function table(count = 2) {
  const queue = [];
  const random = max => queue.length && max === 6 ? queue.shift() - 1 : 0;
  const room = createRoom('room', 'bluemarble', '부루마불 한 판', players[0], now);
  const play = (index, input, at = now) => applyAction(room, players[index],
    { turn: room.turn, revision: room.revision, match: room.match, seatEpoch: room.seatEpoch, ...input }, at, random);
  for (let index = 1; index < count; index++) play(index, { action: 'join' });
  for (let index = 0; index < count; index++) play(index, { action: 'ready', ready: true });
  assert.equal(room.status, 'playing');
  const roll = (index, a, b) => {
    queue.push(a, b);
    play(index, { action: 'roll' });
  };
  return { room, play, roll, queue, random };
}

test('판은 40칸이고 땅 29곳(도시 23 · 관광지 3 · 탈것 3), 황금열쇠 6칸이다', () => {
  assert.equal(spaces.length, 40);
  assert.equal(spaces.filter(space => space.kind === 'city').length, 23);
  assert.equal(spaces.filter(space => space.kind === 'special').length, 6);
  assert.deepEqual(spaces.flatMap((space, pos) => space.kind === 'key' ? [pos] : []), [2, 7, 12, 17, 22, 35]);
  assert.deepEqual([0, ISLAND, FUND, SPACE, DONATE].map(pos => spaces[pos].kind), ['start', 'island', 'fund', 'space', 'donate']);
  assert.equal(spaces[39].name, '서울');
  assert.equal(spaces[COLUMBIA].name, '컬럼비아호');
  // Every space has its own board cell around the edge.
  const cells = new Set(spaces.map((_, pos) => JSON.stringify(cellPlace(pos))));
  assert.equal(cells.size, 40);
});

test('황금열쇠는 30장이고 통행료는 땅과 건물 통행료를 모두 더한다', () => {
  assert.equal(keys.length, 30);
  assert.equal(keys.filter(card => card.type === 'pass').length, 2);
  // 베이징 풀하우스: 땅 4천 + 별장 2채 6만 + 빌딩 18만 + 호텔 45만 = 69만 4천원.
  assert.equal(toll(3, { owner: 0, villa: 2, building: 1, hotel: 1 }), 694_000);
  assert.equal(toll(1, { owner: 0, villa: 0, building: 0, hotel: 0 }), 2_000);
  assert.equal(toll(39, { owner: 0, villa: 0, building: 0, hotel: 0 }), 2_000_000);
  assert.equal(estateValue(1, { owner: 0, villa: 2, building: 1, hotel: 1 }), 50_000 + 100_000 + 150_000 + 250_000);
  assert.equal(won(2_930_000), '293만원');
  assert.equal(won(12_000), '1만 2천원');
  assert.equal(won(2_000), '2천원');
});

test('2명이면 586만원, 3~4명이면 293만원으로 시작한다', () => {
  assert.equal(table(2).room.players[0].money, startMoney(2));
  assert.equal(startMoney(2), 5_860_000);
  assert.equal(table(4).room.players[3].money, 2_930_000);
});

test('빈 땅에 서면 살 수 있고, 남의 땅에 서면 통행료를 낸다', () => {
  const { room, play, roll } = table(2);
  roll(0, 1, 3); // 4칸 → 마닐라
  assert.equal(room.phase, 'buy');
  play(0, { action: 'buy' });
  assert.equal(room.estates[4].owner, 0);
  assert.equal(room.players[0].money, 2 * 2_930_000 - 80_000);
  assert.equal(room.index, 1);
  roll(1, 3, 1);
  assert.equal(room.players[1].money, 2 * 2_930_000 - 4_000);
  assert.equal(room.players[0].money, 2 * 2_930_000 - 80_000 + 4_000);
  assert.equal(room.index, 0);
});

test('내 땅에 다시 서면 별장 2채 · 빌딩 · 호텔을 지을 수 있다', () => {
  const { room, play, roll } = table(2);
  room.estates[4].owner = 0;
  roll(0, 1, 3);
  assert.equal(room.phase, 'build');
  play(0, { action: 'build', part: 'villa' });
  play(0, { action: 'build', part: 'villa' });
  assert.throws(() => play(0, { action: 'build', part: 'villa' }), /더 지을 수 없는/);
  play(0, { action: 'build', part: 'hotel' });
  assert.equal(room.phase, 'build');
  play(0, { action: 'build', part: 'building' });
  assert.deepEqual(room.estates[4], { owner: 0, villa: 2, building: 1, hotel: 1 });
  assert.equal(room.index, 1, '더 지을 건물이 없으면 차례가 넘어간다');
});

test('더블이면 한 번 더 굴리고, 더블 3번이면 무인도로 간다', () => {
  const { room, play, roll } = table(2);
  roll(0, 2, 2); // 마닐라(4)
  play(0, { action: 'skip' });
  assert.equal(room.index, 0);
  assert.equal(room.phase, 'roll');
  roll(0, 1, 1); // 6 싱가포르
  play(0, { action: 'skip' });
  roll(0, 3, 3);
  assert.equal(room.players[0].pos, ISLAND);
  assert.equal(room.players[0].island, 3);
  assert.equal(room.index, 1);
});

test('무인도에서는 더블이 나와야 나가고, 3번째 턴에는 굴린 만큼 나간다', () => {
  const { room, play, roll } = table(2);
  Object.assign(room.players[0], { pos: ISLAND, island: 3 });
  roll(0, 1, 2);
  assert.equal(room.players[0].pos, ISLAND);
  roll(1, 1, 2);
  play(1, { action: 'skip' });
  roll(0, 4, 4);
  assert.equal(room.players[0].pos, 18);
  assert.equal(room.players[0].island, 0);
  play(0, { action: 'skip' });
  assert.equal(room.index, 1, '무인도를 더블로 나가도 다시 굴리지 않는다');

  Object.assign(room.players[1], { pos: ISLAND, island: 1 });
  roll(1, 1, 2);
  assert.equal(room.players[1].pos, 13, '마지막 턴은 더블이 아니어도 나간다');
});

test('무인도 탈출권을 쓰면 바로 굴릴 수 있다', () => {
  const { room, play, roll } = table(2);
  Object.assign(room.players[0], { pos: ISLAND, island: 3, keys: [keyOf('escape')] });
  play(0, { action: 'escape' });
  assert.equal(room.players[0].island, 0);
  assert.equal(room.players[0].keys.length, 0);
  roll(0, 1, 2);
  assert.equal(room.players[0].pos, 13);
});

test('출발을 지나면 월급, 사회복지기금은 접수처에서 모아 수령처에서 받는다', () => {
  const { room, play, roll } = table(2);
  const start = room.players[0].money;
  room.players[0].pos = 36;
  roll(0, 1, 1); // 38 접수처
  assert.equal(room.fund, fundFee);
  assert.equal(room.players[0].money, start - fundFee);
  roll(0, 1, 2); // 41 → 1 타이베이, 월급
  assert.equal(room.players[0].money, start - fundFee + salary);
  play(0, { action: 'skip' });
  room.players[1].pos = 17;
  roll(1, 1, 2);
  assert.equal(room.players[1].money, start + fundFee);
  assert.equal(room.fund, 0);
});

test('우주여행은 다음 차례에 원하는 칸으로 가고 컬럼비아호 주인에게 탑승료를 낸다', () => {
  const { room, play, roll } = table(2);
  room.estates[COLUMBIA].owner = 1;
  room.players[0].pos = 27;
  roll(0, 1, 2);
  assert.equal(room.players[0].space, true);
  assert.equal(room.index, 1);
  roll(1, 1, 2);
  play(1, { action: 'skip' });
  assert.equal(room.phase, 'space');
  assert.throws(() => play(0, { action: 'travel', to: SPACE }), /갈 칸/);
  const before = [room.players[0].money, room.players[1].money];
  play(0, { action: 'travel', to: 39 });
  assert.equal(room.players[0].pos, 39);
  assert.equal(room.players[0].money, before[0] - spaceFee);
  assert.equal(room.players[1].money, before[1] + spaceFee);
  assert.equal(room.phase, 'buy');
});

test('우대권이 있으면 통행료를 낼지 고르고, 쓰면 면제된다', () => {
  const { room, play, roll } = table(2);
  room.estates[39].owner = 1;
  Object.assign(room.players[0], { pos: 36, keys: [keyOf('pass')] });
  roll(0, 1, 2);
  assert.equal(room.phase, 'toll');
  const money = room.players[0].money;
  play(0, { action: 'toll', pass: true });
  assert.equal(room.players[0].money, money);
  assert.equal(room.players[0].keys.length, 0);
  assert.equal(room.index, 1);
});

test('황금열쇠: 관광여행은 출발을 지나며 월급을 받고, 무인도 열쇠는 월급 없이 간다', () => {
  const { room, play, roll } = table(2);
  room.keyDeck = [keys.findIndex(card => card.type === 'go' && card.to === 5), keyOf('island'), ...room.keyDeck];
  room.players[0].pos = 33;
  const money = room.players[0].money;
  roll(0, 1, 1); // 35 황금열쇠 → 제주도, 더블
  assert.equal(room.players[0].pos, 5);
  assert.equal(room.players[0].money, money + salary);
  assert.equal(room.phase, 'buy');
  play(0, { action: 'skip' });
  roll(0, 1, 1); // 7 황금열쇠 → 무인도
  assert.equal(room.players[0].pos, ISLAND);
  assert.equal(room.players[0].money, money + salary);
  assert.equal(room.index, 1, '무인도로 가면 더블이어도 차례가 끝난다');
});

test('말이 간 길을 차례대로 남겨 화면이 한 칸씩 움직일 수 있다', () => {
  const { room, play, roll } = table(2);
  room.keyDeck = [keyOf('back', card => card.steps === 3), keyOf('island'), ...room.keyDeck];
  roll(0, 3, 4); // 7 황금열쇠 → 뒤로 3칸, 4 빈 땅
  const first = room.walk;
  assert.deepEqual(first.moves, [{ seat: 0, from: 0, to: 7, kind: 'forward' }, { seat: 0, from: 7, to: 4, kind: 'back' }]);
  play(0, { action: 'skip' });
  assert.equal(room.walk, first, '땅을 사지 않아도 길은 그대로라 다시 움직이지 않는다');
  roll(1, 6, 6); // 12 황금열쇠 → 무인도로 날아간다
  assert.notEqual(room.walk.id, first.id);
  assert.deepEqual(room.walk.moves, [{ seat: 1, from: 0, to: 12, kind: 'forward' }, { seat: 1, from: 12, to: ISLAND, kind: 'fly' }]);
  assert.equal(roomView(room, players[0].id).walk.moves.length, 2);
});

test('황금열쇠: 건물 세금은 건물 수만큼, 반액대매출은 가장 비싼 땅을 반값에 판다', () => {
  const { room, roll } = table(2);
  room.estates[3] = { owner: 0, villa: 2, building: 1, hotel: 1 };
  room.estates[39].owner = 0;
  room.keyDeck = [keys.findIndex(card => card.name === '정기종합소득세'), keyOf('sale'), ...room.keyDeck];
  const money = room.players[0].money;
  roll(0, 1, 1); // 2 황금열쇠
  assert.equal(room.players[0].money, money - (150_000 + 100_000 + 2 * 30_000));
  room.players[0].pos = 5;
  roll(0, 1, 1); // 7 황금열쇠
  assert.equal(room.estates[39].owner, null);
  assert.equal(room.players[0].money, money - 310_000 + 500_000);
});

test('돈이 모자라면 싼 땅부터 반값에 팔고, 그래도 모자라면 파산해 상대가 이긴다', () => {
  const { room, roll } = table(2);
  room.estates[39] = { owner: 1, villa: 0, building: 0, hotel: 0 };
  room.estates[1] = { owner: 0, villa: 0, building: 0, hotel: 0 };
  room.estates[37] = { owner: 0, villa: 0, building: 0, hotel: 0 };
  room.players[0].money = 1_000_000;
  room.players[0].pos = 36;
  roll(0, 1, 2); // 서울 통행료 200만
  assert.equal(room.estates[1].owner, null);
  assert.equal(room.estates[37].owner, null);
  assert.equal(room.players[0].bankrupt, true);
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.winners, ['1']);
  assert.equal(room.players[1].money, 2 * 2_930_000 + 1_000_000 + 25_000 + 175_000);
});

test('파산 선언하면 땅을 은행에 돌려주고 남은 사람끼리 계속한다', () => {
  const { room, play } = table(3);
  room.estates[1].owner = 1;
  play(1, { action: 'resign' });
  assert.equal(room.players[1].bankrupt, true);
  assert.equal(room.estates[1].owner, null);
  assert.equal(room.status, 'playing');
  play(0, { action: 'resign' });
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.winners, ['2']);
});

test(`${maxRounds}라운드가 끝나면 총자산이 가장 많은 사람이 이긴다`, () => {
  const { room, play, roll } = table(2);
  room.round = maxRounds;
  room.estates[39].owner = 1;
  room.players[0].pos = 20;
  roll(0, 1, 2);
  play(0, { action: 'skip' });
  roll(1, 1, 2);
  play(1, { action: 'skip' });
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.winners, ['1']);
});

test('시간이 지나면 대신 굴리고, 살지 고르는 중이면 사지 않는다', () => {
  const { room, queue, random } = table(2);
  queue.push(1, 3);
  assert.ok(expireRoom(room, now + turnTime, random));
  assert.equal(room.players[0].pos, 4);
  assert.equal(room.phase, 'buy');
  assert.equal(expireRoom(room, now + turnTime + 1, random), false);
  assert.ok(expireRoom(room, now + 2 * turnTime, random));
  assert.equal(room.estates[4].owner, null);
  assert.equal(room.index, 1);
});

test('무작위로 여러 판을 끝까지 두어도 규칙이 깨지지 않는다', () => {
  for (let game = 0; game < 40; game++) {
    let seed = game * 7919 + 1;
    const random = max => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    const count = 2 + (game % 3);
    const room = createRoom('room', 'bluemarble', '랜덤', players[0], now);
    const act = (index, input) => applyAction(room, players[index],
      { turn: room.turn, revision: room.revision, match: room.match, seatEpoch: room.seatEpoch, ...input }, now, random);
    for (let index = 1; index < count; index++) act(index, { action: 'join' });
    for (let index = 0; index < count; index++) act(index, { action: 'ready', ready: true });
    let steps = 0;
    while (room.status === 'playing' && steps++ < 5000) {
      const seat = room.index;
      const options = {
        roll: [{ action: 'roll' }], space: [{ action: 'travel', to: (random(39) + 31) % 40 }],
        buy: [{ action: 'buy' }, { action: 'skip' }], build: [{ action: 'build', part: ['villa', 'building', 'hotel'][random(3)] }, { action: 'skip' }],
        toll: [{ action: 'toll', pass: true }, { action: 'toll', pass: false }],
      }[room.phase];
      try {
        act(seat, options[random(options.length)]);
      } catch (error) {
        if (!/더 지을 수 없는|돈이 모자랍니다/.test(error.message)) throw error;
        act(seat, { action: 'skip' });
      }
      const total = room.players.reduce((sum, player) => sum + player.money, 0);
      assert.ok(room.players.every(player => player.money >= 0 && Number.isInteger(player.money)), '돈은 0 이상의 정수');
      assert.ok(Number.isFinite(total));
      assert.equal(room.keyDeck.length + room.players.reduce((sum, player) => sum + player.keys.length, 0), keys.length, '황금열쇠는 30장 그대로');
      if (room.status === 'playing') roomPage(roomView(room, String(seat)), String(seat), { connected: true, bmCell: steps % 40 });
    }
    assert.equal(room.status, 'finished', '판은 끝까지 간다');
    assert.ok(room.winners.length >= 1);
    roomPage(roomView(room, '0'), '0', { connected: true });
  }
});

test('보는 화면에는 황금열쇠 더미 순서가 없고, 판 · 땅 문서 · 버튼이 그려진다', () => {
  const { room } = table(2);
  room.estates[3] = { owner: 1, villa: 1, building: 0, hotel: 0 };
  const view = roomView(room, '0');
  assert.equal(view.keyDeck, undefined);
  assert.equal(view.keyCount, 30);
  const html = roomPage(view, '0', { connected: true, bmCell: 3 });
  assert.equal((html.match(/data-bm-cell=/g) ?? []).length, 40);
  assert.match(html, /주사위 굴리기/);
  assert.match(html, /베이징/);
  assert.match(html, /지금 통행료 <b>2만 4천원<\/b>/);
  assert.match(guide('bluemarble'), /황금열쇠/);
});
