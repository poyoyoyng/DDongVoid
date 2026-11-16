import { cardAttack, cardName, cardRank, cardSuit, games, legalCard, powerCosts, sum, yachtCategories, yachtScore, yachtTotal } from '../public/rules.js';
import { BLACK, WHITE, forbiddenReason, size as omokSize, winningLine } from '../public/omok.js';
import { randomInt, requireThat } from './http.js';
import { applyMemberAction, isMemberAction } from './room-members.js';

const roomGames = new Set(['slap', 'ciao', 'onecard', 'yacht', 'omok']);
export const isRoomGame = game => roomGames.has(game);
const current = room => room.players[room.index];
const integerIn = (value, first, last) => Number.isInteger(value) && value >= first && value <= last;
const stale = '방 상태가 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.';

function newPlayer(account) {
  return { id: account.id, name: account.name, ready: false };
}

export function createRoom(id, game, title, account, now) {
  return {
    id, game, title, createdAt: now, status: 'waiting', revision: 1,
    players: [newPlayer(account)], spectators: [], hostId: account.id, match: 0, winners: [],
  };
}

function complete(room, winners, reason) {
  room.status = 'finished';
  room.winners = winners;
  room.endReason = reason;
}

export function applyAction(room, account, input, now, roll = randomInt) {
  const id = account.id;
  const player = room.players.find(candidate => candidate.id === id);
  const action = input.action;
  if (isMemberAction(action)) {
    if (!applyMemberAction(room, account, input, player, now)) return false;
  } else {
    requireThat(player, '이 방의 참가자가 아닙니다.', 403);
    if (action === 'ready') {
      requireThat(room.status !== 'playing', '이미 게임이 진행 중입니다.');
      requireThat(typeof input.ready === 'boolean', '준비 상태를 선택해 주세요.');
      if (player.ready === input.ready) return false;
      player.ready = input.ready;
      if (room.players.length >= 2 && room.players.every(candidate => candidate.ready)) start(room, roll);
    } else {
      requireThat(room.status === 'playing', '게임이 진행 중이 아닙니다.', 409);
      requireThat(!room.players.some(player => player.vacant), '빈 자리에 참가자가 들어오면 경기를 이어갑니다.', 409);
      requireThat(input.match === room.match, stale, 409);
      requireThat(!room.seatEpoch || input.seatEpoch === room.seatEpoch, stale, 409);
      if (room.game === 'slap') slapAction(room, player, input);
      if (room.game === 'ciao') ciaoAction(room, player, input, now, roll);
      if (room.game === 'onecard') oneCardAction(room, player, input, now, roll);
      if (room.game === 'yacht') yachtAction(room, player, input, roll);
      if (room.game === 'omok') omokAction(room, player, input);
    }
  }
  room.revision++;
  return true;
}

function start(room, roll) {
  room.status = 'playing';
  room.match++;
  room.index = 0;
  room.turn = 1;
  room.winners = [];
  room.last = null;
  room.endReason = null;
  room.substituted = false;
  room.seatEpoch = 0;
  delete room.deadlineRemaining;
  room.players = room.players.map(({ id, name }) => ({ id, name, ready: false }));
  switch (room.game) {
    case 'slap':
      room.players.forEach(player => Object.assign(player, { hp: 6, gauge: 0, choice: null, gaveUp: false }));
      break;
    case 'ciao':
      Object.assign(room, { phase: 'roll', die: null, declaration: null, deadline: null, passed: [], usedPodium: 0 });
      room.players.forEach(player => Object.assign(player, { position: 0, reserve: 6, fallen: 0, goals: [] }));
      break;
    case 'onecard':
      startCards(room, roll);
      break;
    case 'omok':
      // Colors swap every match: seat 1 (P1) takes black in odd matches, seat 2 in even ones. Black moves first.
      room.blackSeat = (room.match + 1) % 2;
      room.index = room.blackSeat;
      room.board = Array(omokSize * omokSize).fill(0);
      room.lastMove = null;
      break;
    case 'yacht':
      resetDice(room);
      room.players.forEach(player => { player.scores = Array(12).fill(null); });
      break;
  }
}

function slapAction(room, player, input) {
  requireThat(input.turn === room.turn, stale, 409);
  if (input.action === 'giveup') {
    requireThat(typeof input.value === 'boolean', '포기 요청 상태를 선택해 주세요.');
    player.gaveUp = input.value;
    if (room.players.every(candidate => candidate.gaveUp)) {
      room.players.forEach(candidate => { candidate.choice = null; });
      complete(room, [], '두 사람이 모두 포기했습니다.');
    }
    return;
  }
  requireThat(input.action === 'choose', '알 수 없는 행동입니다.');
  requireThat(!room.players.some(candidate => candidate.gaveUp), '포기 요청 중입니다.');
  requireThat(!player.choice, '이번 턴에는 이미 선택했습니다.', 409);
  const { move, zone, power } = input;
  const attacking = player === current(room);
  if (move === 'charge') {
    requireThat(player.gauge < 3, '기는 최대 3개까지 모을 수 있습니다.');
    player.choice = { move };
  } else if (move === 'slap') {
    requireThat(attacking && integerIn(zone, 0, 2) && integerIn(power, 0, 2), '때릴 위치와 세기를 골라 주세요.');
    requireThat(player.gauge >= powerCosts[power], '기가 부족합니다.');
    player.choice = { move, zone, power };
  } else {
    requireThat(move === 'block' && !attacking && integerIn(zone, 0, 2), '막을 위치를 골라 주세요.');
    player.choice = { move, zone };
  }
  if (!room.players.every(candidate => candidate.choice)) return;

  const attacker = current(room);
  const defender = room.players[1 - room.index];
  const attack = attacker.choice;
  const defense = defender.choice;
  const slapped = attack.move === 'slap';
  attacker.gauge += slapped ? -powerCosts[attack.power] : 1;
  if (defense.move === 'charge') defender.gauge++;
  const blocked = slapped && defense.move === 'block' && attack.zone === defense.zone;
  const damage = slapped && !blocked ? [1, 2, 5][attack.power] : 0;
  defender.hp = Math.max(0, defender.hp - damage);
  room.last = { attacker: attacker.id, attack, defense, damage, blocked };
  attacker.choice = defender.choice = null;
  if (!defender.hp) complete(room, [attacker.id], attacker.name + ' 승리!');
  else {
    room.turn++;
    room.index = 1 - room.index;
  }
}

function responders(room) {
  return room.players.filter(player =>
    player !== current(room) && (player.position !== null || player.goals.length) && !room.passed.includes(player.id));
}

function ciaoAction(room, player, input, now, roll) {
  const { action, revision } = input;
  if (action === 'pass' || action === 'doubt') {
    requireThat(room.phase === 'respond' && Number.isInteger(revision) &&
      revision >= room.revision - room.passed.length && revision <= room.revision &&
      responders(room).includes(player), '이미 응답했거나 선언이 끝났습니다.', 409);
    if (action === 'doubt') resolveCiao(room, player);
    else {
      room.passed.push(player.id);
      if (!responders(room).length) resolveCiao(room);
    }
    return;
  }
  requireThat(revision === room.revision, stale, 409);
  requireThat(player === current(room), '지금은 선언할 차례가 아닙니다.');
  if (action === 'roll') {
    requireThat(room.phase === 'roll', '이미 주사위를 굴렸습니다.');
    const face = roll(6);
    room.die = face === 5 ? 0 : face;
    room.phase = 'declare';
    return;
  }
  requireThat(action === 'declare' && room.phase === 'declare' && integerIn(input.number, 1, 4), '1~4 중 하나를 선언해 주세요.');
  room.declaration = input.number;
  room.phase = 'respond';
  room.deadline = now + 20_000;
  if (!responders(room).length) resolveCiao(room);
}

function replacePawn(player) {
  player.position = player.reserve ? 0 : null;
  if (player.reserve) player.reserve--;
}

function movePawn(room, player, steps) {
  if (player.position === null) return;
  if (player.position + steps < 9) player.position += steps;
  else {
    player.goals.push(++room.usedPodium);
    replacePawn(player);
  }
}

function dropPawn(player) {
  if (player.position === null) player.goals.shift();
  else replacePawn(player);
  player.fallen++;
}

function resolveCiao(room, challenger = null, timedOut = []) {
  const speaker = current(room);
  const number = room.declaration;
  const honest = room.die === number;
  let mover = speaker;
  let result = '모두 PASS · ' + speaker.name + ' ' + number + '칸 이동';
  if (challenger) {
    const fallen = honest ? challenger : speaker;
    dropPawn(fallen);
    mover = honest ? speaker : challenger;
    const movement = mover.position === null ? '이동할 말 없음' : mover.name + ' ' + number + '칸 이동';
    result = challenger.name + ' 의심 ' + (honest ? '실패' : '성공') + ' · 실제 눈 ' + (room.die || 'X') +
      ' · ' + fallen.name + '의 말 추락 · ' + movement;
  }
  movePawn(room, mover, number);
  if (timedOut.length) result += ' · 자동 PASS ' + timedOut.map(player => player.name).join(', ');
  Object.assign(room, { last: result, phase: 'roll', die: null, declaration: null, deadline: null, passed: [] });

  const contenders = room.players.filter(player => player.position !== null || player.reserve || player.goals.length);
  const survivor = contenders.length === 1 ? contenders[0] : null;
  if (survivor && survivor.position !== null) {
    while (survivor.position !== null && room.usedPodium < 8) movePawn(room, survivor, 9);
    return finishCiao(room, survivor.name + '의 남은 말을 정산했습니다.');
  }
  const winner = room.players.find(player => player.goals.length >= 3);
  if (winner) return complete(room, [winner.id], winner.name + ' · 말 3개 도착!');
  if (room.usedPodium >= 8 || room.players.every(player => player.position === null)) {
    return finishCiao(room, '경주 종료 · 도착 점수 합계로 정산했습니다.');
  }
  do { room.index = (room.index + 1) % room.players.length; } while (current(room).position === null);
  room.turn++;
}

function finishCiao(room, message) {
  const best = Math.max(...room.players.map(player => sum(player.goals)));
  complete(room, room.players.filter(player => sum(player.goals) === best).map(player => player.id), message);
}

export function expireRoom(room, now) {
  if (room.status !== 'playing' || room.game !== 'ciao' || !room.deadline || now < room.deadline) return false;
  resolveCiao(room, null, responders(room));
  room.revision++;
  return true;
}

function shuffle(cards, random) {
  for (let index = cards.length - 1; index > 0; index--) {
    const other = random(index + 1);
    [cards[index], cards[other]] = [cards[other], cards[index]];
  }
  return cards;
}

function startCards(room, random) {
  const deck = shuffle(Array.from({ length: 54 }, (_, index) => index), random);
  const first = deck.findIndex(card => [4, 5, 6, 8, 9, 10].includes(cardRank(card)));
  const [opener] = deck.splice(first, 1);
  Object.assign(room, {
    deck, discard: [opener], activeSuit: cardSuit(opener), direction: 1, pending: 0,
    emptyDraws: 0, uncalled: [], callCount: 0, lastCaller: null, last: '각자 7장씩 받았습니다.',
  });
  room.players.forEach(player => { player.hand = []; });
  for (let round = 0; round < 7; round++) {
    for (const player of room.players) player.hand.push(deck.pop());
  }
}

function takeCards(room, player, count, random) {
  let drawn = 0;
  while (drawn < count) {
    if (!room.deck.length) {
      if (room.discard.length <= 1) break;
      room.deck = shuffle(room.discard.splice(0, room.discard.length - 1), random);
    }
    player.hand.push(room.deck.pop());
    drawn++;
  }
  return drawn;
}

function advanceCards(room, steps) {
  const size = room.players.length;
  room.index = (room.index + room.direction * steps + size) % size;
  room.turn++;
}

function oneCardAction(room, player, input, now, random) {
  const id = player.id;
  const top = room.discard.at(-1);
  if (input.action === 'call') {
    requireThat(!player.lastCall || now - player.lastCall >= 1000, '원카드는 1초에 한 번 누를 수 있습니다.', 429);
    player.lastCall = now;
    room.lastCaller = player.name;
    room.callCount++;
    const target = room.uncalled.includes(id) ? id : room.uncalled[0];
    room.uncalled = room.uncalled.filter(candidate => candidate !== target);
    if (target === id) {
      room.last = player.name + ' · 원카드!';
      return;
    }
    const penalized = target ? room.players.find(candidate => candidate.id === target) : player;
    const drawn = takeCards(room, penalized, 1, random);
    room.emptyDraws = 0;
    room.last = player.name + (target ? ' · ' + penalized.name + '의 미선언 지적' : ' · 원카드인 사람 없음') + ' · 벌칙 ' + drawn + '장';
    return;
  }

  requireThat(input.revision === room.revision, stale, 409);
  requireThat(player === current(room), '내 차례가 아닙니다.');
  const canPlay = card => legalCard(card, top, room.activeSuit, room.pending);
  room.uncalled = room.uncalled.filter(candidate => candidate !== id);
  if (input.action === 'draw') {
    requireThat(room.deck.length || room.discard.length > 1 || !player.hand.some(canPlay), '받을 카드가 없습니다. 낼 수 있는 카드를 내 주세요.');
    const drawn = takeCards(room, player, Math.max(1, room.pending), random);
    room.emptyDraws = !drawn && !room.pending ? room.emptyDraws + 1 : 0;
    room.pending = 0;
    room.last = player.name + ' · 카드 ' + drawn + '장 받기';
    advanceCards(room, 1);
    if (room.emptyDraws >= room.players.length) {
      const least = Math.min(...room.players.map(candidate => candidate.hand.length));
      complete(room, room.players.filter(candidate => candidate.hand.length === least).map(candidate => candidate.id), '카드 소진 · 가장 적은 손패로 승부');
    }
    return;
  }

  const { card, suit } = input;
  requireThat(input.action === 'play' && player.hand.includes(card) && canPlay(card), '지금 낼 수 없는 카드입니다.');
  const rank = cardRank(card);
  requireThat(rank !== 7 || integerIn(suit, 0, 3), '7을 낼 때는 다음 무늬를 선택해 주세요.');
  player.hand.splice(player.hand.indexOf(card), 1);
  room.discard.push(card);
  room.activeSuit = card >= 52 ? null : rank === 7 ? suit : cardSuit(card);
  room.pending = rank === 3 && room.pending ? 0 : room.pending + cardAttack(card);
  room.emptyDraws = 0;
  room.last = player.name + ' · ' + cardName(card);
  if (!player.hand.length) return complete(room, [id], player.name + ' · 손패를 모두 냈습니다!');
  if (player.hand.length === 1) room.uncalled.push(id);
  if (rank === 12) room.direction *= -1;
  advanceCards(room, rank === 13 ? 0 : rank === 11 ? 2 : 1);
}

function omokAction(room, player, input) {
  requireThat(input.turn === room.turn, stale, 409);
  if (input.action === 'resign') {
    const winner = room.players.find(candidate => candidate !== player);
    return complete(room, [winner.id], player.name + ' 기권');
  }
  requireThat(input.action === 'place', '알 수 없는 행동입니다.');
  requireThat(player === current(room), '내 차례가 아닙니다.');
  const { x, y } = input;
  requireThat(integerIn(x, 0, omokSize - 1) && integerIn(y, 0, omokSize - 1), '돌을 놓을 자리를 골라 주세요.');
  const index = y * omokSize + x;
  requireThat(!room.board[index], '이미 돌이 놓인 자리입니다.');
  const black = room.index === room.blackSeat;
  if (black) {
    const reason = forbiddenReason(room.board, index);
    requireThat(!reason, `흑은 ${reason} 금수 자리에 둘 수 없습니다.`);
  }
  room.board[index] = black ? BLACK : WHITE;
  room.lastMove = index;
  room.turn++;
  if (winningLine(room.board, index)) return complete(room, [player.id], player.name + (black ? '(흑)' : '(백)') + ' · 오목 완성!');
  if (room.board.every(Boolean)) return complete(room, room.players.map(candidate => candidate.id), '판이 가득 찼습니다 · 무승부');
  room.index = 1 - room.index;
}

function resetDice(room) {
  room.dice = Array(5).fill(0);
  room.held = Array(5).fill(false);
  room.rollsUsed = 0;
}

function yachtAction(room, player, input, roll) {
  requireThat(input.revision === room.revision, stale, 409);
  requireThat(player === current(room), '내 차례가 아닙니다.');
  if (input.action === 'roll') {
    const held = input.held;
    requireThat(room.rollsUsed < 3, '이번 차례에는 더 굴릴 수 없습니다.');
    requireThat(Array.isArray(held) && held.length === 5 && held.every(value => typeof value === 'boolean'), '주사위 고정 정보가 올바르지 않습니다.');
    requireThat(!room.rollsUsed || !held.every(Boolean), '다시 굴릴 주사위를 하나 이상 남겨 주세요.');
    room.held = held.map(value => room.rollsUsed > 0 && value);
    room.dice = room.dice.map((die, index) => room.held[index] ? die : roll(6) + 1);
    room.rollsUsed++;
    room.rollCount = (room.rollCount ?? 0) + 1;
    room.last = player.name + ' · ' + room.rollsUsed + '번째 굴림';
    return;
  }

  const category = input.category;
  requireThat(input.action === 'score' && integerIn(category, 0, 11) && room.rollsUsed && player.scores[category] === null,
    '주사위를 굴린 뒤 빈 점수 칸을 선택해 주세요.');
  const score = yachtScore(category, room.dice);
  player.scores[category] = score;
  room.last = player.name + ' · ' + yachtCategories[category] + ' 칸 ' + score + '점';
  resetDice(room);
  if (room.players.every(candidate => candidate.scores.every(value => value !== null))) {
    const best = Math.max(...room.players.map(candidate => yachtTotal(candidate.scores)));
    const winners = room.players.filter(candidate => yachtTotal(candidate.scores) === best);
    complete(room, winners.map(candidate => candidate.id), best + '점 · ' + (winners.length > 1 ? '무승부' : winners[0].name + ' 승리!'));
  } else {
    room.index = 1 - room.index;
    if (!room.index) room.turn++;
  }
}

export function roomView(room, id) {
  const view = structuredClone(room);
  view.spectators ??= [];
  view.hostId ??= room.players[0]?.id;
  view.paused = room.players.some(player => player.vacant);
  delete view.deadlineRemaining;
  for (const player of view.players) delete player.previousPlayerId;
  if (view.game === 'slap') {
    for (const player of view.players) {
      player.submitted = Boolean(player.choice);
      if (player.id !== id) delete player.choice;
    }
  }
  if (view.game === 'ciao') {
    view.responders = view.phase === 'respond' ? responders(room).map(player => player.id) : [];
    if (current(view)?.id !== id) delete view.die;
  }
  if (view.game === 'onecard') {
    view.top = view.discard?.at(-1) ?? null;
    delete view.deck;
    delete view.discard;
    for (const player of view.players) {
      player.count = player.hand?.length ?? 0;
      delete player.lastCall;
      if (player.id !== id) delete player.hand;
    }
  }
  return view;
}
