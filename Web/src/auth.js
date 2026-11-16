import { json, readBody, requireThat } from './http.js';

const minPasswordLength = 4;
const maxPasswordLength = 128;
// A device stays signed in for 30 days after its last visit.
const day = 24 * 60 * 60;
const sessionAge = 30 * day;
const keys = /^[A-Fa-f0-9]{64}$/;
const publicAccount = ({ id, name }) => ({ id, name });
const bytesToHex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
const newKey = () => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
const localHost = request => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);

async function hash(value) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

function same(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function cookieName(request) {
  return localHost(request) ? 'ddongvoid-local' : '__Host-ddongvoid';
}

function cookie(request, value, age) {
  const secure = localHost(request) ? '' : '; Secure';
  return cookieName(request) + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + age + secure;
}

function sessionToken(request) {
  const name = cookieName(request) + '=';
  const token = request.headers.get('Cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(name))?.slice(name.length);
  return token && keys.test(token) ? token : null;
}

async function sessionHash(request) {
  const token = sessionToken(request);
  return token ? hash(token) : null;
}

// Every page load asks who is signed in; that visit also pushes the expiry back, at most once a day.
export async function currentUser(request, db) {
  const token = sessionToken(request);
  if (!token) return json({ user: null });
  const tokenHash = await hash(token);
  const now = Date.now();
  const session = await db.prepare(`
    SELECT a.id, a.name, s.expires_at FROM sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, now).first();
  if (!session) return json({ user: null });
  if (session.expires_at > now + (sessionAge - day) * 1000) return json({ user: publicAccount(session) });
  await db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(now + sessionAge * 1000, tokenHash).run();
  return json({ user: publicAccount(session) }, 200, { 'Set-Cookie': cookie(request, token, sessionAge) });
}

export async function findAccount(request, db) {
  const token = await sessionHash(request);
  if (!token) return null;
  return db.prepare(`
    SELECT a.id, a.name FROM sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(token, Date.now()).first();
}

async function issueSession(request, db, account, registration = null) {
  const token = newKey();
  const previous = await sessionHash(request);
  const now = Date.now();
  const operations = [];
  if (registration) {
    const { nameKey, salt, passwordHash } = registration;
    operations.push(
      db.prepare("INSERT OR IGNORE INTO accounts (id, name, name_key, access_hash, created_at) VALUES (?, ?, ?, '', ?)")
        .bind(account.id, account.name, nameKey, now),
      db.prepare('INSERT INTO account_passwords SELECT id, ?, ? FROM accounts WHERE id = ?')
        .bind(salt, passwordHash, account.id),
    );
  }
  const tokenHash = await hash(token);
  operations.push(
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    db.prepare('INSERT INTO sessions SELECT ?, id, ? FROM accounts WHERE id = ?')
      .bind(tokenHash, now + sessionAge * 1000, account.id),
  );
  if (previous) {
    operations.push(db.prepare('DELETE FROM sessions WHERE token_hash = ? AND EXISTS (SELECT 1 FROM sessions WHERE token_hash = ?)')
      .bind(previous, tokenHash));
  }
  const results = await db.batch(operations);
  if (registration) requireThat(results[0].meta.changes === 1, '이미 사용 중인 닉네임입니다.', 409);
  return json({ user: publicAccount(account) }, registration ? 201 : 200,
    { 'Set-Cookie': cookie(request, token, sessionAge) });
}

export async function authenticate(request, env, action) {
  if (action === 'logout') {
    const token = await sessionHash(request);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(token).run();
    return json({ user: null }, 200, { 'Set-Cookie': cookie(request, '', 0) });
  }
  const address = request.headers.get('CF-Connecting-IP') ?? 'local';
  const { success } = await env.AUTH_LIMIT.limit({ key: address });
  requireThat(success, '요청이 많습니다. 1분 뒤 다시 시도해 주세요.', 429);
  const body = await readBody(request);
  const name = typeof body.name === 'string' ? body.name.normalize('NFKC').trim() : '';
  requireThat(/^[\p{L}\p{N}_-]{2,24}$/u.test(name), '닉네임은 글자, 숫자, 밑줄, 하이픈을 사용해 2~24자로 입력해 주세요.');
  const nameKey = name.toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const validLength = password.length >= minPasswordLength && password.length <= maxPasswordLength;
  if (action === 'join') {
    requireThat(validLength, `비밀번호를 ${minPasswordLength}~${maxPasswordLength}자로 입력해 주세요.`);
    const salt = newKey();
    const passwordHash = await env.PASSWORDS.getByName(nameKey).derive(password, salt);
    const account = { id: crypto.randomUUID(), name };
    return issueSession(request, env.DB, account, { nameKey, salt, passwordHash });
  }
  const account = await env.DB.prepare(`
    SELECT a.id, a.name, a.access_hash, p.salt, p.password_hash
      FROM accounts a LEFT JOIN account_passwords p ON p.account_id = a.id
      WHERE a.name_key = ?
  `).bind(nameKey).first();
  const invalid = '닉네임 또는 비밀번호가 올바르지 않습니다.';
  requireThat(account, invalid, 401);
  if (account.password_hash) {
    requireThat(validLength, invalid, 401);
    const derived = await env.PASSWORDS.getByName(nameKey).derive(password, account.salt);
    requireThat(same(derived, account.password_hash), invalid, 401);
  } else {
    const legacy = (password || (typeof body.accessKey === 'string' ? body.accessKey : '')).trim().toLowerCase();
    requireThat(keys.test(legacy) && same(await hash(legacy), account.access_hash), invalid, 401);
  }
  return issueSession(request, env.DB, account);
}
