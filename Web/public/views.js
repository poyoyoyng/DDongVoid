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
  return heading('랭킹', solo ? '게임별 최고 점수를 확인하세요.' : '대전 게임은 점수 순입니다. 모두 1000점에서 시작해 이기면 오르고 지면 내려가요.') + `
    <div class="tabs" aria-label="랭킹 게임">${tabs}</div>
    <section class="panel rankings">
      <h2>${games[game].title}</h2>
      <table><thead><tr><th scope="col">순위</th><th scope="col">닉네임</th>${solo ?
        '<th scope="col">최고 점수</th>' : '<th scope="col">점수</th><th scope="col">승</th><th scope="col">무</th><th scope="col">패</th>'}</tr></thead>
      <tbody>${rows.length ? rows.map(row => `<tr><td>${row.rank}</td><th scope="row">${escape(row.name)}</th>${solo ?
        '<td>' + row.score.toLocaleString('ko-KR') + '</td>' : `<td class="mmr">${row.mmr}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td>`}</tr>`).join('')
        : `<tr><td colspan="${solo ? 3 : 6}" class="empty">아직 기록이 없습니다.</td></tr>`}</tbody></table>
    </section>`;
}

const action = (label, data, classes = '', disabled = false) =>
  `<button class="app-button ${classes}" type="button" data-action="${escape(JSON.stringify(data))}" ${disabled ? 'disabled' : ''}>${label}</button>`;
const nameOf = (room, id) => escape(room.players.find(player => player.id === id)?.name ?? '');
const pawn = (seat, label, kind = '') => `<i class="pawn seat-${seat} ${kind}" title="${escape(label)}"></i>`;

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
    ${room.substituted && room.status !== 'waiting' ? '<p class="muted">경기 중 참가자가 바뀐 이 판은 랭킹에 반영되지 않습니다.</p>' : ''}
  </section>`;
}

// Every room follows the desktop app's dialog: eyebrow, big status title, the game, then full-width buttons.
const waitingNotes = {
  slap: '두 사람 모두 준비 완료를 누르면 바로 시작합니다.<br>방을 만든 사람(P1)이 먼저 공격합니다.',
  ciao: '2~4명이 참가하고 모두 준비하면 시작합니다.',
  onecard: '2~4명이 참가하고 모두 준비하면 시작합니다.',
  yacht: '두 사람 모두 준비 완료를 누르면 시작합니다.',
};

function stage(room) {
  if (room.status === 'finished') return 'GAME OVER';
  if (room.status !== 'playing') return 'WAITING ROOM';
  return room.game === 'slap' ? 'ROUND ' + room.turn : room.game === 'yacht' ? `ROUND ${room.turn} / 12` : 'TURN ' + room.turn;
}

function roomTitle(room, me) {
  const winners = room.winners;
  if (room.status === 'waiting') return room.game === 'slap' && room.players.length < 2 ? '상대를 기다리는 중' : '준비되면 시작!';
  if (room.status === 'finished') {
    if (!winners.length) return '대전을 종료했어요';
    if (!me) return winners.length > 1 ? '공동 승리!' : nameOf(room, winners[0]) + ' 승리!';
    if (winners.length > 1 && winners.includes(me.id)) return '무승부!';
    if (winners.includes(me.id)) return room.game === 'slap' ? '이겼어요! 짝!' : '이겼어요!';
    return { slap: '졌어요… 얼얼하다', yacht: '아쉽게 졌어요' }[room.game] ?? '게임이 끝났어요';
  }
  if (room.paused) return '빈 자리 대기 중';
  const actual = room.players[room.index];
  const mine = actual.id === me?.id;
  if (room.game === 'slap') return me ? (mine ? '내 공격 차례!' : '내 수비 차례!') : nameOf(room, actual.id) + '의 공격 차례';
  if (room.game === 'ciao' && !mine && room.responders.includes(me?.id)) return '응답 차례';
  if (room.game === 'yacht' && mine) return room.rollsUsed === 0 ? '내 차례 · 주사위를 굴리세요'
    : room.rollsUsed < 3 ? '내 차례 · 남길 주사위를 고르세요' : '내 차례 · 점수 칸을 고르세요';
  return mine ? '내 차례' : nameOf(room, actual.id) + '님의 차례';
}

function waitingSeats(room, me) {
  return `<p class="app-muted">방장 · ${nameOf(room, room.hostId)}</p>
    <ul class="app-seats">${room.players.map((player, index) => `<li>${pawn(index, player.name)}
      <strong>P${index + 1}  ${escape(player.name)}${player.id === me?.id ? ' (나)' : ''}</strong>
      <span class="${player.ready ? 'ready' : ''}">${player.ready ? '준비 완료 ✓' : '준비 대기'}</span></li>`).join('')}</ul>
    <p class="app-muted">참가자 ${room.players.length}/${games[room.game].max}</p>`;
}

export function roomPage(room, user, ui) {
  const me = room.players.find(player => player.id === user);
  const playing = room.status === 'playing';
  const finished = room.status === 'finished';
  const gameView = { slap: slapView, ciao: ciaoView, onecard: cardView, yacht: yachtView }[room.game];
  const winnerNames = room.winners.map(id => nameOf(room, id)).join(' · ');
  const main = [
    me && !playing ? action(me.ready ? '준비 취소' : finished ? '다시 하기 · 준비 완료' : '준비 완료',
      { action: 'ready', ready: !me.ready }, me.ready ? '' : 'primary') : '',
    !me && canTakeSeat(room) ? action('참가하기', { action: 'join' }, 'primary') : '',
  ].join('');
  const minor = [
    me ? action('관전석으로 이동', { action: 'spectate' }, 'small') : '',
    !me || !playing ? action('방 나가기', { action: 'leave' }, 'small') : '',
    room.game !== 'slap' && room.hostId === user ? action('방 없애기 (방장 전용)', { action: 'delete' }, 'small danger') : '',
  ].join('');
  return `<div class="room-top">
      <a class="back" href="#lobby">← 공용 대기방</a>
      <span id="room-connection" class="connection">${ui.connected ? '실시간 연결됨' : '연결 중…'}</span>
      <div class="room-toolbar-actions">
        <button class="button button-small button-quiet" data-focus-chat>채팅</button>
        <button class="button button-small button-quiet" data-copy-room>초대 링크 복사</button>
      </div></div>
    <section class="app-panel game-panel ${room.game}-panel" aria-labelledby="room-title">
      <p class="app-eyebrow">${games[room.game].title} · ${escape(room.title)} · ${stage(room)}</p>
      <h1 class="app-title" id="room-title">${roomTitle(room, me)}</h1>
      ${room.status === 'waiting' ? `<p class="app-desc">${waitingNotes[room.game]}</p>` : ''}
      ${finished ? `<div class="app-result"><strong>${room.winners.length ? '승자  ' + winnerNames : '대전 종료'}</strong>
        ${room.endReason ? '<p>' + escape(room.endReason) + '</p>' : ''}</div>` : ''}
      ${room.paused ? '<p class="app-alert" role="status">빈 자리에 참가자가 들어오면 경기를 이어갑니다.</p>' : ''}
      ${gameView(room, me, ui)}
      ${main ? `<div class="app-actions">${main}</div>` : ''}
      ${minor ? `<div class="app-minor">${minor}</div>` : ''}
    </section>
    ${roomRoster(room, user)}`;
}

const slapDamage = [1, 2, 5];
const powerLabel = power => powerNames[power] + (power ? ' ×' + slapDamage[power] : '');
const describe = choice => choice.move === 'charge' ? '기 모으기'
  : zones[choice.zone] + ' ' + (choice.move === 'block' ? '막기' : powerLabel(choice.power));

// Pose, caption and tooltip for one fighter, following the app's SlapPresentation.
function fighterState(room, player, me) {
  const last = room.last;
  if (room.status === 'waiting') return ['idle', player.ready ? '준비 완료 ✓' : '준비 대기'];
  if (room.status === 'finished' && !room.winners.length) return ['idle', '대전 종료'];
  if (room.status === 'playing' && room.players.some(candidate => candidate.gaveUp)) return ['idle', player.gaveUp ? '포기 요청' : '응답 대기'];
  if (room.status === 'playing' && room.players.some(candidate => candidate.submitted)) {
    const choice = player.id === me?.id && player.choice;
    if (choice) return [{ charge: 'charge', block: 'guard' }[choice.move] ?? 'idle',
      { slap: '입력 완료 ✓', block: '막기 준비', charge: '기 모으기' }[choice.move], '선택 완료 · ' + describe(choice)];
    return ['idle', player.submitted ? '입력 완료 ✓' : '선택 대기'];
  }
  if (last) {
    if (player.id === last.attacker) {
      if (last.attack.move === 'charge') return ['charge', '기 모으기', '기 모으기 · 기력 +1'];
      const success = !last.blocked && last.damage > 0;
      return [success ? 'success' : 'failed', success ? '공격 성공!' : '공격 실패',
        describe(last.attack) + ' · ' + (success ? '피해 ' + last.damage : '막혔어요')];
    }
    if (last.blocked) return ['guard', '막았다!', describe(last.defense) + ' · 방어 성공'];
    if (last.damage) return ['hit', last.defense.move === 'charge' ? '기 모으기 · 맞았다!' : '맞았다!',
      describe(last.defense) + ' · 체력 -' + last.damage];
    return last.defense.move === 'block' ? ['guard', '막기', describe(last.defense)] : ['charge', '기 모으기', describe(last.defense)];
  }
  return ['idle', room.status === 'finished' ? '대전 종료' : '평소'];
}

const poseFrames = { idle: 0, success: 2, failed: 3, guard: 4, hit: 5 };

function fighterCard(room, player, seat, me, right) {
  const kind = seat === 0 ? 'mint' : 'cat';
  const [pose, caption, description = caption] = player ? fighterState(room, player, me) : ['idle', '참가자 대기', '참가자를 기다리고 있어요'];
  const hp = player?.hp ?? 6;
  const gauge = player?.gauge ?? 0;
  const name = player ? `P${seat + 1}  ${escape(player.name)}${player.id === me?.id ? ' (나)' : ''}` : `P${seat + 1}  —`;
  return `<div class="fighter seat-${seat}${player ? '' : ' no-player'}" title="${escape(description)}">
    <strong>${name}</strong>
    <div class="fighter-stats" role="img" aria-label="체력 ${hp}/6 · 기력 ${gauge}/3">
      <span>체력</span><span class="hp-bar">${Array.from({ length: 6 }, (_, index) => `<i${index < hp ? ' class="on"' : ''}></i>`).join('')}</span><b>${hp}/6</b>
      <span>기력</span><span class="gauge-dots">${Array.from({ length: 3 }, (_, index) => `<i${index < gauge ? ' class="on"' : ''}></i>`).join('')}</span><b class="gold">${gauge}/3</b>
    </div>
    <div class="fighter-sprite ${kind} ${pose === 'charge' ? 'charge' : 'pose-' + poseFrames[pose]}${right ? ' facing-left' : ''}" role="img" aria-label="${escape(description)}"></div>
    <p class="fighter-caption">${caption}</p>
  </div>`;
}

function slapView(room, me, ui) {
  const order = me ? [me, room.players.find(player => player !== me)] : [room.players[0], room.players[1]];
  const seatOf = (player, position) => player ? room.players.indexOf(player) : 1 - room.players.indexOf(order[1 - position]);
  const arena = `<div class="fighters">${order.map((player, position) =>
    fighterCard(room, player, seatOf(player, position), me, position === 1)).join('')}</div>`;
  const showsResult = room.last && room.status !== 'waiting' && !room.players.some(player => player.submitted || player.gaveUp);
  const result = showsResult ? `<p class="app-muted">R${room.status === 'playing' ? room.turn - 1 : room.turn} 결과</p>` : '';
  if (room.status !== 'playing' || !me || room.paused) return result + arena;
  const attacking = room.players[room.index].id === me.id;
  const full = me.gauge >= 3;
  let controls;
  if (room.players.some(player => player.gaveUp)) {
    controls = `<p class="app-warn">${me.gaveUp ? '포기를 요청했어요. 상대도 포기하면 대전이 종료됩니다.<br>포기 요청을 취소하면 이어서 진행할 수 있어요.'
      : '상대가 포기를 요청했어요. 나도 포기하면 대전이 종료됩니다.<br>상대가 요청을 취소하면 이어서 진행할 수 있어요.'}</p>`;
  } else if (me.submitted) {
    controls = '<p class="app-muted">상대 선택을 기다려요 · 창을 닫아도 저장됩니다.</p>';
  } else if (attacking) {
    const power = me.gauge >= powerCosts[ui.power] ? ui.power : 0;
    controls = `<div class="app-row">${powerNames.map((_, index) => `<button type="button" class="app-button${index === power ? ' primary' : ''}"
        data-power="${index}" aria-pressed="${index === power}" ${me.gauge < powerCosts[index] ? 'disabled' : ''}>${powerLabel(index)}
        <small>기 ${powerCosts[index]} · 피해 ${slapDamage[index]}</small></button>`).join('')}</div>
      <div class="app-row">${zones.map((zone, index) => action(zone + '<small>때리기</small>',
        { action: 'choose', move: 'slap', zone: index, power }, 'primary')).join('')}</div>
      ${action(full ? '기 가득 참 (3/3) · 때려야 해요' : '기 모으기  +1', { action: 'choose', move: 'charge' }, 'wide', full)}`;
  } else {
    controls = `<div class="app-row">${zones.map((zone, index) => action(zone + '<small>막기</small>',
        { action: 'choose', move: 'block', zone: index }, 'primary')).join('')}</div>
      ${action(full ? '기 가득 참 (3/3) · 막아야 해요' : '기 모으기  +1  (이번 턴은 못 막아요)', { action: 'choose', move: 'charge' }, 'wide', full)}`;
  }
  return result + arena + controls + action(me.gaveUp ? '포기 요청 취소' : '포기하기', { action: 'giveup', value: !me.gaveUp }, 'wide');
}

const ciaoSteps = [0, 1, 2, 3, 4, 9, 8, 7, 6, 5];
const ciaoLabel = step => step === 0 ? 'S →' : step === 9 ? 'G' : step === 4 ? '4 ↓' : step < 4 ? step + ' →' : '← ' + step;

function ciaoActions(room, me) {
  const speaker = room.players[room.index];
  const speakerName = nameOf(room, speaker.id);
  const mine = speaker.id === me?.id;
  if (room.phase === 'roll') return mine ? action('주사위 굴리기', { action: 'roll' }, 'primary wide')
    : `<p class="app-muted">${speakerName}님이 주사위를 굴릴 차례입니다.</p>`;
  let markup = mine && room.die != null ? `<p class="app-big">내 주사위 <b>${room.die || 'X'}</b></p>` : '';
  if (room.phase === 'declare') {
    if (mine && room.die === 0) markup += '<p class="app-warn">X가 나왔어요. 숫자를 골라 블러핑하세요.</p>';
    return markup + (mine ? `<p class="app-muted">나왔다고 말할 숫자를 고르세요.</p>
      <div class="app-row">${[1, 2, 3, 4].map(number => action(String(number), { action: 'declare', number }, 'number')).join('')}</div>`
      : `<p class="app-muted">${speakerName}님이 숫자를 선언하고 있어요. 주사위는 비공개입니다.</p>`);
  }
  const allowed = room.responders.includes(me?.id);
  return markup + `<p class="app-big">${speakerName}님의 선언 <b>${room.declaration}</b></p>
    <p class="app-muted">동시 응답 · 먼저 접수된 의심으로 판정</p>
    ${room.deadline ? `<p class="app-warn">응답 남은 시간 <strong data-deadline="${room.deadline}"></strong></p>` : ''}
    ${room.responders.length ? `<p class="app-muted">응답 대기 · ${room.responders.map(id => nameOf(room, id)).join(' · ')}</p>` : ''}
    ${me && !mine ? `<div class="app-stack">${action('PASS', { action: 'pass' }, '', !allowed)}${action('의심', { action: 'doubt' }, 'primary', !allowed)}</div>` : ''}
    ${allowed && me.position === null && me.goals.length ? `<p class="app-warn">의심이 틀리면 도착한 ${me.goals[0]}점 말이 떨어집니다.</p>` : ''}
    ${room.passed?.length ? `<p class="app-muted">PASS · ${room.passed.map(id => nameOf(room, id)).join(' · ')}</p>` : ''}`;
}

function ciaoView(room, me) {
  if (room.status === 'waiting') return waitingSeats(room, me);
  const playing = room.status === 'playing';
  const speaker = room.players[room.index];
  const track = ciaoSteps.map(step => `<div><span>${ciaoLabel(step)}</span><span class="pawns">${room.players.map((player, index) =>
    player.position === step ? pawn(index, `P${index + 1} ${player.name} · ${step}칸`, 'active') : '').join('')}</span></div>`).join('');
  const players = room.players.map((player, index) => {
    const left = player.reserve + (player.position === null ? 0 : 1);
    return `<div class="ciao-player seat-${index}">
      <strong>${playing && player.id === speaker.id ? '▶ ' : ''}P${index + 1}  ${escape(player.name)}${player.id === me?.id ? ' (나)' : ''}</strong>
      <div class="ciao-reserve"><span>남은 말</span>${player.position !== null ? pawn(index, '이동 중인 말', 'active') : ''}${
        Array.from({ length: player.reserve }, () => pawn(index, '대기 중인 말')).join('')}
        <span>${left}개 · 도착 ${player.goals.length}/3 · ${sum(player.goals)}점 · 추락 ${player.fallen}</span></div></div>`;
  }).join('');
  const podium = Array.from({ length: 8 }, (_, index) => {
    const score = index + 1;
    const owner = room.players.findIndex(player => player.goals.includes(score));
    const gone = owner < 0 && score <= room.usedPodium;
    return `<div><span>${score}${gone ? '×' : ''}</span>${owner < 0 ? pawn(0, gone ? score + '점 · 탈락한 자리' : score + '점 · 빈자리', gone ? 'gone' : 'open')
      : pawn(owner, score + '점 · ' + room.players[owner].name)}</div>`;
  }).join('');
  return `${playing && !room.paused ? ciaoActions(room, me) : ''}
    ${room.last ? `<p class="app-warn">${escape(room.last)}</p>` : ''}
    <p class="app-muted">공용 이동판 · 9칸</p><div class="ciao-track" aria-label="이동판">${track}</div>
    ${players}
    <p class="app-muted">도착대 · 탈락한 자리는 다시 사용하지 않음</p><div class="ciao-podium" aria-label="도착대">${podium}</div>`;
}

const rankNames = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
export const redCard = card => card === 53 || card < 52 && [1, 2].includes(cardSuit(card));

export function cardFace(card) {
  if (card === null) return '<b>—</b>';
  if (card >= 52) return `<b>★</b><small class="joker${card === 53 ? ' rainbow' : ''}">${[...'JOKER'].map(letter => `<i>${letter}</i>`).join('')}</small>`;
  return `<b>${rankNames[cardRank(card)] ?? cardRank(card)}</b><span>${suits[cardSuit(card)]}</span>`;
}

function cardView(room, me, ui) {
  if (room.status === 'waiting') return waitingSeats(room, me);
  const playing = room.status === 'playing';
  const actual = room.players[room.index];
  const own = playing && !room.paused && actual.id === me?.id;
  const choose = own && ui.card !== null && me.hand.includes(ui.card);
  const chips = room.players.map(player => {
    const current = playing && player.id === actual.id;
    return `<li class="${current ? 'current' : ''}">${current ? '▶ ' : ''}${escape(player.name)}${player.id === me?.id ? ' (나)' : ''}
      <small>${player.count}장${player.count === 1 ? ' · 원카드' : ''}</small></li>`;
  }).join('');
  const hand = me && playing ? `<div class="hand">${[...me.hand].sort((a, b) => a - b).map(card => `<button type="button"
      class="card-face${redCard(card) ? ' red-card' : ''}${ui.card === card ? ' picked' : ''}" data-card="${card}" title="${cardName(card)}"
      aria-label="${cardName(card)} 내기" ${own && legalCard(card, room.top, room.activeSuit, room.pending) ? '' : 'disabled'}>${cardFace(card)}</button>`).join('')}</div>
    ${choose ? `<p class="app-muted">다음 무늬를 고르세요.</p><div class="app-row">${suits.map((suit, index) => action(suit + ' ' + suitNames[index],
      { action: 'play', card: ui.card, suit: index }, 'small')).join('')}</div>` : ''}
    <p class="app-muted small">밝은 카드를 눌러 내세요. 상대 손패는 장수만 표시합니다.</p>` : '';
  return `<ul class="card-players">${chips}</ul>
    <div class="card-table">${ui.call ? '<span class="call-bubble">원카드! · ' + escape(room.lastCaller) + '</span>' : ''}
      <div class="card-face big${room.top !== null && redCard(room.top) ? ' red-card' : ''}" role="img"
        aria-label="맨 위 카드 ${room.top === null ? '없음' : cardName(room.top)}">${cardFace(room.top)}</div>
      <p>${room.direction === 1 ? '→ 정방향' : '← 역방향'}<br>${room.activeSuit != null ? suits[room.activeSuit] + ' ' + suitNames[room.activeSuit] : '모든 무늬 가능'}
        ${room.pending ? '<br>누적 공격 +' + room.pending : ''}</p>
    </div>
    ${playing && me && !room.paused ? `<div class="app-stack">${action(room.pending ? `공격 받기 · ${room.pending}장` : '카드 1장 받기 · 차례 넘기기',
      { action: 'draw' }, '', !own)}${action('원카드!', { action: 'call' }, 'primary')}</div>` : ''}
    ${me ? `<p class="app-label">내 손패 · ${me.count}장</p>` : ''}${hand}
    ${room.last ? `<p class="app-warn">${escape(room.last)}</p>` : ''}`;
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
          ? action(yachtScore(index, room.dice) + '점', { action: 'score', category: index }, 'score-pick')
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
  if (room.status === 'waiting') return yachtVersus(room, me);
  const playing = room.status === 'playing';
  const actual = room.players[room.index];
  const own = playing && !room.paused && actual.id === me?.id;
  const canHold = own && room.rollsUsed > 0 && room.rollsUsed < 3;
  const rollText = room.rollsUsed ? '다시 굴리기' : '굴리기';
  return `${yachtVersus(room, me)}
    ${playing ? `<div class="yacht-tray"><div class="dice-rack">${room.dice.map((die, index) => `
      <button type="button" class="die" data-hold="${index}" aria-label="주사위 ${index + 1}${die ? ', 눈 ' + die : ''}"
        aria-pressed="${Boolean(ui.held[index])}" ${canHold ? '' : 'disabled'}>
        <span class="die-face" aria-hidden="true" ${room.held[index] ? '' : 'data-roll-face'}>${yachtFace(die)}</span>
        <span class="die-tag">${ui.held[index] ? '고정' : ' '}</span>
      </button>`).join('')}</div>
      <div class="yacht-roll">${me ? action(rollText, { action: 'roll', held: ui.held }, 'primary',
        !own || room.rollsUsed >= 3 || ui.held.every(Boolean)) : ''}<span>${3 - room.rollsUsed}회 남음</span></div>
    </div>` : ''}
    ${room.last ? '<p class="yacht-last">' + escape(room.last) + '</p>' : ''}
    <div class="yacht-sheet">${yachtTable(room, me, own && room.rollsUsed, true)}
      ${yachtTable(room, me, own && room.rollsUsed, false)}</div>`;
}
