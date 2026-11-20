import { cardRank, games } from './rules.js';
import { connectSocket, createChat } from './chat.js';
import { escape, heading, home, lobby, presenceText, rankings, roomList, roomPage, signInPrompt, yachtFace } from './views.js';
import { guide } from './guide.js';
import { playSolo, soloMarkup } from './solo.js';
import { createMusic } from './music.js';

const app = document.querySelector('#app');
const accountButton = document.querySelector('#account-button');
const dialog = document.querySelector('#account-dialog');
const toast = document.querySelector('#toast');
const music = createMusic(document.querySelector('#music-player'));
const roomIdPattern = /^[0-9a-f-]{36}$/;
let user = null;
let page = null;
let generation = 0;
let accountMode = 'login';
let toastTimer;
let room = null;
let live = null;
let chat = null;
let roomResize = null;
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
    if (section === 'rankings' || section === 'guide' || section === 'play' && games[key].max === 1) return { section, key };
  }
  if (section === 'guide') return { section, key: 'yacht' };
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
  roomResize?.disconnect();
  roomResize = null;
  solo?.stop();
  solo = null;
  room = null;
  ui = { connected: false, held: Array(5).fill(false), card: null, call: false, power: 0, peeked: readPeeked(), sabCard: null, sabRot: 0, sabZoom: 1, bmCell: null };
  page = parsePage();
  const { section, key } = page;
  // The rhythm game needs to be heard on its own.
  music.update(Boolean(user), section === 'play' && key === 'rhythm');
  const title = section === 'rankings' ? '랭킹' : section === 'guide' ? '게임설명' : section === 'lobby' ? '공용 대기방' : games[key]?.title ?? '대전방';
  document.querySelector('#nav-games').setAttribute('aria-current', section === 'home' || section === 'play' ? 'page' : 'false');
  document.querySelector('#nav-guide').setAttribute('aria-current', section === 'guide' ? 'page' : 'false');
  document.querySelector('#nav-lobby')?.setAttribute('aria-current', section === 'lobby' || section === 'room' ? 'page' : 'false');
  document.querySelector('#nav-rankings').setAttribute('aria-current', section === 'rankings' ? 'page' : 'false');
  if (section === 'home') return paint(home());
  if (section === 'guide') return paint(guide(key));
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
        chat = mountChat('/lobby', '로비 채팅', token, { members: true });
        live = connectSocket('/lobby', { status: chat.setConnected, receive: packet => {
          chat.receive(packet);
          const presence = app.querySelector('#lobby-presence');
          if (packet.presence && presence) {
            presence.textContent = presenceText(packet.presence);
            presence.hidden = false;
            chat.setMembers(packet.presence);
          }
        } });
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
        `<div class="panel empty room-list-actions">
          <button type="button" class="button button-primary" data-join="${key}">방 참가</button>
          <button type="button" class="button button-outline" data-watch="${key}">관전</button>
        </div>`);
    }
    paint(heading(title) + '<div class="panel empty"><p>' + escape(error.message) +
      '</p><button type="button" class="button button-outline" data-reload>다시 불러오기</button></div>');
  }
}

async function refreshLobby(token = generation) {
  const { rooms } = await api('/rooms');
  if (token !== generation) return;
  const list = app.querySelector('#lobby-rooms');
  if (list) list.innerHTML = roomList(rooms, user);
  else paint(lobby(rooms, user, page.key));
}

function mountChat(path, title, token, options) {
  return createChat(app.querySelector('#chat-host'), title, user.id, async text => {
    try {
      return await api(path + '/chat', { text });
    } catch (error) {
      if (error.status === 401 && token === generation) signedOut();
      throw error;
    }
  }, options);
}

const soloIntro = {
  dodge: {
    art: '← →',
    help: ['← → 키 또는 A D 키로 좌우 이동합니다. 생존 시간과 피한 똥 개수로 점수를 얻습니다.', '터치 버튼으로도 플레이할 수 있습니다.'],
  },
  rhythm: {
    art: 'S D K L',
    help: ['왼손은 S·D, 오른손은 K·L. 블록에 적힌 키를 블록이 판정선에 닿는 순간 누릅니다. 한글 입력 상태여도 됩니다.',
      'PERFECT·GREAT·GOOD 판정과 콤보로 점수를 얻고, MISS 네 번이면 라이프가 바닥나 끝납니다. 갈수록 빨라져요.',
      '터치 버튼으로도 플레이할 수 있습니다.'],
  },
  sides: {
    art: '← →',
    help: ['양쪽에 세 마리씩 서 있는 캐릭터를 기억하고, 줄 맨 앞 캐릭터와 같은 캐릭터가 있는 쪽으로 ← → (또는 A D) 키를 누릅니다.',
      '맞히면 체력이 조금 차고 콤보가 쌓여 점수가 커집니다. 틀리면 체력이 줄고 콤보가 끊기며, 체력은 시간이 갈수록 빨리 줄어듭니다.',
      '30초마다 "섞어!!"와 함께 양쪽 캐릭터의 자리가 바뀝니다. 화면 왼쪽·오른쪽이나 터치 버튼을 눌러도 됩니다.'],
  },
};

function showSoloStart(game) {
  const intro = soloIntro[game];
  paint(heading(games[game].title, games[game].description) + `
    <section class="panel solo-start"><div class="game-art art-${game}" aria-hidden="true"><span>${intro.art}</span></div>
      <div><h2>조작 방법</h2>${intro.help.map(line => '<p>' + line + '</p>').join('')}
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
    paint(heading(games[game].title) + soloMarkup(game));
    // 한 판 더 starts the next run right away instead of going back to the start screen.
    solo = playSolo(game, run, data => api('/solo/finish', data), beginSolo);
  } catch (error) {
    if (token !== generation) return;
    if (error.status === 401) return signedOut();
    message(error.message);
    const button = app.querySelector('[data-start-solo], [data-restart]');
    if (button) button.disabled = false;
  }
}

// The 섯다 cards I have opened stay open for this tab, even after a reload.
const peekStore = 'seotda-peeked';

function readPeeked() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(peekStore)) ?? []);
  } catch {
    return new Set();
  }
}

function peek(key, flip) {
  ui.peeked.add(key);
  ui.flipped = flip ? key : null;
  try { sessionStorage.setItem(peekStore, JSON.stringify([...ui.peeked].slice(-40))); } catch { /* Kept for this page only. */ }
  renderRoom();
  ui.flipped = null;
}

function renderRoom() {
  if (!room || !user) return;
  // A card being dragged open would be thrown away by a redraw, so the redraw waits until it is let go.
  if (ui.dragging) {
    ui.renderPending = true;
    return;
  }
  ui.renderPending = false;
  const previous = document.activeElement;
  const hold = previous?.dataset.hold;
  let content = app.querySelector('#room-content');
  if (!content) {
    paint(`<div class="room-layout"><div id="room-content"></div><aside id="chat-host"></aside>
      <button type="button" class="chat-tab" data-chat-toggle aria-expanded="false">채팅<i class="chat-unread" hidden></i></button>
      <button type="button" class="chat-backdrop" data-chat-toggle aria-label="채팅 닫기" tabindex="-1"></button></div>`);
    content = app.querySelector('#room-content');
    chat = mountChat('/rooms/' + room.id, '방 채팅', generation);
    roomResize = new ResizeObserver(fitRoomChat);
    roomResize.observe(content);
  }
  // A scrolled board (사보타지) keeps its place across redraws.
  const scroller = content.querySelector('[data-keep-scroll]');
  const kept = scroller && [scroller.scrollLeft, scroller.scrollTop];
  // A scrolling log follows new lines while it is at the bottom, and stays put while someone reads back.
  const log = content.querySelector('[data-log-scroll]');
  const logAt = log && log.scrollHeight - log.scrollTop - log.clientHeight >= 4 ? log.scrollTop : null;
  content.innerHTML = roomPage(room, user.id, ui);
  const board = kept && content.querySelector('[data-keep-scroll]');
  if (board) [board.scrollLeft, board.scrollTop] = kept;
  const nextLog = content.querySelector('[data-log-scroll]');
  if (nextLog) nextLog.scrollTop = logAt ?? nextLog.scrollHeight;
  fitRoomChat();
  updateDeadline();
  if (hold !== undefined) app.querySelector('[data-hold="' + hold + '"]')?.focus();
}

// On narrow screens the room chat is a drawer on the left edge.
const narrowRoom = () => matchMedia('(max-width: 920px)').matches;

function toggleChat(open) {
  const layout = app.querySelector('.room-layout');
  if (!layout) return;
  const next = open ?? !layout.classList.contains('chat-open');
  layout.classList.toggle('chat-open', next);
  layout.querySelector('.chat-tab').setAttribute('aria-expanded', String(next));
  if (next) layout.querySelector('.chat-unread').hidden = true;
}

// Beside the game, the chat starts at the game panel and matches its height.
function fitRoomChat() {
  const layout = app.querySelector('.room-layout');
  const aside = layout?.querySelector('#chat-host');
  if (!aside) return;
  const panel = layout.querySelector('#room-content .game-panel, #room-content .yacht-panel');
  const beside = panel && matchMedia('(min-width: 921px)').matches;
  aside.classList.toggle('chat-fill', Boolean(beside));
  aside.style.marginTop = beside ? panel.getBoundingClientRect().top - layout.getBoundingClientRect().top + 'px' : '';
  aside.style.height = beside ? Math.max(panel.offsetHeight, 360) + 'px' : '';
}

async function loadRanks(delay) {
  const token = generation;
  const game = room.game;
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  if (token !== generation) return;
  try {
    const { rows } = await api('/rankings?game=' + game);
    if (token !== generation) return;
    ui.ranks = new Map(rows.map(row => [row.id, row]));
    // Someone missing from the board is remembered as unranked, so the board is not read again for them.
    for (const person of [...room.players, ...room.spectators]) if (!ui.ranks.has(person.id)) ui.ranks.set(person.id, null);
    renderRoom();
  } catch {
    // The room plays on without ranks; they come back with the next change.
  }
}

function acceptRoom(next) {
  if (!next || room && next.revision <= room.revision) return;
  const rolled = next.game === 'yacht' && room && next.rollCount > (room.rollCount ?? 0) && next.rollsUsed > 0;
  const caught = next.game === 'ciao' && room && room.match === next.match && room.phase === 'respond' &&
    next.phase !== 'respond' && next.last?.includes(' 의심 성공 ');
  if (!room || room.match !== next.match || room.seatEpoch !== next.seatEpoch ||
      room.index !== next.index || room.rollsUsed !== next.rollsUsed) {
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
          app.querySelector('.call-button')?.removeAttribute('disabled');
        }
      }, 500);
    }
    if (room?.index !== next.index || !next.players.find(player => player.id === user.id)?.hand?.includes(ui.card)) ui.card = null;
  }
  if (next.game === 'saboteur' && !next.players.find(player => player.id === user.id)?.hand?.includes(ui.sabCard)) {
    ui.sabCard = null;
    ui.sabRot = 0;
  }
  const previous = room;
  room = next;
  renderRoom();
  // Results reach the ranking board a moment after a game ends, so the board is read again a little later.
  const members = [...next.players, ...next.spectators].filter(person => !person.vacant);
  if (!previous || previous.status !== next.status || members.some(person => !ui.ranks?.has(person.id))) {
    void loadRanks(next.status === 'finished' && previous ? 1500 : 0);
  }
  if (rolled) animateYachtRoll();
  if (rolled && next.dice[0] > 0 && next.dice.every(die => die === next.dice[0])) {
    const token = generation;
    // One of the lines at random; the revision picks it so everyone in the room sees the same one.
    const line = ['미친 야추!!', '게임 쉽다~', '이게 실력이야ㅋ'][next.revision % 3];
    setTimeout(() => token === generation && celebrate(line), 480);
  }
  // Everyone in the room sees the same line: the revision picks it.
  if (caught) celebrate(['벌레컷', '꼴이 좋아'][next.revision % 2], false);
}

// A big banner over the whole screen (yacht, a caught ciao bluff), with confetti for yacht.
function celebrate(text, confetti = true) {
  document.querySelector('.yacht-fanfare')?.remove();
  const colors = ['#ffd166', '#ef476f', '#06d6a0', '#4cc9f0', '#f78c6b'];
  const pieces = !confetti || matchMedia('(prefers-reduced-motion: reduce)').matches ? '' : Array.from({ length: 72 }, (_, index) =>
    `<i style="--x:${Math.random() * 100}%;--d:${(Math.random() * 0.4).toFixed(2)}s;--r:${Math.floor(Math.random() * 720 - 360)}deg;background:${colors[index % colors.length]}"></i>`).join('');
  document.body.insertAdjacentHTML('beforeend', `<div class="yacht-fanfare" aria-live="polite"><strong>${escape(text)}</strong>${pieces}</div>`);
  const banner = document.querySelector('.yacht-fanfare');
  setTimeout(() => banner.remove(), 2200);
}

function animateYachtRoll() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const faces = Array.from(app.querySelectorAll('[data-roll-face]'));
  if (!faces.length) return;
  const results = faces.map(face => face.innerHTML);
  let frame = 0;
  faces.forEach(face => face.classList.add('tumbling'));
  const timer = setInterval(() => {
    if (!faces[0].isConnected || ++frame >= 8) {
      clearInterval(timer);
      faces.forEach((face, index) => {
        face.innerHTML = results[index];
        face.classList.remove('tumbling');
      });
    } else {
      for (const face of faces) face.innerHTML = yachtFace(1 + Math.floor(Math.random() * 6));
    }
  }, 55);
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
      const layout = app.querySelector('.room-layout');
      if (packet.chatMessage && packet.chatMessage.playerId !== user.id && narrowRoom() && !layout?.classList.contains('chat-open')) {
        const unread = layout?.querySelector('.chat-unread');
        if (unread) unread.hidden = false;
      }
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
      seatEpoch: current.seatEpoch,
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

// A face-down 섯다 card opens at once on a tap, or slides its back off as it is dragged; past half its height it stays open.
let drag = null;

app.addEventListener('pointerdown', event => {
  const peel = event.target.closest('[data-peek]');
  if (!peel || event.button > 0) return;
  event.preventDefault();
  peel.setPointerCapture(event.pointerId);
  drag = { peel, key: peel.dataset.peek, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
  ui.dragging = true;
  peel.classList.add('dragging');
});

app.addEventListener('pointermove', event => {
  if (drag?.pointer !== event.pointerId) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag.moved = Math.hypot(dx, dy);
  drag.peel.querySelector('.peel-cover').style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 14}deg)`;
});

function endDrag(event, cancelled) {
  if (drag?.pointer !== event.pointerId) return;
  const { peel, key, moved } = drag;
  drag = null;
  ui.dragging = false;
  const tapped = moved < 6;
  if (!cancelled && (tapped || moved > peel.querySelector('.peel-card').offsetHeight * .5)) return peek(key, tapped);
  peel.classList.remove('dragging');
  peel.querySelector('.peel-cover').style.transform = '';
  if (ui.renderPending) renderRoom();
}

app.addEventListener('pointerup', event => endDrag(event, false));
app.addEventListener('pointercancel', event => endDrag(event, true));

app.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  // Pointer presses are handled above; a keyboard press arrives only as a click.
  if (button.dataset.peek) {
    if (!event.detail) peek(button.dataset.peek, true);
    return;
  }
  if (button.hasAttribute('data-account')) return showAccount();
  if (button.hasAttribute('data-reload')) return navigate();
  if (button.hasAttribute('data-chat-toggle')) return toggleChat();
  if (button.hasAttribute('data-focus-chat')) {
    if (narrowRoom() && app.querySelector('.room-layout')) return toggleChat(true);
    return app.querySelector('[data-chat-input]')?.focus();
  }
  if (button.dataset.sabCard !== undefined) {
    const card = Number(button.dataset.sabCard);
    ui.sabRot = 0;
    ui.sabCard = ui.sabCard === card ? null : card;
    return renderRoom();
  }
  if (button.dataset.dvPick) {
    // The picked tile counts only for this turn step; the number pad below it sends the guess.
    const same = ui.dvPick?.key === button.dataset.dvPick && ui.dvPick.turn === room.turn;
    ui.dvPick = same ? null : { key: button.dataset.dvPick, turn: room.turn };
    return renderRoom();
  }
  if (button.dataset.bmCell !== undefined) {
    const cell = Number(button.dataset.bmCell);
    ui.bmCell = ui.bmCell === cell ? null : cell;
    return renderRoom();
  }
  if (button.hasAttribute('data-sab-rotate')) {
    ui.sabRot = 1 - ui.sabRot;
    return renderRoom();
  }
  if (button.dataset.sabZoom) {
    ui.sabZoom = Math.min(2, Math.max(0, ui.sabZoom + Number(button.dataset.sabZoom)));
    return renderRoom();
  }
  if (button.dataset.power !== undefined) {
    ui.power = Number(button.dataset.power);
    return renderRoom();
  }
  if (button.hasAttribute('data-refresh')) {
    try { await refreshLobby(); } catch (error) { message(error.message); }
    return;
  }
  if (button.dataset.deleteRoom) {
    if (!window.confirm('이 방을 삭제할까요? 안에 있는 사람들은 모두 나가게 됩니다.')) return;
    const token = generation;
    button.disabled = true;
    try {
      await api('/rooms/' + button.dataset.deleteRoom + '/action', { action: 'delete' });
      if (token === generation) await refreshLobby(token);
    } catch (error) {
      if (token !== generation) return;
      if (error.status === 401) return signedOut();
      message(error.message);
      button.disabled = false;
    }
    return;
  }
  const entryRoom = button.dataset.join ?? button.dataset.watch;
  if (entryRoom) {
    const token = generation;
    button.disabled = true;
    try {
      const { room: joined } = await api('/rooms/' + entryRoom + '/action', {
        action: button.dataset.watch ? 'watch' : 'join',
      });
      if (token !== generation) return;
      if (location.hash === '#room/' + joined.id) await navigate();
      else location.hash = '#room/' + joined.id;
    } catch (error) {
      if (token !== generation) return;
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
    if (action.action === 'kick' &&
      !window.confirm(`${room.players.find(player => player.id === action.target)?.name ?? ''}님을 강퇴할까요?`)) return;
    if (action.action === 'resign' && !window.confirm('기권하면 이번 판은 패배로 기록됩니다. 기권할까요?')) return;
    if (action.action === 'spectate' && room.game === 'seotda' && room.status === 'playing' &&
      !window.confirm('지금 관전석으로 이동하면 이번 판은 다이로 처리되고 건 돈을 잃습니다. 이동할까요?')) return;
    await sendAction(action);
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && app.querySelector('.room-layout.chat-open')) toggleChat(false);
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
