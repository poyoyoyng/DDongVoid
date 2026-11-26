import { maxReactionMs, reactionDelay, reactionRankChange } from './reaction-model.js';
import { reactionRankingTable } from './views.js';

export function reactionMarkup() {
  return `<section class="panel reaction-panel">
    <p class="reaction-help">초록색이 되면 아래 화면을 터치·클릭하거나 Space·Enter를 누르세요.</p>
    <div class="reaction-stage">
      <button type="button" id="reaction-pad" class="reaction-pad" data-phase="waiting" aria-live="polite">
        <strong>준비</strong><span>빨간색일 때는 누르지 마세요</span>
      </button>
      <button type="button" class="button button-primary reaction-restart" data-restart hidden>바로 다시하기</button>
    </div>
    <div id="reaction-result" class="reaction-result" hidden>
      <p id="reaction-status" role="status"></p>
      <div class="reaction-actions">
        <button type="button" class="button button-outline" id="reaction-save" hidden>저장 다시 시도</button>
        <a class="button button-outline" href="#rankings/reaction">전체 랭킹 보기</a>
      </div>
      <div id="reaction-ranking" class="rankings"></div>
    </div>
    <p class="muted">랜덤한 시간 동안 기다리세요 · 짧은 기록이 높은 순위 · 화면을 벗어나면 이번 측정은 취소됩니다.</p>
  </section>`;
}

export function playReaction(run, save, loadRanks, restart, userId) {
  const pad = document.querySelector('#reaction-pad');
  const result = document.querySelector('#reaction-result');
  const status = document.querySelector('#reaction-status');
  const ranking = document.querySelector('#reaction-ranking');
  const retrySave = document.querySelector('#reaction-save');
  const restartButton = document.querySelector('[data-restart]');
  const lifecycle = new AbortController();
  const listen = (target, name, callback) => target.addEventListener(name, callback, { signal: lifecycle.signal });
  const delay = reactionDelay(run.seed);
  let phase = 'waiting';
  let frame;
  let startedAt = performance.now();
  let greenAt;
  let timeout;
  let stopped = false;
  let pending = false;
  let record;
  // Capture the rank before this attempt is saved; failures never prevent playing.
  const previousRanks = loadRanks().catch(() => null);
  let previousRank;
  let rankKnown = false;

  function show(phaseName, title, help) {
    phase = phaseName;
    pad.dataset.phase = phaseName;
    pad.querySelector('strong').textContent = title;
    pad.querySelector('span').textContent = help;
  }

  function end(phaseName, title, help) {
    cancelAnimationFrame(frame);
    clearTimeout(timeout);
    show(phaseName, title, help);
    result.hidden = false;
    restartButton.hidden = false;
  }

  function cancel() {
    if (phase !== 'waiting' && phase !== 'ready') return;
    end('cancelled', '측정 취소', '화면을 벗어나거나 제한 시간이 지나 이번 기록은 저장하지 않았어요');
    status.textContent = '한 번 더 눌러 새로 시작하세요.';
  }

  async function refreshRanks() {
    try {
      const { rows } = await loadRanks();
      if (stopped) return;
      const mine = rows.find(row => row.id === userId);
      if (record && mine) {
        pad.querySelector('span').textContent = `내 랭킹 ${mine.rank}위 · ${rankKnown
          ? reactionRankChange(previousRank, mine.rank) : '이전 순위 확인 불가'}`;
      }
      const summary = document.createElement('p');
      summary.className = 'reaction-best';
      summary.textContent = mine ? `내 최고 기록 ${mine.score.toLocaleString('ko-KR')} ms · 내 순위 ${mine.rank}위`
        : '첫 기록에 도전해 보세요!';
      const top = rows.slice(0, 10);
      if (mine && !top.includes(mine)) top.push(mine);
      ranking.innerHTML = '<h2>반응속도 랭킹 TOP 10</h2>' + reactionRankingTable(top, userId);
      ranking.prepend(summary);
    } catch (error) {
      if (stopped) return;
      ranking.textContent = '랭킹을 불러오지 못했습니다. ' + error.message;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'button button-small button-outline';
      retry.textContent = '랭킹 새로고침';
      retry.addEventListener('click', () => { retry.disabled = true; void refreshRanks(); }, { signal: lifecycle.signal });
      ranking.append(retry);
    }
  }

  async function saveRecord() {
    if (pending || stopped) return;
    pending = true;
    retrySave.hidden = true;
    status.textContent = '기록을 저장하고 있어요…';
    try {
      const before = await previousRanks;
      rankKnown = before !== null;
      previousRank = before?.rows.find(row => row.id === userId)?.rank;
      await save(record);
      if (stopped) return;
      status.textContent = '기록을 저장했습니다. 개인 최고 기록으로 랭킹에 반영됩니다.';
      await refreshRanks();
    } catch (error) {
      if (stopped) return;
      status.textContent = '기록을 저장하지 못했습니다. ' + error.message;
      retrySave.hidden = false;
    } finally {
      pending = false;
    }
  }

  function press() {
    const now = performance.now();
    if (stopped) return;
    if (phase === 'waiting') {
      end('early', '너무 빨라요!', '초록색의 “눌러!”가 보일 때 눌러 주세요');
      status.textContent = '준비 중에 눌러 이번 기록은 저장하지 않았어요.';
      void refreshRanks();
    } else if (phase === 'ready') {
      const reactionMs = Math.max(1, Math.round(now - greenAt));
      if (reactionMs > maxReactionMs) return cancel();
      record = { id: run.id, reactionMs, elapsedMs: Math.ceil(now - startedAt) };
      end('result', `${reactionMs.toLocaleString('ko-KR')} ms`, '내 랭킹 확인 중…');
      void saveRecord();
    }
  }

  // Pointer-down measures the first contact, without waiting for a touch release/click.
  listen(pad, 'pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    pad.focus({ preventScroll: true });
    press();
  });
  listen(window, 'keydown', event => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest?.('input, textarea, select, a, dialog[open]') ||
      event.target.closest?.('button') && event.target !== pad) return;
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      press();
    }
  });
  // Assistive technology can activate a button without pointer or keyboard events.
  listen(pad, 'click', event => { if (event.detail === 0) press(); });
  listen(retrySave, 'click', () => { void saveRecord(); });
  listen(restartButton, 'click', () => { restartButton.disabled = true; void restart(); });
  listen(window, 'blur', cancel);
  listen(document, 'visibilitychange', () => { if (document.hidden) cancel(); });

  // Start with a painted red frame, then switch on the first display frame after the random delay.
  frame = requestAnimationFrame(() => {
    startedAt = performance.now();
    function waitForGreen() {
      if (phase !== 'waiting' || stopped) return;
      if (performance.now() - startedAt < delay) {
        frame = requestAnimationFrame(waitForGreen);
        return;
      }
      if (document.hidden || !document.hasFocus()) return cancel();
      show('ready', '눌러!', '지금 화면을 터치하세요!');
      greenAt = performance.now();
      timeout = setTimeout(cancel, maxReactionMs);
    }
    frame = requestAnimationFrame(waitForGreen);
  });

  return {
    pause: cancel,
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      lifecycle.abort();
    },
  };
}
