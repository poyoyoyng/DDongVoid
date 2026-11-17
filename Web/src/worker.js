import { authenticate, currentUser, findAccount } from './auth.js';
import { isRoomGame } from './games.js';
import { errorResponse, json, readBody, requireThat } from './http.js';
import { music } from './music.js';
import { startRating } from './ratings.js';
import { isSoloGame, startSolo } from './scores.js';
export { GameRoom } from './room.js';
export { ScoreVerifier } from './scores.js';
export { AccountPasswords } from './passwords.js';
export { LobbyChat } from './chat.js';

const roomPath = /^\/api\/rooms\/([0-9a-f-]{36})(?:\/(action|socket|chat))?$/;

async function rankings(db, game) {
  requireThat(isRoomGame(game) || isSoloGame(game), '게임을 선택해 주세요.');
  // Every account is listed; members without a record show zeros.
  const sql = isSoloGame(game) ? `
    WITH board AS (
      SELECT name, COALESCE(score, 0) AS score
      FROM accounts LEFT JOIN solo_bests ON solo_bests.account_id = accounts.id AND solo_bests.game = ?
    )
    SELECT name, score, RANK() OVER (ORDER BY score DESC) AS rank FROM board ORDER BY rank, name LIMIT 1000
  ` : `
    WITH totals AS (
      SELECT account_id, SUM(outcome = 'W') AS wins, SUM(outcome = 'D') AS draws, SUM(outcome = 'L') AS losses
      FROM match_results WHERE game = ?1 GROUP BY account_id
    ), board AS (
      SELECT name, CAST(ROUND(COALESCE(ratings.rating, ${startRating})) AS INTEGER) AS mmr, COALESCE(ratings.streak, 0) AS streak,
        COALESCE(wins, 0) AS wins, COALESCE(draws, 0) AS draws, COALESCE(losses, 0) AS losses
      FROM accounts LEFT JOIN totals ON totals.account_id = accounts.id
        LEFT JOIN ratings ON ratings.account_id = accounts.id AND ratings.game = ?1
    )
    SELECT name, mmr, streak, wins, draws, losses, RANK() OVER (ORDER BY mmr DESC, wins DESC, draws DESC, losses ASC) AS rank
    FROM board ORDER BY rank, name LIMIT 1000
  `;
  return json({ rows: (await db.prepare(sql).bind(game).all()).results });
}

function channelRequest(stub, path, account, request, body) {
  const headers = new Headers({ 'x-player': account.id, 'x-player-name': encodeURIComponent(account.name) });
  if (path === 'socket') headers.set('Upgrade', request.headers.get('Upgrade') ?? 'none');
  if (body) headers.set('Content-Type', 'application/json');
  return stub.fetch('https://channel.internal/' + path, {
    method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined,
  });
}

async function sendChat(request, env, account, stub) {
  const { success } = await env.CHAT_LIMIT.limit({ key: account.id });
  requireThat(success, '메시지를 너무 빠르게 보냈습니다. 잠시 뒤 다시 보내 주세요.', 429);
  return channelRequest(stub, 'chat', account, request, await readBody(request));
}

async function listRooms(db, game, account) {
  requireThat(game === null || isRoomGame(game), '대전 게임을 선택해 주세요.');
  const { results } = await db.prepare(`
    SELECT id, game, title, status, players, COALESCE(spectators, '[]') AS spectators
    FROM rooms LEFT JOIN room_spectators ON rooms.id = room_spectators.room_id
    WHERE (?1 IS NULL OR game = ?1) AND status <> 'deleted'
      AND (status IN ('waiting', 'playing')
        OR EXISTS (SELECT 1 FROM json_each(players) WHERE json_extract(value, '$.id') = ?2)
        OR EXISTS (SELECT 1 FROM json_each(spectators) WHERE json_extract(value, '$.id') = ?2))
    ORDER BY status = 'waiting' DESC, created_at DESC LIMIT 100
  `).bind(game, account.id).all();
  return json({ rooms: results.map(room => ({
    ...room, players: JSON.parse(room.players), spectators: JSON.parse(room.spectators),
  })) });
}

async function api(request, env, url) {
  const path = url.pathname;
  const method = request.method;
  const origin = request.headers.get('Origin');
  if (method !== 'GET' || path.endsWith('/socket')) {
    requireThat(!origin || origin === url.origin, '다른 사이트에서는 이 요청을 보낼 수 없습니다.', 403);
  }
  if (method === 'POST' && ['/api/login', '/api/join', '/api/logout'].includes(path)) {
    return authenticate(request, env, path.slice(5));
  }
  if (method === 'GET' && path === '/api/me') return currentUser(request, env.DB);
  const account = await findAccount(request, env.DB);
  requireThat(account, '로그인이 필요합니다.', 401);
  if (method === 'GET' && path === '/api/rankings') return rankings(env.DB, url.searchParams.get('game'));
  if (method === 'GET' && path === '/api/music') return music(request, env);
  if (path === '/api/lobby/socket' && method === 'GET') {
    return channelRequest(env.LOBBY_CHAT.getByName('lobby'), 'socket', account, request);
  }
  if (path === '/api/lobby/chat' && method === 'POST') {
    return sendChat(request, env, account, env.LOBBY_CHAT.getByName('lobby'));
  }
  if (path === '/api/rooms') {
    if (method === 'GET') return listRooms(env.DB, url.searchParams.get('game'), account);
    if (method === 'POST') {
      const { game, title } = await readBody(request);
      requireThat(isRoomGame(game) && typeof title === 'string' && title.trim().length > 0 && title.trim().length <= 40,
        '대전 게임과 1~40자의 방 제목을 입력해 주세요.');
      const { success } = await env.AUTH_LIMIT.limit({ key: 'create:' + account.id });
      requireThat(success, '잠시 뒤에 새 방을 만들어 주세요.', 429);
      const id = crypto.randomUUID();
      return channelRequest(env.ROOMS.getByName(id), 'create', account, request, { id, game, title: title.trim() });
    }
  }
  const room = path.match(roomPath);
  if (room) {
    const [, id, operation] = room;
    const stub = env.ROOMS.getByName(id);
    if (!operation && method === 'GET') return channelRequest(stub, 'view', account, request);
    if (operation === 'socket' && method === 'GET') return channelRequest(stub, operation, account, request);
    if (operation === 'action' && method === 'POST') return channelRequest(stub, operation, account, request, await readBody(request));
    if (operation === 'chat' && method === 'POST') return sendChat(request, env, account, stub);
  }
  if (method === 'POST' && path === '/api/solo/start') return startSolo(request, env, account);
  if (method === 'POST' && path === '/api/solo/finish') {
    const { success } = await env.AUTH_LIMIT.limit({ key: 'finish:' + account.id });
    requireThat(success, '잠시 뒤에 기록 저장을 다시 시도해 주세요.', 429);
    return env.SCORES.getByName(account.id).fetch('https://scores.internal/finish', {
      method: 'POST',
      headers: { 'x-player': account.id, 'Content-Type': request.headers.get('Content-Type') ?? '' },
      body: request.body,
    });
  }
  return json({ error: '요청한 주소를 찾을 수 없습니다.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
