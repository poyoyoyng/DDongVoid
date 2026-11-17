import assert from 'node:assert/strict';
import test from 'node:test';
import { createMusic } from '../public/music.js';

class Element extends EventTarget {
  children = [];
  attributes = new Map();
  classList = { toggle() {} };
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  contains(target) { return target === this || this.children.some(child => child.contains(target)); }
  fire(type) { this.dispatchEvent(new Event(type)); }
}

function setup(context, saved = {}) {
  const previous = { Audio: globalThis.Audio, document: globalThis.document, localStorage: globalThis.localStorage };
  context.after(() => Object.assign(globalThis, previous));
  const storage = new Map(Object.entries(saved));
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  let audio;
  globalThis.Audio = class extends Element {
    paused = true;
    currentTime = 0;
    playCalls = 0;
    rejectPlay = null;
    constructor() { super(); audio = this; }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    removeAttribute(key) { this.attributes.delete(key); }
    set src(value) { this.attributes.set('src', value); this.currentTime = 0; this.paused = true; }
    play() {
      this.playCalls++;
      if (this.rejectPlay) return Promise.reject(this.rejectPlay);
      this.paused = false;
      this.fire('playing');
      return Promise.resolve();
    }
    pause() { if (!this.paused) { this.paused = true; this.fire('pause'); } }
    load() { this.currentTime = 0; this.paused = true; }
  };
  const document = new Element();
  document.createElement = () => new Element();
  globalThis.document = document;
  const controls = new Map();
  const player = new Element();
  player.querySelector = selector => {
    if (!controls.has(selector)) {
      const element = new Element();
      controls.set(selector, element);
      player.append(element);
    }
    return controls.get(selector);
  };
  const controller = createMusic(player);
  const get = id => controls.get('#music-' + id);
  const track = index => get('tracks').children[index].children[0];
  return { audio, controller, get, track, storage, document };
}
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };

test('재생, 일시정지, 다음 곡, 목록 선택과 마지막 곡 순환이 작동한다', async context => {
  const { audio, controller, get, track } = setup(context, { 'ddongvoid-music': 'off' });
  assert.equal(get('play').disabled, true);
  controller.update(true, false);
  assert.equal(audio.playCalls, 0);
  get('play').fire('click');
  await settle();
  assert.equal(audio.getAttribute('src'), '/api/music/circles');
  audio.currentTime = 42;
  get('pause').fire('click');
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 42);
  get('play').fire('click');
  await settle();
  assert.equal(audio.currentTime, 42);
  get('next').fire('click');
  await settle();
  assert.equal(audio.getAttribute('src'), '/api/music/iu-merry-christmas');
  assert.equal(get('title').textContent, '미리 메리 크리스마스');
  assert.equal(track(1).attributes.get('aria-current'), 'true');
  track(4).fire('click');
  await settle();
  assert.equal(get('title').textContent, 'All I Want For Christmas Is You');
  audio.paused = true;
  audio.fire('ended');
  await settle();
  assert.equal(get('title').textContent, 'Circles');
  assert.equal(audio.paused, false);
});

test('볼륨과 선택 곡을 기억하고 리듬 게임 및 로그아웃에서 음악을 멈춘다', async context => {
  const { audio, controller, get, storage } = setup(context, {
    'ddongvoid-music-track': 'last-christmas', 'ddongvoid-music-volume': '0.7',
  });
  assert.equal(audio.volume, .7);
  assert.equal(get('title').textContent, 'Last Christmas');
  controller.update(true, false);
  await settle();
  get('volume').value = '0';
  get('volume').fire('input');
  assert.equal(audio.volume, 0);
  assert.equal(get('volume-value').textContent, '0%');
  assert.equal(storage.get('ddongvoid-music-volume'), '0');
  audio.currentTime = 20;
  controller.update(true, true);
  assert.equal(audio.paused, true);
  assert.equal(get('next').disabled, true);
  controller.update(true, false);
  await settle();
  assert.equal(audio.paused, false);
  assert.equal(audio.currentTime, 20);
  get('next').fire('click');
  await settle();
  assert.equal(storage.get('ddongvoid-music-track'), 'underneath-the-tree');
  controller.update(false, false);
  assert.equal(audio.paused, true);
  assert.equal(audio.getAttribute('src'), null);
  assert.equal(get('play').disabled, true);
});

test('브라우저 자동재생 거부 후 시작 버튼으로 재시도하고 음원 오류에서 다음 곡을 고를 수 있다', async context => {
  const { audio, controller, get } = setup(context);
  audio.rejectPlay = Object.assign(new Error('gesture needed'), { name: 'NotAllowedError' });
  controller.update(true, false);
  await settle();
  assert.equal(get('play').disabled, false);
  assert.match(get('status').textContent, /시작/);
  audio.rejectPlay = null;
  get('play').fire('click');
  await settle();
  assert.equal(audio.paused, false);
  audio.fire('error');
  assert.match(get('status').textContent, /불러오지 못/);
  get('next').fire('click');
  await settle();
  assert.equal(audio.getAttribute('src'), '/api/music/iu-merry-christmas');
  assert.equal(audio.paused, false);
});
