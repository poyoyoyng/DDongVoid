import { cardName, cardRank, cardSuit, games, legalCard, powerCosts, powerNames, sum, suits, suitNames, yachtBonus, yachtCategories, yachtScore, yachtTotal, zones } from './rules.js';

export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const artwork = {
  dodge: '<span class="fall fall-one">●</span><span class="fall fall-two">●</span><span class="fall fall-three">●</span><span class="dodge-player"><i></i><i></i></span>',
  slap: '<span class="art-fighter mint"></span><span class="art-fighter cat"></span><span class="art-spark">✦</span>',
  ciao: '<span class="ciao-die">?</span><span class="ciao-die other">✕</span><span class="ciao-bridge"></span>',
  onecard: '<span class="art-card first">♣</span><span class="art-card second">♥</span><span class="art-card third">♠</span>',
  yacht: '<span class="art-die first">⚄</span><span class="art-die second">⚂</span><span class="art-die third">⚅</span>',
};

export function home() {
  const entries = Object.entries(games).map(([id, game]) => `
    <a class="game-tile" href="#${game.max === 1 ? 'play' : 'lobby'}/${id}">
      <div class="game-art art-${id}" aria-hidden="true">${artwork[id]}</div>
      <div class="game-info">
        <span class="game-mode">${game.mode}</span>
        <h3>${game.title}</h3>
        <p>${game.description}</p>
        <span class="tile-arrow" aria-hidden="true">↗</span>
      </div>
    </a>`).join('');
  return `<section class="hero">
      <div class="hero-copy">
        <h1>포요용의<br>미니게임천국<span aria-hidden="true">.</span></h1>
        <p>혼자 최고 기록에 도전하거나<br>친구를 초대해 한 판 겨뤄 보세요.</p>
        <a href="#lobby/onecard" class="button button-primary">대전방 열기 <span aria-hidden="true">↗</span></a>
      </div>
      <div class="hero-art" aria-hidden="true">
        <span class="hero-orbit"></span><span class="hero-orbit orbit-small"></span>
        <span class="hero-star star-top">✦</span><span class="hero-star star-bottom">✦</span>
        <span class="hero-card hero-card-back">◆</span><span class="hero-card hero-card-front">♠</span>
        <span class="hero-die">⚄</span><span class="hero-dot"></span>
      </div>
    </section>
    <section class="arcade" aria-labelledby="games-title">
      <div class="section-head"><h2 id="games-title">게임 선택</h2><a href="#rankings/dodge">랭킹 보기 ↗</a></div>
      <div class="game-grid">${entries}</div>
    </section>`;
}

export const heading = (title, description, back = '#home', backText = '게임 목록') =>
  `<a class="back" href="${back}">← ${backText}</a>
   <div class="page-title"><h1>${escape(title)}</h1>${description ? '<p>' + escape(description) + '</p>' : ''}</div>`;

export const signInPrompt = `<div class="panel empty"><h2>로그인이 필요합니다</h2>
  <p>닉네임과 비밀번호로 가입하거나 로그인하세요.</p>
  <button class="button button-primary" data-account>로그인</button></div>`;

export function lobby(game, rooms, accountId) {
  return heading(games[game].title, games[game].description) + `
  <div class="lobby-grid">
    <section class="panel">
      <div class="section-head"><h2>대전방</h2><button type="button" class="button button-small button-quiet" data-refresh>새로고침</button></div>
      ${rooms.length ? `<ul class="room-list">${rooms.map(room => {
        const member = room.players.some(player => player.id === accountId);
        const label = { waiting: '대기 중', playing: '진행 중', finished: '종료' }[room.status];
        return `<li><div><strong>${escape(room.title)}</strong>
          <p>${label} · ${room.players.length}/${games[game].max}명 · ${room.players.map(player => escape(player.name)).join(', ')}</p></div>
          ${member ? `<a class="button button-small button-outline" href="#room/${room.id}">입장</a>`
          : `<button class="button button-small button-outline" data-join="${room.id}" ${room.players.length >= games[game].max ? 'disabled' : ''}>참가</button>`}</li>`;
      }).join('')}</ul>` : '<p class="empty">아직 열린 방이 없습니다.</p>'}
    </section>
    <section class="panel">
      <h2>방 만들기</h2>
      <form id="new-room" class="stack">
        <label>방 제목<input name="title" maxlength="40" placeholder="${games[game].title} 방" required></label>
        <button class="button button-primary" type="submit">방 만들기</button>
      </form>
    </section>
  </div>`;
}

export function rankings(game, rows) {
  const solo = games[game].max === 1;
  const tabs = Object.entries(games).map(([id, item]) =>
    `<a class="${id === game ? 'selected' : ''}" href="#rankings/${id}" ${id === game ? 'aria-current="page"' : ''}>${item.title}</a>`).join('');
  return heading('랭킹', '게임별 최고 점수와 대전 성적을 확인하세요.') + `
    <div class="tabs" aria-label="랭킹 게임">${tabs}</div>
    <section class="panel rankings">
      <h2>${games[game].title}</h2>
      <table><thead><tr><th scope="col">순위</th><th scope="col">닉네임</th>${solo ?
        '<th scope="col">최고 점수</th>' : '<th scope="col">승</th><th scope="col">무</th><th scope="col">패</th>'}</tr></thead>
      <tbody>${rows.length ? rows.map(row => `<tr><td>${row.rank}</td><th scope="row">${escape(row.name)}</th>${solo ?
        '<td>' + row.score.toLocaleString('ko-KR') + '</td>' : `<td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td>`}</tr>`).join('')
        : `<tr><td colspan="${solo ? 3 : 5}" class="empty">아직 기록이 없습니다.</td></tr>`}</tbody></table>
    </section>`;
}

const action = (label, data, classes = 'button-outline', disabled = false) =>
  `<button class="button ${classes}" type="button" data-action="${escape(JSON.stringify(data))}" ${disabled ? 'disabled' : ''}>${label}</button>`;

function players(room, user) {
  return `<ul class="participants">${room.players.map((player, index) => `
    <li><span class="player-color p${index}"></span>
    <strong>${escape(player.name)}${player.id === user ? ' <small>나</small>' : ''}</strong>
    ${index === 0 ? '<span>방장</span>' : ''}
    ${room.status !== 'playing' ? (player.ready ? '<span class="ready">준비 완료</span>' : '<span>대기</span>') : ''}</li>`).join('')}</ul>`;
}

export function roomPage(room, user, ui) {
  const me = room.players.find(player => player.id === user);
  const playing = room.status === 'playing';
  const waiting = room.status === 'waiting';
  const gameView = { slap: slapView, ciao: ciaoView, onecard: cardView, yacht: yachtView }[room.game];
  const winnerNames = room.winners.map(id => escape(room.players.find(player => player.id === id)?.name)).join(', ');
  const status = waiting ? '대기 중' : playing ? '게임 진행 중' : '경기 종료';
  return heading(room.title, games[room.game].title + ' · ' + status, '#lobby/' + room.game, '대전방 목록') + `
    <div class="room-toolbar"><span id="room-connection" class="connection">${ui.connected ? '실시간 연결됨' : '연결 중…'}</span>
      <button class="button button-small button-quiet" data-copy-room>초대 링크 복사</button></div>
    ${waiting ? `<section class="panel"><h2>참가자 ${room.players.length}/${games[room.game].max}</h2>
      ${players(room, user)}<p class="muted">2명 이상 모이고 모두 준비하면 시작합니다.</p></section>` :
      `<section class="panel game-panel">${!playing ? `<div class="game-result">
        <h2>${room.winners.length > 1 ? '공동 승리' : room.winners.length === 1 ? winnerNames + ' 승리' : '대전 종료'}</h2>
        <p>${escape(room.endReason)}${room.winners.length > 1 ? ' · ' + winnerNames : ''}</p></div>` : ''}
        ${gameView(room, me, ui)}</section>`}
    <div class="room-controls">
      ${!playing ? action(me.ready ? '준비 취소' : waiting ? '준비 완료' : '다시 하기 · 준비 완료',
        { action: 'ready', ready: !me.ready }, me.ready ? 'button-outline' : 'button-primary') : ''}
      ${!playing ? action('방 나가기', { action: 'leave' }, 'button-quiet') : ''}
      ${room.game !== 'slap' && room.players[0].id === user ? action('방 삭제', { action: 'delete' }, 'button-quiet danger') : ''}
    </div>`;
}

function moveText(choice) {
  if (!choice) return '';
  return choice.move === 'charge' ? '기 모으기' :
    zones[choice.zone] + ' ' + (choice.move === 'block' ? '막기' : powerNames[choice.power]);
}

function pose(room, player, index) {
  const kind = index === 0 ? 'mint' : 'cat';
  const last = room.last;
  const move = last?.attacker === player.id ? last.attack : last?.defense;
  if (last && move?.move === 'charge' && !(last.attacker !== player.id && last.damage)) return kind + ' charge';
  const frame = last?.attacker === player.id && move?.move === 'slap' ? (last.blocked ? 3 : 2)
    : last?.attacker !== player.id && last?.damage ? 5 : move?.move === 'block' ? 4 : 0;
  return kind + ' pose-' + frame;
}

function slapView(room, me) {
  const attacking = room.players[room.index]?.id === me.id;
  const paused = room.players.some(player => player.gaveUp);
  let controls = '';
  if (room.status === 'playing') {
    if (!me.submitted && !paused) {
      const rows = attacking ? zones.map((zone, index) =>
        `<div class="move-row"><span>${zone}</span>${powerNames.map((name, power) => action(name,
          { action: 'choose', move: 'slap', zone: index, power }, 'button-outline button-small', me.gauge < powerCosts[power])).join('')}</div>`).join('')
        : zones.map((zone, index) => action(zone + ' 막기', { action: 'choose', move: 'block', zone: index })).join('');
      controls = `<div class="moves">${rows}${action('기 모으기', { action: 'choose', move: 'charge' }, 'button-outline', me.gauge >= 3)}</div>`;
    }
    controls += '<div class="room-controls">' + action(me.gaveUp ? '포기 요청 취소' : '포기하기',
      { action: 'giveup', value: !me.gaveUp }, 'button-quiet danger') + '</div>';
  }
  const outcome = room.last ? moveText(room.last.attack) + ' / ' + moveText(room.last.defense) +
    (room.last.blocked ? ' · 막았습니다' : room.last.damage ? ' · 피해 ' + room.last.damage : '') : '';
  return `<div class="turn-head"><h2>${room.turn}라운드</h2><p>${paused ? '포기 요청 중' :
    room.status === 'playing' ? (attacking ? '이번 라운드는 내 공격 차례' : '이번 라운드는 내 수비 차례') : ''}</p></div>
    <div class="fighters">${room.players.map((player, index) => `
      <div class="fighter"><strong>${escape(player.name)}</strong>
        <div class="fighter-sprite ${pose(room, player, index)}" aria-hidden="true"></div>
        <div class="fighter-meters"><span>체력 ${player.hp}/6</span><meter min="0" max="6" value="${player.hp}">${player.hp}</meter>
          <span>기력 ${player.gauge}/3</span><meter class="gauge" min="0" max="3" value="${player.gauge}">${player.gauge}</meter></div>
        <p class="caption">${player.gaveUp ? '포기 요청' : player.submitted ? (player.id === me.id ? moveText(player.choice) : '선택 완료') : ' '}</p>
      </div>`).join('')}</div>
    ${outcome ? '<p class="status-line">' + outcome + '</p>' : ''}${controls}`;
}

function ciaoView(room, me) {
  const speaker = room.players[room.index];
  const playing = room.status === 'playing';
  let choices = '';
  if (playing && speaker.id === me.id && room.phase === 'roll') choices = action('주사위 굴리기', { action: 'roll' }, 'button-primary');
  if (playing && speaker.id === me.id && room.phase === 'declare') choices =
    [1, 2, 3, 4].map(number => action(number + '칸 선언', { action: 'declare', number })).join('');
  if (playing && room.responders.includes(me.id)) choices = action('PASS', { action: 'pass' }) + action('의심', { action: 'doubt' }, 'button-primary');
  return `<div class="turn-head"><h2>${room.turn}번째 턴</h2><p>${playing ? escape(speaker.name) + '의 차례' : ''}</p></div>
    <div class="ciao-board" aria-label="이동판">${Array.from({ length: 10 }, (_, cell) => `
      <div><span>${cell === 0 ? '출발' : cell === 9 ? '도착' : cell}</span>
        <div class="pawns">${room.players.map((player, index) => player.position === cell
          ? `<span class="player-color p${index}" title="${escape(player.name)}"><span class="sr-only">${escape(player.name)}</span></span>` : '').join('')}</div></div>`).join('')}</div>
    <div class="podium" aria-label="도착 점수">${Array.from({ length: 8 }, (_, index) => {
      const slot = index + 1;
      const owner = room.players.findIndex(player => player.goals.includes(slot));
      return `<div class="${owner >= 0 ? 'slot p' + owner : ''}">${owner < 0 && slot <= room.usedPodium ? '×' : slot}</div>`;
    }).join('')}</div>
    <ul class="participants">${room.players.map((player, index) => `<li><span class="player-color p${index}"></span><strong>${escape(player.name)}</strong><span>대기 ${player.reserve} · 추락 ${player.fallen} · ${sum(player.goals)}점</span></li>`).join('')}</ul>
    <div class="game-facts">
      ${room.die != null ? '<span>내 주사위 <strong>' + (room.die || 'X') + '</strong></span>' : ''}
      ${room.declaration ? '<span>선언 <strong>' + room.declaration + '칸</strong></span>' : ''}
      ${room.deadline ? `<span>남은 시간 <strong data-deadline="${room.deadline}"></strong></span>` : ''}
    </div>
    <div class="moves">${choices}</div>${room.last ? '<p class="status-line">' + escape(room.last) + '</p>' : ''}`;
}

function cardView(room, me, ui) {
  const playing = room.status === 'playing';
  const actual = room.players[room.index];
  const own = playing && actual.id === me.id;
  const top = room.top === null ? '—' : cardName(room.top);
  const choose = ui.card !== null && me.hand.includes(ui.card) && own;
  return `<div class="turn-head"><h2>${room.turn}번째 턴</h2><p>${playing ? escape(actual.name) + '의 차례' : ''}</p></div>
    <ul class="participants">${room.players.map((player, index) => `
      <li><span class="player-color p${index}"></span><strong>${escape(player.name)}</strong><span>카드 ${player.count}장</span></li>`).join('')}</ul>
    <div class="card-table">${ui.call ? '<span class="call-bubble">원카드! · ' + escape(room.lastCaller) + '</span>' : ''}
      <div class="card-face ${room.top < 52 && [1, 2].includes(cardSuit(room.top)) ? 'red-card' : ''}">${top}</div>
      <div class="game-facts"><span>현재 무늬 <strong>${suits[room.activeSuit] ?? '아무 무늬'}</strong></span>
        ${room.pending ? '<span>누적 공격 <strong>+' + room.pending + '장</strong></span>' : ''}
        <span>진행 방향 <strong>${room.direction === 1 ? '↻' : '↺'}</strong></span></div>
    </div>
    <h3>내 손패</h3><div class="hand">${me.hand.map(card => {
      const red = card < 52 && [1, 2].includes(cardSuit(card));
      return `<button type="button" class="card-face ${red ? 'red-card' : ''}" data-card="${card}" ${own &&
        legalCard(card, room.top, room.activeSuit, room.pending) ? '' : 'disabled'}>${cardName(card)}</button>`;
    }).join('') || '<span class="muted">손패가 비었습니다.</span>'}</div>
    ${choose ? `<div class="moves suit-select"><span>다음 무늬 선택</span>${suits.map((suit, index) => action(suit + ' ' + suitNames[index],
      { action: 'play', card: ui.card, suit: index }, 'button-outline button-small')).join('')}</div>` : ''}
    ${playing ? `<div class="moves">${action('카드 받기', { action: 'draw' }, 'button-outline', !own)}
      ${action('원카드!', { action: 'call' }, 'button-primary')}</div>` : ''}
    ${room.last ? '<p class="status-line">' + escape(room.last) + '</p>' : ''}`;
}

function yachtView(room, me, ui) {
  const playing = room.status === 'playing';
  const actual = room.players[room.index];
  const own = playing && actual.id === me.id;
  return `<div class="turn-head"><h2>${room.turn} / 12라운드</h2><p>${playing ? escape(actual.name) + '의 차례' : ''}</p></div>
    ${playing ? `<div class="dice-rack">${room.dice.map((die, index) => `<button type="button" class="die" data-hold="${index}"
      aria-label="주사위 ${index + 1}${die ? ', 눈 ' + die : ''}" aria-pressed="${Boolean(ui.held[index])}"
      ${own && room.rollsUsed && room.rollsUsed < 3 ? '' : 'disabled'}>${die ? '⚀⚁⚂⚃⚄⚅'[die - 1] : '–'}</button>`).join('')}</div>
      <div class="moves">${action('주사위 굴리기', { action: 'roll', held: ui.held }, 'button-primary',
        !own || room.rollsUsed >= 3 || ui.held.every(Boolean))}<span>남은 굴림 ${3 - room.rollsUsed}회</span></div>` : ''}
    <table class="score-sheet"><thead><tr><th scope="col">족보</th>${room.players.map(player =>
      '<th scope="col">' + escape(player.name) + '</th>').join('')}</tr></thead><tbody>
      ${yachtCategories.map((category, index) => `<tr><th scope="row">${category}</th>${room.players.map(player =>
        '<td>' + (player.scores[index] ?? (player.id === me.id && own && room.rollsUsed
          ? action(yachtScore(index, room.dice) + '점', { action: 'score', category: index }, 'button-small button-outline')
          : '—')) + '</td>').join('')}</tr>`).join('')}
      <tr><th scope="row">상단 소계 / 63</th>${room.players.map(player => '<td>' + sum(player.scores.slice(0, 6)) + '</td>').join('')}</tr>
      <tr><th scope="row">상단 보너스</th>${room.players.map(player => '<td>' + yachtBonus(player.scores) + '</td>').join('')}</tr>
      <tr class="total"><th scope="row">총점</th>${room.players.map(player => '<td>' + yachtTotal(player.scores) + '</td>').join('')}</tr>
    </tbody></table>${room.last ? '<p class="status-line">' + escape(room.last) + '</p>' : ''}`;
}
