import { DurableObject } from 'cloudflare:workers';
import { chatHistory, closeLiveSocket, openLiveSocket, openSockets, postChat } from './chat.js';
import { applyAction, createRoom, expireRoom, roomView } from './games.js';
import { errorResponse, json, readBody, requireThat } from './http.js';
import { extendsStreak, ratingChanges, startRating, streakBonus } from './ratings.js';
import { isRoomMember } from './room-members.js';
import { refillMoney, startMoney } from '../public/seotda.js';
import { walletStatements } from './wallets.js';

const retryDelay = 5000;
// In a team game every member of the winning team wins.
const teamGames = new Set(['saboteur']);

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
    // A 섯다 hand records the money each bettor won or lost, even when it ended because someone left.
    if (room.settlement && room.settlement.match !== previous?.settlement?.match) {
      pending.results.push({ id: room.id, game: room.game, ...room.settlement });
    } else if (room.game !== 'seotda' && room.status === 'finished' && previous?.status === 'playing' && room.winners.length && !room.substituted) {
      pending.results.push({
        id: room.id, game: room.game, match: room.match,
        outcomes: room.players.map(({ id }) => ({
          id, outcome: room.winners.includes(id) ? (room.winners.length > 1 && !teamGames.has(room.game) ? 'D' : 'W') : 'L',
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
    this.ctx.waitUntil(this.reportPresence());
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
    const results = pending.results.slice(0, 15);
    const ids = [...new Set(results.filter(result => !result.money).flatMap(result => result.outcomes.map(player => player.id)))];
    const ratings = new Map();
    if (ids.length) {
      const { results: rows } = await db.prepare(`SELECT game, account_id, rating, streak FROM ratings WHERE account_id IN (${ids.map(() => '?').join(', ')})`)
        .bind(...ids).all();
      for (const row of rows) ratings.set(row.game + ':' + row.account_id, { rating: row.rating, streak: row.streak });
    }
    for (const result of results) {
      if (result.money) {
        statements.push(...walletStatements(db, result));
      } else {
        const entry = id => ratings.get(result.game + ':' + id) ?? { rating: startRating, streak: 0 };
        const current = new Map(result.outcomes.map(player => [player.id, entry(player.id).rating]));
        const outcomes = new Map(result.outcomes.map(player => [player.id, player.outcome]));
        // Rating changes run before the match is recorded, so a retried batch finds the match and skips them.
        for (const { id, change: elo } of ratingChanges(result.outcomes, current)) {
          const won = extendsStreak(outcomes.get(id));
          const streak = won ? entry(id).streak + 1 : 0;
          const change = elo + streakBonus(streak);
          ratings.set(result.game + ':' + id, { rating: current.get(id) + change, streak });
          statements.push(db.prepare(`
            INSERT INTO ratings (game, account_id, rating, streak)
            SELECT ?1, ?2, ?3 + ?4, ?7 WHERE NOT EXISTS (SELECT 1 FROM match_results WHERE room_id = ?5 AND match_no = ?6)
            ON CONFLICT (game, account_id) DO UPDATE SET rating = ratings.rating + ?4, streak = CASE WHEN ?7 THEN ratings.streak + 1 ELSE 0 END
          `).bind(result.game, id, startRating, change, result.id, result.match, won ? 1 : 0));
        }
      }
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

  livePresence(leaving) {
    const room = this.room;
    const members = new Map();
    const playing = new Set();
    if (room && room.status !== 'deleted') {
      for (const socket of openSockets(this.ctx, leaving)) {
        const id = socket.deserializeAttachment();
        const player = room.players.find(entry => !entry.vacant && entry.id === id);
        const member = player ?? (room.spectators ?? []).find(entry => entry.id === id);
        if (!member) continue;
        members.set(id, member.name);
        if (player && room.status === 'playing') playing.add(id);
      }
    }
    return {
      members: [...members].sort(([a], [b]) => a.localeCompare(b)).map(([id, name]) => ({ id, name })),
      playing: [...playing].sort(),
    };
  }

  // The lobby asks directly when its copy is old; the answer counts as reported.
  checkPresence() {
    const presence = this.livePresence();
    this.ctx.storage.kv.put('presence', JSON.stringify(presence));
    return presence;
  }

  // The lobby counts who has a room open right now; it hears only when that changes, in order.
  reportPresence(leaving) {
    const report = () => this.sendPresence(leaving);
    this.reporting = (this.reporting ?? Promise.resolve()).then(report, report);
    return this.reporting;
  }

  async sendPresence(leaving) {
    const room = this.room;
    const presence = this.livePresence(leaving);
    const summary = JSON.stringify(presence);
    if (!room || summary === (this.ctx.storage.kv.get('presence') ?? '{"members":[],"playing":[]}')) return;
    try {
      await this.env.LOBBY_CHAT.getByName('lobby').reportRoom(room.id, presence);
      this.ctx.storage.kv.put('presence', summary);
    } catch (error) {
      console.error('접속 인원 보고 실패', error);
    }
  }

  // 섯다 bets against D1 balances, so this room's finished hands are written first.
  async loadWallets(room) {
    while (this.pending?.results.length) await this.flush();
    const ids = room.players.filter(player => !player.vacant).map(player => player.id);
    const wallets = new Map(ids.map(id => [id, startMoney]));
    if (!ids.length) return wallets;
    const { results } = await this.env.DB.prepare(`SELECT account_id, balance FROM wallets WHERE account_id IN (${ids.map(() => '?').join(', ')})`)
      .bind(...ids).all();
    for (const row of results) wallets.set(row.account_id, row.balance);
    return wallets;
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
      const seotdaReady = path === '/action' && body.action === 'ready' && body.ready === true && this.room?.game === 'seotda';
      const wallets = seotdaReady && this.room.status !== 'deleted' ? await this.loadWallets(this.room) : null;
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
        if (applyAction(next, account, body, now, undefined, wallets)) await this.store(next, room);
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
        const response = openLiveSocket(this.ctx, request, account.id, { revision: room.revision, chat: chatHistory(this.ctx) });
        this.ctx.waitUntil(this.reportPresence());
        return response;
      }
      // Finished/waiting snapshots may predate a refill; show the current persisted balance on refresh.
      if (room.game === 'seotda' && room.status !== 'playing') {
        const balances = await this.loadWallets(room);
        for (const player of room.players) {
          const balance = balances.get(player.id);
          if (player.balance === 0 && balance === refillMoney) player.refilledAfter = true;
          player.balance = balance;
        }
      }
      return json({ room: roomView(room, account.id) });
    } catch (error) {
      return errorResponse(error);
    }
  }

  webSocketMessage(socket) { socket.close(1008, 'Read-only connection'); }

  webSocketClose(socket, code, reason) {
    closeLiveSocket(socket, code, reason);
    return this.reportPresence(socket);
  }
}
