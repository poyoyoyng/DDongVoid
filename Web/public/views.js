import { canTakeSeat, cardName, cardRank, cardSuit, games, legalCard, powerCosts, powerNames, sum, suits, suitNames, yachtBonus, yachtCategories, yachtScore, yachtTotal, zones } from './rules.js';

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
        <span class="hero-badge">☁ 구름 위의 오락실</span>
        <h1>포요용의<br>미니게임<span>천국</span></h1>
        <p>혼자 최고 기록에 도전하거나<br>친구를 초대해 한 판 겨뤄 보세요.</p>
        <a href="#lobby" class="button button-primary">대기방 입장 <span aria-hidden="true">↗</span></a>
      </div>
      <div class="hero-art" aria-hidden="true">
        <span class="hero-sun"></span><span class="hero-rainbow"></span>
        <span class="hero-cloud cloud-back"></span>
        <span class="hero-card hero-card-back">◆</span><span class="hero-card hero-card-front">♠</span>
        <span class="hero-die">⚄</span>
        <span class="hero-cloud cloud-front"></span>
        <span class="hero-star star-top">✦</span><span class="hero-star star-bottom">✦</span>
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

export function lobby(rooms, accountId, selectedGame) {
  const options = Object.entries(games)
    .filter(([, game]) => game.max > 1)
    .map(([id, game]) => `<option value="${id}" ${selectedGame === id ? 'selected' : ''}>${game.title}</option>`).join('');
  return heading('공용 대기방') + `
  <div class="lobby-grid">
    <section class="panel">
      <div class="section-head"><h2>방 목록</h2><button type="button" class="button button-small button-quiet" data-refresh>새로고침</button></div>
      <div id="lobby-rooms">${roomList(rooms, accountId)}</div>
    </section>
    <aside class="lobby-sidebar">
      <section class="panel">
        <h2>방 만들기</h2>
        <form id="new-room" class="stack">
          <label>게임<select name="game" required>
            <option value="" disabled ${selectedGame === undefined ? 'selected' : ''}>게임을 선택하세요</option>
            ${options}
          </select></label>
          <label>방 제목<input name="title" maxlength="40" required></label>
          <button class="button button-primary" type="submit">방 만들기</button>
        </form>
      </section>
      <div id="chat-host"></div>
    </aside>
  </div>`;
}

export function roomList(rooms, accountId) {
  if (!rooms.length) return '<p class="empty">아직 열린 방이 없습니다.</p>';
  return `<ul class="room-list">${rooms.map(room => {
    const game = games[room.game];
    const spectators = room.spectators ?? [];
    const member = [...room.players, ...spectators].some(person => person.id === accountId);
    const canJoin = canTakeSeat(room);
    const players = room.players.filter(player => !player.vacant);
    const label = { waiting: '대기 중', playing: '진행 중', finished: '종료' }[room.status];
    return `<li><div><strong>${escape(room.title)}</strong>
      <p>${game.title} · ${label} · 참가 ${players.length}/${room.status === 'playing' ? room.players.length : game.max}명 · 관전 ${spectators.length}명</p>
      <p>${players.map(player => escape(player.name)).join(', ')}</p></div>
      ${member ? `<a class="button button-small button-outline" href="#room/${room.id}">입장</a>`
      : `<div class="room-list-actions">
        ${canJoin ? `<button class="button button-small button-outline" data-join="${room.id}">참가</button>` : ''}
        <button class="button button-small button-outline" data-watch="${room.id}">관전</button>
      </div>`}</li>`;
  }).join('')}</ul>`;
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

function roomRoster(room, user) {
  const active = room.players.filter(player => !player.vacant).length;
  const playerMarkup = (person, index, isPlayer) => `
    <li>${isPlayer ? `<span class="player-color p${index}"></span>` : ''}
      <strong>${escape(person.name)}${person.id === user ? ' <small>나</small>' : ''}</strong>
      ${person.id === room.hostId ? '<span>방장</span>' : ''}
      ${isPlayer && room.status !== 'playing' && person.ready ? '<span class="ready">준비 완료</span>' : ''}
    </li>`;
  return `<section class="panel room-roster">
    <div class="room-roster-group">
      <div><h2>참가자 ${active}/${room.status === 'playing' ? room.players.length : games[room.game].max}</h2>
        <ul class="participants">${room.players.map((person, index) => playerMarkup(person, index, true)).join('')}</ul></div>
      <div><h2>관전자 ${room.spectators.length}명</h2>
        ${room.spectators.length ? `<ul class="participants">${room.spectators.map(person => playerMarkup(person, 0, false)).join('')}</ul>`
          : '<p class="muted">관전자가 없습니다.</p>'}</div>
    </div>
    ${room.status === 'waiting' ? '<p class="muted">2명 이상 모이고 모두 준비하면 시작합니다.</p>' : ''}
    ${room.paused ? '<p class="seat-pause" role="status">빈 자리에 참가자가 들어오면 경기를 이어갑니다.</p>' : ''}
    ${room.substituted && room.status !== 'waiting' ? '<p class="muted">경기 중 참가자가 바뀐 이 판은 랭킹에 반영되지 않습니다.</p>' : ''}
  </section>`;
}

export function roomPage(room, user, ui) {
  const me = room.players.find(player => player.id === user);
  const playing = room.status === 'playing';
  const waiting = room.status === 'waiting';
  const gameView = { slap: slapView, ciao: ciaoView, onecard: cardView, yacht: yachtView }[room.game];
  const winnerNames = room.winners.map(id => escape(room.players.find(player => player.id === id)?.name)).join(', ');
  const status = waiting ? '대기 중' : playing ? '게임 진행 중' : '경기 종료';
  return heading(room.title, games[room.game].title + ' · ' + status, '#lobby', '공용 대기방') + `
    <div class="room-toolbar"><span id="room-connection" class="connection">${ui.connected ? '실시간 연결됨' : '연결 중…'}</span>
      <div class="room-toolbar-actions">
        <button class="button button-small button-quiet" data-focus-chat>채팅</button>
        <button class="button button-small button-quiet" data-copy-room>초대 링크 복사</button>
      </div></div>
    ${roomRoster(room, user)}
    ${waiting ? (room.game === 'yacht' ? `<section class="panel yacht-panel">${yachtVersus(room, me)}</section>` : '') :
      `<section class="panel game-panel ${room.game === 'yacht' ? 'yacht-panel' : ''}">${!playing ? `<div class="game-result">
        <h2>${room.winners.length > 1 ? '공동 승리' : room.winners.length === 1 ? winnerNames + ' 승리' : '대전 종료'}</h2>
        <p>${escape(room.endReason)}${room.winners.length > 1 ? ' · ' + winnerNames : ''}</p></div>` : ''}
        ${gameView(room, me, ui)}</section>`}
    <div class="room-controls">
      ${me && !playing ? action(me.ready ? '준비 취소' : waiting ? '준비 완료' : '다시 하기 · 준비 완료',
        { action: 'ready', ready: !me.ready }, me.ready ? 'button-outline' : 'button-primary') : ''}
      ${me ? action('관전석으로 이동', { action: 'spectate' }) : ''}
      ${!me && canTakeSeat(room) ? action('참가하기', { action: 'join' }, 'button-primary') : ''}
      ${!me || !playing ? action('방 나가기', { action: 'leave' }, 'button-quiet') : ''}
      ${room.game !== 'slap' && room.hostId === user ? action('방 삭제', { action: 'delete' }, 'button-quiet danger') : ''}
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
  const attacking = room.players[room.index]?.id === me?.id;
  const paused = room.players.some(player => player.gaveUp);
  let controls = '';
  if (room.status === 'playing' && me && !room.paused) {
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
    room.status === 'playing' ? (me ? (attacking ? '이번 라운드는 내 공격 차례' : '이번 라운드는 내 수비 차례') : '관전 중') : ''}</p></div>
    <div class="fighters">${room.players.map((player, index) => `
      <div class="fighter"><strong>${escape(player.name)}</strong>
        <div class="fighter-sprite ${pose(room, player, index)}" aria-hidden="true"></div>
        <div class="fighter-meters"><span>체력 ${player.hp}/6</span><meter min="0" max="6" value="${player.hp}">${player.hp}</meter>
          <span>기력 ${player.gauge}/3</span><meter class="gauge" min="0" max="3" value="${player.gauge}">${player.gauge}</meter></div>
        <p class="caption">${player.gaveUp ? '포기 요청' : player.submitted ? (player.id === me?.id ? moveText(player.choice) : '선택 완료') : ' '}</p>
      </div>`).join('')}</div>
    ${outcome ? '<p class="status-line">' + outcome + '</p>' : ''}${controls}`;
}

function ciaoView(room, me) {
  const speaker = room.players[room.index];
  const playing = room.status === 'playing';
  const actionable = playing && !room.paused;
  let choices = '';
  if (actionable && speaker.id === me?.id && room.phase === 'roll') choices = action('주사위 굴리기', { action: 'roll' }, 'button-primary');
  if (actionable && speaker.id === me?.id && room.phase === 'declare') choices =
    [1, 2, 3, 4].map(number => action(number + '칸 선언', { action: 'declare', number })).join('');
  if (actionable && room.responders.includes(me?.id)) choices = action('PASS', { action: 'pass' }) + action('의심', { action: 'doubt' }, 'button-primary');
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
  const own = playing && !room.paused && actual.id === me?.id;
  const top = room.top === null ? '—' : cardName(room.top);
  const choose = own && ui.card !== null && me.hand.includes(ui.card);
  return `<div class="turn-head"><h2>${room.turn}번째 턴</h2><p>${playing ? escape(actual.name) + '의 차례' : ''}</p></div>
    <ul class="participants">${room.players.map((player, index) => `
      <li><span class="player-color p${index}"></span><strong>${escape(player.name)}</strong><span>카드 ${player.count}장</span></li>`).join('')}</ul>
    <div class="card-table">${ui.call ? '<span class="call-bubble">원카드! · ' + escape(room.lastCaller) + '</span>' : ''}
      <div class="card-face ${room.top < 52 && [1, 2].includes(cardSuit(room.top)) ? 'red-card' : ''}">${top}</div>
      <div class="game-facts"><span>현재 무늬 <strong>${suits[room.activeSuit] ?? '아무 무늬'}</strong></span>
        ${room.pending ? '<span>누적 공격 <strong>+' + room.pending + '장</strong></span>' : ''}
        <span>진행 방향 <strong>${room.direction === 1 ? '↻' : '↺'}</strong></span></div>
    </div>
    ${me ? `<h3>내 손패</h3><div class="hand">${me.hand.map(card => {
      const red = card < 52 && [1, 2].includes(cardSuit(card));
      return `<button type="button" class="card-face ${red ? 'red-card' : ''}" data-card="${card}" ${own &&
        legalCard(card, room.top, room.activeSuit, room.pending) ? '' : 'disabled'}>${cardName(card)}</button>`;
    }).join('') || '<span class="muted">손패가 비었습니다.</span>'}</div>` : ''}
    ${choose ? `<div class="moves suit-select"><span>다음 무늬 선택</span>${suits.map((suit, index) => action(suit + ' ' + suitNames[index],
      { action: 'play', card: ui.card, suit: index }, 'button-outline button-small')).join('')}</div>` : ''}
    ${playing && me && !room.paused ? `<div class="moves">${action('카드 받기', { action: 'draw' }, 'button-outline', !own)}
      ${action('원카드!', { action: 'call' }, 'button-primary')}</div>` : ''}
    ${room.last ? '<p class="status-line">' + escape(room.last) + '</p>' : ''}`;
}

const yachtPips = [[], [4], [2, 6], [2, 4, 6], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
const yachtHints = [
  ...Array.from({ length: 6 }, (_, index) => (index + 1) + ' 눈의 합'),
  '주사위 5개의 합', '같은 눈 4개 이상이면 주사위 5개의 합', '같은 눈 3개와 2개 또는 같은 눈 5개의 합',
  '연속 4개 · 15점', '연속 5개 · 30점', '같은 눈 5개 · 50점',
];

export function yachtFace(value) {
  return value ? `<span class="yacht-pips ${value === 1 ? 'single-pip' : ''}">
    ${Array.from({ length: 9 }, (_, index) => `<i${yachtPips[value].includes(index) ? ' class="pip"' : ''}></i>`).join('')}
  </span>` : '<span class="die-unknown">?</span>';
}

function yachtTable(room, me, canScore, upper) {
  const categories = yachtCategories.entries();
  const seats = room.players;
  const summary = (label, score, className = '') => `<tr class="${className}"><th scope="row">${label}</th>
    ${seats.map(player => '<td>' + score(player.scores) + '</td>').join('')}</tr>`;
  return `<table class="score-sheet"><thead><tr><th scope="col">${upper ? '상단' : '하단'}</th>
    ${seats.map(player => `<th scope="col" title="${escape(player.name)}">${escape(player.id === me?.id ? '나' : player.name)}</th>`).join('')}
    </tr></thead><tbody>
    ${Array.from(categories).filter(([index]) => (index < 6) === upper).map(([index, category]) =>
      `<tr><th scope="row" title="${yachtHints[index]}">${category}</th>${seats.map(player =>
        '<td>' + (player.scores[index] ?? (player.id === me?.id && canScore
          ? action(yachtScore(index, room.dice) + '점', { action: 'score', category: index }, 'button-small button-outline')
          : '—')) + '</td>').join('')}</tr>`).join('')}
    ${upper ? summary('상단 소계 / 63', scores => sum(scores.slice(0, 6))) + summary('보너스 +35', yachtBonus) :
      summary('총점', yachtTotal, 'total')}
  </tbody></table>`;
}

function yachtVersus(room, me) {
  const waiting = room.status === 'waiting';
  const activeId = room.status === 'playing' ? room.players[room.index]?.id : null;
  const plates = Array.from({ length: 2 }, (_, index) => {
    const player = room.players[index];
    const label = player?.name ?? '빈 자리';
    const current = player?.id === activeId || room.winners.includes(player?.id);
    const caption = !player ? '상대를 기다리는 중…' :
      waiting ? (player.ready ? '준비 완료 ✓' : '준비 대기') : yachtTotal(player.scores) + '점';
    return `<div class="yacht-player seat-${index} ${current ? 'current' : ''}">
      <strong>${escape(label)}${player && player.id === me?.id ? ' (나)' : ''}</strong>
      <span class="${waiting ? 'waiting-score' : ''}">${caption}</span></div>`;
  });
  return `<div class="yacht-versus">${plates.join('<span class="yacht-vs">VS</span>')}</div>`;
}

function yachtView(room, me, ui) {
  const playing = room.status === 'playing';
  const actual = room.players[room.index];
  const own = playing && !room.paused && actual.id === me?.id;
  const canHold = own && room.rollsUsed > 0 && room.rollsUsed < 3;
  const rollText = room.rollsUsed ? '다시 굴리기' : '굴리기';
  const turnText = room.paused ? '빈 자리 대기 중' :
    own ? (room.rollsUsed ? '남길 주사위나 점수 칸을 고르세요' : '주사위를 굴리세요') : actual.name + '의 차례';
  return `<div class="turn-head"><h2>${room.turn} / 12라운드</h2><p>${playing ? escape(turnText) : ''}</p></div>
    ${yachtVersus(room, me)}
    ${playing ? `<div class="yacht-tray"><div class="dice-rack">${room.dice.map((die, index) => `
      <button type="button" class="die" data-hold="${index}" aria-label="주사위 ${index + 1}${die ? ', 눈 ' + die : ''}"
        aria-pressed="${Boolean(ui.held[index])}" ${canHold ? '' : 'disabled'}>
        <span class="die-face" aria-hidden="true" ${room.held[index] ? '' : 'data-roll-face'}>${yachtFace(die)}</span>
        <span class="die-tag">${ui.held[index] ? '고정' : ' '}</span>
      </button>`).join('')}</div>
      <div class="yacht-roll">${me ? action(rollText, { action: 'roll', held: ui.held }, 'button-primary',
        !own || room.rollsUsed >= 3 || ui.held.every(Boolean)) : ''}<span>${3 - room.rollsUsed}회 남음</span></div>
    </div>` : ''}
    ${room.last ? '<p class="yacht-last">' + escape(room.last) + '</p>' : ''}
    <div class="yacht-sheet">${yachtTable(room, me, own && room.rollsUsed, true)}
      ${yachtTable(room, me, own && room.rollsUsed, false)}</div>`;
}
