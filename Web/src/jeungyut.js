import { FLICK_SECONDS, act, createGame } from '../public/jeung-yut/engine.mjs';
import { requireThat } from './http.js';

const random = roll => () => roll(0x1000000) / 0x1000000;
// The player's page ends a flick after FLICK_SECONDS; the room waits a little longer for slow connections and animations.
const flickGrace = 5_000;

export function startJeungYut(room, roll) {
  room.yut = createGame(room.players.map(player => player.name), true, random(roll));
  room.index = room.yut.active;
  room.turn = room.yut.round;
  room.deadline = null;
}

function applyYut(room, move, roll, now) {
  const next = structuredClone(room.yut);
  next.players.forEach((entry, seat) => { entry.name = room.players[seat].name; });
  act(next, move, random(roll));
  room.yut = next;
  room.index = next.active;
  room.turn = next.round;
  room.last = next.log[0];
  room.deadline = next.phase === 'flick' ? now + FLICK_SECONDS * 1000 + flickGrace : null;
  if (next.winner !== null) {
    room.status = 'finished';
    room.winners = [room.players[next.winner].id];
    room.endReason = next.winReason;
  }
}

export function jeungYutAction(room, player, input, roll, now) {
  requireThat(input.action === 'yut', '증윷 행동을 선택해 주세요.');
  const move = { ...(input.move ?? {}) };
  if (room.yut.phase === 'draft') {
    // Everyone picks at once, so a pick is checked against the picker's own seat instead of the turn or revision.
    const seat = room.players.findIndex(entry => entry.id === player.id && !entry.vacant);
    requireThat(seat >= 0 && room.yut.draft?.[seat], '이번 증강 선택에 참여하지 않습니다.', 403);
    move.player = seat;
  } else {
    requireThat(room.players[room.yut.active].id === player.id, '내 차례가 아닙니다.', 403);
    requireThat(input.gameRevision === room.yut.revision, '판이 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.', 409);
  }
  try { applyYut(room, move, roll, now); }
  catch (error) { requireThat(false, error.message); }
}

export function expireJeungYut(room, now, roll) {
  if (room.yut?.phase === 'flick') applyYut(room, { type: 'flickTimeout' }, roll, now);
  else room.deadline = null;
}

export function jeungYutView(view) {
  if (view.status === 'waiting') { delete view.yut; return; }
  if (view.yut) view.yut.players.forEach((player, seat) => { player.name = view.players[seat].name; });
}
