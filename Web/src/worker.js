import { authenticate, findAccount } from './auth.js';
import { isRoomGame } from './games.js';
import { errorResponse, json, readBody, requireThat } from './http.js';
import { isSoloGame, startSolo } from './scores.js';
export { GameRoom } from './room.js';
export { ScoreVerifier } from './scores.js';
export { AccountPasswords } from './passwords.js';

const roomPath = /^\/api\/rooms\/([0-9a-f-]{36})(?:\/(action|socket))?$/;

async function rankings(db, game) {
  requireThat(isRoomGame(game) || isSoloGame(game), '게임을 선택해 주세요.');
  const sql = isSoloGame(game) ? `
    SELECT name, score, RANK() OVER (ORDER BY score DESC) AS rank
    FROM solo_bests JOIN accounts ON account_id = accounts.id
    WHERE game = ? ORDER BY rank, name LIMIT 100
  ` : `
    WITH totals AS (
      SELECT account_id, SUM(outcome = 'W') AS wins, SUM(outcome = 'D') AS draws, SUM(outcome = 'L') AS losses
      FROM match_results WHERE game = ? GROUP BY account_id
    )
    SELECT name, wins, draws, losses, RANK() OVER (ORDER BY wins DESC, draws DESC, losses ASC) AS rank
    FROM totals JOIN accounts ON account_id = accounts.id ORDER BY rank, name LIMIT 100
  `;
  return json({ rows: (await db.prepare(sql).bind(game).all()).results });
}

function roomRequest(env, id, path, account, request, body) {
  const headers = new Headers({ 'x-player': account.id, 'x-player-name': encodeURIComponent(account.name) });
  if (path === 'socket') headers.set('Upgrade', request.headers.get('Upgrade') ?? 'none');
  if (body) headers.set('Content-Type', 'application/json');
  return env.ROOMS.getByName(id).fetch('https://room.internal/' + path, {
    method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined,
  });
}

async function listRooms(db, game, account) {
  requireThat(game === null || isRoomGame(game), '대전 게임을 선택해 주세요.');
  const { results } = await db.prepare(`
    SELECT id, game, title, status, players FROM rooms
    WHERE (? IS NULL OR game = ?) AND status <> 'deleted'
      AND (status = 'waiting' OR EXISTS (SELECT 1 FROM json_each(players) WHERE json_extract(value, '$.id') = ?))
    ORDER BY status = 'waiting' DESC, created_at DESC LIMIT 100
  `).bind(game, game, account.id).all();
  return json({ rooms: results.map(room => ({ ...room, players: JSON.parse(room.players) })) });
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
  const account = await findAccount(request, env.DB);
  if (method === 'GET' && path === '/api/me') return json({ user: account });
  requireThat(account, '로그인이 필요합니다.', 401);
  if (method === 'GET' && path === '/api/rankings') return rankings(env.DB, url.searchParams.get('game'));
  if (path === '/api/rooms') {
    if (method === 'GET') return listRooms(env.DB, url.searchParams.get('game'), account);
    if (method === 'POST') {
      const { game, title } = await readBody(request);
      requireThat(isRoomGame(game) && typeof title === 'string' && title.trim().length > 0 && title.trim().length <= 40,
        '대전 게임과 1~40자의 방 제목을 입력해 주세요.');
      const { success } = await env.AUTH_LIMIT.limit({ key: 'create:' + account.id });
      requireThat(success, '잠시 뒤에 새 방을 만들어 주세요.', 429);
      const id = crypto.randomUUID();
      return roomRequest(env, id, 'create', account, request, { id, game, title: title.trim() });
    }
  }
  const room = path.match(roomPath);
  if (room) {
    const [, id, operation] = room;
    if (!operation && method === 'GET') return roomRequest(env, id, 'view', account, request);
    if (operation === 'socket' && method === 'GET') return roomRequest(env, id, operation, account, request);
    if (operation === 'action' && method === 'POST') return roomRequest(env, id, operation, account, request, await readBody(request));
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
