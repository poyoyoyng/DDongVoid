import { applySoloInput, height, makeSolo, maxTicks, stepSolo, tickRate, width } from './solo-model.js';
import * as rhythm from './rhythm-model.js';
import * as sides from './sides-model.js';
import { critters, critterSvg } from './sides-art.js';

// Phones get a narrower, taller board so the blocks and labels stay readable.
function rhythmSize() {
  return matchMedia('(max-width: 600px)').matches ? { width: 400, height: 500 } : { width: 720, height: 540 };
}

// Each single-player game supplies its clock, controls and drawing; the loop, pause and score saving are shared.
const modes = {
  dodge: {
    label: '똥 피하기 화면', size: () => ({ width, height }), tickRate, maxTicks, make: makeSolo, step: stepSolo,
    controls: ['←', '→'],
    help: '← → 키 또는 A D 키로 움직이세요. Space 또는 Esc로 일시정지합니다.',
    metric: state => '생존 ' + Math.floor(state.tick / tickRate) + '초 · 피한 똥 ' + state.dodged + '개',
    paint: paintDodge,
    controller: dodgeController,
  },
  rhythm: {
    label: '키보드 리듬 화면', size: rhythmSize, tickRate: rhythm.tickRate, maxTicks: rhythm.maxTicks,
    make: rhythm.makeRhythm, step: rhythm.stepRhythm,
    controls: rhythm.keys,
    help: '블록이 판정선에 닿을 때 블록에 적힌 S D K L 키를 누르세요. 한글 입력 상태여도 됩니다. Space 또는 Esc로 일시정지합니다.',
    metric: state => '콤보 ' + state.combo + ' · 라이프 ' + state.life + '% · 속도 ×' + rhythm.speedMultiplier(state.seconds).toFixed(1),
    paint: paintRhythm,
    controller: rhythmController,
  },
  sides: {
    label: '니편내편 화면', size: () => ({ width: 560, height: 600 }), tickRate: sides.tickRate, maxTicks: sides.maxTicks,
    make: sides.makeSides, step: sides.stepSides,
    controls: ['←', '→'],
    help: '← → 키 또는 A D 키로 맨 앞 캐릭터를 같은 캐릭터가 있는 쪽으로 보내세요. 화면 왼쪽·오른쪽을 눌러도 됩니다. Space 또는 Esc로 일시정지합니다.',
    metric: state => '콤보 ' + state.combo + ' · ' + (state.pause
      ? (state.pause.kind === 'start' ? '준비' : '섞는 중!') : '섞기까지 ' + sides.nextShuffleIn(state) + '초'),
    paint: paintSides,
    controller: sidesController,
    // Tapping the left or right half of the board sends the character that way.
    tap: fraction => fraction < .5 ? 0 : 1,
  },
};

// Holding keys or touch buttons steers left and right; only changes of direction are recorded.
function dodgeController(state, events) {
  const pressed = new Map();
  const keyboard = { ArrowLeft: 0, KeyA: 0, ArrowRight: 1, KeyD: 1 };
  function input(value) {
    if (!applySoloInput(state, value)) return;
    const previous = events.at(-1);
    if (previous?.[0] === state.tick) previous[1] = value;
    else events.push([state.tick, value]);
  }
  const direction = () => {
    const held = [...pressed.values()];
    return Number(held.includes(1)) - Number(held.includes(0));
  };
  return {
    keyFor: code => keyboard[code],
    press(id, value) {
      if (pressed.has(id)) return;
      pressed.set(id, value);
      input(direction());
    },
    release(id) {
      if (pressed.delete(id)) input(direction());
    },
    clear() {
      pressed.clear();
      input(0);
    },
  };
}

// Each press is judged at once; only presses that hit a block change the score, so only those are recorded.
function rhythmController(state, events) {
  const keyboard = { KeyS: 0, KeyD: 1, KeyK: 2, KeyL: 3 };
  return {
    keyFor: code => keyboard[code],
    press(id, key) {
      if (rhythm.hitRhythm(state, key) !== null) events.push([state.tick, key]);
    },
    release() {},
    clear() {},
  };
}

// Every press while playing is judged and a wrong one costs life, so all of them are recorded.
function sidesController(state, events) {
  const keyboard = { ArrowLeft: 0, KeyA: 0, ArrowRight: 1, KeyD: 1 };
  return {
    keyFor: code => keyboard[code],
    press(id, side) {
      if (sides.pressSides(state, side) !== null) events.push([state.tick, side]);
    },
    release() {},
    clear() {},
  };
}

export function soloMarkup(game) {
  const mode = modes[game];
  const size = mode.size();
  return `<section class="panel solo-panel ${game}-solo">
    <div class="solo-hud" aria-live="off">
      <div><span>점수</span> <strong id="solo-score">0</strong></div>
      <div id="solo-metric"></div>
      <button type="button" class="button button-small button-outline" id="solo-pause">일시정지</button>
    </div>
    <div class="canvas-wrap">
      <canvas id="solo-canvas" width="${size.width}" height="${size.height}" aria-label="${mode.label}"></canvas>
      <div id="solo-cover" class="canvas-cover" hidden></div>
    </div>
    <div class="touch-controls" aria-label="터치 조작">${mode.controls.map((key, index) =>
      `<button type="button" class="button button-outline" data-game-key="${index}">${key}</button>`).join('')}</div>
    <p class="muted">${mode.help}</p>
  </section>`;
}

export function playSolo(game, run, save, restart) {
  const mode = modes[game];
  const canvas = document.querySelector('#solo-canvas');
  const painter = canvas.getContext('2d');
  const score = document.querySelector('#solo-score');
  const metric = document.querySelector('#solo-metric');
  const cover = document.querySelector('#solo-cover');
  const pauseButton = document.querySelector('#solo-pause');
  const state = mode.make(run.seed);
  const events = [];
  const controls = mode.controller(state, events);
  const lifecycle = new AbortController();
  const listen = (target, name, callback) => target.addEventListener(name, callback, { signal: lifecycle.signal });
  let lastTime = performance.now();
  let accumulated = 0;
  let frame;
  let paused = false;
  let stopped = false;
  let pending = false;

  // Catch the clock up to the moment of the press so input is judged on time, not at the last drawn frame.
  function advance(now) {
    if (paused || state.over) return;
    accumulated += Math.max(0, Math.min(now - lastTime, 100));
    lastTime = Math.max(lastTime, now);
    const step = 1000 / mode.tickRate;
    while (accumulated >= step && !state.over) {
      mode.step(state);
      accumulated -= step;
    }
  }

  function setPressed(id, value, now) {
    if (paused || state.over) return;
    advance(now);
    if (!state.over) controls.press(id, value);
  }

  function release(id) {
    if (!paused && !state.over) controls.release(id);
  }

  function togglePause(next = !paused) {
    if (state.over || paused === next) return;
    paused = next;
    controls.clear();
    pauseButton.textContent = paused ? '계속하기' : '일시정지';
    cover.hidden = !paused;
    if (paused) {
      cover.innerHTML = '<h2>일시정지</h2><button type="button" class="button button-primary" data-resume>계속하기</button>';
      cover.querySelector('button').focus();
    }
    lastTime = performance.now();
    accumulated = 0;
  }

  listen(window, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('input,dialog[open]')) return;
    if (event.code === 'Space' || event.code === 'Escape') {
      if (event.code === 'Space' && event.target.closest?.('button')) return;
      event.preventDefault();
      if (!event.repeat) togglePause();
      return;
    }
    const key = controls.keyFor(event.code);
    if (key === undefined) return;
    event.preventDefault();
    if (!event.repeat) setPressed(event.code, key, event.timeStamp);
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
  if (mode.tap) listen(canvas, 'pointerdown', event => {
    const rect = canvas.getBoundingClientRect();
    setPressed('tap', mode.tap((event.clientX - rect.left) / rect.width), event.timeStamp);
  });
  for (const button of document.querySelectorAll('[data-game-key]')) {
    const value = Number(button.dataset.gameKey);
    listen(button, 'pointerdown', event => {
      button.setPointerCapture(event.pointerId);
      setPressed(event.pointerId, value, event.timeStamp);
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
    cover.innerHTML = `<h2>${state.tick === mode.maxTicks ? '30분 기록 완료' : '게임 종료'}</h2>
      <p class="final-score">${state.score.toLocaleString('ko-KR')}점</p>
      <p data-save-status role="status"></p>
      <div class="moves"><button type="button" class="button button-primary" data-restart>한 판 더</button>
      <button type="button" class="button button-outline" data-retry-score hidden>저장 재시도</button></div>`;
    void saveScore();
  }

  function update(now) {
    advance(now);
    mode.paint(painter, state);
    score.textContent = state.score.toLocaleString('ko-KR');
    metric.textContent = mode.metric(state);
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

const rhythmColors = {
  lanes: ['#a7f3ce', '#f4c59d'], background: '#101b17', fill: '#14261e', edge: '#2c4234', muted: '#91ab9c', ink: '#122a1e',
  judgements: ['#a7f3ce', '#9fd3f3', '#e8e3a1', '#f4b69d'],
};

function text(ctx, value, font, color, x, y, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
  ctx.globalAlpha = 1;
}

// Same layout as the Windows app: two lanes, a hit line near the bottom and the life bar under it.
function paintRhythm(ctx, state) {
  const { width: w, height: h } = ctx.canvas;
  const side = 18, gap = 14, block = 46;
  const laneWidth = (w - side * 2 - gap) / 2;
  const hitY = h - 84;
  const laneLeft = lane => side + lane * (laneWidth + gap);
  const mono = size => `800 ${size}px Consolas, "Malgun Gothic", monospace`;
  ctx.fillStyle = rhythmColors.background;
  ctx.fillRect(0, 0, w, h);
  for (let lane = 0; lane < 2; lane++) {
    const x = laneLeft(lane);
    ctx.fillStyle = rhythmColors.fill;
    ctx.strokeStyle = rhythmColors.edge;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, 10, laneWidth, h - 22, 12); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = state.seconds - state.lastPressTime[lane] < .12 ? .45 : .14;
    ctx.fillStyle = rhythmColors.lanes[lane];
    ctx.beginPath(); ctx.roundRect(x + 5, hitY - block / 2, laneWidth - 10, block, 10); ctx.fill();
    ctx.globalAlpha = .85;
    ctx.strokeStyle = rhythmColors.lanes[0];
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 5, hitY); ctx.lineTo(x + laneWidth - 5, hitY); ctx.stroke();
    ctx.globalAlpha = 1;
    text(ctx, lane ? '오른손 K · L' : '왼손 S · D', '700 14px "Malgun Gothic", sans-serif', rhythmColors.muted, x + laneWidth / 2, hitY + block / 2 + 18, .8);
  }
  // Combo sits under the blocks so it never hides one.
  if (state.combo >= 2) text(ctx, state.combo + ' COMBO', mono(28), '#ffffff', w / 2, h * .3, .6);
  const blockWidth = Math.min(laneWidth - 24, 170);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 10, w, h - 22); ctx.clip();
  for (const note of state.notes) {
    const progress = 1 - (note.time - state.seconds) / note.travel;
    const y = -block + progress * (hitY + block);
    const x = laneLeft(note.lane) + (laneWidth - blockWidth) / 2;
    ctx.fillStyle = rhythmColors.lanes[note.lane];
    ctx.beginPath(); ctx.roundRect(x, y - block / 2, blockWidth, block, 11); ctx.fill();
    text(ctx, rhythm.keys[note.key], mono(29), rhythmColors.ink, x + blockWidth / 2, y + 1);
  }
  ctx.restore();
  for (let lane = 0; lane < 2; lane++) {
    const since = state.seconds - state.lastJudgementTime[lane];
    const judgement = state.lastJudgement[lane];
    if (judgement === null || since >= .45) continue;
    text(ctx, rhythm.judgements[judgement], mono(22), rhythmColors.judgements[judgement],
      laneLeft(lane) + laneWidth / 2, hitY - 76 - since * 36, 1 - since / .45);
  }
  text(ctx, 'SPEED ×' + rhythm.speedMultiplier(state.seconds).toFixed(1), mono(13), rhythmColors.muted, w / 2, 28, .7);
  if (state.tick < rhythm.tickRate * 2) text(ctx, '블록이 선에 닿을 때 누르세요', '700 18px "Malgun Gothic", sans-serif', '#ffffff', w / 2, h * .42, .8);
  const lifeWidth = w - side * 2;
  ctx.fillStyle = rhythmColors.edge;
  ctx.fillRect(side, h - 8, lifeWidth, 4);
  ctx.fillStyle = state.life > 30 ? rhythmColors.lanes[0] : rhythmColors.judgements[3];
  ctx.fillRect(side, h - 8, lifeWidth * state.life / 100, 4);
}

// Firefox only draws an SVG on a canvas when it has its own width and height.
const critterImages = critters.map((_, kind) => {
  const image = new Image();
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(critterSvg(kind).replace('<svg ', '<svg width="100" height="100" '));
  return image;
});

function drawCritter(ctx, kind, x, y, size) {
  const image = critterImages[kind];
  if (image.complete && image.naturalWidth) {
    ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
    return;
  }
  ctx.fillStyle = critters[kind].color;
  ctx.beginPath(); ctx.arc(x, y, size * .4, 0, Math.PI * 2); ctx.fill();
}

function shadow(ctx, x, y, size, color = '#2a223822') {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y + size * .44, size * .36, size * .09, 0, 0, Math.PI * 2); ctx.fill();
}

function outlined(ctx, value, size, color, x, y) {
  ctx.font = `900 ${size}px "Malgun Gothic", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size / 6;
  ctx.strokeStyle = '#2a2238';
  ctx.strokeText(value, x, y);
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

const clamp01 = value => Math.max(0, Math.min(1, value));
const easeInOut = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

// Like the original: the six stand in two columns, the line comes up the snowy path in the middle,
// and the life bar sits on top.
function paintSides(ctx, state) {
  const { width: w, height: h } = ctx.canvas;
  const centerX = w / 2, frontY = h - 100, gap = 50, size = 92;
  const columnX = [w * .17, w * .83];
  const rows = [h * .29, h * .48, h * .67];
  const slotAt = slot => ({ x: columnX[sides.sideOfSlot(slot)], y: rows[slot % 3] });
  const age = event => event ? state.tick - event.tick : Infinity;
  const sortAge = age(state.lastSort);
  const missAge = age(state.lastMiss);
  const { pause } = state;
  const elapsed = pause ? pause.total - pause.left : 0;
  const mixing = pause?.kind === 'shuffle' && elapsed < sides.mixTicks;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#8fcaf5');
  sky.addColorStop(.5, '#d8eefc');
  sky.addColorStop(1, '#f2f9ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#c4dcef';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - 34, 76); ctx.lineTo(centerX + 34, 76); ctx.lineTo(centerX + 94, h); ctx.lineTo(centerX - 94, h);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  for (const x of columnX) {
    ctx.fillStyle = '#ffffff73';
    ctx.strokeStyle = '#ffffffc0';
    ctx.beginPath(); ctx.roundRect(x - 70, rows[0] - 72, 140, rows[2] - rows[0] + 144, 22); ctx.fill(); ctx.stroke();
  }

  // The six on the sides; while shuffling they hop from their old places to the new ones.
  const hop = easeInOut(clamp01((elapsed - 12) / (sides.mixTicks - 30)));
  state.slots.forEach((kind, slot) => {
    const to = slotAt(slot);
    let { x, y } = to;
    let ground = to.y;
    if (mixing && state.previousSlots) {
      const from = slotAt(state.previousSlots.indexOf(kind));
      x = from.x + (to.x - from.x) * hop;
      ground = from.y + (to.y - from.y) * hop;
      y = ground - Math.sin(Math.PI * hop) * 70;
    }
    let scale = 1;
    if (state.lastSort?.kind === kind && sortAge < 10) {
      scale += .18 * (1 - sortAge / 10);
      shadow(ctx, x, ground, size * 1.3, '#ffd23f88');
    } else shadow(ctx, x, ground, size);
    drawCritter(ctx, kind, x, y, size * scale);
  });

  // The line: the front one sits on a yellow mark and the rest slide up a step after each sort.
  const slide = sortAge < 8 ? 1 - sortAge / 8 : 0;
  for (let index = state.queue.length - 1; index >= 0; index--) {
    const place = index + slide;
    const y = frontY - place * gap;
    // The newcomer fades in at the back of the line.
    ctx.globalAlpha = (pause?.kind === 'shuffle' ? .4 : 1) * clamp01(sides.queueLength - place);
    let x = centerX;
    if (index === 0 && missAge < 18) x += Math.sin(missAge * 1.4) * 10 * (1 - missAge / 18);
    shadow(ctx, centerX, y, size, index === 0 ? '#ffd23fcc' : undefined);
    drawCritter(ctx, state.queue[index], x, y, size * (1 - place * .06));
  }
  ctx.globalAlpha = 1;

  // The one just sorted flies to its side.
  if (sortAge < 10) {
    const progress = sortAge / 10;
    const target = slotAt(state.slots.indexOf(state.lastSort.kind));
    ctx.globalAlpha = 1 - progress * .6;
    drawCritter(ctx, state.lastSort.kind, centerX + (target.x - centerX) * progress,
      frontY + (target.y - frontY) * progress - Math.sin(Math.PI * progress) * 60, size * (1 - progress * .3));
    ctx.globalAlpha = 1;
  }

  for (let side = 0; side < 2; side++) {
    const x = side ? w - 62 : 62, y = h - 52, direction = side ? 1 : -1;
    const hit = state.lastSort?.side === side && sortAge < 8;
    const miss = state.lastMiss?.side === side && missAge < 12;
    ctx.fillStyle = miss ? '#ffb3b3' : hit ? '#ffe27a' : '#ffffff';
    ctx.strokeStyle = '#7f93ad';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5c6f88';
    ctx.beginPath();
    ctx.moveTo(x + direction * 20, y);
    for (const [dx, dy] of [[-4, -18], [-4, -8], [-18, -8], [-18, 8], [-4, 8], [-4, 18]]) ctx.lineTo(x + direction * dx, y + dy);
    ctx.closePath(); ctx.fill();
  }

  if (missAge < 18) {
    ctx.fillStyle = `rgba(235, 64, 52, ${.22 * (1 - missAge / 18)})`;
    ctx.fillRect(0, 0, w, h);
    outlined(ctx, '✕', 54, '#ff5a4c', centerX + (state.lastMiss.side ? 70 : -70), frontY - 10);
  }

  // Life bar.
  const barX = 50, barY = 18, barWidth = w - barX - 22, barHeight = 22;
  outlined(ctx, '♥', 24, '#ff5a6e', 30, barY + barHeight / 2 + 1);
  ctx.fillStyle = '#ffffffd9';
  ctx.strokeStyle = '#5c6f88';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(barX, barY, barWidth, barHeight, 11); ctx.fill(); ctx.stroke();
  if (state.life > 0) {
    ctx.fillStyle = state.life > 50 ? '#5fd38d' : state.life > 25 ? '#f5c242' : '#ef5a4c';
    ctx.beginPath(); ctx.roundRect(barX + 3, barY + 3, (barWidth - 6) * state.life / 100, barHeight - 6, 8); ctx.fill();
  }
  if (state.combo >= 2) outlined(ctx, state.combo + ' COMBO', 28, '#ff9a3c', centerX, 66);
  const shuffleIn = sides.nextShuffleIn(state);
  if (!pause && shuffleIn <= 3) outlined(ctx, `${shuffleIn}초 뒤 섞어요!`, 20, '#ffe27a', centerX, 100);

  if (pause) {
    const label = pause.kind === 'start' ? '시작!' : mixing ? '섞어!!' : '다시 시작!';
    const shown = pause.kind === 'shuffle' && !mixing ? elapsed - sides.mixTicks : elapsed;
    const pop = clamp01(shown / 8);
    ctx.save();
    ctx.translate(centerX, h * .42);
    ctx.scale(.6 + .4 * pop, .6 + .4 * pop);
    if (mixing) ctx.rotate(Math.sin(elapsed * .5) * .07);
    outlined(ctx, label, 66, mixing ? '#ffcf3a' : '#ffffff', 0, 0);
    ctx.restore();
  }
}
