import { act, createGame } from '../public/jeung-yut/engine.mjs';
import { requireThat } from './http.js';

const random = roll => () => roll(0x1000000) / 0x1000000;

export function startJeungYut(room, roll) {
  room.yut = createGame(room.players.map(player => player.name), true, random(roll));
  room.index = room.yut.active;
  room.turn = room.yut.round;
  room.deadline = null;
}

export function jeungYutAction(room, player, input, roll) {
  requireThat(input.action === 'yut', '증윷 행동을 선택해 주세요.');
  requireThat(room.players[room.yut.active].id === player.id, '내 차례가 아닙니다.', 403);
  requireThat(input.gameRevision === room.yut.revision, '판이 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.', 409);
  const next = structuredClone(room.yut);
  next.players.forEach((entry, seat) => { entry.name = room.players[seat].name; });
  try { act(next, input.move ?? {}, random(roll)); }
  catch (error) { requireThat(false, error.message); }
  room.yut = next;
  room.index = next.active;
  room.turn = next.round;
  room.last = next.log[0];
  if (next.winner !== null) {
    room.status = 'finished';
    room.winners = [room.players[next.winner].id];
    room.endReason = next.winReason;
  }
}

export function jeungYutView(view) {
  if (view.status === 'waiting') { delete view.yut; return; }
  if (view.yut) view.yut.players.forEach((player, seat) => { player.name = view.players[seat].name; });
}
