// davinci.js comes first: views.js draws a tile for its home art while this import cycle is still loading.
import { colorNames, colors, isJoker, joker, ruledOut, tileColor, tileValue, valueName } from './davinci.js';
import { escape, rankTag } from './views.js';

const act = (label, data, classes = '', disabled = false, title = '') =>
  `<button class="app-button ${classes}" type="button" data-action="${escape(JSON.stringify(data))}" ${disabled ? 'disabled' : ''}${title ? ` title="${escape(title)}"` : ''}>${label}</button>`;

export const davinciStage = room => `${room.players.filter(player => !player.out).length}명 생존`;

// One tile: its color always shows; the number only when it is face up, mine, or the game is over.
// Face-up tiles carry a gold rim, and 6 and 9 are underlined like the real tiles.
export function tileArt(color, tile, { open = false, fresh = false, label = '' } = {}) {
  const value = tile == null ? null : tileValue(tile);
  const face = value == null ? '' : value === joker ? '<b class="dv-joker">−</b>' : `<b${value === 6 || value === 9 ? ' class="under"' : ''}>${value}</b>`;
  const name = label || `${colorNames[color]} ${value == null ? '숨겨진 패' : valueName(value)}${open ? ' · 공개' : ''}`;
  return `<span class="dv-tile ${color}${value == null ? ' dv-back' : ''}${open ? ' open' : ''}${fresh ? ' fresh' : ''}" role="img" aria-label="${escape(name)}" title="${escape(name)}">${face}</span>`;
}

const misses = entry => entry.misses?.length && !entry.open
  ? `<small class="dv-miss" title="틀린 추리">✕ ${entry.misses.map(valueName).join(' ')}</small>` : '<small class="dv-miss"></small>';

const pickKey = (seat, index) => seat + ':' + index;

// ui.dvPick is the opponent tile I picked to guess; it only counts for the turn step it was picked in (app.js).
function picked(room, ui) {
  const pick = ui.dvPick;
  if (!pick || pick.turn !== room.turn) return null;
  const [seat, index] = pick.key.split(':').map(Number);
  const entry = room.players[seat]?.tiles?.[index];
  return entry && !entry.open && !room.players[seat].out ? { seat, index, entry } : null;
}

function opponentRow(room, player, seat, me, guessing, pick) {
  return player.tiles.map((entry, index) => {
    const art = tileArt(entry.color, entry.tile, { open: entry.open, fresh: entry.fresh });
    const chosen = pick?.seat === seat && pick.index === index;
    const body = guessing && !entry.open && !player.out
      ? `<button type="button" class="dv-pick${chosen ? ' picked' : ''}" data-dv-pick="${pickKey(seat, index)}" aria-pressed="${chosen}"
          aria-label="${escape(player.name)}님의 왼쪽에서 ${index + 1}번째 ${colorNames[entry.color]} 패 고르기">${art}</button>`
      : art;
    return `<span class="dv-slot">${body}${misses(entry)}</span>`;
  }).join('');
}

function seatStatus(room, player) {
  if (room.status === 'finished') return player.place === 1 ? '<b class="gold">1위 · 승리</b>' : `${player.place}위 · 탈락`;
  if (player.out) return '탈락';
  const left = player.tiles.filter(entry => !entry.open).length;
  return `숨긴 패 ${left}장 / ${player.tiles.length}장`;
}

function seatHead(room, player, seat, me) {
  const current = room.status === 'playing' && seat === room.index;
  return `<div class="dv-name"><span class="player-color p${seat}"></span>
    <strong>${current ? '▶ ' : ''}${escape(player.name)}${player.id === me?.id ? ' (나)' : ''}${rankTag(room, player)}</strong>
    <small>${seatStatus(room, player)}</small></div>`;
}

// My own code: every number is visible to me, hidden ones stay dark-rimmed. While placing a drawn tile the
// allowed gaps become buttons; when I must turn up a tile, my hidden ones do.
function myRow(room, me, seat, phase) {
  const slots = phase === 'place' ? new Set(room.slots) : null;
  const gap = slot => slots?.has(slot)
    ? act(`<span aria-hidden="true">＋</span>`, { action: 'place', slot }, 'dv-gap primary', false, `왼쪽에서 ${slot + 1}번째 자리에 놓기`) : '';
  const tiles = me.tiles.map((entry, index) => {
    const art = tileArt(entry.color, entry.tile, { open: entry.open, fresh: entry.fresh });
    const body = phase === 'reveal' && !entry.open
      ? act(art, { action: 'reveal', index }, 'dv-reveal', false, '이 패 공개하기') : art;
    return gap(index) + `<span class="dv-slot${entry.open ? '' : ' secret'}">${body}${entry.open ? '<small class="dv-miss">공개됨</small>' : '<small class="dv-miss">숨김</small>'}</span>`;
  }).join('') + gap(me.tiles.length);
  return `<section class="dv-me${seat === room.index && room.status === 'playing' ? ' current' : ''}">
    ${seatHead(room, me, seat, me)}
    <div class="dv-row">${tiles}</div>
    ${phase === 'place' ? `<p class="app-muted">가져온 패 ${tileArt(tileColor(room.drawn), room.drawn)} · 빛나는 ＋ 자리 중 하나를 골라 끼워 넣으세요.</p>` : ''}
  </section>`;
}

function guessPad(room, me, pick) {
  const target = room.players[pick.seat];
  const out = me ? ruledOut(room, me, pick.entry) : new Set();
  const buttons = Array.from({ length: joker + 1 }, (_, value) => act(value === joker ? '조커<small>−</small>' : String(value),
    { action: 'guess', target: pick.seat, index: pick.index, value }, `number${out.has(value) ? ' dim' : ''}`, false,
    out.has(value) ? '이미 보이거나 틀린 숫자예요' : ''));
  return `<div class="dv-pad"><p class="app-label">${escape(target.name)}님의 왼쪽에서 ${pick.index + 1}번째 ${colorNames[pick.entry.color]} 패는?</p>
    <div class="dv-numbers">${buttons.join('')}</div>
    <p class="app-muted">흐린 숫자는 이미 보이거나 누군가 틀린 숫자예요.</p></div>`;
}

function controls(room, me, ui, myTurn) {
  const name = escape(room.players[room.index].name);
  const timer = ` · 남은 시간 <strong data-deadline="${room.deadline}"></strong>`;
  const phase = room.phase;
  if (!myTurn) {
    const doing = { draw: '패를 가져오는 중', place: '가져온 패를 놓는 중', guess: room.streak ? `${room.streak}번 맞히고 계속 추리하는 중` : '추리하는 중', reveal: '공개할 패를 고르는 중' }[phase];
    return `<p class="app-muted">${name}님이 ${doing}${timer}</p>`;
  }
  if (phase === 'draw') {
    return `<p class="app-warn">내 차례 · 가져올 패의 색을 고르세요${timer}</p>
      <div class="app-row dv-draw">${colors.map(color => act(`${tileArt(color, null, { label: colorNames[color] + ' 패' })}<span>${colorNames[color]} 패 가져오기<small>${room.pileCount[color]}장 남음</small></span>`,
        { action: 'draw', color }, 'primary', !room.pileCount[color])).join('')}</div>`;
  }
  if (phase === 'place') return `<p class="app-warn">내 차례 · ${isJoker(room.drawn) ? '조커는 원하는 자리에 놓을 수 있어요' : '조커 옆이라 놓을 자리를 고를 수 있어요'}${timer}</p>`;
  if (phase === 'reveal') return `<p class="app-warn">틀렸어요! 가져온 패가 없으니 내 숨긴 패 하나를 골라 공개하세요${timer}</p>`;
  const pick = picked(room, ui);
  const head = room.streak
    ? `<p class="app-warn">${room.streak}번 맞혔어요! 계속 추리하거나 멈추세요. 틀리면 ${room.drawn != null ? '가져온 패가' : '내 패 하나가'} 공개돼요${timer}</p>`
    : `<p class="app-warn">내 차례 · 상대의 숨겨진 패를 하나 골라 숫자를 맞혀 보세요${room.drawn == null ? ' (남은 패가 없어서 틀리면 내 패 하나를 공개해요)' : ''}${timer}</p>`;
  return head + (pick ? guessPad(room, me, pick) : '<p class="app-muted">맞힐 상대 패를 위에서 누르세요. 빛나는 테두리가 있는 패를 고를 수 있어요.</p>') +
    (room.streak ? act('추리 멈추고 차례 넘기기', { action: 'stop' }, 'wide') : '');
}

export function davinciBoard(room, me, ui) {
  const playing = room.status === 'playing';
  const mySeat = room.players.indexOf(me);
  const myTurn = playing && !room.paused && mySeat >= 0 && room.index === mySeat;
  const guessing = myTurn && room.phase === 'guess';
  const pick = guessing ? picked(room, ui) : null;
  const others = room.players.map((player, seat) => ({ player, seat })).filter(({ player }) => player !== me);
  const seats = `<ul class="dv-players">${others.map(({ player, seat }) => `
    <li class="${playing && seat === room.index ? 'current' : ''}${player.out ? ' out' : ''}${room.winners.includes(player.id) ? ' won' : ''}">
      ${seatHead(room, player, seat, me)}
      <div class="dv-row">${opponentRow(room, player, seat, me, guessing, pick)}</div></li>`).join('')}</ul>`;
  return `<div class="dv-status">
      <span>남은 패 · 검은 <b>${room.pileCount.black}</b>장 · 흰 <b>${room.pileCount.white}</b>장</span>
      <span>${davinciStage(room)}</span></div>
    ${seats}
    ${playing && !room.paused ? controls(room, me, ui, myTurn) : ''}
    ${me?.tiles ? myRow(room, me, mySeat, myTurn ? room.phase : null) : ''}
    ${room.log?.length ? `<ol class="dv-log" data-log-scroll aria-label="활동 기록">${room.log.map(line => '<li>' + escape(line) + '</li>').join('')}</ol>` : ''}`;
}
