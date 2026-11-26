import assert from 'node:assert/strict';
import test from 'node:test';
import { reactionDelay, reactionRankChange, validReaction } from '../public/reaction-model.js';
import { playReaction } from '../public/reaction.js';
import { home, rankings } from '../public/views.js';

test('준비 시간은 무작위 시드에 따라 1~6초이고 양 끝값을 포함한다', () => {
  assert.equal(reactionDelay(0), 1000);
  assert.equal(reactionDelay(0xffffffff), 6000);
  const delays = new Set();
  for (let seed = 0; seed < 0x100000000; seed += 100003) {
    const delay = reactionDelay(seed);
    assert.ok(Number.isInteger(delay) && delay >= 1000 && delay <= 6000);
    delays.add(delay);
  }
  assert.equal(delays.size, 5001);
});

test('반응 기록은 준비 시간을 포함하고 서버 경과 시간과 맞아야 한다', () => {
  assert.equal(validReaction(0, 250, 1250, 1250), true);
  assert.equal(validReaction(0xffffffff, 250, 6250, 6250), true);
  assert.equal(validReaction(0, 100, 1100, 1100), true);
  for (const ms of [undefined, null, '250', -1, 0, 1, 27, 99, 99.9, 1.5, NaN, Infinity, 60001]) {
    assert.equal(validReaction(0, ms, 10000, 10000), false);
  }
  assert.equal(validReaction(0, 250, 1249, 1250), false);
  assert.equal(validReaction(0, 250, 1250, 0), false);
  assert.equal(validReaction(0, 250, Infinity, 10000), false);
});

test('순위 변화는 상승·하락·유지·첫 진입으로 구분한다', () => {
  assert.equal(reactionRankChange(5, 2), '↑ 3계단 상승');
  assert.equal(reactionRankChange(2, 5), '↓ 3계단 하락');
  assert.equal(reactionRankChange(2, 2), '순위 유지');
  assert.equal(reactionRankChange(undefined, 2), '첫 랭킹 진입');
});

class Element extends EventTarget {
  dataset = {};
  hidden = false;
  textContent = '';
  children = [];
  selectors = new Map();
  querySelector(selector) { return this.selectors.get(selector); }
  closest() { return null; }
  focus() {}
  append(child) { this.children.push(child); }
  prepend(child) { this.children.unshift(child); }
}

function setup(context, { save = async () => {}, rows = [] } = {}) {
  const old = { document: globalThis.document, window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const document = new Element();
  document.createElement = () => new Element();
  document.hasFocus = () => true;
  const window = new Element();
  const elements = new Map();
  for (const id of ['reaction-pad', 'reaction-result', 'reaction-status', 'reaction-ranking', 'reaction-save']) {
    elements.set('#' + id, new Element());
  }
  const pad = elements.get('#reaction-pad');
  const title = new Element();
  const subtitle = new Element();
  pad.selectors.set('strong', title);
  pad.selectors.set('span', subtitle);
  const restart = new Element();
  elements.set('[data-restart]', restart);
  document.querySelector = selector => elements.get(selector);
  let now = 0;
  let sequence = 0;
  const frames = new Map();
  const timers = new Map();
  Object.assign(globalThis, { document, window,
    requestAnimationFrame: callback => { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id) });
  context.mock.method(performance, 'now', () => now);
  context.mock.method(globalThis, 'setTimeout', (callback, delay) => { const id = ++sequence; timers.set(id, { callback, delay }); return id; });
  context.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
  let loads = 0;
  let restarts = 0;
  const saved = [];
  const controller = playReaction({ id: 'test-run', seed: 0 }, async data => { saved.push(data); return save(data); },
    async () => ({ rows: typeof rows === 'function' ? rows(loads++) : rows }), () => { restarts++; }, 'me');
  const fire = (target, type, values = {}) => {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event);
  };
  context.after(() => { controller.stop(); Object.assign(globalThis, old); });
  return { pad, title, subtitle, document, window, restart, saved, controller, timers,
    get: id => elements.get('#' + id),
    restarts: () => restarts,
    frame(time) { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time)); },
    press(time) { now = time; fire(pad, 'pointerdown', { isPrimary: true, button: 0 }); },
    fire,
  };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('초록색 터치 즉시 ms·다시하기를 표시하고 최고 기록과 순위 상승을 함께 보여 준다', async context => {
  const ui = setup(context, { rows: index => [{ id: 'me', name: '나', score: index ? 250 : 400, rank: index ? 2 : 5 }] });
  ui.frame(0);
  ui.frame(999);
  assert.notEqual(ui.pad.dataset.phase, 'ready');
  ui.frame(1000);
  assert.equal(ui.pad.dataset.phase, 'ready');
  assert.equal(ui.title.textContent, '눌러!');
  ui.press(1250);
  assert.equal(ui.title.textContent, '250 ms');
  assert.equal(ui.restart.hidden, false);
  await settle();
  assert.deepEqual(ui.saved, [{ id: 'test-run', reactionMs: 250, elapsedMs: 1250 }]);
  assert.equal(ui.subtitle.textContent, '내 랭킹 2위 · ↑ 3계단 상승');
  assert.match(ui.get('reaction-ranking').children[0].textContent, /내 최고 기록 250 ms · 내 순위 2위/);
  ui.press(1300);
  assert.equal(ui.saved.length, 1);
  ui.fire(ui.restart, 'click');
  assert.equal(ui.restarts(), 1);
});

test('100ms 미만이면 예측하지마라잉?을 표시하고 저장 없이 바로 다시하기가 가능하다', async context => {
  const ui = setup(context);
  ui.frame(0);
  ui.frame(1000);
  ui.press(1099);
  await settle();
  assert.equal(ui.title.textContent, '예측하지마라잉?');
  assert.match(ui.subtitle.textContent, /99 ms/);
  assert.equal(ui.pad.dataset.phase, 'predicted');
  assert.equal(ui.restart.hidden, false);
  assert.deepEqual(ui.saved, []);
  ui.press(1200);
  assert.deepEqual(ui.saved, []);
  ui.fire(ui.restart, 'click');
  assert.equal(ui.restarts(), 1);
});

test('정확히 100ms는 정상 기록으로 저장한다', async context => {
  const ui = setup(context);
  ui.frame(0);
  ui.frame(1000);
  ui.press(1100);
  await settle();
  assert.equal(ui.title.textContent, '100 ms');
  assert.deepEqual(ui.saved, [{ id: 'test-run', reactionMs: 100, elapsedMs: 1100 }]);
});

test('빨간색에서 미리 누르면 실패하고 저장하지 않으며 다시 시작할 수 있다', async context => {
  const ui = setup(context);
  ui.press(100);
  ui.frame(0);
  ui.frame(6000);
  await settle();
  assert.equal(ui.pad.dataset.phase, 'early');
  assert.deepEqual(ui.saved, []);
  assert.equal(ui.restart.hidden, false);
});

test('키를 길게 누르거나 보조 포인터를 대는 입력은 무시하고 Space 한 번으로만 측정한다', async context => {
  const ui = setup(context);
  ui.frame(0);
  ui.fire(ui.window, 'keydown', { code: 'Space', repeat: true });
  ui.fire(ui.pad, 'pointerdown', { isPrimary: false, button: 0 });
  ui.frame(1000);
  ui.frame(1260);
  ui.fire(ui.window, 'keydown', { code: 'Space', repeat: false });
  await settle();
  assert.equal(ui.saved[0].reactionMs, 260);
});

test('탭을 숨기거나 종료한 측정은 나중에 초록색으로 바뀌거나 저장되지 않는다', context => {
  const ui = setup(context);
  ui.frame(0);
  ui.document.hidden = true;
  ui.fire(ui.document, 'visibilitychange');
  ui.frame(3000);
  assert.equal(ui.pad.dataset.phase, 'cancelled');
  ui.controller.stop();
  ui.press(4000);
  assert.deepEqual(ui.saved, []);
});

test('저장 실패 후에는 같은 기록을 재시도하고 하락한 순위도 표시한다', async context => {
  let attempts = 0;
  const ui = setup(context, { save: async () => { if (++attempts === 1) throw new Error('연결 실패'); },
    rows: index => [{ id: 'me', name: '나', score: 250, rank: index ? 5 : 2 }] });
  ui.frame(0);
  ui.frame(1000);
  ui.press(1300);
  await settle();
  assert.equal(ui.get('reaction-save').hidden, false);
  ui.fire(ui.get('reaction-save'), 'click');
  await settle();
  assert.deepEqual(ui.saved[0], ui.saved[1]);
  assert.equal(ui.subtitle.textContent, '내 랭킹 5위 · ↓ 3계단 하락');
});

test('게임 목록과 전체 랭킹에 반응속도 테스트와 ms가 표시된다', () => {
  assert.match(home(), /href="#play\/reaction"/);
  const markup = rankings('reaction', [{ id: 'me', name: '<나>', score: 250, rank: 1 }]);
  assert.match(markup, /250 ms/);
  assert.match(markup, /&lt;나&gt;/);
  assert.match(markup, /최고 기록/);
  assert.doesNotMatch(markup, /최고 점수/);
});
