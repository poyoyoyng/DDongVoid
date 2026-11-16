const clock = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' });

export function createChat(host, title, accountId, send) {
  host.innerHTML = `<section class="panel chat-panel" aria-labelledby="chat-title">
    <div class="section-head"><h2 id="chat-title"></h2><span class="muted" data-chat-status>연결 중…</span></div>
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
    const header = document.createElement('div');
    const name = document.createElement('strong');
    const time = document.createElement('time');
    const body = document.createElement('p');
    name.textContent = entry.name;
    time.dateTime = new Date(entry.sentAt).toISOString();
    time.textContent = clock.format(entry.sentAt);
    body.textContent = entry.text;
    header.append(name, time);
    item.append(header, body);
    log.insertBefore(item, next ?? null);
    if (log.childElementCount > 50) log.firstElementChild.remove();
    if (pinned || own && !next) log.scrollTop = log.scrollHeight;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const draft = input.value;
    if (button.disabled || !draft.trim()) return;
    button.disabled = true;
    error.hidden = true;
    try {
      const { chatMessage } = await send(draft);
      append(chatMessage);
      if (input.value === draft) input.value = '';
    } catch (failure) {
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
