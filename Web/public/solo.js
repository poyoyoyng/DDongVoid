import { applySoloInput, height, makeSolo, maxTicks, stepSolo, tickRate, width } from './solo-model.js';

export function soloMarkup() {
  const controls = ['←', '→'];
  return `<section class="panel solo-panel">
    <div class="solo-hud" aria-live="off">
      <div><span>점수</span> <strong id="solo-score">0</strong></div>
      <div id="solo-metric"></div>
      <button type="button" class="button button-small button-outline" id="solo-pause">일시정지</button>
    </div>
    <div class="canvas-wrap">
      <canvas id="solo-canvas" width="${width}" height="${height}" aria-label="똥 피하기 화면"></canvas>
      <div id="solo-cover" class="canvas-cover" hidden></div>
    </div>
    <div class="touch-controls" aria-label="터치 조작">${controls.map((key, index) =>
      `<button type="button" class="button button-outline" data-game-key="${index}">${key}</button>`).join('')}</div>
    <p class="muted">← → 키 또는 A D 키로 움직이세요. Space 또는 Esc로 일시정지합니다.</p>
  </section>`;
}

export function playSolo(run, save, restart) {
  const canvas = document.querySelector('#solo-canvas');
  const painter = canvas.getContext('2d');
  const score = document.querySelector('#solo-score');
  const metric = document.querySelector('#solo-metric');
  const cover = document.querySelector('#solo-cover');
  const pauseButton = document.querySelector('#solo-pause');
  const state = makeSolo(run.seed);
  const events = [];
  const pressed = new Map();
  const lifecycle = new AbortController();
  const listen = (target, name, callback) => target.addEventListener(name, callback, { signal: lifecycle.signal });
  let lastTime = performance.now();
  let accumulated = 0;
  let frame;
  let paused = false;
  let stopped = false;
  let pending = false;

  function input(value) {
    if (!applySoloInput(state, value)) return;
    const previous = events.at(-1);
    if (previous?.[0] === state.tick) previous[1] = value;
    else events.push([state.tick, value]);
  }

  function direction() {
    const held = [...pressed.values()];
    return Number(held.includes(1)) - Number(held.includes(0));
  }

  function setPressed(id, value) {
    if (paused || state.over || pressed.has(id)) return;
    pressed.set(id, value);
    input(direction());
  }

  function release(id) {
    if (!pressed.delete(id) || paused || state.over) return;
    input(direction());
  }

  function togglePause(next = !paused) {
    if (state.over || paused === next) return;
    paused = next;
    pressed.clear();
    input(0);
    pauseButton.textContent = paused ? '계속하기' : '일시정지';
    cover.hidden = !paused;
    if (paused) {
      cover.innerHTML = '<h2>일시정지</h2><button type="button" class="button button-primary" data-resume>계속하기</button>';
      cover.querySelector('button').focus();
    }
    lastTime = performance.now();
    accumulated = 0;
  }

  const keyboard = { ArrowLeft: 0, KeyA: 0, ArrowRight: 1, KeyD: 1 };
  listen(window, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('input,dialog[open]')) return;
    if (event.code === 'Space' || event.code === 'Escape') {
      if (event.code === 'Space' && event.target.closest?.('button')) return;
      event.preventDefault();
      if (!event.repeat) togglePause();
      return;
    }
    if (!Object.hasOwn(keyboard, event.code)) return;
    event.preventDefault();
    if (!event.repeat) setPressed(event.code, keyboard[event.code]);
  });
  listen(window, 'keyup', event => release(event.code));
  listen(window, 'blur', () => togglePause(true));
  listen(document, 'visibilitychange', () => { if (document.hidden) togglePause(true); });
  listen(pauseButton, 'click', () => togglePause());
  listen(cover, 'click', event => {
    if (event.target.closest('[data-resume]')) togglePause(false);
    if (event.target.closest('[data-retry-score]')) void saveScore();
    if (event.target.closest('[data-restart]')) restart();
  });
  for (const button of document.querySelectorAll('[data-game-key]')) {
    const value = Number(button.dataset.gameKey);
    listen(button, 'pointerdown', event => {
      button.setPointerCapture(event.pointerId);
      setPressed(event.pointerId, value);
    });
    listen(button, 'lostpointercapture', event => release(event.pointerId));
    listen(button, 'pointerup', event => release(event.pointerId));
    listen(button, 'pointercancel', event => release(event.pointerId));
  }

  async function saveScore() {
    if (pending || stopped) return;
    pending = true;
    const message = cover.querySelector('[data-save-status]');
    const retry = cover.querySelector('[data-retry-score]');
    const again = cover.querySelector('[data-restart]');
    retry.hidden = true;
    again.disabled = true;
    message.textContent = '랭킹 기록 저장 중…';
    try {
      await save({ id: run.id, tick: state.tick, events });
      if (!stopped) message.textContent = '랭킹에 기록했습니다.';
    } catch (error) {
      if (!stopped) {
        message.textContent = error.message;
        retry.hidden = false;
      }
    } finally {
      if (!stopped) again.disabled = false;
      pending = false;
    }
  }

  function end() {
    pauseButton.disabled = true;
    cover.hidden = false;
    cover.innerHTML = `<h2>${state.tick === maxTicks ? '30분 기록 완료' : '게임 종료'}</h2>
      <p class="final-score">${state.score.toLocaleString('ko-KR')}점</p>
      <p data-save-status role="status"></p>
      <div class="moves"><button type="button" class="button button-primary" data-restart>한 판 더</button>
      <button type="button" class="button button-outline" data-retry-score hidden>저장 재시도</button></div>`;
    void saveScore();
  }

  function update(now) {
    if (!paused && !state.over) {
      accumulated += Math.min(now - lastTime, 100);
      const step = 1000 / tickRate;
      while (accumulated >= step && !state.over) {
        stepSolo(state);
        accumulated -= step;
      }
    }
    lastTime = now;
    paintDodge(painter, state);
    score.textContent = state.score.toLocaleString('ko-KR');
    metric.textContent = '생존 ' + Math.floor(state.tick / tickRate) + '초 · 피한 똥 ' + state.dodged + '개';
    if (state.over) end();
    else frame = requestAnimationFrame(update);
  }

  frame = requestAnimationFrame(update);
  return {
    pause: () => togglePause(true),
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      lifecycle.abort();
    },
  };
}

function backdrop(ctx, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#ffffff0d';
  for (let i = 30; i < width; i += 30) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
  }
  for (let i = 30; i < height; i += 30) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
  }
}

function paintDodge(ctx, state) {
  backdrop(ctx, '#1d2336');
  ctx.fillStyle = '#313d57';
  ctx.fillRect(0, height - 17, width, 17);
  ctx.fillStyle = '#aaffc9';
  ctx.beginPath();
  ctx.roundRect(state.x - 19, height - 58, 38, 37, 13);
  ctx.fill();
  ctx.fillStyle = '#182831';
  for (const offset of [-7, 7]) {
    ctx.beginPath(); ctx.arc(state.x + offset, height - 43, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  for (const hazard of state.hazards) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = hazard.radius * 1.9 + 'px "Segoe UI Emoji", sans-serif';
    ctx.fillText('💩', hazard.x, hazard.y);
  }
}
