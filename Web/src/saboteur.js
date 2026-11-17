import {
  breakTime, canPlace, cardName, cards, goalFaceName, goalFaces, goalNames, goalRotation, goalX, goalYs, goldCards, handSize,
  reachedGoals, roleCounts, rounds, saboteurReward, toolNames, turnTime,
} from '../public/saboteur.js';
import { requireThat } from './http.js';

const integerIn = (value, first, last) => Number.isInteger(value) && value >= first && value <= last;

function note(room, text) {
  room.log = [...(room.log ?? []), text].slice(-10);
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = random(index + 1);
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

// A game is three rounds. Gold cards come from one shuffled pile for the whole game and stay hidden until the end.
export function startSaboteur(room, random, now) {
  room.round = 0;
  room.goldPile = shuffle([...goldCards], random);
  room.log = [];
  room.history = [];
  for (const player of room.players) player.gold = 0;
  startRound(room, random, now, random(room.players.length));
}

// Roles are dealt again every round from players + 1 role cards; the spare one is never shown.
function startRound(room, random, now, first) {
  const count = room.players.length;
  const [saboteurs, diggers] = roleCounts[count];
  const roles = shuffle([...Array(saboteurs).fill('saboteur'), ...Array(diggers).fill('digger')], random);
  room.round++;
  room.deck = shuffle(cards.map((_, card) => card), random);
  room.goals = shuffle([...goalFaces], random);
  room.board = [{ x: 0, y: 0, kind: 'start' }, ...goalYs.map((y, goal) => ({ x: goalX, y, kind: 'goal', goal }))];
  const size = handSize(count);
  room.players.forEach((player, seat) => Object.assign(player, {
    role: roles[seat], hand: room.deck.splice(room.deck.length - size), broken: [], peeks: {}, next: false,
  }));
  Object.assign(room, { phase: 'play', index: first, result: null, lastCell: null, discarded: 0, deadline: now + turnTime });
  note(room, `${room.round}라운드 시작 · ${room.players[first].name}부터 · 손패 ${size}장씩`);
}

const cellAt = (room, x, y) => room.board.find(cell => cell.x === x && cell.y === y);

function playCard(room, player, seat, input, now, suffix = '') {
  const card = input.card;
  requireThat(Number.isInteger(card) && player.hand.includes(card), '손에 없는 카드입니다.');
  const info = cards[card];
  const target = Number.isInteger(input.target) ? room.players[input.target] : null;
  let found = false;
  switch (input.action) {
    case 'discard':
      room.discarded++;
      note(room, player.name + ' · 카드 1장 버리고 패스' + suffix);
      break;
    case 'path': {
      const { x, y, rot } = input;
      requireThat(info.type === 'path', '길 카드가 아닙니다.');
      requireThat(!player.broken.length, '부서진 도구가 있어서 길 카드를 낼 수 없습니다. 먼저 고쳐야 해요.');
      requireThat((rot === 0 || rot === 1) && Number.isInteger(x) && Number.isInteger(y) && canPlace(room.board, card, rot, x, y),
        '그 자리에는 놓을 수 없습니다. 맞닿는 길이 모두 맞고 시작 카드와 이어져야 해요.');
      room.board.push({ x, y, kind: 'path', card, rot });
      room.lastCell = { x, y };
      note(room, `${player.name} · ${cardName(card)} 놓기`);
      found = revealGoals(room);
      break;
    }
    case 'break': {
      requireThat(info.type === 'break', '부수기 카드가 아닙니다.');
      const tool = info.tools[0];
      requireThat(target && target !== player, '도구를 부술 다른 사람을 골라 주세요.');
      requireThat(!target.broken.includes(tool), `${target.name}님의 ${toolNames[tool]}는 이미 부서져 있습니다.`);
      target.broken.push(tool);
      note(room, `${player.name} → ${target.name} · ${toolNames[tool]} 부수기`);
      break;
    }
    case 'fix': {
      const tool = input.tool;
      requireThat(info.type === 'fix', '고치기 카드가 아닙니다.');
      requireThat(target && info.tools.includes(tool) && target.broken.includes(tool), '이 카드로 고칠 수 있는 부서진 도구를 골라 주세요.');
      target.broken = target.broken.filter(broken => broken !== tool);
      note(room, `${player.name} → ${target === player ? '자기' : target.name + '님의'} ${toolNames[tool]} 고치기`);
      break;
    }
    case 'map': {
      const goal = input.goal;
      requireThat(info.type === 'map', '지도 카드가 아닙니다.');
      const cell = integerIn(goal, 0, 2) && room.board.find(candidate => candidate.kind === 'goal' && candidate.goal === goal);
      requireThat(cell && !cell.face, '아직 뒤집히지 않은 목적지 카드를 골라 주세요.');
      player.peeks[goal] = room.goals[goal];
      note(room, `${player.name} · 지도로 ${goalNames[goal]} 목적지 몰래 보기`);
      break;
    }
    case 'rockfall': {
      requireThat(info.type === 'rockfall', '낙석 카드가 아닙니다.');
      const cell = cellAt(room, input.x, input.y);
      requireThat(cell?.kind === 'path', '무너뜨릴 길 카드를 골라 주세요. 시작·목적지 카드는 안 돼요.');
      room.board = room.board.filter(candidate => candidate !== cell);
      if (room.lastCell?.x === cell.x && room.lastCell?.y === cell.y) room.lastCell = null;
      note(room, `${player.name} · 낙석으로 ${cardName(cell.card)} 무너뜨리기`);
      break;
    }
    default:
      requireThat(false, '알 수 없는 행동입니다.');
  }
  player.hand.splice(player.hand.indexOf(card), 1);
  if (room.deck.length) player.hand.push(room.deck.pop());
  room.turn++;
  if (found) return endRound(room, seat, now);
  // Without cards nobody can move: a player with an empty hand is skipped, and when every hand is empty the saboteurs win.
  const size = room.players.length;
  for (let step = 1; step <= size; step++) {
    const next = (seat + step) % size;
    if (room.players[next].hand.length) {
      room.index = next;
      room.deadline = now + turnTime;
      return;
    }
  }
  endRound(room, null, now, seat);
}

// Turns over each goal a path now reaches. A stone keeps the round going; the gold ends it.
function revealGoals(room) {
  let reached;
  while ((reached = reachedGoals(room.board)).length) {
    for (const { goal, side } of reached) {
      goal.face = room.goals[goal.goal];
      goal.rot = goalRotation(goal.face, side);
      note(room, `${goalNames[goal.goal]} 목적지 공개 · ${goalFaceName(goal.face)}${goal.face === 'gold' ? '!' : ''}`);
    }
  }
  return room.board.some(cell => cell.kind === 'goal' && cell.face === 'gold');
}

// Takes gold cards worth the amount when the pile allows; the reward is paid in full either way.
function takeGold(pile, amount) {
  let left = amount;
  for (const value of [3, 2, 1]) {
    while (left >= value && pile.includes(value)) {
      pile.splice(pile.indexOf(value), 1);
      left -= value;
    }
  }
}

// finder is the seat that reached the gold, or null when the saboteurs win.
function endRound(room, finder, now, last = finder) {
  const size = room.players.length;
  const gains = Array(size).fill(0);
  const saboteurs = room.players.filter(player => player.role === 'saboteur');
  if (finder !== null) {
    // As many gold cards as there are gold diggers; from the finder (or the digger to a saboteur finder's right),
    // each digger to the right keeps the biggest card left.
    const order = Array.from({ length: size }, (_, step) => (finder - step + size) % size).filter(seat => room.players[seat].role === 'digger');
    const drawn = room.goldPile.splice(Math.max(0, room.goldPile.length - order.length)).sort((a, b) => b - a);
    drawn.forEach((value, index) => { gains[order[index]] += value; });
    note(room, `${room.round}라운드 · ${room.players[finder].name}님이 금을 찾았습니다! 광부 승리`);
  } else {
    const reward = saboteurReward(saboteurs.length);
    room.players.forEach((player, seat) => {
      if (player.role !== 'saboteur') return;
      takeGold(room.goldPile, reward);
      gains[seat] = reward;
    });
    note(room, `${room.round}라운드 · 카드가 모두 떨어졌습니다. 방해꾼 승리${saboteurs.length ? '' : ' (방해꾼 없음)'}`);
  }
  room.players.forEach((player, seat) => { player.gold += gains[seat]; });
  room.result = {
    round: room.round, winner: finder !== null ? 'digger' : 'saboteur', finder, gains,
    roles: room.players.map(player => player.role), goals: [...room.goals],
  };
  room.history.push({ round: room.round, winner: room.result.winner });
  room.first = (last + 1) % size;
  room.index = null;
  if (room.round < rounds) {
    Object.assign(room, { phase: 'roundEnd', deadline: now + breakTime });
    return;
  }
  const best = Math.max(...room.players.map(player => player.gold));
  const winners = room.players.filter(player => player.gold === best);
  Object.assign(room, {
    phase: 'over', status: 'finished', deadline: null, winners: winners.map(player => player.id),
    endReason: `${rounds}라운드 종료 · 금 ${best}개 · ${winners.map(player => player.name).join(' · ')}${winners.length > 1 ? ' 공동 1위' : ' 승리!'}`,
  });
}

function nextRound(room, random, now) {
  room.turn++;
  startRound(room, random, now, room.first);
}

export function saboteurAction(room, player, input, now, random) {
  requireThat(input.turn === room.turn, '방 상태가 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.', 409);
  const seat = room.players.indexOf(player);
  if (input.action === 'next') {
    requireThat(room.phase === 'roundEnd', '라운드가 진행 중입니다.');
    player.next = true;
    if (room.players.every(candidate => candidate.next || candidate.vacant)) nextRound(room, random, now);
    return;
  }
  requireThat(room.phase === 'play' && seat === room.index, '내 차례가 아닙니다.');
  playCard(room, player, seat, input, now);
}

// When the clock runs out the player passes with their first card; a finished round moves on by itself.
export function expireSaboteur(room, now, random) {
  if (room.phase === 'roundEnd') return nextRound(room, random, now);
  const player = room.players[room.index];
  playCard(room, player, room.index, { action: 'discard', card: player.hand[0] }, now, ' (시간 초과)');
}

// Others' hands, roles, map peeks and gold stay hidden; roles and goals show once a round ends, gold at the end of the game.
export function saboteurView(view, id) {
  const over = view.status === 'finished';
  const revealed = over || view.status === 'playing' && view.phase === 'roundEnd';
  view.deckCount = view.deck?.length ?? 0;
  view.goldLeft = view.goldPile?.length ?? 0;
  delete view.deck;
  delete view.goldPile;
  if (!revealed) delete view.goals;
  const mine = view.players.findIndex(player => player.id === id);
  for (const player of view.players) {
    player.handCount = player.hand?.length ?? 0;
    if (player.id === id) continue;
    delete player.hand;
    delete player.peeks;
    if (!revealed) delete player.role;
    if (!over) delete player.gold;
  }
  if (view.result && !over) view.result.gains = view.result.gains.map((gain, seat) => seat === mine ? gain : null);
}
