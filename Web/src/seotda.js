import { bankruptLine, baseBet, betOptions, deckSize, handOf, refillMoney, showdown, turnTime, won } from '../public/seotda.js';
import { requireThat } from './http.js';

const stale = '방 상태가 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.';
const maxRegames = 3;

const inHand = player => !player.folded && !player.vacant;

// Seats still in the hand, in turn order from the given seat.
function seatsFrom(room, from) {
  const size = room.players.length;
  return Array.from({ length: size }, (_, step) => (from + step) % size).filter(seat => inHand(room.players[seat]));
}

function note(room, text) {
  room.log = [...(room.log ?? []), text].slice(-50);
}

function shuffle(cards, random) {
  for (let index = cards.length - 1; index > 0; index--) {
    const other = random(index + 1);
    [cards[index], cards[other]] = [cards[other], cards[index]];
  }
  return cards;
}

// wallets holds each player's balance from D1. Anyone at or below 10만원 goes bankrupt and starts again from 300만원.
export function startSeotda(room, random, now, wallets) {
  requireThat(wallets && room.players.every(player => wallets.has(player.id)), '잔액을 확인하지 못했습니다. 준비를 다시 눌러 주세요.', 409);
  room.stakes = {};
  room.log = [];
  for (const player of room.players) {
    const refill = wallets.get(player.id) <= bankruptLine;
    Object.assign(player, { balance: refill ? refillMoney : wallets.get(player.id), cards: [], folded: false, roundBet: 0, refilledAfter: false });
    room.stakes[player.id] = { paid: baseBet, refill };
    if (refill) note(room, player.name + ' · 파산해서 ' + won(refillMoney) + ' 지원');
  }
  Object.assign(room, {
    pot: baseBet * room.players.length,
    cap: Math.min(...room.players.map(player => player.balance)),
    first: (room.match - 1) % room.players.length,
    regames: 0, reveal: null, deadline: null,
  });
  note(room, '기본 판돈 ' + won(baseBet) + '씩 · 판돈 ' + won(room.pot));
  deal(room, random, now);
}

function deal(room, random, now) {
  room.deck = shuffle(Array.from({ length: deckSize }, (_, card) => card), random);
  for (const player of room.players) player.cards = inHand(player) ? [room.deck.pop()] : [];
  room.stage = 1;
  startRound(room);
  proceed(room, random, now);
}

function startRound(room) {
  room.currentBet = 0;
  for (const player of room.players) player.roundBet = 0;
  const open = seatsFrom(room, room.first);
  // Once everyone has put in the most this hand allows, the cards are simply dealt out.
  room.toAct = open.every(seat => room.stakes[room.players[seat].id].paid >= room.cap) ? [] : open;
}

function proceed(room, random, now) {
  while (!room.toAct.length) {
    if (room.stage === 2) return finish(room, random, now);
    for (const player of room.players) if (inHand(player)) player.cards.push(room.deck.pop());
    room.stage = 2;
    startRound(room);
  }
  room.index = room.toAct[0];
  room.deadline = now + turnTime;
}

function finish(room, random, now) {
  const entries = seatsFrom(room, 0).map(seat => ({ id: room.players[seat].id, cards: room.players[seat].cards }));
  const result = showdown(entries, room.regames < maxRegames);
  if (result.regame) {
    room.regames++;
    note(room, `${room.players.find(player => player.id === result.regame.id).name} · ${result.regame.hand.special} · 재경기! 판돈 ${won(room.pot)} 그대로`);
    return deal(room, random, now);
  }
  room.reveal = entries.map(({ id, cards }) => ({ id, cards, hand: handOf(cards).name }));
  const names = result.winners.map(id => room.players.find(player => player.id === id).name).join(' · ');
  settle(room, result.winners, result.winners.length > 1 ? `${result.hand.name} 동점 · ${names} 판돈 나눔` : `${names} · ${result.hand.name} 승리!`);
}

// Pays the pot to the winners and records every bettor's gain or loss, including players who left mid-hand.
function settle(room, winners, reason) {
  const share = Math.floor(room.pot / winners.length);
  const gains = new Map(winners.map((id, order) => [id, share + (order ? 0 : room.pot - share * winners.length)]));
  const money = Object.entries(room.stakes).map(([id, stake]) => ({ id, delta: (gains.get(id) ?? 0) - stake.paid, refill: stake.refill }));
  for (const player of room.players) {
    const entry = money.find(item => item.id === player.id);
    if (entry) {
      player.balance += entry.delta;
      if (player.balance <= 0) {
        player.balance = refillMoney;
        player.refilledAfter = true;
        note(room, player.name + ' · 잔액 0원으로 파산해서 ' + won(refillMoney) + ' 즉시 충전');
      }
    }
  }
  room.settlement = {
    match: room.match, money,
    outcomes: money.map(({ id }) => ({ id, outcome: gains.has(id) ? (winners.length > 1 ? 'D' : 'W') : 'L' })),
  };
  note(room, reason);
  Object.assign(room, { status: 'finished', winners, endReason: reason, deadline: null, toAct: [] });
  room.players = room.players.filter(player => !player.vacant);
}

function pay(room, player, amount) {
  room.stakes[player.id].paid += amount;
  player.roundBet += amount;
  room.pot += amount;
}

const betNames = { ping: '삥', ddadang: '따당', half: '하프' };

function act(room, seat, action, kind, random, now, suffix = '') {
  const player = room.players[seat];
  const options = betOptions(room, player);
  if (action === 'die') {
    player.folded = true;
    room.toAct = room.toAct.filter(other => other !== seat);
    note(room, player.name + ' · 다이' + suffix);
  } else if (action === 'check') {
    requireThat(!options.toCall, '앞 사람의 베팅을 받거나 다이해야 합니다.');
    room.toAct.shift();
    note(room, player.name + ' · 체크' + suffix);
  } else if (action === 'call') {
    requireThat(options.toCall > 0, '받을 베팅이 없습니다. 체크하거나 베팅해 주세요.');
    pay(room, player, options.toCall);
    room.toAct.shift();
    note(room, player.name + ' · 콜 ' + won(options.toCall));
  } else {
    requireThat(action === 'bet' && Object.hasOwn(betNames, kind), '알 수 없는 행동입니다.');
    const amount = options[kind];
    requireThat(amount, kind === 'ping' ? '삥은 첫 베팅에만 할 수 있습니다.' : kind === 'ddadang' ? '따당은 앞 사람이 베팅했을 때 할 수 있습니다.'
      : '이번 판에 걸 수 있는 최대 금액에 도달했습니다.');
    pay(room, player, amount);
    room.currentBet = player.roundBet;
    room.toAct = seatsFrom(room, seat + 1).filter(other => other !== seat);
    note(room, `${player.name} · ${betNames[kind]} ${won(amount)}${room.stakes[player.id].paid >= room.cap ? ' (최대)' : ''}`);
  }
  room.turn++;
  const left = seatsFrom(room, 0);
  if (left.length === 1) {
    const winner = room.players[left[0]];
    return settle(room, [winner.id], winner.name + ' 승리 · 나머지가 모두 다이');
  }
  proceed(room, random, now);
}

export function seotdaAction(room, player, input, now, random) {
  requireThat(input.turn === room.turn, stale, 409);
  const seat = room.players.indexOf(player);
  requireThat(seat === room.index && inHand(player), '내 차례가 아닙니다.');
  act(room, seat, input.action, input.kind, random, now);
}

// Moving to the spectator seats mid-hand folds the hand; the money already bet stays in the pot.
export function leaveSeotda(room, player, now, random) {
  const seat = room.players.indexOf(player);
  if (!inHand(player)) return;
  if (seat === room.index) return act(room, seat, 'die', null, random, now, ' (관전석으로 이동)');
  player.folded = true;
  room.toAct = room.toAct.filter(other => other !== seat);
  note(room, player.name + ' · 다이 (관전석으로 이동)');
  const left = seatsFrom(room, 0);
  if (left.length === 1) settle(room, [room.players[left[0]].id], room.players[left[0]].name + ' 승리 · 나머지가 모두 다이');
}

// A player who lets the clock run out checks when they can and otherwise dies.
export function expireSeotda(room, now, random) {
  const player = room.players[room.index];
  act(room, room.index, betOptions(room, player).toCall ? 'die' : 'check', null, random, now, ' (시간 초과)');
}

export function seotdaView(view, id) {
  delete view.deck;
  for (const player of view.players) {
    player.cardCount = player.cards?.length ?? 0;
    if (player.id !== id) delete player.cards;
  }
}
