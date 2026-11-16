import { DurableObject } from 'cloudflare:workers';
import { chatHistory, closeLiveSocket, openLiveSocket, postChat } from './chat.js';
import { applyAction, createRoom, expireRoom, roomView } from './games.js';
import { errorResponse, json, readBody, requireThat } from './http.js';
import { isRoomMember } from './room-members.js';

const retryDelay = 5000;

function projection(room) {
  return JSON.stringify({
    status: room.status,
    players: room.players.map(({ id, name, vacant }) => ({ id, name, ...(vacant && { vacant }) })),
    spectators: room.spectators ?? [],
  });
}

export class GameRoom extends DurableObject {
  get room() { return this.ctx.storage.kv.get('room'); }
  get pending() { return this.ctx.storage.kv.get('pending'); }

  schedule(room, pending) {
    const next = Math.min(room?.deadline ?? Infinity, pending ? Date.now() + retryDelay : Infinity);
    return Number.isFinite(next) ? this.ctx.storage.setAlarm(next) : this.ctx.storage.deleteAlarm();
  }

  async store(room, previous) {
    const summary = projection(room);
    const changed = !previous || summary !== projection(previous);
    const pending = this.pending ?? { summary: null, results: [] };
    if (changed) pending.summary = {
      id: room.id, game: room.game, title: room.title, revision: room.revision,
      createdAt: room.createdAt, ...JSON.parse(summary),
    };
    if (room.status === 'finished' && previous?.status === 'playing' && room.winners.length && !room.substituted) {
      pending.results.push({
        id: room.id, game: room.game, match: room.match,
        outcomes: room.players.map(({ id }) => ({
          id, outcome: room.winners.includes(id) ? (room.winners.length > 1 ? 'D' : 'W') : 'L',
        })),
      });
    }
    const hasPending = pending.summary || pending.results.length;
    this.ctx.storage.kv.put('room', room.status === 'deleted' ? {
      id: room.id, game: room.game, title: room.title, status: room.status,
      createdAt: room.createdAt, revision: room.revision, players: [],
    } : room);
    if (room.status === 'deleted') this.ctx.storage.kv.delete('chat');
    if (hasPending) this.ctx.storage.kv.put('pending', pending);
    await this.schedule(room, hasPending);
    this.notify(this.room);
    if (hasPending) this.ctx.waitUntil(this.flush().catch(error => console.error('방 목록과 결과 동기화 재시도', error)));
  }

  flush() {
    if (!this.flushing) {
      this.flushing = this.flushPending().finally(() => { this.flushing = null; });
    }
    return this.flushing;
  }

  async flushPending() {
    const pending = this.pending;
    if (!pending) return;
    const db = this.env.DB;
    const statements = [];
    const summary = pending.summary;
    if (summary) {
      statements.push(db.prepare(`
        INSERT INTO rooms VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status, players = excluded.players, revision = excluded.revision
        WHERE excluded.revision > rooms.revision
      `).bind(summary.id, summary.game, summary.title, summary.status,
        JSON.stringify(summary.players), summary.revision, summary.createdAt));
      statements.push(db.prepare(`
        INSERT INTO room_spectators (room_id, spectators, revision) VALUES (?, ?, ?)
        ON CONFLICT(room_id) DO UPDATE SET spectators = excluded.spectators, revision = excluded.revision
        WHERE excluded.revision > room_spectators.revision
      `).bind(summary.id, JSON.stringify(summary.spectators ?? []), summary.revision));
    }
    for (const result of pending.results.slice(0, 15)) {
      for (const player of result.outcomes) {
        statements.push(db.prepare('INSERT OR IGNORE INTO match_results VALUES (?, ?, ?, ?, ?)')
          .bind(result.id, result.match, result.game, player.id, player.outcome));
      }
    }
    await db.batch(statements);
    const latest = this.pending;
    if (latest.summary?.revision === summary?.revision) latest.summary = null;
    const applied = new Set(pending.results.slice(0, 15).map(result => result.match));
    latest.results = latest.results.filter(result => !applied.has(result.match));
    const hasPending = latest.summary || latest.results.length;
    if (hasPending) this.ctx.storage.kv.put('pending', latest);
    else this.ctx.storage.kv.delete('pending');
    await this.schedule(this.room, hasPending);
  }

  notify(room) {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        if (room.status === 'deleted' || !isRoomMember(room, socket.deserializeAttachment())) {
          socket.close(1000, 'Room closed');
        } else socket.send(JSON.stringify({ revision: room.revision }));
      } catch { /* A disconnected client reads the latest room when it reconnects. */ }
    }
  }

  async alarm() {
    const previous = this.room;
    const room = structuredClone(previous);
    if (room && expireRoom(room, Date.now())) await this.store(room, previous);
    if (this.pending) await this.flush();
    else if (room?.deadline) await this.schedule(this.room, this.pending);
  }

  async fetch(request) {
    try {
      const path = new URL(request.url).pathname;
      const account = { id: request.headers.get('x-player'), name: decodeURIComponent(request.headers.get('x-player-name') ?? '') };
      requireThat(account.id, '로그인이 필요합니다.', 401);
      const body = request.method === 'POST' ? await readBody(request) : null;
      const now = Date.now();
      const previous = this.room;
      if (path === '/create') {
        requireThat(!previous, '이미 만들어진 방입니다.', 409);
        const room = createRoom(body.id, body.game, body.title, account, now);
        await this.store(room, null);
        try { await this.flush(); } catch { /* The alarm retries the room listing. */ }
        return json({ room: roomView(room, account.id) }, 201);
      }
      requireThat(previous && previous.status !== 'deleted', '방이 삭제되었거나 존재하지 않습니다.', 404);
      let room = structuredClone(previous);
      if (expireRoom(room, now)) {
        await this.store(room, previous);
        room = this.room;
      }
      if (path === '/action') {
        const next = structuredClone(room);
        if (applyAction(next, account, body, now)) await this.store(next, room);
        return json({ room: next.status !== 'deleted' && isRoomMember(next, account.id)
          ? roomView(next, account.id) : null });
      }
      requireThat(isRoomMember(room, account.id), '이 방에 입장하지 않았습니다.', 403);
      if (path === '/chat') {
        const sockets = this.ctx.getWebSockets().filter(socket => isRoomMember(room, socket.deserializeAttachment()));
        return postChat(this.ctx, account, body, sockets);
      }
      if (path === '/socket') {
        requireThat(this.ctx.getWebSockets().length < 32, '열려 있는 대전방 연결이 너무 많습니다.', 429);
        return openLiveSocket(this.ctx, request, account.id, { revision: room.revision, chat: chatHistory(this.ctx) });
      }
      return json({ room: roomView(room, account.id) });
    } catch (error) {
      return errorResponse(error);
    }
  }

  webSocketMessage(socket) { socket.close(1008, 'Read-only connection'); }

  webSocketClose(socket, code, reason) { closeLiveSocket(socket, code, reason); }
}
