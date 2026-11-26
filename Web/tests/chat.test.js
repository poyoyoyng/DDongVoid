import assert from 'node:assert/strict';
import test from 'node:test';
import { createChat } from '../public/chat.js';

class Element extends EventTarget {
  children = [];
  dataset = {};
  className = '';
  classList = { contains: name => this.className.split(' ').includes(name) };
  attributes = new Map();
  scrollHeight = 1000;
  clientHeight = 200;
  scrollTop = 800;
  get previousElementSibling() { return this.parent?.children[this.parent.children.indexOf(this) - 1] ?? null; }
  get nextElementSibling() { return this.parent?.children[this.parent.children.indexOf(this) + 1] ?? null; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  append(...children) {
    for (const child of children) { child.remove(); child.parent = this; this.children.push(child); }
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  replaceChildren(...children) {
    for (const child of [...this.children]) child.remove();
    this.append(...children);
  }
  insertBefore(child, next) {
    child.remove();
    child.parent = this;
    const index = next ? this.children.indexOf(next) : this.children.length;
    this.children.splice(index, 0, child);
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(child.className.split(' ').includes(selector.slice(1)) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}

function setup(context, dateSeparators = true) {
  const previousDocument = globalThis.document;
  context.after(() => { globalThis.document = previousDocument; });
  globalThis.document = { createElement: () => new Element() };
  const selectors = new Map();
  for (const selector of ['#chat-title', '[data-chat-status]', '.chat-log', 'form', '.chat-error']) {
    selectors.set(selector, new Element());
  }
  const form = selectors.get('form');
  form.elements = { text: new Element() };
  form.querySelector = () => new Element();
  const host = { querySelector: selector => selectors.get(selector) };
  const chat = createChat(host, '채팅', 'me', async () => {}, { dateSeparators });
  const log = selectors.get('.chat-log');
  return { chat, log,
    messages: () => log.querySelectorAll('.chat-message'),
    dates: () => log.querySelectorAll('.chat-date').map(item => item.children[0].textContent),
  };
}

const entry = (id, sentAt, playerId = 'other') => ({ id, sentAt: Date.parse(sentAt), playerId, name: '테스트', text: '메시지 ' + id });

test('로비 기록에서 같은 날짜의 메시지는 한 구분선 아래에 표시한다', context => {
  const ui = setup(context);
  ui.chat.receive({ chat: [entry(1, '2026-11-26T09:00:00+09:00'), entry(2, '2026-11-26T10:00:00+09:00')] });
  assert.deepEqual(ui.dates(), ['2026.11.26']);
  assert.equal(ui.messages().length, 2);
  const separator = ui.log.children[0];
  assert.equal(separator.attributes.get('role'), 'separator');
  assert.equal(separator.attributes.get('aria-label'), '2026.11.26');
  assert.equal(separator.children[0].dateTime, '2026-11-26');
  ui.chat.receive({ chatMessage: entry(3, '2026-11-26T11:00:00+09:00') });
  assert.equal(ui.log.children[0], separator);
  assert.deepEqual(ui.dates(), ['2026.11.26']);
});

test('한국 시간 자정을 넘어온 실시간 메시지 앞에 새 날짜 구분선을 추가한다', context => {
  const ui = setup(context);
  ui.chat.receive({ chat: [entry(1, '2026-11-25T14:59:59.999Z')] });
  ui.chat.receive({ chatMessage: entry(2, '2026-11-25T15:00:00.000Z') });
  ui.chat.receive({ chatMessage: entry(3, '2026-11-25T15:01:00.000Z') });
  assert.deepEqual(ui.dates(), ['2026.11.25', '2026.11.26']);
  assert.equal(ui.messages()[1].children[0].children[1].textContent, '오전 12:00');
});

test('늦게 도착한 기록과 재연결 중 중복 메시지에도 순서와 구분선이 맞다', context => {
  const ui = setup(context);
  const earlier = entry(1, '2026-11-25T12:00:00+09:00');
  const middle = entry(2, '2026-11-25T13:00:00+09:00');
  const latest = entry(3, '2026-11-26T12:00:00+09:00');
  ui.chat.receive({ chatMessage: latest });
  ui.chat.receive({ chat: [earlier, middle] });
  ui.chat.receive({ chat: [earlier, middle, latest] });
  assert.deepEqual(ui.log.children.map(item => item.dataset.id ?? item.children[0].textContent),
    ['2026.11.25', 1, 2, '2026.11.26', 3]);
});

test('구분선을 제외하고 최근 메시지 50개를 유지하며 빈 날짜 구분선은 제거한다', context => {
  const ui = setup(context);
  ui.chat.receive({ chat: Array.from({ length: 51 }, (_, index) =>
    entry(index + 1, index === 0 ? '2026-11-25T12:00:00+09:00' : '2026-11-26T12:00:00+09:00')) });
  assert.equal(ui.messages().length, 50);
  assert.equal(ui.messages()[0].dataset.id, 2);
  assert.deepEqual(ui.dates(), ['2026.11.26']);
  ui.chat.receive({ chatMessage: entry(0, '2026-11-24T12:00:00+09:00') });
  assert.equal(ui.messages().length, 50);
  assert.deepEqual(ui.dates(), ['2026.11.26']);
});

test('구분선을 사용하지 않는 게임방 채팅에는 날짜 행을 넣지 않는다', context => {
  const ui = setup(context, false);
  ui.chat.receive({ chat: [entry(1, '2026-11-25T12:00:00+09:00'), entry(2, '2026-11-26T12:00:00+09:00')] });
  assert.deepEqual(ui.dates(), []);
  assert.equal(ui.messages().length, 2);
});

test('이전 메시지를 읽는 중에는 새 날짜의 다른 사람 메시지가 와도 맨 아래로 이동하지 않는다', context => {
  const ui = setup(context);
  ui.chat.receive({ chatMessage: entry(1, '2026-11-25T12:00:00+09:00') });
  ui.log.scrollTop = 100;
  ui.chat.receive({ chatMessage: entry(2, '2026-11-26T12:00:00+09:00') });
  assert.equal(ui.log.scrollTop, 100);
  assert.deepEqual(ui.dates(), ['2026.11.25', '2026.11.26']);
});
