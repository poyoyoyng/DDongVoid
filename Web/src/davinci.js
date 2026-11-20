import { colorNames, colors, handSize, insertSlots, joker, stepTime, tileColor, tileName, tileValue, valueName } from '../public/davinci.js';
import { requireThat } from './http.js';

const integerIn = (value, first, last) => Number.isInteger(value) && value >= first && value <= last;
const hidden = player => player.tiles.filter(entry => !entry.open).length;
const spot = (player, index) => `${player.name}님의 왼쪽에서 ${index + 1}번째 ${colorNames[tileColor(player.tiles[index].tile)]} 패`;

// The room keeps a long history; the log box shows five lines and scrolls for the rest.
function note(room, text) {
  room.log = [...(room.log ?? []), text].slice(-50);
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = random(index + 1);
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

// The pile keeps its colors apart, since a face-down tile still shows its color: the player picks which color to draw.
export function startDavinci(room, random, now) {
  const numbers = shuffle(Array.from({ length: 24 }, (_, tile) => tile), random);
  const size = handSize(room.players.length);
  room.players.forEach(player => Object.assign(player, {
    tiles: numbers.splice(0, size).sort((a, b) => a - b).map(tile => ({ tile, open: false, misses: [] })),
    out: false, place: null,
  }));
  // Starting hands hold no joker; the jokers join the pile only after the deal.
  const rest = [...numbers, 24, 25];
  room.pile = Object.fromEntries(colors.map(color => [color, shuffle(rest.filter(tile => tileColor(tile) === color), random)]));
  const first = random(room.players.length);
  // guesses counts every guess of the game and lastHit says how the latest went, so the room can flash 정답!/실패!.
  Object.assign(room, { index: first, log: [], outs: [], guesses: 0, lastHit: null });
  note(room, `게임 시작 · ${size}장씩 · ${room.players[first].name}님부터`);
  beginTurn(room, now);
}

function beginTurn(room, now) {
  Object.assign(room, { drawn: null, slots: null, streak: 0, deadline: now + stepTime });
  room.phase = room.pile.black.length || room.pile.white.length ? 'draw' : 'guess';
}

function drawTile(room, player, color, now) {
  requireThat(colors.includes(color) && room.pile[color].length, '남은 패가 있는 색을 골라 주세요.');
  const tile = room.pile[color].pop();
  room.drawn = tile;
  const slots = insertSlots(player.tiles, tile);
  note(room, `${player.name} · ${colorNames[color]} 패 가져오기`);
  if (slots.length === 1) placeTile(room, player, slots[0], now);
  else Object.assign(room, { phase: 'place', slots, deadline: now + stepTime });
}

function placeTile(room, player, slot, now) {
  player.tiles.splice(slot, 0, { tile: room.drawn, open: false, misses: [], fresh: true });
  Object.assign(room, { phase: 'guess', slots: null, deadline: now + stepTime });
}

// Whoever has nothing left to hide is out; once a single player is left, they win.
function knockOut(room, player) {
  if (player.out || hidden(player)) return false;
  player.out = true;
  room.outs.push(player.id);
  note(room, `${player.name} · 모든 패가 공개되어 탈락`);
  const left = room.players.filter(candidate => !candidate.out);
  if (left.length > 1) return false;
  const winner = left[0];
  const reason = `${winner.name}님이 마지막까지 살아남았습니다!`;
  note(room, reason);
  // The first one out finishes last.
  room.players.forEach(candidate => {
    candidate.place = candidate === winner ? 1 : room.players.length - room.outs.indexOf(candidate.id);
  });
  Object.assign(room, {
    phase: 'over', status: 'finished', index: null, deadline: null, drawn: null, slots: null,
    winners: [winner.id], endReason: reason,
  });
  return true;
}

function endTurn(room, seat, now) {
  for (const player of room.players) for (const entry of player.tiles) delete entry.fresh;
  const size = room.players.length;
  for (let step = 1; step <= size; step++) {
    const next = (seat + step) % size;
    if (!room.players[next].out) {
      room.index = next;
      return beginTurn(room, now);
    }
  }
}

function guess(room, player, seat, input, now) {
  const target = integerIn(input.target, 0, room.players.length - 1) ? room.players[input.target] : null;
  const entry = target && integerIn(input.index, 0, target.tiles.length - 1) ? target.tiles[input.index] : null;
  requireThat(target && target !== player && !target.out && entry && !entry.open, '맞힐 상대의 숨겨진 패를 골라 주세요.');
  requireThat(integerIn(input.value, 0, joker), '0~11 또는 조커 중 하나를 골라 주세요.');
  const said = `${player.name} → ${spot(target, input.index)}는 ${valueName(input.value)}?`;
  room.guesses++;
  room.lastHit = tileValue(entry.tile) === input.value;
  if (room.lastHit) {
    entry.open = true;
    room.streak++;
    note(room, said + ' · 맞음!');
    if (!knockOut(room, target)) room.deadline = now + stepTime;
    return;
  }
  if (!entry.misses.includes(input.value)) entry.misses.push(input.value);
  note(room, said + ' · 틀림');
  miss(room, player, seat, now);
}

// A miss turns up the tile drawn this turn; with nothing drawn, the player turns up one of their own hidden tiles.
function miss(room, player, seat, now) {
  if (room.drawn == null) return Object.assign(room, { phase: 'reveal', deadline: now + stepTime });
  const entry = player.tiles.find(candidate => candidate.tile === room.drawn);
  entry.open = true;
  note(room, `${player.name} · 가져온 ${tileName(room.drawn)} 공개`);
  if (!knockOut(room, player)) endTurn(room, seat, now);
}

function reveal(room, player, seat, index, now, suffix = '') {
  const entry = Number.isInteger(index) ? player.tiles[index] : null;
  requireThat(entry && !entry.open, '공개할 내 숨겨진 패를 골라 주세요.');
  entry.open = true;
  note(room, `${player.name} · 가져올 패가 없어 내 ${tileName(entry.tile)} 공개${suffix}`);
  if (!knockOut(room, player)) endTurn(room, seat, now);
}

export function davinciAction(room, player, input, now) {
  requireThat(input.turn === room.turn, '방 상태가 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.', 409);
  const seat = room.players.indexOf(player);
  requireThat(room.phase !== 'over' && seat === room.index, '내 차례가 아닙니다.');
  const { action } = input;
  if (action === 'draw') {
    requireThat(room.phase === 'draw', '지금은 패를 가져올 때가 아닙니다.');
    drawTile(room, player, input.color, now);
  } else if (action === 'place') {
    requireThat(room.phase === 'place' && room.slots.includes(input.slot), '가져온 패를 놓을 자리를 골라 주세요.');
    placeTile(room, player, input.slot, now);
  } else if (action === 'guess') {
    requireThat(room.phase === 'guess', '지금은 추리할 때가 아닙니다.');
    guess(room, player, seat, input, now);
  } else if (action === 'stop') {
    requireThat(room.phase === 'guess' && room.streak > 0, '한 번 이상 맞힌 뒤에 멈출 수 있습니다.');
    note(room, `${player.name} · 추리를 멈추고 차례 넘기기`);
    endTurn(room, seat, now);
  } else {
    requireThat(action === 'reveal' && room.phase === 'reveal', '알 수 없는 행동입니다.');
    reveal(room, player, seat, input.index, now);
  }
  room.turn++;
}

// When the clock runs out: draw from the bigger pile, take the first slot, stop after a hit or else count a miss,
// and turn up the leftmost hidden tile.
export function expireDavinci(room, now) {
  const seat = room.index;
  const player = room.players[seat];
  const late = ' (시간 초과)';
  if (room.phase === 'draw') {
    drawTile(room, player, room.pile.white.length > room.pile.black.length ? 'white' : 'black', now);
  } else if (room.phase === 'place') {
    placeTile(room, player, room.slots[0], now);
  } else if (room.phase === 'guess' && room.streak) {
    note(room, `${player.name} · 추리를 멈추고 차례 넘기기${late}`);
    endTurn(room, seat, now);
  } else if (room.phase === 'guess') {
    note(room, `${player.name} · 추리하지 못함${late}`);
    miss(room, player, seat, now);
  } else {
    reveal(room, player, seat, player.tiles.findIndex(entry => !entry.open), now, late);
  }
  room.turn++;
}

// Everyone sees each tile's color, which ones are face up and the misses on it; only the owner sees their hidden numbers.
// Once the game is over every tile is shown.
export function davinciView(view, id) {
  const over = view.status === 'finished';
  view.pileCount = Object.fromEntries(colors.map(color => [color, view.pile?.[color]?.length ?? 0]));
  delete view.pile;
  const mine = view.players.find(player => player.id === id);
  if (!mine || mine !== view.players[view.index]) delete view.drawn;
  for (const player of view.players) {
    for (const entry of player.tiles ?? []) {
      entry.color = tileColor(entry.tile);
      if (!entry.open && player !== mine && !over) delete entry.tile;
    }
  }
}
