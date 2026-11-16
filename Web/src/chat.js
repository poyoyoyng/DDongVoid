import { DurableObject } from 'cloudflare:workers';
import { errorResponse, json, readBody, requireThat } from './http.js';

const historyLimit = 50;

export const chatHistory = ctx => ctx.storage.kv.get('chat') ?? [];

export function postChat(ctx, account, input, sockets = ctx.getWebSockets()) {
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  requireThat(text.length > 0 && text.length <= 300, '메시지를 1~300자로 입력해 주세요.');
  const history = chatHistory(ctx);
  const chatMessage = {
    id: (history.at(-1)?.id ?? 0) + 1,
    playerId: account.id, name: account.name, text, sentAt: Date.now(),
  };
  ctx.storage.kv.put('chat', [...history.slice(1 - historyLimit), chatMessage]);
  const packet = JSON.stringify({ chatMessage });
  for (const socket of sockets) {
    try { socket.send(packet); } catch { /* A client reads the history on reconnect. */ }
  }
  return json({ chatMessage }, 201);
}

export function openLiveSocket(ctx, request, attachment, packet) {
  requireThat(request.headers.get('Upgrade')?.toLowerCase() === 'websocket', 'WebSocket 연결이 필요합니다.', 426);
  const { 0: client, 1: server } = new WebSocketPair();
  server.serializeAttachment(attachment);
  ctx.acceptWebSocket(server);
  server.send(JSON.stringify(packet));
  return new Response(null, { status: 101, webSocket: client });
}

export function closeLiveSocket(socket, code, reason) {
  // Reserved codes can be reported by the runtime but cannot be sent in a Close frame.
  if ([1004, 1005, 1006, 1015].includes(code)) socket.close(1000);
  else socket.close(code, reason);
}

// Rooms report only when their live members change, so an old report is checked with the room itself.
const presenceCheck = 10 * 60 * 1000;

export const openSockets = (ctx, leaving) =>
  ctx.getWebSockets().filter(socket => socket !== leaving && socket.readyState === WebSocket.OPEN);

// Room members are kept as { id, name }; the older id-only copy under 'rooms' is no longer read.
const roomsKey = 'roomMembers';

function setRoomPresence(rooms, id, presence, at) {
  if (presence?.members.length) rooms[id] = { members: presence.members, playing: presence.playing, at };
  else delete rooms[id];
}

const sortedNames = members =>
  [...new Map(members.map(member => [member.id, member.name])).values()].sort((a, b) => a.localeCompare(b, 'ko'));

export function listPresence(lobby, rooms) {
  const members = Object.values(rooms).flatMap(room => room.members);
  const playing = new Set(Object.values(rooms).flatMap(room => room.playing));
  return {
    lobby: sortedNames(lobby),
    rooms: sortedNames(members),
    playing: sortedNames(members.filter(member => playing.has(member.id))),
  };
}

export class LobbyChat extends DurableObject {
  async fetch(request) {
    try {
      const id = request.headers.get('x-player');
      requireThat(id, '로그인이 필요합니다.', 401);
      const name = decodeURIComponent(request.headers.get('x-player-name') ?? '');
      if (request.method === 'POST') return postChat(this.ctx, { id, name }, await readBody(request));
      const sockets = openSockets(this.ctx);
      const presence = listPresence([...sockets.map(socket => socket.deserializeAttachment()), { id, name }], await this.rooms());
      const response = openLiveSocket(this.ctx, request, { id, name }, { chat: chatHistory(this.ctx), presence });
      this.send(sockets, { presence });
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  }

  async reportRoom(id, presence) {
    const rooms = this.ctx.storage.kv.get(roomsKey) ?? {};
    setRoomPresence(rooms, id, presence, Date.now());
    this.ctx.storage.kv.put(roomsKey, rooms);
    await this.broadcastPresence();
  }

  async rooms() {
    const now = Date.now();
    const stale = Object.entries(this.ctx.storage.kv.get(roomsKey) ?? {}).filter(([, room]) => now - room.at > presenceCheck);
    const checked = await Promise.all(stale.map(([id, room]) => this.env.ROOMS.getByName(id).checkPresence()
      .then(presence => [id, room.at, presence], () => [id, room.at, null])));
    const rooms = this.ctx.storage.kv.get(roomsKey) ?? {};
    // A report that arrived while the rooms were being checked is newer than the check.
    for (const [id, at, presence] of checked) if (rooms[id]?.at === at) setRoomPresence(rooms, id, presence, now);
    if (checked.length) this.ctx.storage.kv.put(roomsKey, rooms);
    return rooms;
  }

  async broadcastPresence(leaving) {
    const rooms = await this.rooms();
    const sockets = openSockets(this.ctx, leaving);
    this.send(sockets, { presence: listPresence(sockets.map(socket => socket.deserializeAttachment()), rooms) });
  }

  send(sockets, packet) {
    const data = JSON.stringify(packet);
    for (const socket of sockets) {
      try { socket.send(data); } catch { /* A client reads the counts on reconnect. */ }
    }
  }

  webSocketMessage(socket) { socket.close(1008, 'Read-only connection'); }

  webSocketClose(socket, code, reason) {
    closeLiveSocket(socket, code, reason);
    return this.broadcastPresence(socket);
  }
}
