import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAction, createRoom, expireRoom, roomView } from '../src/games.js';
import { canTakeSeat } from '../public/rules.js';
import { bankruptLine, baseBet, betOptions, handOf, refillMoney, showdown, startMoney, turnTime, won } from '../public/seotda.js';
import { peekKey, roomPage } from '../public/views.js';

const card = (month, picture = true) => (month - 1) * 2 + (picture ? 0 : 1);
const players = ['민트', '고양이', '보라'].map((name, index) => ({ id: String(index), name }));
const now = 1_000_000;

function table(count = 2, balances = []) {
  const room = createRoom('room', 'seotda', '섯다 한 판', players[0], now);
  const wallets = new Map(players.slice(0, count).map((player, index) => [player.id, balances[index] ?? startMoney]));
  const play = (index, input, at = now) => applyAction(room, players[index],
    { turn: room.turn, revision: room.revision, match: room.match, seatEpoch: room.seatEpoch, ...input }, at, () => 0, wallets);
  for (let index = 1; index < count; index++) play(index, { action: 'join' });
  for (let index = 0; index < count; index++) play(index, { action: 'ready', ready: true });
  assert.equal(room.status, 'playing');
  return { room, play };
}

// Replaces the dealt cards: each hand is [first, second]; the second cards come off the deck in seat order.
function setHands(room, hands) {
  room.players.forEach((player, seat) => { player.cards = [hands[seat][0]]; });
  room.deck = hands.map(hand => hand[1]).reverse();
}

const total = room => room.settlement.money.reduce((sum, entry) => sum + entry.delta, 0);

test('섯다 족보는 광땡, 땡, 알리~세륙, 끗 순서다', () => {
  const order = [
    [card(3), card(8)], [card(1), card(8)], [card(1), card(3)], [card(10), card(10, false)], [card(9), card(9, false)],
    [card(1, false), card(1)], [card(1), card(2)], [card(1), card(4, false)], [card(1, false), card(9, false)],
    [card(1, false), card(10)], [card(4, false), card(10)], [card(4, false), card(6)], [card(2), card(7, false)],
    [card(3, false), card(5)], [card(2, false), card(8)],
  ];
  const names = order.map(cards => handOf(cards).name);
  assert.deepEqual(names, ['38광땡', '18광땡', '13광땡', '장땡', '9땡', '1땡', '알리', '독사', '구삥', '장삥', '장사', '세륙', '갑오', '8끗', '망통']);
  const ranks = order.map(cards => handOf(cards).rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a));
  assert.equal(new Set(ranks).size, ranks.length);
});

test('암행어사와 땡잡이는 정해진 패만 잡고, 나머지에는 끗으로 진다', () => {
  const duel = (a, b) => showdown([{ id: 'a', cards: a }, { id: 'b', cards: b }]);
  const amhaeng = [card(4), card(7)];
  const catcher = [card(3), card(7)];
  assert.equal(handOf(amhaeng).special, '암행어사');
  assert.deepEqual(duel(amhaeng, [card(1), card(8)]).winners, ['a']);
  assert.deepEqual(duel(amhaeng, [card(3), card(8)]).winners, ['b']);
  assert.deepEqual(duel(amhaeng, [card(2), card(8, false)]).winners, ['a'], '1끗은 망통을 이긴다');
  assert.equal(handOf(catcher).special, '땡잡이');
  assert.deepEqual(duel(catcher, [card(9), card(9, false)]).winners, ['a']);
  assert.deepEqual(duel(catcher, [card(10), card(10, false)]).winners, ['b']);
  assert.deepEqual(duel(catcher, [card(2), card(3, false)]).winners, ['b'], '땡이 없으면 망통');
  assert.deepEqual(duel([card(2), card(7, false)], [card(5), card(4, false)]).winners, ['a', 'b'], '같은 끗은 동점');
});

test('구사는 알리 이하, 멍텅구리 구사는 9땡 이하에서 재경기를 부른다', () => {
  const duel = (a, b) => showdown([{ id: 'a', cards: a }, { id: 'b', cards: b }]);
  const gusa = [card(4, false), card(9, false)];
  const meong = [card(4), card(9)];
  assert.equal(duel(gusa, [card(1), card(2)]).regame.id, 'a');
  assert.deepEqual(duel(gusa, [card(1), card(1, false)]).winners, ['b']);
  assert.deepEqual(duel(gusa, [card(2), card(10, false)]).winners, ['a'], '구사가 이기면 재경기 없이 3끗으로 이긴다');
  assert.equal(duel(meong, [card(9), card(9, false)]).regame.id, 'a');
  assert.deepEqual(duel(meong, [card(10), card(10, false)]).winners, ['b']);
  assert.deepEqual(showdown([{ id: 'a', cards: gusa }, { id: 'b', cards: [card(1), card(2)] }], false).winners, ['b']);
});

test('금액은 만원 단위로 읽기 쉽게 표시한다', () => {
  assert.equal(won(startMoney), '1,000만원');
  assert.equal(won(baseBet), '1만원');
  assert.equal(won(-400_000), '-40만원');
  assert.equal(won(105_000_000), '1억 500만원');
  assert.equal(won(12_345_000), '1,234만 5,000원');
  assert.equal(won(0), '0원');
});

test('기본 판돈을 내고 두 번 베팅한 뒤 이긴 사람이 판돈을 가져간다', () => {
  const { room, play } = table();
  assert.equal(room.pot, 2 * baseBet);
  assert.equal(room.index, 0);
  setHands(room, [[card(9), card(9, false)], [card(2), card(7, false)]]);
  assert.throws(() => play(1, { action: 'check' }), /내 차례/);
  assert.throws(() => play(0, { action: 'bet', kind: 'ddadang' }), /따당/);
  play(0, { action: 'bet', kind: 'ping' });
  assert.throws(() => play(1, { action: 'check' }), /받거나 다이/);
  play(1, { action: 'call' });
  assert.equal(room.stage, 2);
  assert.equal(room.players[0].cards.length, 2);
  assert.equal(room.pot, 4 * baseBet);
  play(0, { action: 'check' });
  play(1, { action: 'bet', kind: 'half' });
  assert.equal(room.currentBet, 20_000);
  play(0, { action: 'call' });
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.winners, ['0']);
  assert.equal(room.pot, 80_000);
  assert.deepEqual(room.settlement.money, [{ id: '0', delta: 40_000, refill: false }, { id: '1', delta: -40_000, refill: false }]);
  assert.deepEqual(room.settlement.outcomes.map(entry => entry.outcome), ['W', 'L']);
  assert.equal(room.players[0].balance, startMoney + 40_000);
  assert.deepEqual(room.reveal.map(entry => entry.hand), ['9땡', '갑오']);

  // The next hand starts from the other seat.
  play(0, { action: 'ready', ready: true });
  play(1, { action: 'ready', ready: true });
  assert.equal(room.match, 2);
  assert.equal(room.index, 1);
});

test('상대 패와 남은 패는 보이지 않고, 끝나면 다이하지 않은 패만 공개된다', () => {
  const { room, play } = table(3);
  setHands(room, [[card(5), card(5, false)], [card(1), card(2)], [card(3), card(8)]]);
  play(0, { action: 'bet', kind: 'ping' });
  const view = roomView(room, '1');
  assert.equal(view.deck, undefined);
  assert.equal(view.players[0].cards, undefined);
  assert.equal(view.players[0].cardCount, 1);
  assert.deepEqual(view.players[1].cards, [card(1)]);
  play(1, { action: 'die' });
  room.deck = [card(8), card(5, false)];
  play(2, { action: 'call' });
  play(0, { action: 'check' });
  play(2, { action: 'check' });
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.winners, ['2']);
  assert.deepEqual(room.reveal.map(entry => entry.id), ['0', '2']);
  assert.equal(total(room), 0);
  assert.equal(room.settlement.money.find(entry => entry.id === '1').delta, -baseBet);
  for (const id of ['0', '1', '2', '9']) assert.match(roomPage(roomView(room, id), id, { connected: true }), /38광땡/);
});

test('혼자 남으면 패를 보지 않고 바로 판돈을 가져간다', () => {
  const { room, play } = table(3);
  play(0, { action: 'bet', kind: 'ping' });
  play(1, { action: 'die' });
  play(2, { action: 'die' });
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.winners, ['0']);
  assert.equal(room.reveal, null);
  assert.deepEqual(room.settlement.money.map(entry => entry.delta), [2 * baseBet, -baseBet, -baseBet]);
});

test('한 판에 걸 수 있는 돈은 가장 적은 잔액까지이고, 10만원 이하면 파산해서 300만원을 받는다', () => {
  const capped = table(2, [startMoney, 115_000]).room;
  assert.equal(capped.cap, 115_000);
  capped.cap = 15_000; // a small cap keeps the all-in hand short
  const play = (index, input) => applyAction(capped, players[index],
    { turn: capped.turn, revision: capped.revision, match: capped.match, seatEpoch: capped.seatEpoch, ...input }, now);
  setHands(capped, [[card(1), card(1, false)], [card(2), card(3)]]);
  play(0, { action: 'bet', kind: 'half' });
  assert.equal(capped.currentBet, 5_000);
  assert.match(capped.log.at(-1), /최대/);
  play(1, { action: 'call' });
  assert.equal(capped.status, 'finished', '둘 다 최대로 걸면 남은 장을 바로 받고 공개한다');
  assert.deepEqual(capped.settlement.money.map(entry => entry.delta), [15_000, -15_000]);

  const { room } = table(2, [bankruptLine, startMoney]);
  assert.equal(room.players[0].balance, refillMoney);
  assert.equal(room.stakes['0'].refill, true);
  assert.equal(room.cap, refillMoney);
  assert.equal(table(2, [bankruptLine + 1, startMoney]).room.stakes['0'].refill, false);
});

test('판이 끝나 잔액이 0원이면 즉시 300만원으로 충전하고 결과에 표시한다', () => {
  const { room, play } = table(2, [200_000, 200_000]);
  setHands(room, [[card(1), card(1, false)], [card(2), card(3)]]);
  for (let turn = 0; turn < 50 && room.status === 'playing'; turn++) {
    const options = betOptions(room, room.players[room.index]);
    play(room.index, options.half ? { action: 'bet', kind: 'half' } : { action: options.toCall ? 'call' : 'check' });
  }
  assert.equal(room.status, 'finished');
  assert.equal(room.players[1].balance, refillMoney);
  assert.equal(room.players[1].refilledAfter, true);
  assert.equal(room.players[0].balance, 400_000);
  assert.equal(room.players[0].refilledAfter, false);
  assert.equal(total(room), 0);
  assert.equal(room.settlement.money[1].delta, -200_000);
  assert.match(room.log.join('\n'), /300만원 즉시 충전/);
  assert.match(roomPage(roomView(room, '1'), '1', { connected: true, peeked: new Set() }), /300만원 충전 완료/);
});

test('시간이 지나면 체크할 수 있을 때는 체크, 아니면 다이한다', () => {
  const { room, play } = table();
  assert.equal(expireRoom(room, now + turnTime - 1), false);
  assert.equal(expireRoom(room, now + turnTime), true);
  assert.equal(room.index, 1);
  assert.match(room.log.at(-1), /체크 \(시간 초과\)/);
  play(1, { action: 'bet', kind: 'ping' }, now + turnTime);
  assert.equal(expireRoom(room, now + 2 * turnTime), true);
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.winners, ['1']);
});

test('판 도중 관전석으로 가면 다이로 처리하고 판은 멈추지 않는다', () => {
  const { room, play } = table(3);
  play(0, { action: 'bet', kind: 'ping' });
  play(2, { action: 'spectate' });
  assert.equal(room.players[2].vacant, true);
  assert.equal(room.players[2].folded, true);
  assert.equal(roomView(room, '0').paused, false);
  assert.equal(canTakeSeat(room), false);
  assert.ok(room.deadline > now);
  play(1, { action: 'call' });
  assert.equal(room.stage, 2);
  play(0, { action: 'check' });
  play(1, { action: 'check' });
  assert.equal(room.status, 'finished');
  assert.equal(room.players.length, 2);
  assert.equal(room.settlement.money.find(entry => entry.id === '2').delta, -baseBet);
  assert.equal(total(room), 0);

  const duel = table();
  duel.play(0, { action: 'spectate' });
  assert.deepEqual(duel.room.settlement.outcomes, [{ id: '0', outcome: 'L' }, { id: '1', outcome: 'W' }]);
  assert.equal(duel.room.players.length, 1);
});

test('구사 재경기는 판돈을 그대로 두고 남은 사람에게 새로 패를 준다', () => {
  const { room, play } = table();
  setHands(room, [[card(4, false), card(9, false)], [card(1), card(2)]]);
  play(0, { action: 'check' });
  play(1, { action: 'check' });
  play(0, { action: 'bet', kind: 'ping' });
  play(1, { action: 'call' });
  assert.equal(room.status, 'playing');
  assert.equal(room.regames, 1);
  assert.equal(room.stage, 1);
  assert.equal(room.pot, 4 * baseBet);
  assert.equal(room.players[0].cards.length, 1);
  assert.match(room.log.at(-1), /구사 · 재경기/);
});

test('내 패는 열기 전까지 뒷면이고, 두 장을 모두 열어야 족보표에 내 패를 표시한다', () => {
  const { room, play } = table();
  setHands(room, [[card(9), card(9, false)], [card(2), card(7, false)]]);
  const page = peeked => roomPage(roomView(room, '0'), '0', { connected: true, peeked: new Set(peeked) });
  let html = page([]);
  assert.equal((html.match(/data-peek=/g) ?? []).length, 1);
  assert.match(html, /패를 열어 보세요/);
  assert.doesNotMatch(html, /class="[^"]*mine/);
  html = page([peekKey(room, 0)]);
  assert.doesNotMatch(html, /data-peek=/);
  assert.match(html, /9월/);
  play(0, { action: 'check' });
  play(1, { action: 'check' });
  html = page([peekKey(room, 0)]);
  assert.equal((html.match(/data-peek="room:1:0:1"/g) ?? []).length, 1, '새로 받은 둘째 장만 가려진다');
  assert.doesNotMatch(html, /class="[^"]*mine/);
  html = page([peekKey(room, 0), peekKey(room, 1)]);
  assert.match(html, /mine"\s+aria-current="true">9~1땡 <i>내 패 · 9땡<\/i>/);
});
