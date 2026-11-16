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

export function openLiveSocket(ctx, request, accountId, packet) {
  requireThat(request.headers.get('Upgrade')?.toLowerCase() === 'websocket', 'WebSocket 연결이 필요합니다.', 426);
  const { 0: client, 1: server } = new WebSocketPair();
  server.serializeAttachment(accountId);
  ctx.acceptWebSocket(server);
  server.send(JSON.stringify(packet));
  return new Response(null, { status: 101, webSocket: client });
}

export function closeLiveSocket(socket, code, reason) {
  // Reserved codes can be reported by the runtime but cannot be sent in a Close frame.
  if ([1004, 1005, 1006, 1015].includes(code)) socket.close(1000);
  else socket.close(code, reason);
}

export class LobbyChat extends DurableObject {
  async fetch(request) {
    try {
      const id = request.headers.get('x-player');
      requireThat(id, '로그인이 필요합니다.', 401);
      if (request.method === 'POST') {
        const name = decodeURIComponent(request.headers.get('x-player-name') ?? '');
        return postChat(this.ctx, { id, name }, await readBody(request));
      }
      return openLiveSocket(this.ctx, request, id, { chat: chatHistory(this.ctx) });
    } catch (error) {
      return errorResponse(error);
    }
  }

  webSocketMessage(socket) { socket.close(1008, 'Read-only connection'); }
  webSocketClose(socket, code, reason) { closeLiveSocket(socket, code, reason); }
}
