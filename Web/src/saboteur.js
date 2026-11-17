import {
  canPlace, cardName, cards, goalFaceName, goalFaces, goalNames, goalRotation, goalX, goalYs, handSize, reachedGoals, saboteurCounts, toolNames, turnTime,
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

// One game is one round of gold diggers against saboteurs, with exactly saboteurCounts saboteurs.
export function startSaboteur(room, random, now) {
  const count = room.players.length;
  const saboteurs = saboteurCounts[count];
  const roles = shuffle([...Array(saboteurs).fill('saboteur'), ...Array(count - saboteurs).fill('digger')], random);
  const first = random(count);
  room.deck = shuffle(cards.map((_, card) => card), random);
  room.goals = shuffle([...goalFaces], random);
  room.board = [{ x: 0, y: 0, kind: 'start' }, ...goalYs.map((y, goal) => ({ x: goalX, y, kind: 'goal', goal }))];
  const size = handSize(count);
  room.players.forEach((player, seat) => Object.assign(player, {
    role: roles[seat], hand: room.deck.splice(room.deck.length - size), broken: [], peeks: {},
  }));
  Object.assign(room, { phase: 'play', index: first, result: null, lastCell: null, discarded: 0, deadline: now + turnTime, log: [] });
  note(room, `게임 시작 · ${room.players[first].name}부터 · 손패 ${size}장씩`);
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
  if (found) return finish(room, 'digger', seat);
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
  finish(room, 'saboteur');
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

// The whole winning team wins: every gold digger when the gold is reached (whoever reached it), otherwise every saboteur.
function finish(room, team, finder = null) {
  const winners = room.players.filter(player => player.role === team);
  const reason = team === 'digger' ? `${room.players[finder].name}님이 금을 찾았습니다 · 광부 팀 승리!`
    : '금을 찾지 못하고 카드가 모두 떨어졌습니다 · 방해꾼 팀 승리!';
  note(room, reason);
  room.result = { winner: team, finder, goals: [...room.goals] };
  Object.assign(room, {
    phase: 'over', status: 'finished', index: null, deadline: null, winners: winners.map(player => player.id), endReason: reason,
  });
}

export function saboteurAction(room, player, input, now) {
  requireThat(input.turn === room.turn, '방 상태가 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.', 409);
  const seat = room.players.indexOf(player);
  requireThat(room.phase === 'play' && seat === room.index, '내 차례가 아닙니다.');
  playCard(room, player, seat, input, now);
}

// When the clock runs out the player passes with their first card.
export function expireSaboteur(room, now) {
  const player = room.players[room.index];
  playCard(room, player, room.index, { action: 'discard', card: player.hand[0] }, now, ' (시간 초과)');
}

// Others' hands, roles and map peeks stay hidden until the game ends; then every role and goal is shown.
export function saboteurView(view, id) {
  const over = view.status === 'finished';
  view.deckCount = view.deck?.length ?? 0;
  delete view.deck;
  if (!over) delete view.goals;
  for (const player of view.players) {
    player.handCount = player.hand?.length ?? 0;
    if (player.id === id) continue;
    delete player.hand;
    delete player.peeks;
    if (!over) delete player.role;
  }
}
