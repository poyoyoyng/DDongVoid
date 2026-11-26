const clock = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' });
const lobbyClock = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' });
const calendar = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });

function messageDate(sentAt) {
  const parts = Object.fromEntries(calendar.formatToParts(sentAt).map(part => [part.type, part.value]));
  return `${parts.year}.${parts.month}.${parts.day}`;
}

function memberGroup(title, names, playing) {
  const group = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = `${title} ${names.length}명`;
  group.append(heading);
  if (!names.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = '아무도 없습니다.';
    group.append(empty);
    return group;
  }
  const list = document.createElement('ul');
  for (const name of names) {
    const item = document.createElement('li');
    item.textContent = name;
    if (playing?.has(name)) {
      const badge = document.createElement('small');
      badge.textContent = '게임 중';
      item.append(badge);
    }
    list.append(item);
  }
  group.append(list);
  return group;
}

export function createChat(host, title, accountId, send, { members = false, dateSeparators = false } = {}) {
  const membersButton = members ? `<button type="button" class="button button-small button-quiet" data-members-toggle
    aria-expanded="false" aria-controls="chat-members">참가자 <span data-members-count></span></button>` : '';
  host.innerHTML = `<section class="panel chat-panel" aria-labelledby="chat-title">
    <div class="section-head"><h2 id="chat-title"></h2>
      <div class="chat-tools">${membersButton}<span class="muted" data-chat-status>연결 중…</span></div></div>
    ${members ? '<div class="chat-members" id="chat-members" hidden><p class="muted">불러오는 중…</p></div>' : ''}
    <div class="chat-log" role="log" aria-labelledby="chat-title" tabindex="0">
      <p class="muted">아직 메시지가 없습니다.</p>
    </div>
    <form class="chat-form">
      <input name="text" data-chat-input aria-label="메시지" placeholder="메시지 입력" maxlength="300" autocomplete="off" required>
      <button class="button button-primary" type="submit">보내기</button>
    </form>
    <p class="chat-error" role="status" hidden></p>
  </section>`;
  host.querySelector('#chat-title').textContent = title;
  const status = host.querySelector('[data-chat-status]');
  const log = host.querySelector('.chat-log');
  const form = host.querySelector('form');
  const input = form.elements.text;
  const button = form.querySelector('button');
  const error = host.querySelector('.chat-error');
  const membersToggle = host.querySelector('[data-members-toggle]');
  const membersPanel = host.querySelector('#chat-members');
  membersToggle?.addEventListener('click', () => {
    membersPanel.hidden = !membersPanel.hidden;
    membersToggle.setAttribute('aria-expanded', String(!membersPanel.hidden));
  });

  function updateDates() {
    let previousDate;
    for (const item of log.querySelectorAll('.chat-message')) {
      const date = item.dataset.date;
      const before = item.previousElementSibling;
      if (date !== previousDate && !(before?.classList.contains('chat-date') && before.dataset.date === date)) {
        const separator = document.createElement('div');
        separator.className = 'chat-date';
        separator.dataset.date = date;
        separator.setAttribute('role', 'separator');
        separator.setAttribute('aria-label', date);
        const time = document.createElement('time');
        time.dateTime = date.replaceAll('.', '-');
        time.textContent = date;
        separator.append(time);
        log.insertBefore(separator, item);
      } else if (date === previousDate && before?.classList.contains('chat-date')) {
        before.remove();
      }
      previousDate = date;
    }
    for (const separator of log.querySelectorAll('.chat-date')) {
      const next = separator.nextElementSibling;
      if (!next?.classList.contains('chat-message') || next.dataset.date !== separator.dataset.date) separator.remove();
    }
  }

  function append(entry) {
    const items = Array.from(log.querySelectorAll('.chat-message'));
    if (items.some(item => Number(item.dataset.id) === entry.id)) return;
    const next = items.find(item => Number(item.dataset.id) > entry.id);
    const own = entry.playerId === accountId;
    const pinned = log.scrollHeight - log.scrollTop - log.clientHeight <= 24;
    if (items.length === 0) log.replaceChildren();
    const item = document.createElement('article');
    item.className = own ? 'chat-message mine' : 'chat-message';
    item.dataset.id = entry.id;
    if (dateSeparators) item.dataset.date = messageDate(entry.sentAt);
    const header = document.createElement('div');
    const name = document.createElement('strong');
    const time = document.createElement('time');
    const body = document.createElement('p');
    name.textContent = entry.name;
    time.dateTime = new Date(entry.sentAt).toISOString();
    time.textContent = (dateSeparators ? lobbyClock : clock).format(entry.sentAt);
    body.textContent = entry.text;
    header.append(name, time);
    item.append(header, body);
    log.insertBefore(item, next ?? null);
    // Date separators do not count toward the 50-message history limit.
    for (const old of Array.from(log.querySelectorAll('.chat-message')).slice(0, -50)) old.remove();
    if (dateSeparators) updateDates();
    if (pinned || own && !next) log.scrollTop = log.scrollHeight;
  }

  // A desktop Korean IME may still be composing the last syllable when Enter submits. Clearing the field then
  // lets the IME write that syllable back, so a submit during composition waits for the composition to end.
  let composing = false;
  let submitAfterComposition = false;
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => {
    composing = false;
    if (!submitAfterComposition) return;
    submitAfterComposition = false;
    // Some browsers also submit on the Enter that ended the composition; then the field is already empty here.
    setTimeout(() => { if (input.value.trim()) form.requestSubmit(); });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (composing) { submitAfterComposition = true; return; }
    const draft = input.value;
    if (button.disabled || !draft.trim()) return;
    button.disabled = true;
    error.hidden = true;
    input.value = '';
    try {
      const { chatMessage } = await send(draft);
      append(chatMessage);
    } catch (failure) {
      // Give the unsent message back unless a new one was started meanwhile.
      if (!input.value) input.value = draft;
      error.textContent = failure.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  return {
    receive(packet) {
      for (const entry of packet.chat ?? []) append(entry);
      if (packet.chatMessage) append(packet.chatMessage);
    },
    setMembers({ lobby, rooms, playing }) {
      if (!membersPanel) return;
      host.querySelector('[data-members-count]').textContent = new Set([...lobby, ...rooms]).size;
      membersPanel.replaceChildren(memberGroup('로비', lobby), memberGroup('대전방', rooms, new Set(playing)));
    },
    setConnected(connected) {
      status.textContent = connected ? '연결됨' : '재연결 중…';
    },
  };
}

export function connectSocket(path, { status, receive }) {
  const target = new URL('/api' + path + '/socket', location.origin);
  target.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let socket;
  let retry;
  let delay = 650;
  let stopped = false;

  function open() {
    socket = new WebSocket(target);
    socket.addEventListener('open', () => {
      if (stopped) return;
      delay = 650;
      status(true);
    });
    socket.addEventListener('message', event => {
      if (!stopped) receive(JSON.parse(event.data));
    });
    socket.addEventListener('close', () => {
      if (stopped) return;
      status(false);
      retry = setTimeout(open, delay);
      delay = Math.min(delay * 2, 12_000);
    });
  }

  open();
  return {
    stop() {
      stopped = true;
      clearTimeout(retry);
      if (socket.readyState < WebSocket.CLOSING) socket.close();
    },
  };
}
