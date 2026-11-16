import { cardRank, games } from './rules.js';
import { connectSocket, createChat } from './chat.js';
import { escape, heading, home, lobby, rankings, roomList, roomPage, signInPrompt } from './views.js';
import { playSolo, soloMarkup } from './solo.js';

const app = document.querySelector('#app');
const accountButton = document.querySelector('#account-button');
const dialog = document.querySelector('#account-dialog');
const toast = document.querySelector('#toast');
const roomIdPattern = /^[0-9a-f-]{36}$/;
let user = null;
let page = null;
let generation = 0;
let accountMode = 'login';
let toastTimer;
let room = null;
let live = null;
let chat = null;
let solo = null;
let ui = null;

async function api(path, data) {
  const response = await fetch('/api' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error ?? '서버에 연결하지 못했습니다. 다시 시도해 주세요.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function message(text) {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function updateAccount() {
  accountButton.textContent = user?.name ?? '로그인';
  accountButton.title = user ? '계정 · 로그아웃' : '';
}

function showAccount(mode = 'login') {
  solo?.pause();
  accountMode = mode;
  if (user) {
    dialog.innerHTML = `<div class="dialog-heading"><h2 id="account-title">내 계정</h2><button class="icon-button" data-close aria-label="닫기">×</button></div>
      <p>${escape(user.name)}님으로 로그인했습니다.</p><button class="button button-outline" data-logout>로그아웃</button>`;
  } else {
    const joining = mode === 'join';
    dialog.innerHTML = `<div class="dialog-heading"><h2 id="account-title">${joining ? '회원가입' : '로그인'}</h2>
      <button class="icon-button" data-close aria-label="닫기">×</button></div>
      <form class="stack" id="account-form">
        <label>닉네임<input name="name" autocomplete="username" maxlength="24" required autofocus></label>
        <label>비밀번호<input name="password" type="password" autocomplete="${joining ? 'new-password' : 'current-password'}"
          ${joining ? 'minlength="4" aria-describedby="password-hint"' : ''} maxlength="128" required></label>
        ${joining ? '<p class="muted" id="password-hint">4자 이상 입력해 주세요.</p>' : ''}
        <p class="form-error" role="alert" hidden></p>
        <button class="button button-primary" type="submit">${joining ? '가입하기' : '로그인'}</button>
      </form><button type="button" class="button button-quiet" data-mode="${joining ? 'login' : 'join'}">${joining ? '로그인으로 돌아가기' : '회원가입'}</button>`;
  }
  if (!dialog.open) dialog.showModal();
}

dialog.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-close')) dialog.close();
  if (button.dataset.mode) showAccount(button.dataset.mode);
  if (button.hasAttribute('data-logout')) {
    button.disabled = true;
    try {
      await api('/logout', {});
      user = null;
      updateAccount();
      dialog.close();
      if (page?.section === 'home') await navigate();
      else location.hash = '#home';
    } catch (error) {
      message(error.message);
      button.disabled = false;
    }
  }
});

dialog.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const alert = form.querySelector('.form-error');
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  submit.disabled = true;
  alert.hidden = true;
  try {
    const result = await api(accountMode === 'join' ? '/join' : '/login', data);
    user = result.user;
    updateAccount();
    dialog.close();
    await navigate();
  } catch (error) {
    alert.textContent = error.message;
    alert.hidden = false;
    submit.disabled = false;
  }
});

accountButton.addEventListener('click', () => showAccount());

function parsePage() {
  const [section, key] = location.hash.slice(1).split('/');
  if (section === 'room' && roomIdPattern.test(key)) return { section, key };
  if (section === 'lobby') return { section, key: Object.hasOwn(games, key) && games[key].max > 1 ? key : undefined };
  if (Object.hasOwn(games, key)) {
    if (section === 'rankings' || section === 'play' && games[key].max === 1) return { section, key };
  }
  return { section: 'home' };
}

function paint(markup) {
  app.innerHTML = markup;
  app.removeAttribute('aria-busy');
}

function signedOut() {
  user = null;
  updateAccount();
  void navigate();
}

async function navigate() {
  const token = ++generation;
  if (live) {
    live.stop();
    live = null;
  }
  chat = null;
  solo?.stop();
  solo = null;
  room = null;
  ui = { connected: false, held: Array(5).fill(false), card: null, call: false };
  page = parsePage();
  const { section, key } = page;
  const title = section === 'rankings' ? '랭킹' : section === 'lobby' ? '공용 대기방' : games[key]?.title ?? '대전방';
  document.querySelector('#nav-games').setAttribute('aria-current', section === 'home' || section === 'play' ? 'page' : 'false');
  document.querySelector('#nav-lobby')?.setAttribute('aria-current', section === 'lobby' || section === 'room' ? 'page' : 'false');
  document.querySelector('#nav-rankings').setAttribute('aria-current', section === 'rankings' ? 'page' : 'false');
  if (section === 'home') return paint(home());
  if (!user) return paint(heading(title) + signInPrompt);
  if (section === 'play') return showSoloStart(key);
  paint('<p class="loading" role="status">불러오는 중…</p>');
  try {
    if (section === 'rankings') {
      const data = await api('/rankings?game=' + key);
      if (token === generation) paint(rankings(key, data.rows));
    }
    if (section === 'lobby') {
      await refreshLobby(token);
      if (token === generation) {
        chat = mountChat('/lobby', '로비 채팅', token);
        live = connectSocket('/lobby', { status: chat.setConnected, receive: chat.receive });
      }
    }
    if (section === 'room') {
      const data = await api('/rooms/' + key);
      if (token !== generation) return;
      acceptRoom(data.room);
      live = connectRoom(key, token);
    }
  } catch (error) {
    if (token !== generation) return;
    if (error.status === 401) return signedOut();
    if (section === 'room' && error.status === 403) {
      return paint(heading('대전방', '초대받은 방에 참가할 수 있습니다.') +
        `<div class="panel empty"><button type="button" class="button button-primary" data-join="${key}">방 참가</button></div>`);
    }
    paint(heading(title) + '<div class="panel empty"><p>' + escape(error.message) +
      '</p><button type="button" class="button button-outline" data-reload>다시 불러오기</button></div>');
  }
}

async function refreshLobby(token = generation) {
  const { rooms } = await api('/rooms');
  if (token !== generation) return;
  const list = app.querySelector('#lobby-rooms');
  if (list) list.innerHTML = roomList(rooms, user.id);
  else paint(lobby(rooms, user.id, page.key));
}

function mountChat(path, title, token) {
  return createChat(app.querySelector('#chat-host'), title, user.id, async text => {
    try {
      return await api(path + '/chat', { text });
    } catch (error) {
      if (error.status === 401 && token === generation) signedOut();
      throw error;
    }
  });
}

function showSoloStart(game) {
  paint(heading(games[game].title, games[game].description) + `
    <section class="panel solo-start"><div class="game-art art-dodge" aria-hidden="true"><span>← →</span></div>
      <div><h2>조작 방법</h2><p>← → 키 또는 A D 키로 좌우 이동합니다. 생존 시간과 피한 똥 개수로 점수를 얻습니다.</p>
      <p>터치 버튼으로도 플레이할 수 있습니다.</p>
      <button class="button button-primary" type="button" data-start-solo>게임 시작</button></div>
    </section>`);
}

async function beginSolo() {
  const token = generation;
  const game = page.key;
  try {
    const run = await api('/solo/start', { game });
    if (token !== generation) return;
    solo?.stop();
    paint(heading(games[game].title) + soloMarkup());
    solo = playSolo(run, data => api('/solo/finish', data), () => {
      solo.stop();
      solo = null;
      showSoloStart(game);
      app.querySelector('[data-start-solo]').focus();
    });
  } catch (error) {
    if (token !== generation) return;
    if (error.status === 401) return signedOut();
    message(error.message);
    const button = app.querySelector('[data-start-solo]');
    if (button) button.disabled = false;
  }
}

function renderRoom() {
  if (!room || !user) return;
  const previous = document.activeElement;
  const hold = previous?.dataset.hold;
  let content = app.querySelector('#room-content');
  if (!content) {
    paint('<div class="room-layout"><div id="room-content"></div><aside id="chat-host"></aside></div>');
    content = app.querySelector('#room-content');
    chat = mountChat('/rooms/' + room.id, '방 채팅', generation);
  }
  content.innerHTML = roomPage(room, user.id, ui);
  updateDeadline();
  if (hold !== undefined) app.querySelector('[data-hold="' + hold + '"]')?.focus();
}

function acceptRoom(next) {
  if (!next || room && next.revision <= room.revision) return;
  if (!room || room.match !== next.match || room.index !== next.index || room.rollsUsed !== next.rollsUsed) {
    ui.held = next.held ? [...next.held] : Array(5).fill(false);
  }
  if (next.game === 'onecard') {
    if (room && room.match === next.match && next.callCount > room.callCount) {
      ui.call = true;
      const token = generation;
      const call = next.callCount;
      setTimeout(() => {
        if (token === generation && room?.callCount === call) {
          ui.call = false;
          app.querySelector('.call-bubble')?.remove();
        }
      }, 500);
    }
    if (room?.index !== next.index || !next.players.find(player => player.id === user.id)?.hand?.includes(ui.card)) ui.card = null;
  }
  room = next;
  renderRoom();
}

function updateDeadline() {
  const timer = app.querySelector('[data-deadline]');
  if (timer) timer.textContent = Math.max(0, Math.ceil((Number(timer.dataset.deadline) - Date.now()) / 1000)) + '초';
}

function connectRoom(id, token) {
  let requestedRevision = 0;
  let loading = false;
  let stopped = false;
  const path = '/rooms/' + id;
  const active = () => !stopped && token === generation;
  const clock = setInterval(() => {
    if (!active()) return;
    updateDeadline();
  }, 300);
  const fallback = setInterval(() => {
    if (active() && !ui.connected) void refresh();
  }, 2500);

  function status(connected) {
    ui.connected = connected;
    chat.setConnected(connected);
    const label = document.querySelector('#room-connection');
    if (label) label.textContent = connected ? '실시간 연결됨' : '재연결 중…';
    void refresh();
  }

  async function refresh(revision = 0) {
    if (!active()) return;
    requestedRevision = Math.max(requestedRevision, revision);
    if (loading) return;
    loading = true;
    try {
      do {
        const { room: next } = await api(path);
        if (!active()) return;
        acceptRoom(next);
      } while (room.revision < requestedRevision);
    } catch (error) {
      if (!active()) return;
      if (error.status === 401) return signedOut();
      if (error.status === 403 || error.status === 404) {
        message(error.message);
        location.hash = '#lobby';
      }
    } finally {
      loading = false;
    }
  }

  const socket = connectSocket(path, {
    status,
    receive(packet) {
      chat.receive(packet);
      const { revision } = packet;
      if (Number.isInteger(revision) && revision > room.revision) void refresh(revision);
    },
  });
  return {
    refresh,
    stop() {
      stopped = true;
      clearInterval(clock);
      clearInterval(fallback);
      socket.stop();
    },
  };
}

async function sendAction(data) {
  const token = generation;
  const current = room;
  try {
    const result = await api('/rooms/' + current.id + '/action', {
      ...data, revision: current.revision, turn: current.turn, match: current.match,
    });
    if (token !== generation) return;
    if (result.room) acceptRoom(result.room);
    else location.hash = '#lobby';
  } catch (error) {
    if (token !== generation) return;
    if (error.status === 401) return signedOut();
    message(error.message);
    if (error.status === 409 || error.status === 404) await live?.refresh();
  }
}

app.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-account')) return showAccount();
  if (button.hasAttribute('data-reload')) return navigate();
  if (button.hasAttribute('data-focus-chat')) return app.querySelector('[data-chat-input]')?.focus();
  if (button.hasAttribute('data-refresh')) {
    try { await refreshLobby(); } catch (error) { message(error.message); }
    return;
  }
  if (button.dataset.join) {
    button.disabled = true;
    try {
      const { room: joined } = await api('/rooms/' + button.dataset.join + '/action', { action: 'join' });
      if (location.hash === '#room/' + joined.id) await navigate();
      else location.hash = '#room/' + joined.id;
    } catch (error) {
      if (error.status === 401) return signedOut();
      message(error.message);
      button.disabled = false;
    }
    return;
  }
  if (button.hasAttribute('data-copy-room')) {
    try {
      await navigator.clipboard.writeText(location.href);
      message('초대 링크를 복사했습니다.');
    } catch {
      message('브라우저 주소 표시줄에서 초대 링크를 복사해 주세요.');
    }
    return;
  }
  if (button.hasAttribute('data-start-solo')) {
    button.disabled = true;
    return beginSolo();
  }
  if (button.dataset.hold !== undefined) {
    const index = Number(button.dataset.hold);
    ui.held[index] = !ui.held[index];
    return renderRoom();
  }
  if (button.dataset.card !== undefined) {
    const card = Number(button.dataset.card);
    if (cardRank(card) === 7) {
      ui.card = ui.card === card ? null : card;
      return renderRoom();
    }
    await sendAction({ action: 'play', card });
    return;
  }
  if (button.dataset.action) {
    const action = JSON.parse(button.dataset.action);
    if (action.action === 'delete' && !window.confirm('이 방을 삭제할까요?')) return;
    await sendAction(action);
  }
});

app.addEventListener('submit', async event => {
  if (event.target.id !== 'new-room') return;
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button');
  button.disabled = true;
  const token = generation;
  try {
    const result = await api('/rooms', Object.fromEntries(new FormData(form)));
    if (token === generation) location.hash = '#room/' + result.room.id;
  } catch (error) {
    if (token !== generation) return;
    if (error.status === 401) return signedOut();
    message(error.message);
    button.disabled = false;
  }
});

try {
  user = (await api('/me')).user;
  updateAccount();
} catch (error) {
  message(error.message);
}
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  void navigate();
});
await navigate();
