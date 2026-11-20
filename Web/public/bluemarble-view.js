import { escape, rankTag, yachtFace } from './views.js';
import {
  SPACE, buildable, cellPlace, estateValue, fundFee, islandTurns, keys, maxRounds, partLimit, partNames, parts,
  saleValue, salary, shortName, spaceFee, spaces, toll, won,
} from './bluemarble.js';

const act = (label, data, classes = '', disabled = false) =>
  `<button class="app-button ${classes}" type="button" data-action="${escape(JSON.stringify(data))}" ${disabled ? 'disabled' : ''}>${label}</button>`;

export const bluemarbleStage = room => `ROUND ${Math.min(room.round, maxRounds)} / ${maxRounds}`;

const kindIcons = { start: '🏁', key: '🔑', island: '🏝️', fund: '💰', donate: '🎗️', space: '🚀' };
const specialIcons = { 5: '🌴', 15: '✈️', 25: '⚓', 28: '🛳️', 32: '🚀', 39: '🏯' };

// Buildings on a lot as small marks: ▲ villa, ■ building, ★ hotel.
const buildingMarks = estate => estate ? '<i class="bm-villa"></i>'.repeat(estate.villa) +
  '<i class="bm-building"></i>'.repeat(estate.building) + '<i class="bm-hotel"></i>'.repeat(estate.hotel) : '';

// While a pawn walks (app.js), ui.bmShow says where it is drawn, ui.bmGhost which seat's pawn is floating above the board,
// and ui.bmKey whether it has reached the 황금열쇠 it drew yet.
function cell(room, pos, ui, travel) {
  const space = spaces[pos];
  const { row, col } = cellPlace(pos);
  const estate = room.estates?.[pos];
  const owner = estate?.owner ?? null;
  const side = row === 11 ? 'bottom' : col === 1 ? 'left' : row === 1 ? 'top' : 'right';
  const corner = [0, 10, 20, 30].includes(pos);
  const pawns = room.players.map((player, seat) => (!player.bankrupt || seat === ui.bmGhost) && (ui.bmShow?.[seat] ?? player.pos) === pos
    ? `<i class="bm-pawn seat-${seat}${seat === room.index ? ' active' : ''}${seat === ui.bmGhost ? ' ghosted' : ''}" title="${escape(player.name)}"></i>` : '').join('');
  const classes = ['bm-cell', side, space.kind, corner ? 'corner' : '', space.kind === 'city' ? 'g' + space.group : '',
    owner !== null ? 'owned own-' + owner : '', ui.bmCell === pos ? 'picked' : '', !ui.bmShow && room.walk?.moves.at(-1)?.to === pos ? 'landed' : '',
    travel && pos !== SPACE ? 'travel' : ''].filter(Boolean).join(' ');
  const icon = space.kind === 'special' ? specialIcons[pos] : kindIcons[space.kind] ?? '';
  const price = space.price ? `<small class="bm-price">${won(space.price).replace('원', '')}</small>` : '';
  return `<button type="button" class="${classes}" style="grid-area:${row}/${col}" data-bm-cell="${pos}"
      aria-label="${escape(space.name)}${owner !== null ? ' · ' + escape(room.players[owner].name) + ' 소유' : ''}">
    ${space.kind === 'city' ? '<span class="bm-band"></span>' : ''}
    ${icon ? `<span class="bm-icon" aria-hidden="true">${icon}</span>` : ''}
    <span class="bm-name">${escape(shortName(pos))}</span>${price}
    ${estate && (estate.villa || estate.building || estate.hotel) ? `<span class="bm-marks">${buildingMarks(estate)}</span>` : ''}
    ${pawns ? `<span class="bm-pawns">${pawns}</span>` : ''}
  </button>`;
}

function dice(room) {
  if (!room.dice) return `<div class="bm-dice empty"><span class="die-face">${yachtFace(0)}</span><span class="die-face">${yachtFace(0)}</span></div>`;
  const double = room.dice[0] === room.dice[1];
  return `<div class="bm-dice${double ? ' double' : ''}">${room.dice.map(value => `<span class="die-face">${yachtFace(value)}</span>`).join('')}
    ${double ? '<b>더블!</b>' : ''}</div>`;
}

function keyCard(room) {
  const drawn = room.drawn;
  if (!drawn || drawn.turn < room.turn - 2) return '';
  const info = keys[drawn.card];
  return `<div class="bm-key"><span>🔑 황금열쇠</span><b>${escape(info.name)}</b><small>${escape(info.text)}</small></div>`;
}

function center(room, me, ui) {
  const playing = room.status === 'playing';
  const actual = playing ? room.players[room.index] : null;
  return `<div class="bm-center">
    <p class="bm-logo">BLUE MARBLE<span>부루마불</span></p>
    ${dice(room)}
    ${actual ? `<p class="bm-turn"><i class="bm-pawn seat-${room.index}"></i>${actual.id === me?.id ? '내 차례' : escape(actual.name) + '님의 차례'}
      · <strong data-deadline="${room.deadline}"></strong></p>` : ''}
    ${ui.bmShow && !ui.bmKey ? '' : keyCard(room)}
    <p class="bm-fund">사회복지기금 <b>${won(room.fund ?? 0)}</b></p>
  </div>`;
}

function deed(room, pos, me, myTurn) {
  if (pos == null) return '<p class="app-muted bm-hint">판의 칸을 누르면 땅값과 통행료를 볼 수 있어요.</p>';
  const space = spaces[pos];
  const estate = room.estates?.[pos];
  const owner = estate?.owner ?? null;
  const ownerName = owner === null ? '주인 없음' : escape(room.players[owner].name) + (room.players[owner].id === me?.id ? ' (나)' : '');
  const mine = owner !== null && room.players[owner].id === me?.id;
  const head = `<p class="bm-deed-title ${space.kind === 'city' ? 'g' + space.group : space.kind}">${escape(space.name)}</p>`;
  let body;
  if (space.kind === 'city') {
    const [land, villa1, villa2, building, hotel] = space.tolls;
    body = `<table class="bm-deed-table">
      <tr><th scope="row">땅값</th><td>${won(space.price)}</td></tr>
      <tr><th scope="row">별장 · 빌딩 · 호텔</th><td>${parts.map(part => won(space.cost[part]).replace('원', '')).join(' · ')}</td></tr>
      <tr><th scope="row">통행료 · 땅</th><td>${won(land)}</td></tr>
      <tr><th scope="row">별장 1채 · 2채</th><td>+${won(villa1)} · +${won(villa2)}</td></tr>
      <tr><th scope="row">빌딩 · 호텔</th><td>+${won(building)} · +${won(hotel)}</td></tr></table>
      <p class="bm-deed-own">${ownerName}${owner !== null ? ` · ${parts.map(part => `${partNames[part]} ${estate[part]}`).join(' · ')} · 지금 통행료 <b>${won(toll(pos, estate))}</b>` : ''}</p>`;
  } else if (space.kind === 'special') {
    body = `<table class="bm-deed-table"><tr><th scope="row">땅값</th><td>${won(space.price)}</td></tr>
      <tr><th scope="row">통행료</th><td>${won(space.toll)}</td></tr></table>
      <p class="bm-deed-own">${ownerName} · 건물을 지을 수 없어요${pos === 32 ? ` · 우주여행 탑승료 ${won(spaceFee)}도 주인이 받아요` : ''}</p>`;
  } else {
    const help = {
      start: `지나가거나 멈추면 월급 ${won(salary)}을 받아요.`,
      key: '황금열쇠 카드를 한 장 뽑아 그대로 따라요.',
      island: `${islandTurns}턴 동안 갇혀요. 더블이 나오거나 무인도 탈출권을 쓰면 바로 나가요.`,
      fund: '사회복지기금에 모인 돈을 모두 받아요.',
      donate: `사회복지기금에 ${won(fundFee)}을 내요.`,
      space: `다음 차례에 판의 아무 칸으로나 날아가요. 컬럼비아호 주인에게 탑승료 ${won(spaceFee)}을 내요.`,
    }[space.kind];
    body = `<p class="app-muted">${help}</p>`;
  }
  const sell = mine && myTurn && room.phase === 'roll'
    ? act(`은행에 팔기<small>${won(saleValue(pos, estate))} (반값)</small>`, { action: 'sell', pos }, 'small danger') : '';
  return `<div class="bm-deed">${head}${body}${sell}</div>`;
}

function controls(room, me, ui) {
  const seat = room.players.indexOf(me);
  if (room.status !== 'playing' || room.paused || seat !== room.index || me.bankrupt) return '';
  if (ui.bmShow) return '<div class="bm-controls"><p class="app-muted">말이 가는 중이에요…</p></div>';
  const pending = room.pending;
  const hasKey = type => me.keys.some(card => keys[card].type === type);
  switch (room.phase) {
    case 'roll':
      return `<div class="bm-controls">
        ${me.island ? `<p class="app-warn">무인도 ${islandTurns - me.island + 1}번째 턴 · 더블이 나오면 탈출해요${me.island === 1 ? ' · 이번에 못 나와도 굴린 만큼 나가요' : ''}</p>` : ''}
        ${act('🎲 주사위 굴리기', { action: 'roll' }, 'primary')}
        ${me.island && hasKey('escape') ? act('무인도 탈출권 쓰기', { action: 'escape' }) : ''}
        <p class="app-muted">굴리기 전에 내 땅을 눌러 은행에 반값으로 팔 수 있어요.</p></div>`;
    case 'space': {
      const to = ui.bmCell;
      const ok = to != null && to !== SPACE;
      return `<div class="bm-controls"><p class="app-warn">🚀 우주여행 · 판에서 갈 칸을 누르세요${me.freeRide ? ' (초대권으로 무료)' : ` · 컬럼비아호 탑승료 ${won(spaceFee)}`}</p>
        ${act(ok ? `${escape(spaces[to].name)}(으)로 출발` : '갈 칸을 골라 주세요', { action: 'travel', to }, 'primary', !ok)}</div>`;
    }
    case 'buy': {
      const space = spaces[pending.pos];
      return `<div class="bm-controls"><p class="app-warn">${escape(space.name)} · 주인이 없는 땅이에요</p>
        <div class="app-row">${act(`땅 사기<small>${won(space.price)}</small>`, { action: 'buy' }, 'primary')}${act('사지 않기', { action: 'skip' })}</div></div>`;
    }
    case 'build': {
      const space = spaces[pending.pos];
      const estate = room.estates[pending.pos];
      const options = buildable(pending.pos, estate);
      return `<div class="bm-controls"><p class="app-warn">${escape(space.name)} · 내 땅에 건물을 지을 수 있어요</p>
        <div class="app-row">${parts.map(part => act(`${partNames[part]} 짓기<small>${won(space.cost[part])} · ${estate[part]}/${partLimit[part]}</small>`,
          { action: 'build', part }, 'primary', !options.includes(part) || me.money < space.cost[part])).join('')}</div>
        ${act('그만 짓기', { action: 'skip' }, 'wide')}</div>`;
    }
    case 'toll':
      return `<div class="bm-controls"><p class="app-warn">${escape(room.players[pending.to].name)}님의 ${escape(spaces[pending.pos].name)} · 통행료 ${won(pending.amount)}</p>
        <div class="app-row">${act(`통행료 내기<small>${won(pending.amount)}</small>`, { action: 'toll', pass: false })}${act('우대권 쓰기<small>통행료 면제</small>', { action: 'toll', pass: true }, 'primary')}</div></div>`;
    default:
      return '';
  }
}

function players(room, me) {
  const revealed = room.status === 'finished';
  return `<ul class="bm-players">${room.players.map((player, seat) => {
    const lots = (room.estates ?? []).flatMap((estate, pos) => estate?.owner === seat ? [pos] : []);
    const worth = player.money + lots.reduce((total, pos) => total + estateValue(pos, room.estates[pos]), 0);
    const held = (player.keys ?? []).map(card => keys[card].name);
    const status = player.bankrupt ? '파산' : player.island ? `무인도 (남은 ${player.island}턴)` : player.space ? '우주여행 대기' : '';
    const current = room.status === 'playing' && seat === room.index;
    return `<li class="${current ? 'current' : ''}${player.bankrupt ? ' out' : ''}${player.vacant ? ' vacant' : ''}${revealed && room.winners.includes(player.id) ? ' winner' : ''}">
      <i class="bm-pawn seat-${seat}"></i>
      <div><strong>${current ? '▶ ' : ''}${escape(player.name)}${player.id === me?.id ? ' (나)' : ''}${rankTag(room, player)}</strong>
        <span class="bm-money">${player.bankrupt ? '—' : won(player.money)}</span>
        <small>땅 ${lots.length}곳 · 총자산 ${player.bankrupt ? '0원' : won(worth)}${status ? ' · ' + status : ''}</small>
        ${held.length ? `<small class="bm-held">🔑 ${held.map(escape).join(', ')}</small>` : ''}</div></li>`;
  }).join('')}</ul>`;
}

// Final standings: survivors by total assets, then the bankrupt, the last to go out first.
function result(room) {
  if (room.status !== 'finished' || !room.result) return '';
  const order = room.players.map((player, seat) => ({ player, seat, worth: room.result.assets[seat] }))
    .sort((a, b) => (a.player.bankrupt - b.player.bankrupt) || b.worth - a.worth || (a.player.rank ?? 0) - (b.player.rank ?? 0));
  return `<section class="bm-result"><h3>최종 순위</h3><ol>${order.map(({ player, seat, worth }) =>
    `<li class="${room.winners.includes(player.id) ? 'winner' : ''}"><i class="bm-pawn seat-${seat}"></i>${escape(player.name)}
      <b>${player.bankrupt ? '파산' : won(worth)}</b></li>`).join('')}</ol></section>`;
}

// ui.bmCell is the board cell I picked (app.js): its deed is shown, and in 우주여행 it is where I fly.
export function bluemarbleView(room, me, ui) {
  const myTurn = room.status === 'playing' && !room.paused && me && room.players.indexOf(me) === room.index;
  const travel = myTurn && room.phase === 'space';
  const cells = spaces.map((_, pos) => cell(room, pos, ui, travel)).join('');
  return `<div class="bm-layout">
    <div class="bm-board-wrap"><div class="bm-board">${cells}${center(room, me, ui)}</div></div>
    <div class="bm-side">
      ${result(room)}
      ${controls(room, me, ui)}
      ${players(room, me)}
      ${me && room.status === 'playing' && !me.bankrupt ? act('파산 선언 (기권)', { action: 'resign' }, 'small danger bm-resign') : ''}
      ${deed(room, ui.bmCell ?? null, me, myTurn)}
      ${room.log?.length ? `<ol class="bm-log" data-log-scroll aria-label="활동 기록">${room.log.map(line => '<li>' + escape(line) + '</li>').join('')}</ol>` : ''}
    </div></div>`;
}

