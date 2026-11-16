import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import WebSocket from 'ws';
import { makeSolo, stepSolo, tickRate } from '../public/solo-model.js';

const url = new URL(process.env.DDONGVOID_TEST_URL ?? 'http://127.0.0.1:8787');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), '로컬 실행기에서만 테스트할 수 있습니다.');

async function request(path, { cookie, data, status = 200 } = {}) {
  const headers = { Origin: url.origin };
  if (cookie) headers.Cookie = cookie;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(new URL('/api' + path, url), {
    method: data === undefined ? 'GET' : 'POST',
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  assert.equal(response.status, status, path + ' ' + (result.error ?? '응답 코드 불일치'));
  return { ...result, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

function connect(path, cookie) {
  const target = new URL('/api' + path + '/socket', url);
  target.protocol = 'ws:';
  return new WebSocket(target, { headers: { Cookie: cookie, Origin: url.origin } });
}

function nextRevision(socket, timeout = 3000) {
  return once(socket, 'message', { signal: AbortSignal.timeout(timeout) })
    .then(([message]) => JSON.parse(message.toString()).revision);
}

async function eventually(get, predicate) {
  for (let index = 0; index < 20; index++) {
    const result = await get();
    if (predicate(result)) return result;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.fail('예상한 저장 결과가 나타나지 않았습니다.');
}

test('Cloudflare 로컬 실행기에서 가입, WebSocket 대전, 알람, 랭킹이 작동한다', { timeout: 65_000 }, async context => {
  const prefix = 'qa-' + randomUUID().slice(0, 8);
  const password = randomUUID().slice(0, 4);
  const members = [];
  await request('/join', { data: { name: prefix + '-short', password: '123' }, status: 400 });
  for (const name of [prefix + '-a', prefix + '-b']) {
    const registered = await request('/join', { data: { name, password }, status: 201 });
    assert.deepEqual(Object.keys(registered).sort(), ['cookie', 'user']);
    members.push(registered);
  }
  const [a, b] = members;
  await request('/join', { data: { name: a.user.name.toUpperCase(), password }, status: 409 });
  const login = await request('/login', { data: { name: a.user.name, password } });
  assert.equal(login.user.id, a.user.id);
  await request('/logout', { cookie: login.cookie, data: {} });
  assert.equal((await request('/me', { cookie: login.cookie })).user, null);
  await request('/login', { data: { name: a.user.name, password: password + 'x' }, status: 401 });
  await request('/rankings?game=slap', { status: 401 });
  await request('/rankings?game=rhythm', { cookie: a.cookie, status: 400 });
  await request('/solo/start', { cookie: a.cookie, data: { game: 'rhythm' }, status: 400 });

  async function setup(game) {
    let { room } = await request('/rooms', { cookie: a.cookie, data: { title: prefix + ' 방', game }, status: 201 });
    const path = '/rooms/' + room.id;
    await request(path, { cookie: b.cookie, status: 403 });
    await eventually(() => request('/rooms?game=' + game, { cookie: a.cookie }),
      result => result.rooms.some(item => item.id === room.id));
    const act = async (member, input) => {
      const result = await request(path + '/action', { cookie: member.cookie,
        data: { turn: room.turn, revision: room.revision, match: room.match, ...input } });
      room = result.room;
      return room;
    };
    await act(b, { action: 'join' });
    const firstSocket = connect(path, b.cookie);
    context.after(() => firstSocket.terminate());
    assert.equal(await nextRevision(firstSocket), room.revision);
    const closed = once(firstSocket, 'close', { signal: AbortSignal.timeout(5000) });
    firstSocket.close();
    const [code] = await closed;
    assert.ok([1000, 1005].includes(code));

    const socket = connect(path, b.cookie);
    context.after(() => socket.close());
    assert.equal(await nextRevision(socket), room.revision);
    const notice = nextRevision(socket);
    await act(a, { action: 'ready', ready: true });
    assert.equal(await notice, room.revision);
    await act(b, { action: 'ready', ready: true });
    assert.equal(room.status, 'playing');
    return { path, act, socket, current: () => room };
  }

  const slap = await setup('slap');
  for (let turn = 0; turn < 11; turn++) {
    const attacker = members[turn % 2];
    const defender = members[1 - turn % 2];
    await slap.act(attacker, { action: 'choose', move: 'slap', zone: 0, power: 0 });
    if (!turn) {
      const { room } = await request(slap.path, { cookie: defender.cookie });
      assert.equal(room.players[0].submitted, true);
      assert.equal(room.players[0].choice, undefined);
    }
    await slap.act(defender, { action: 'choose', move: 'block', zone: 1 });
  }
  assert.deepEqual(slap.current().winners, [a.user.id]);
  await eventually(() => request('/rankings?game=slap', { cookie: a.cookie }),
    result => result.rows.some(row => row.name === a.user.name && row.wins === 1));

  const ciao = await setup('ciao');
  const { room: onecard } = await request('/rooms', {
    cookie: a.cookie, data: { title: prefix + ' 원카드', game: 'onecard' }, status: 201,
  });
  const { room: yacht } = await request('/rooms', {
    cookie: b.cookie, data: { title: prefix + ' 야추', game: 'yacht' }, status: 201,
  });
  const expectedRooms = [slap.current(), ciao.current(), onecard, yacht];
  const { rooms: allRooms } = await eventually(() => request('/rooms', { cookie: b.cookie }),
    result => expectedRooms.every(room => result.rooms.some(item => item.id === room.id)));
  for (const room of expectedRooms) {
    assert.equal(allRooms.find(item => item.id === room.id).game, room.game);
  }
  const { rooms: onecardRooms } = await request('/rooms?game=onecard', { cookie: b.cookie });
  assert.ok(onecardRooms.some(room => room.id === onecard.id));
  assert.ok(onecardRooms.every(room => room.game === 'onecard'));

  const rolled = await ciao.act(a, { action: 'roll' });
  assert.equal(typeof rolled.die, 'number');
  assert.equal((await request(ciao.path, { cookie: b.cookie })).room.die, undefined);
  const declaration = await ciao.act(a, { action: 'declare', number: 3 });
  let revision;
  do { revision = await nextRevision(ciao.socket, 26_000); } while (revision <= declaration.revision);
  const expired = await request(ciao.path, { cookie: b.cookie });
  assert.equal(expired.room.players[0].position, 3);
  assert.match(expired.room.last, /자동 PASS/);

  const { id, seed } = await request('/solo/start', { cookie: a.cookie, data: { game: 'dodge' }, status: 201 });
  const solo = makeSolo(seed);
  while (!solo.over) stepSolo(solo);
  await new Promise(resolve => setTimeout(resolve, solo.tick * 1000 / tickRate));
  const finish = await request('/solo/finish', { cookie: a.cookie, data: { id, tick: solo.tick, events: [] } });
  assert.equal(finish.score, solo.score);
  const repeat = await request('/solo/finish', { cookie: a.cookie, data: { id, tick: solo.tick, events: [] } });
  assert.equal(repeat.score, solo.score);
  const ranks = await request('/rankings?game=dodge', { cookie: a.cookie });
  assert.equal(ranks.rows.find(row => row.name === a.user.name).score, solo.score);

  for (const socket of [slap.socket, ciao.socket]) {
    const closed = once(socket, 'close', { signal: AbortSignal.timeout(5000) });
    socket.close();
    await closed;
  }
});
