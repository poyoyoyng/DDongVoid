import { canTakeSeat } from '../public/rules.js';
import { requireThat } from './http.js';

const memberActions = new Set(['join', 'watch', 'spectate', 'leave', 'delete']);
export const isMemberAction = action => memberActions.has(action);
export const isRoomMember = (room, id) =>
  room.players.some(player => !player.vacant && player.id === id) || (room.spectators ?? []).some(spectator => spectator.id === id);

function resetReady(room) {
  room.status = 'waiting';
  room.winners = [];
  for (const player of room.players) player.ready = false;
}

function removeMember(room, id) {
  room.players = room.players.filter(player => player.id !== id);
  room.spectators = room.spectators.filter(spectator => spectator.id !== id);
  if (room.hostId === id) room.hostId = room.players.find(player => !player.vacant)?.id ?? room.spectators[0]?.id;
  if (!room.hostId) room.status = 'deleted';
}

function changeSeat(room, seat, nextId, nextName) {
  const previousId = seat.id;
  seat.id = nextId;
  seat.name = nextName;
  // Pending responses follow the seat, just like its turn, cards and score.
  for (const field of ['passed', 'uncalled']) {
    if (room[field]) room[field] = room[field].map(id => id === previousId ? nextId : id);
  }
  if (room.game === 'slap' && room.last?.attacker === previousId) room.last.attacker = nextId;
  room.seatEpoch = (room.seatEpoch ?? 0) + 1;
}

function fillSeat(room, account, now) {
  const seat = room.players.find(player => player.previousPlayerId === account.id) ??
    room.players.find(player => player.vacant);
  if (seat.previousPlayerId !== account.id) room.substituted = true;
  changeSeat(room, seat, account.id, account.name);
  delete seat.vacant;
  delete seat.previousPlayerId;
  if (room.deadlineRemaining != null && !room.players.some(player => player.vacant)) {
    room.deadline = now + room.deadlineRemaining;
    delete room.deadlineRemaining;
  }
}

function vacateSeat(room, player, now) {
  const index = room.players.indexOf(player);
  player.vacant = true;
  player.previousPlayerId = player.id;
  changeSeat(room, player, 'vacant:' + index, '빈 자리');
  if (room.deadline != null) {
    room.deadlineRemaining = Math.max(0, room.deadline - now);
    room.deadline = null;
  }
}

export function applyMemberAction(room, account, input, player, now) {
  room.spectators ??= [];
  room.hostId ??= room.players[0]?.id;
  const { id, name } = account;
  const spectator = room.spectators.some(entry => entry.id === id);
  if (input.action === 'join') {
    if (player) return false;
    requireThat(canTakeSeat(room), '지금은 빈 참가 자리가 없습니다. 관전으로 입장할 수 있습니다.', 409);
    room.spectators = room.spectators.filter(entry => entry.id !== id);
    if (room.status === 'playing') {
      fillSeat(room, account, now);
    } else {
      if (room.status === 'finished') resetReady(room);
      room.players.push({ id, name, ready: false });
    }
  } else if (input.action === 'watch') {
    if (player || spectator) return false;
    room.spectators.push({ id, name });
  } else {
    requireThat(player || spectator, '이 방에 입장하지 않았습니다.', 403);
    if (input.action === 'spectate') {
      if (!player) return false;
      room.spectators.push({ id, name });
      if (room.status === 'playing') {
        vacateSeat(room, player, now);
      } else {
        room.players = room.players.filter(entry => entry.id !== id);
        resetReady(room);
      }
    } else if (input.action === 'leave') {
      requireThat(!player || room.status !== 'playing', '경기 중에는 관전석으로 이동한 뒤 방을 나갈 수 있습니다.');
      removeMember(room, id);
      if (player && room.status !== 'deleted') resetReady(room);
    } else {
      requireThat(room.game !== 'slap' && room.hostId === id, '방장만 이 방을 삭제할 수 있습니다.', 403);
      room.status = 'deleted';
      room.players = [];
      room.spectators = [];
      room.deadline = null;
    }
  }
  return true;
}
