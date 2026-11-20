import {
  COLUMBIA, ISLAND, SPACE, START, buildable, emptyEstate, estateValue, fundFee, islandTurns, keys, maxRounds,
  ownable, partNames, saleValue, salary, spaceFee, spaces, startMoney, toll, turnTime, won,
} from '../public/bluemarble.js';
import { requireThat } from './http.js';

const integerIn = (value, first, last) => Number.isInteger(value) && value >= first && value <= last;
const nameOf = pos => spaces[pos].name;
const alive = room => room.players.filter(player => !player.bankrupt);

function note(room, text) {
  room.log = [...(room.log ?? []), text].slice(-12);
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = random(index + 1);
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

export function startBluemarble(room, random, now) {
  const money = startMoney(room.players.length);
  room.players.forEach(player => Object.assign(player, {
    money, pos: START, island: 0, bankrupt: false, space: false, freeRide: false, keys: [],
  }));
  Object.assign(room, {
    phase: 'roll', index: 0, round: 1, dice: null, doubles: 0, again: false, stop: false, fund: 0, pending: null,
    estates: spaces.map((_, pos) => ownable(pos) ? emptyEstate() : null),
    keyDeck: shuffle(keys.map((_, card) => card), random), drawn: null, moved: null, result: null, log: [],
    deadline: now + turnTime,
  });
  note(room, `게임 시작 · 모두 ${won(money)}씩 · ${room.players[0].name}부터`);
}

// Money changes hands; a debtor short of cash sells lots to the bank at half price, cheapest first, and goes bankrupt
// when even that is not enough. to is a seat, 'bank' or 'fund'.
function charge(room, seat, amount, to, reason) {
  const player = room.players[seat];
  if (amount <= 0 || player.bankrupt) return;
  if (player.money < amount) liquidate(room, seat, amount);
  const paid = Math.min(player.money, amount);
  player.money -= paid;
  if (to === 'fund') room.fund += paid;
  else if (to !== 'bank') room.players[to].money += paid;
  if (paid < amount) {
    note(room, `${player.name} · ${reason} ${won(amount)}을 다 내지 못해 파산!`);
    bankrupt(room, seat);
  }
}

function owned(room, seat) {
  return room.estates.flatMap((estate, pos) => estate?.owner === seat ? [pos] : []);
}

function sell(room, seat, pos) {
  const estate = room.estates[pos];
  const price = saleValue(pos, estate);
  room.players[seat].money += price;
  room.estates[pos] = emptyEstate();
  return price;
}

function liquidate(room, seat, amount) {
  const player = room.players[seat];
  const lots = owned(room, seat).sort((a, b) => saleValue(a, room.estates[a]) - saleValue(b, room.estates[b]));
  for (const pos of lots) {
    if (player.money >= amount) break;
    const price = sell(room, seat, pos);
    note(room, `${player.name} · 돈이 모자라 ${nameOf(pos)}을(를) 은행에 ${won(price)}에 팔았습니다`);
  }
}

// A bankrupt player leaves the game; their lots go back to the bank and kept keys back under the deck.
function bankrupt(room, seat) {
  const player = room.players[seat];
  for (const pos of owned(room, seat)) room.estates[pos] = emptyEstate();
  room.keyDeck.push(...player.keys);
  Object.assign(player, { bankrupt: true, money: 0, keys: [], island: 0, space: false, freeRide: false, rank: alive(room).length });
  const left = alive(room);
  if (left.length <= 1) finish(room, left, left.length ? `${left[0].name}님만 남았습니다 · 최후의 승자!` : '모두 파산했습니다');
}

export const assets = (room, seat) => room.players[seat].money +
  owned(room, seat).reduce((total, pos) => total + estateValue(pos, room.estates[pos]), 0);

function finish(room, winners, reason) {
  note(room, reason);
  room.result = { assets: room.players.map((player, seat) => player.bankrupt ? 0 : assets(room, seat)) };
  Object.assign(room, {
    phase: 'over', status: 'finished', index: null, deadline: null, pending: null,
    winners: winners.map(player => player.id), endReason: reason,
  });
}

// Moves forward to a space; passing or landing on 출발 pays the salary.
function advance(room, seat, to, { pay = true } = {}) {
  const player = room.players[seat];
  const from = player.pos;
  const steps = (to - from + 40) % 40;
  if (pay && steps && from + steps >= 40) {
    player.money += salary;
    note(room, `${player.name} · 출발을 지나 월급 ${won(salary)}`);
  }
  player.pos = to;
  room.moved = { seat, from, to };
}

function sendToIsland(room, seat) {
  const player = room.players[seat];
  room.moved = { seat, from: player.pos, to: ISLAND };
  player.pos = ISLAND;
  player.island = islandTurns;
  room.stop = true;
}

// What happens on the space the current player stands on. Returns true when the player must now decide something.
function land(room, seat) {
  const player = room.players[seat];
  const pos = player.pos;
  const space = spaces[pos];
  if (ownable(pos)) {
    const estate = room.estates[pos];
    if (estate.owner === null) {
      if (player.money >= space.price) return wait(room, 'buy', { pos });
      note(room, `${player.name} · ${space.name} 도착 · 돈이 모자라 살 수 없어요`);
      return false;
    }
    if (estate.owner === seat) {
      const cheapest = Math.min(...buildable(pos, estate).map(part => space.cost[part]));
      if (player.money >= cheapest) return wait(room, 'build', { pos });
      note(room, `${player.name} · 내 땅 ${space.name} 도착`);
      return false;
    }
    const amount = toll(pos, estate);
    if (player.keys.some(card => keys[card].type === 'pass')) return wait(room, 'toll', { pos, amount, to: estate.owner });
    note(room, `${player.name} → ${room.players[estate.owner].name} · ${space.name} 통행료 ${won(amount)}`);
    charge(room, seat, amount, estate.owner, '통행료');
    return false;
  }
  switch (space.kind) {
    case 'key':
      return drawKey(room, seat);
    case 'island':
      note(room, `${player.name} · 무인도에 갇혔어요 (${islandTurns}턴)`);
      sendToIsland(room, seat);
      return false;
    case 'fund':
      note(room, `${player.name} · 사회복지기금 ${won(room.fund)} 받기`);
      player.money += room.fund;
      room.fund = 0;
      return false;
    case 'donate':
      note(room, `${player.name} · 사회복지기금 ${won(fundFee)} 내기`);
      charge(room, seat, fundFee, 'fund', '사회복지기금');
      return false;
    case 'space':
      note(room, `${player.name} · 우주여행 정거장 도착 · 다음 차례에 원하는 곳으로 가요`);
      player.space = true;
      room.stop = true;
      return false;
    default:
      return false;
  }
}

function wait(room, phase, pending) {
  room.phase = phase;
  room.pending = pending;
  room.deadline = room.now + turnTime;
  return true;
}

function drawKey(room, seat) {
  const player = room.players[seat];
  const card = room.keyDeck.shift();
  const info = keys[card];
  room.drawn = { card, seat, turn: room.turn };
  note(room, `${player.name} · 황금열쇠 「${info.name}」 ${info.text}`);
  if (info.keep) player.keys.push(card);
  else room.keyDeck.push(card);
  switch (info.type) {
    case 'sale': {
      const lots = owned(room, seat);
      if (!lots.length) {
        note(room, '팔 땅이 없어서 그냥 넘어갑니다');
        return false;
      }
      const pos = lots.reduce((best, candidate) => estateValue(candidate, room.estates[candidate]) > estateValue(best, room.estates[best]) ? candidate : best);
      note(room, `${nameOf(pos)}을(를) ${won(sell(room, seat, pos))}에 팔았습니다`);
      return false;
    }
    case 'levy': {
      const amount = owned(room, seat).reduce((total, pos) =>
        total + Object.entries(info.rates).reduce((sum, [part, rate]) => sum + room.estates[pos][part] * rate, 0), 0);
      note(room, amount ? `${player.name} · ${info.name} ${won(amount)}` : '건물이 없어서 낼 돈이 없어요');
      charge(room, seat, amount, 'bank', info.name);
      return false;
    }
    case 'back':
      player.pos = (player.pos - info.steps + 40) % 40;
      room.moved = { seat, from: (player.pos + info.steps) % 40, to: player.pos };
      return land(room, seat);
    case 'go':
      advance(room, seat, info.to);
      return land(room, seat);
    case 'island':
      sendToIsland(room, seat);
      return false;
    case 'world':
      player.money += salary + room.fund;
      note(room, `${player.name} · 한 바퀴 돌아 월급 ${won(salary)}과 사회복지기금 ${won(room.fund)} 받기`);
      room.fund = 0;
      room.moved = { seat, from: player.pos, to: player.pos, lap: true };
      return false;
    case 'space':
      advance(room, seat, SPACE);
      player.space = true;
      player.freeRide = true;
      room.stop = true;
      return false;
    case 'ride': {
      const estate = room.estates[info.via];
      if (estate.owner !== null && estate.owner !== seat) {
        note(room, `${player.name} → ${room.players[estate.owner].name} · ${nameOf(info.via)} 탑승료 ${won(spaces[info.via].toll)}`);
        charge(room, seat, spaces[info.via].toll, estate.owner, '탑승료');
        if (player.bankrupt) return false;
      }
      advance(room, seat, info.to);
      return land(room, seat);
    }
    case 'gain':
      player.money += info.amount;
      return false;
    case 'pay':
      charge(room, seat, info.amount, 'bank', info.name);
      return false;
    case 'gift':
      for (const [other, giver] of room.players.entries()) {
        if (other === seat || giver.bankrupt) continue;
        const paid = Math.min(giver.money, info.amount);
        giver.money -= paid;
        player.money += paid;
      }
      return false;
    default:
      return false;
  }
}

// After a move is settled: doubles roll again, anything else hands the dice on.
function settle(room) {
  if (room.status !== 'playing') return;
  room.pending = null;
  const player = room.players[room.index];
  if (!player.bankrupt && room.again && !room.stop) {
    room.phase = 'roll';
    room.deadline = room.now + turnTime;
    return;
  }
  nextPlayer(room);
}

function nextPlayer(room) {
  const size = room.players.length;
  let next = room.index;
  do { next = (next + 1) % size; } while (room.players[next].bankrupt);
  if (next <= room.index) room.round++;
  if (room.round > maxRounds) {
    const totals = room.players.map((player, seat) => player.bankrupt ? -1 : assets(room, seat));
    const best = Math.max(...totals);
    const winners = room.players.filter((_, seat) => totals[seat] === best);
    return finish(room, winners, `${maxRounds}라운드 끝 · 총자산 ${won(best)} · ` +
      (winners.length > 1 ? '공동 1위!' : `${winners[0].name}님 승리!`));
  }
  Object.assign(room, { index: next, doubles: 0, again: false, stop: false, pending: null, deadline: room.now + turnTime });
  room.phase = room.players[next].space ? 'space' : 'roll';
}

function rollDice(room, seat, random) {
  const player = room.players[seat];
  const dice = [random(6) + 1, random(6) + 1];
  const double = dice[0] === dice[1];
  const sum = dice[0] + dice[1];
  room.dice = dice;
  room.stop = false;
  room.again = false;
  if (player.island) {
    if (double) {
      note(room, `${player.name} · 🎲 ${dice.join('·')} 더블! 무인도 탈출`);
      player.island = 0;
    } else if (--player.island) {
      note(room, `${player.name} · 🎲 ${dice.join('·')} · 무인도에 남아요 (남은 ${player.island}턴)`);
      return settle(room);
    } else {
      note(room, `${player.name} · 🎲 ${dice.join('·')} · 무인도에서 ${islandTurns}턴을 채우고 나갑니다`);
    }
  } else {
    room.doubles = double ? room.doubles + 1 : 0;
    if (room.doubles >= 3) {
      note(room, `${player.name} · 🎲 ${dice.join('·')} 더블 3번! 무인도로 갑니다`);
      sendToIsland(room, seat);
      return settle(room);
    }
    room.again = double;
    note(room, `${player.name} · 🎲 ${dice.join('·')}${double ? ' 더블! 한 번 더' : ''}`);
  }
  advance(room, seat, (player.pos + sum) % 40);
  if (!land(room, seat)) settle(room);
}

function travel(room, seat, to) {
  const player = room.players[seat];
  requireThat(integerIn(to, 0, 39) && to !== SPACE, '우주여행으로 갈 칸을 골라 주세요.');
  player.space = false;
  room.dice = null;
  room.again = false;
  room.stop = false;
  const owner = room.estates[COLUMBIA].owner;
  if (player.freeRide) note(room, `${player.name} · 우주여행 초대권으로 컬럼비아호 무료 탑승`);
  else if (owner !== null && owner !== seat) {
    note(room, `${player.name} → ${room.players[owner].name} · 컬럼비아호 탑승료 ${won(spaceFee)}`);
    charge(room, seat, spaceFee, owner, '컬럼비아호 탑승료');
  }
  player.freeRide = false;
  if (player.bankrupt) return settle(room);
  note(room, `${player.name} · 🚀 ${nameOf(to)}(으)로 우주여행`);
  advance(room, seat, to);
  if (!land(room, seat)) settle(room);
}

function useKey(player, type, room) {
  const card = player.keys.find(candidate => keys[candidate].type === type);
  player.keys.splice(player.keys.indexOf(card), 1);
  room.keyDeck.push(card);
}

function act(room, seat, input, random) {
  const player = room.players[seat];
  const pending = room.pending;
  switch (input.action) {
    case 'roll':
      requireThat(room.phase === 'roll', '지금은 주사위를 굴릴 때가 아닙니다.');
      return rollDice(room, seat, random);
    case 'escape':
      requireThat(room.phase === 'roll' && player.island && player.keys.some(card => keys[card].type === 'escape'), '쓸 수 있는 무인도 탈출권이 없습니다.');
      useKey(player, 'escape', room);
      player.island = 0;
      note(room, `${player.name} · 무인도 탈출권으로 탈출!`);
      return;
    case 'sell': {
      const pos = input.pos;
      requireThat(room.phase === 'roll' && integerIn(pos, 0, 39) && room.estates[pos]?.owner === seat, '팔 수 있는 내 땅을 골라 주세요.');
      note(room, `${player.name} · ${nameOf(pos)}을(를) 은행에 ${won(sell(room, seat, pos))}에 팔았습니다`);
      return;
    }
    case 'travel':
      requireThat(room.phase === 'space', '지금은 우주여행을 할 때가 아닙니다.');
      return travel(room, seat, input.to);
    case 'buy': {
      requireThat(room.phase === 'buy', '지금은 땅을 살 때가 아닙니다.');
      const space = spaces[pending.pos];
      requireThat(player.money >= space.price, '돈이 모자랍니다.');
      player.money -= space.price;
      room.estates[pending.pos].owner = seat;
      note(room, `${player.name} · ${space.name} 구입 (${won(space.price)})`);
      return settle(room);
    }
    case 'build': {
      requireThat(room.phase === 'build', '지금은 건물을 지을 때가 아닙니다.');
      const estate = room.estates[pending.pos];
      const space = spaces[pending.pos];
      const part = input.part;
      requireThat(buildable(pending.pos, estate).includes(part), '더 지을 수 없는 건물입니다.');
      requireThat(player.money >= space.cost[part], '돈이 모자랍니다.');
      player.money -= space.cost[part];
      estate[part]++;
      note(room, `${player.name} · ${space.name}에 ${partNames[part]} 짓기 (${won(space.cost[part])})`);
      const more = buildable(pending.pos, estate).some(next => player.money >= space.cost[next]);
      if (!more) settle(room);
      return;
    }
    case 'skip':
      requireThat(room.phase === 'buy' || room.phase === 'build', '넘길 것이 없습니다.');
      if (room.phase === 'buy') note(room, `${player.name} · ${nameOf(pending.pos)} 사지 않기`);
      return settle(room);
    case 'toll': {
      requireThat(room.phase === 'toll', '지금은 통행료를 낼 때가 아닙니다.');
      const owner = room.players[pending.to];
      if (input.pass) {
        requireThat(player.keys.some(card => keys[card].type === 'pass'), '우대권이 없습니다.');
        useKey(player, 'pass', room);
        note(room, `${player.name} · 우대권으로 ${owner.name}님의 ${nameOf(pending.pos)} 통행료 면제`);
      } else {
        note(room, `${player.name} → ${owner.name} · ${nameOf(pending.pos)} 통행료 ${won(pending.amount)}`);
        charge(room, seat, pending.amount, pending.to, '통행료');
      }
      return settle(room);
    }
    default:
      requireThat(false, '알 수 없는 행동입니다.');
  }
}

export function bluemarbleAction(room, player, input, now, random) {
  requireThat(input.turn === room.turn, '방 상태가 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.', 409);
  const seat = room.players.indexOf(player);
  requireThat(!player.bankrupt, '파산해서 게임에서 빠졌습니다.');
  room.now = now;
  if (input.action === 'resign') {
    note(room, `${player.name} · 파산 선언`);
    const current = seat === room.index;
    bankrupt(room, seat);
    if (room.status === 'playing' && current) nextPlayer(room);
  } else {
    requireThat(room.phase !== 'over' && seat === room.index, '내 차례가 아닙니다.');
    act(room, seat, input, random);
  }
  room.turn++;
  delete room.now;
}

// When the clock runs out the game plays the safe choice: roll, pass on buying or building, pay the toll, fly to 출발.
export function expireBluemarble(room, now, random) {
  room.now = now;
  const seat = room.index;
  const player = room.players[seat];
  note(room, `${player.name} · 시간 초과`);
  if (room.phase === 'roll') rollDice(room, seat, random);
  else if (room.phase === 'space') travel(room, seat, START);
  else if (room.phase === 'toll') act(room, seat, { action: 'toll', pass: player.money < room.pending.amount }, random);
  else settle(room);
  room.turn++;
  delete room.now;
}

export function bluemarbleView(view) {
  view.keyCount = view.keyDeck?.length ?? 0;
  delete view.keyDeck;
}
