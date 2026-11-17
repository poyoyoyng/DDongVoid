import { escape } from './views.js';
import {
  bounds, cardHelp, cardName, cards, goalFaceName, goalNames, goalX, goalYs, placements, roleNames, rounds, toolNames,
} from './saboteur.js';
import { brokenTool, cardArt, cardBack, goalArt, goalBack, roleArt, startArt } from './saboteur-art.js';

const act = (label, data, classes = '', disabled = false) =>
  `<button class="app-button ${classes}" type="button" data-action="${escape(JSON.stringify(data))}" ${disabled ? 'disabled' : ''}>${label}</button>`;

const roleHelp = {
  digger: '금으로 가는 길을 이어요. 금을 찾으면 광부끼리 금 카드를 나눠 가져요.',
  saboteur: '정체를 숨기고 길을 막아요. 카드가 모두 떨어질 때까지 금을 못 찾으면 방해꾼이 이겨요.',
};

export const saboteurStage = room => `라운드 ${room.round ?? 1} / ${rounds}`;

export function saboteurTitle(room) {
  const result = room.result;
  return `${result.round}라운드 끝 · ${result.winner === 'digger' ? '광부' : '방해꾼'} 승리!`;
}

function cellArt(room, cell, me) {
  if (cell.kind === 'start') return startArt('시작 카드');
  if (cell.kind === 'path') return cardArt(cell.card, cell.rot, cardName(cell.card));
  const name = goalNames[cell.goal] + ' 목적지';
  if (cell.face) return goalArt(cell.face, cell.rot, name + ' · ' + goalFaceName(cell.face));
  // Once the round is over every goal is shown, the unturned ones dimmed.
  if (room.goals) return goalArt(room.goals[cell.goal], 0, name + ' · ' + goalFaceName(room.goals[cell.goal]));
  const peek = me?.peeks?.[cell.goal];
  return goalBack(name + (peek ? ' · 지도로 본 카드: ' + goalFaceName(peek) : ' · 뒷면')) +
    (peek ? `<em class="sab-peek ${peek === 'gold' ? 'gold' : ''}">${goalFaceName(peek)}</em>` : '');
}

// The mine: every placed card plus one free space around it, scrolled inside its own frame.
function mine(room, me, ui, selection) {
  const { card, info, rot, spots, mine: canPlay } = selection;
  const cells = new Map(room.board.map(cell => [cell.x + ',' + cell.y, cell]));
  const xs = room.board.map(cell => cell.x);
  const ys = room.board.map(cell => cell.y);
  const left = Math.max(bounds.left, Math.min(...xs) - 1);
  const right = Math.min(bounds.right, Math.max(...xs, goalX) + 1);
  const top = Math.max(bounds.top, Math.min(...ys, goalYs[0]) - 1);
  const bottom = Math.min(bounds.bottom, Math.max(...ys, goalYs[2]) + 1);
  const open = new Set(spots.map(spot => spot.x + ',' + spot.y));
  const markup = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const id = x + ',' + y;
      const cell = cells.get(id);
      if (!cell) {
        markup.push(open.has(id)
          ? `<button type="button" class="sab-cell spot" aria-label="여기에 ${cardName(card)} 놓기"
              data-action="${escape(JSON.stringify({ action: 'path', card, x, y, rot }))}">${cardArt(card, rot)}</button>`
          : '<span class="sab-cell empty"></span>');
        continue;
      }
      const last = room.lastCell?.x === x && room.lastCell?.y === y;
      const hidden = cell.kind === 'goal' && !cell.face;
      const target = canPlay && (info?.type === 'rockfall' && cell.kind === 'path' || info?.type === 'map' && hidden && !room.goals)
        ? { action: info.type, card, ...(info.type === 'map' ? { goal: cell.goal } : { x, y }) } : null;
      const classes = `sab-cell ${cell.kind}${last ? ' last' : ''}${cell.kind === 'goal' && !cell.face && room.goals ? ' unturned' : ''}${target ? ' target ' + info.type : ''}`;
      markup.push(target
        ? `<button type="button" class="${classes}" aria-label="${info.type === 'map' ? goalNames[cell.goal] + ' 목적지 몰래 보기' : cardName(cell.card) + ' 무너뜨리기'}"
            data-action="${escape(JSON.stringify(target))}">${cellArt(room, cell, me)}</button>`
        : `<span class="${classes}">${cellArt(room, cell, me)}</span>`);
    }
  }
  const zoom = ui.sabZoom ?? 1;
  return `<div class="sab-board-head"><p class="app-label">광산 · 시작 카드에서 목적지 3장까지 굴을 이어요</p>
      <span class="sab-zoom" role="group" aria-label="카드 크기">
        <button type="button" class="app-button small" data-sab-zoom="-1" aria-label="작게" ${zoom <= 0 ? 'disabled' : ''}>−</button>
        <button type="button" class="app-button small" data-sab-zoom="1" aria-label="크게" ${zoom >= 2 ? 'disabled' : ''}>+</button></span></div>
    <div class="sab-board zoom-${zoom}" data-keep-scroll><div class="sab-grid" style="--cols:${right - left + 1}">${markup.join('')}</div></div>`;
}

function seatList(room, me, revealed) {
  const playing = room.status === 'playing' && room.phase === 'play';
  return `<ul class="sab-players">${room.players.map((player, seat) => {
    const current = playing && seat === room.index;
    const role = revealed ? player.role : null;
    const gain = revealed ? room.result?.gains?.[seat] : null;
    const lines = [];
    if (room.status === 'finished') lines.push(`<b class="gold">금 ${player.gold}개</b>`);
    else if (gain != null) lines.push(gain ? `<b class="gold">금 +${gain}</b>` : '금 없음');
    if (room.phase === 'roundEnd' && room.status === 'playing') lines.push(player.next ? '<span class="ready">다음 라운드 준비 ✓</span>' : '준비 대기');
    return `<li class="${current ? 'current' : ''}${player.vacant ? ' vacant' : ''}${role ? ' ' + role : ''}">
      ${role ? `<span class="sab-role-mini">${roleArt(role, roleNames[role])}</span>` : ''}
      <div><strong>${current ? '▶ ' : ''}${escape(player.name)}${player.id === me?.id ? ' (나)' : ''}</strong>
        <span class="sab-count">${cardBack()}${player.handCount}장</span>
        ${player.broken?.length ? `<span class="sab-broken">${player.broken.map(tool => brokenTool(tool, toolNames[tool] + ' 부서짐')).join('')}</span>` : ''}
        ${role ? `<small class="sab-role-name ${role}">${roleNames[role]}</small>` : ''}
        ${lines.length ? `<small>${lines.join(' · ')}</small>` : ''}</div></li>`;
  }).join('')}</ul>`;
}

function myPanel(room, me) {
  if (!me?.role) return '';
  const peeks = Object.entries(me.peeks ?? {});
  return `<div class="sab-me ${me.role}">
    <span class="sab-role-card">${roleArt(me.role, '내 역할 ' + roleNames[me.role])}</span>
    <div><p class="app-label">이번 라운드 내 역할</p><p class="sab-role-title">${roleNames[me.role]}</p>
      <p class="app-muted">${roleHelp[me.role]}</p>
      ${me.gold != null ? `<p class="sab-gold">내 금 <b>${me.gold}</b>개 <small>· 다른 사람의 금은 게임이 끝날 때 공개돼요</small></p>` : ''}
      ${peeks.length ? `<p class="sab-known">지도로 본 목적지 · ${peeks.map(([goal, face]) => `${goalNames[goal]} = <b>${goalFaceName(face)}</b>`).join(' · ')}</p>` : ''}
      ${me.broken?.length ? `<p class="app-warn">부서진 도구 · ${me.broken.map(tool => toolNames[tool]).join(', ')} · 고칠 때까지 길 카드를 못 내요</p>` : ''}
    </div></div>`;
}

function controls(room, me, selection) {
  const { card, info, rot, spots, mine: canPlay, flipped } = selection;
  const mySeat = room.players.indexOf(me);
  if (card == null) {
    return canPlay ? '<p class="app-warn">내 차례 · 손패에서 낼 카드를 고르세요. 낼 카드가 없으면 한 장을 버리고 패스해요.</p>' : '';
  }
  let body = '';
  if (info.type === 'path') {
    if (me.broken.length) body = '<p class="app-warn">도구가 부서져서 길 카드를 낼 수 없어요. 고치기 카드를 받거나 버리고 패스하세요.</p>';
    else {
      body = `<button type="button" class="app-button" data-sab-rotate>180° 돌리기 ↻</button>
        <p class="app-muted">${canPlay ? (spots.length ? `놓을 수 있는 자리 <b>${spots.length}곳</b> · 판에서 빛나는 칸을 누르세요`
          : flipped ? '이 방향으로는 놓을 곳이 없어요. 돌려 보세요.' : '지금은 놓을 수 있는 자리가 없어요.') : '내 차례가 되면 판에 놓을 수 있어요.'}</p>`;
    }
  } else if (info.type === 'break') {
    const tool = info.tools[0];
    body = `<div class="sab-targets">${room.players.map((player, seat) => seat === mySeat ? '' :
      act(`${escape(player.name)}<small>${player.broken.includes(tool) ? '이미 부서짐' : toolNames[tool] + ' 부수기'}</small>`,
        { action: 'break', card, target: seat }, 'primary', !canPlay || player.broken.includes(tool))).join('')}</div>`;
  } else if (info.type === 'fix') {
    const options = room.players.flatMap((player, seat) => info.tools.filter(tool => player.broken.includes(tool)).map(tool =>
      act(`${seat === mySeat ? '나' : escape(player.name)}<small>${toolNames[tool]} 고치기</small>`, { action: 'fix', card, target: seat, tool }, 'primary', !canPlay)));
    body = options.length ? `<div class="sab-targets">${options.join('')}</div>` : '<p class="app-muted">이 카드로 고칠 부서진 도구가 아무에게도 없어요.</p>';
  } else if (info.type === 'map') {
    body = `<div class="sab-targets">${goalNames.map((name, goal) => {
      const cell = room.board.find(candidate => candidate.kind === 'goal' && candidate.goal === goal);
      return act(`${name} 목적지<small>${cell.face ? '이미 공개' : '몰래 보기'}</small>`, { action: 'map', card, goal }, 'primary', !canPlay || Boolean(cell.face));
    }).join('')}</div>`;
  } else {
    body = `<p class="app-muted">${canPlay ? '판에서 빨간 테두리가 생긴 길 카드를 눌러 무너뜨리세요.' : '내 차례가 되면 길 카드 한 장을 무너뜨릴 수 있어요.'}</p>`;
  }
  return `<div class="sab-controls"><div class="sab-picked"><span class="sab-picked-art">${cardArt(card, rot)}</span>
      <div><p class="sab-picked-name">${cardName(card)}</p><p class="app-muted">${cardHelp(card)}</p></div></div>
    ${body}
    ${act('이 카드 버리고 패스', { action: 'discard', card }, 'wide', !canPlay)}</div>`;
}

function result(room, me) {
  const outcome = room.result;
  if (!outcome) return '';
  const finder = outcome.finder !== null ? room.players[outcome.finder] : null;
  const roundEnd = room.status === 'playing' && room.phase === 'roundEnd';
  const standings = room.status === 'finished'
    ? `<ol class="sab-final">${[...room.players].sort((a, b) => b.gold - a.gold).map(player =>
      `<li class="${room.winners.includes(player.id) ? 'winner' : ''}"><strong>${escape(player.name)}</strong><b>금 ${player.gold}개</b></li>`).join('')}</ol>` : '';
  return `<section class="sab-result ${outcome.winner}">
    <h3>${outcome.round}라운드 · ${outcome.winner === 'digger' ? '광부 승리!' : '방해꾼 승리!'}</h3>
    <p>${finder ? `${escape(finder.name)}님이 금을 찾았어요. 광부들이 금 카드를 한 장씩 나눠 가졌어요.`
      : '카드가 모두 떨어질 때까지 금을 찾지 못했어요. 방해꾼들이 금을 가져가요.'}</p>
    <div class="sab-goals">${goalNames.map((name, goal) => `<figure>${goalArt(outcome.goals[goal], 0, name + ' 목적지 · ' + goalFaceName(outcome.goals[goal]))}
      <figcaption>${name} · ${goalFaceName(outcome.goals[goal])}</figcaption></figure>`).join('')}</div>
    ${room.history?.length ? `<p class="app-muted">${room.history.map(entry => `${entry.round}R ${entry.winner === 'digger' ? '광부' : '방해꾼'}`).join(' · ')}</p>` : ''}
    ${standings}
    ${roundEnd ? `<p class="app-muted">${outcome.round + 1}라운드는 역할을 새로 나눠요 · 자동 시작까지 <strong data-deadline="${room.deadline}"></strong></p>
      ${me ? act(me.next ? '다른 사람을 기다리는 중…' : '다음 라운드 준비', { action: 'next' }, 'primary wide', me.next) : ''}` : ''}
  </section>`;
}

// ui.sabCard is the hand card I picked, ui.sabRot whether it is turned 180°, ui.sabZoom the board's card size (app.js).
export function saboteurView(room, me, ui) {
  const playing = room.status === 'playing';
  const revealed = !playing || room.phase === 'roundEnd';
  const mySeat = room.players.indexOf(me);
  const inPlay = playing && room.phase === 'play';
  const myTurn = inPlay && !room.paused && mySeat >= 0 && room.index === mySeat;
  const card = inPlay && me?.hand?.includes(ui.sabCard) ? ui.sabCard : null;
  const info = card != null ? cards[card] : null;
  const rot = ui.sabRot ?? 0;
  const pathOk = myTurn && info?.type === 'path' && !me.broken.length;
  const spots = pathOk ? placements(room.board, card, rot) : [];
  const selection = { card, info, rot, spots, mine: myTurn, flipped: pathOk && !spots.length && placements(room.board, card, 1 - rot).length > 0 };
  const turn = inPlay ? `<p class="${myTurn ? 'app-warn' : 'app-muted'}">${myTurn ? '내 차례' : escape(room.players[room.index].name) + '님의 차례'}
    · 남은 시간 <strong data-deadline="${room.deadline}"></strong> · 시간이 지나면 첫 카드를 버리고 패스</p>` : '';
  const hand = inPlay && me?.hand ? `<p class="app-label">내 손패 · ${me.hand.length}장${me.hand.length ? '' : ' · 낼 카드가 없어서 차례를 건너뛰어요'}</p>
    <div class="sab-hand">${me.hand.map(id => `<button type="button" class="sab-card${id === card ? ' picked' : ''}${cards[id].type === 'path' && me.broken.length ? ' blocked' : ''}"
      data-sab-card="${id}" aria-pressed="${id === card}" title="${escape(cardName(id) + ' · ' + cardHelp(id))}">${cardArt(id, id === card ? rot : 0, cardName(id))}
      <small>${cardName(id)}</small></button>`).join('')}</div>` : '';
  return `<div class="sab-status">
      <span>라운드 <b>${room.round}</b> / ${rounds}</span><span>남은 카드 <b>${room.deckCount}</b>장</span>
      <span>금 카드 더미 <b>${room.goldLeft}</b>장</span></div>
    ${turn}
    ${revealed ? result(room, me) : ''}
    ${playing && !revealed ? myPanel(room, me) : ''}
    ${seatList(room, me, revealed)}
    ${mine(room, me, ui, selection)}
    ${hand}
    ${inPlay && me ? controls(room, me, selection) : ''}
    ${room.log?.length ? `<ol class="sab-log">${room.log.map(line => '<li>' + escape(line) + '</li>').join('')}</ol>` : ''}`;
}
