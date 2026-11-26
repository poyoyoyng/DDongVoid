import { AUGMENTS } from './jeung-yut/engine.mjs';
import { escape } from './views.js';
import { cardName, games, powerCosts, powerNames, yachtCategories, yachtScore } from './rules.js';
import { bankruptLine, baseBet, refillMoney, startMoney, won } from './seotda.js';
import { cardFace, heading, hwatu, redCard, yachtFace } from './views.js';
import { cardHelp, cardName as saboteurCardName, cards, handSize, saboteurCounts } from './saboteur.js';
import { cardArt, cardBack, goalArt, goalBack, roleArt, startArt } from './saboteur-art.js';
import { critterSvg } from './sides-art.js';
import { tileArt as dvTile } from './davinci-view.js';
import { drainRate as sidesDrain, lifeGain as sidesLifeGain, missPenalty as sidesMissPenalty, sortPoints as sidesPoints } from './sides-model.js';
import {
  fundFee, islandTurns, keys as goldenKeys, maxRounds, partNames, parts, salary as bmSalary, spaceFee, spaces as bmSpaces,
  startMoney as bmStartMoney, won as bmWon,
} from './bluemarble.js';

const dice = (values, { held = [], dim = [] } = {}) => `<span class="guide-dice">${values.map((value, index) =>
  `<span class="die-face guide-die${held.includes(index) ? ' held' : ''}${dim.includes(index) ? ' dim' : ''}">${yachtFace(value)}</span>`).join('')}</span>`;

const section = (number, title, body) =>
  `<section class="guide-section"><h3><span class="guide-number">${number}</span>${title}</h3>${body}</section>`;

const stepList = (steps, warning) => `<ol class="guide-steps">${steps.map(([title, text, demo], index) => `
  <li><div><h4>${'①②③④'[index]} ${title}</h4><p>${text}</p></div><div class="guide-demo">${demo}</div></li>`).join('')}</ol>
  <p class="guide-warning"><b>주의</b> ${warning}</p>`;

const tipList = tips => `<ul class="guide-tips">${tips.map(([title, text]) => `<li><h4>${title}</h4><p>${text}</p></li>`).join('')}</ul>`;

function article(game, { eyebrow, title, intro, art, stats, sections, foot }) {
  return `<article class="panel guide-game">
    <header class="guide-head">
      <div><p class="guide-eyebrow">${eyebrow}</p><h2>${title}</h2><p>${intro}</p></div>
      <span class="guide-hero-art" aria-hidden="true">${art}</span>
    </header>
    <ul class="guide-stats">${stats.map(([value, text]) => `<li><b>${value}</b>${text}</li>`).join('')}</ul>
    ${sections.map(([heading, body], index) => section(index + 1, heading, body)).join('')}
    <footer class="guide-foot"><p>${foot}</p>
      <a class="button button-primary" href="#${games[game].max === 1 ? 'play' : 'lobby'}/${game}">${games[game].title} ${games[game].max === 1 ? '하러 가기' : '방 만들러 가기'} <span aria-hidden="true">↗</span></a></footer>
  </article>`;
}

function yachtGuide() {
  const steps = [
    ['굴리기', '주사위 5개를 모두 굴려요.', dice([5, 2, 5, 3, 5])],
    ['남길 주사위 고정', '마음에 드는 주사위를 눌러 고정해요.',
      dice([5, 2, 5, 3, 5], { held: [0, 2, 4] }) + '<p><b class="guide-green">초록 테두리 = 고정</b> · 다시 누르면 풀려요</p>'],
    ['다시 굴리기', '고정 안 한 주사위만 다시 굴려요.<br>굴리기는 한 차례에 최대 3번!', dice([5, 5, 5, 5, 5], { held: [0, 2, 4] })],
    ['빈 칸 하나에 점수 적기', '적으면 상대 차례로 넘어가요.<br>1~2번만 굴리고 바로 적어도 OK.',
      `<span class="guide-score">${yachtCategories[11]} <b>${yachtScore(11, [5, 5, 5, 5, 5])}</b></span><p>← 미리 보이는 점수를 눌러 기록</p>`],
  ];
  const lower = [
    [6, '아무거나 · 5개 합', [6, 5, 6, 4, 3]],
    [7, '같은 눈 4개 이상 · 5개 합', [4, 4, 4, 4, 2]],
    [8, '같은 눈 3개 + 2개 · 5개 합', [3, 3, 3, 6, 6]],
    [9, '연속된 숫자 4개', [1, 2, 3, 4, 6]],
    [10, '연속된 숫자 5개', [2, 3, 4, 5, 6]],
    [11, '같은 눈 5개!', [6, 6, 6, 6, 6]],
  ];
  return article('yacht', {
    eyebrow: '야추 게임 룰', title: '야추 다이스 쉽게 배우기',
    intro: '주사위 5개를 굴려 족보를 만들고, 12칸을 모두 채워 총점이 높은 사람이 이겨요.',
    art: dice([6, 6, 6, 6, 6]),
    stats: [['2명', '번갈아 진행'], ['12라운드', '칸 12개 = 12번'], ['최대 3번', '한 차례 굴림'], ['+35', '상단 63점 보너스']],
    sections: [
      ['내 차례는 이렇게 해요', stepList(steps,
        '굴린 뒤에는 꼭 한 칸을 채워야 해요. 맞는 족보가 없으면 아무 칸에나 <b>0점</b>을 적어야 해요. 한 번 적은 칸은 다시 못 써요.')],
      ['상단 6칸과 보너스 +35', `<div class="guide-upper">
        <div><h4>1 · 2 · 3 · 4 · 5 · 6 칸</h4><p>칸 숫자와 같은 눈이 나온 주사위만 더해요.</p>
          <div class="guide-example">${dice([5, 5, 3, 5, 1], { dim: [2, 4] })}<b>→ 5 칸 ${yachtScore(4, [5, 5, 3, 5, 1])}점</b></div>
          <p class="guide-small">5가 3개 → 5 × 3 = 15</p></div>
        <div class="guide-bonus"><p>상단 합계 <b>63점 이상</b>이면</p><strong>+35점 보너스!</strong>
          <p>요령: 눈마다 <b>3개씩</b> 모으면 딱 63점</p><p class="guide-small">3 + 6 + 9 + 12 + 15 + 18 = 63</p>
          <p class="guide-small">게임 화면 <b class="guide-plain">소계 48/63</b> · <b>15점 남음</b></p>
          <span class="guide-progress" aria-hidden="true"><i></i></span>
          <p class="guide-small guide-legend"><span><b>15★</b> = 이 칸에 적으면 보너스 달성!</span>
            <span><b>+35</b> = 달성</span><span><b class="guide-plain">실패</b> = 이제 63점은 불가능</span></p></div>
      </div>`],
      ['하단 6칸 족보', `<ul class="guide-combos">${lower.map(([category, text, values]) => `
        <li><strong>${yachtCategories[category]}</strong><span>${text}</span>${dice(values)}<b>${yachtScore(category, values)}</b></li>`).join('')}</ul>
        <p class="guide-small">· 조건이 안 맞는 칸에 적으면 0점 · 같은 눈 5개는 ${yachtCategories[8]}로도 인정돼요</p>`],
      ['이기는 꿀팁', tipList([
        ['보너스부터 챙기기', '상단에서 같은 눈을 3개 이상 모으면 63점에 가까워져요. 35점은 야추 다음으로 큰 점수!'],
        ['버릴 칸 정해두기', `망한 판은 1 칸이나 ${yachtCategories[6]}처럼 손해가 적은 칸에 적어요.`],
        ['스트레이트는 일찍', 'L. 스트레이트 30점은 노리기 어려워요. 연속 4개가 나오면 S.부터 확보!'],
      ])],
    ],
    foot: '게임 선택 → 야추 → 방 만들기 · 상대가 참가하고 둘 다 준비 완료를 누르면 시작해요.',
  });
}

const slapDamage = [1, 2, 5];
const sprite = (kind, pose, flip = false) => `<span class="fighter-sprite guide-sprite ${kind} ${pose}${flip ? ' facing-left' : ''}"></span>`;
const chip = (text, tone = '') => `<span class="guide-chip ${tone}">${text}</span>`;
const gauge = count => `<span class="gauge-dots">${Array.from({ length: 3 }, (_, index) => `<i${index < count ? ' class="on"' : ''}></i>`).join('')}</span>`;

function slapGuide() {
  const steps = [
    ['공격과 수비 정하기', '라운드마다 공격과 수비가 바뀌어요.<br>방을 만든 P1이 먼저 공격해요.',
      chip('P1 공격', 'mint') + '<b class="guide-swap">⇄</b>' + chip('P2 수비', 'peach')],
    ['몰래 동시에 고르기', '두 사람이 동시에 골라요. 상대가 고른 건<br>결과가 나올 때까지 보이지 않아요.',
      chip('입력 완료 ✓') + chip('선택 대기') + '<p>← 둘 다 고르면 바로 결과!</p>'],
    ['결과 확인', '때린 위치와 막은 위치가 같으면 막기 성공,<br>다르면 그대로 맞아요.',
      `<div class="guide-lines"><p>${chip('상단 때리기')} vs ${chip('상단 막기')} → <b class="guide-green">막았다!</b></p>
       <p>${chip('상단 때리기')} vs ${chip('하단 막기')} → <b class="guide-hit">맞았다!</b></p></div>`],
    ['다음 라운드', '공격과 수비를 바꿔 이어가요.<br>상대 체력을 먼저 0으로 만들면 승리!',
      `<span class="hp-bar guide-hp">${Array.from({ length: 6 }, (_, index) => `<i${index < 2 ? ' class="on"' : ''}></i>`).join('')}</span><p>체력 2/6 · 조금만 더!</p>`],
  ];
  const powers = powerNames.map((name, index) => [name + (index ? ' ×' + slapDamage[index] : ''),
    `기력 ${powerCosts[index]}개 사용`, gauge(powerCosts[index]), slapDamage[index]]);
  const defense = [
    ['같은 위치 막기', '때린 위치를 맞히면 피해 0', chip('막았다!', 'mint'), 0],
    ['다른 위치 막기', '위치가 다르면 피해를 그대로 받아요', chip('맞았다!', 'peach'), '−'],
    ['기 모으기', '이번 라운드는 못 막지만 기력 +1', chip('기력 +1', 'gold'), '−'],
  ];
  return article('slap', {
    eyebrow: '맞짱 게임 룰', title: '맞짱 쉽게 배우기',
    intro: '공격과 수비를 번갈아 하며 뺨을 주고받아요. 상대 체력 6칸을 먼저 모두 깎으면 이겨요.',
    art: sprite('mint', 'pose-2') + sprite('cat', 'pose-5', true),
    stats: [['2명', '1 : 1 대전'], ['체력 6', '먼저 0이 되면 패배'], ['기력 최대 3', '기 모으기로 충전'], ['상·중·하', '때리고 막는 위치']],
    sections: [
      ['한 라운드는 이렇게 해요', stepList(steps,
        '때리면 막혀도 기력은 써요. 기력이 3개로 가득 차면 기 모으기를 할 수 없어서 공격이면 때리고, 수비면 막아야 해요.')],
      ['공격은 세기를 고르고 위치를 골라요', `<ul class="guide-combos">${powers.map(([name, text, visual, damage]) => `
        <li><strong>${name}</strong><span>${text}</span>${visual}<b>피해 ${damage}</b></li>`).join('')}</ul>
        <div class="guide-upper">
          <div><h4>기 모으기 +1</h4><p>공격 차례에도, 수비 차례에도 고를 수 있어요. 공격 차례에 모으면 이번 라운드는 때리지 않아요.</p>
            <div class="guide-example">${gauge(0)}<b>→</b>${gauge(1)}<b>→</b>${gauge(3)}</div></div>
          <div class="guide-bonus"><p>기력 <b>3개</b>를 모으면</p><strong>필살뺨 피해 5!</strong>
            <p>체력 6 중 5칸을 한 번에 깎아요.</p><p class="guide-small">막히면 피해는 0이지만 기력 3개는 그대로 써요.</p></div>
        </div>`],
      ['수비는 위치를 맞혀요', `<ul class="guide-combos">${defense.map(([name, text, visual, damage]) => `
        <li><strong>${name}</strong><span>${text}</span>${visual}<b>${damage}</b></li>`).join('')}</ul>
        <p class="guide-small">· 오른쪽 숫자는 받는 피해예요 · 공격 쪽이 기 모으기를 고르면 그 라운드에는 아무도 맞지 않아요</p>`],
      ['이기는 꿀팁', tipList([
        ['상대 기력 보기', '상대 기력이 3개면 필살뺨이 올 수 있어요. 수비 위치를 신중하게!'],
        ['수비 차례에 충전', '상대 기력이 0이면 기본공격(피해 1)밖에 없어요. 이때 기를 모아 두면 좋아요.'],
        ['포기는 둘이 함께', '두 사람 모두 포기하면 승패 없이 끝나요. 요청은 다시 눌러 취소할 수 있어요.'],
      ])],
    ],
    foot: '게임 선택 → 맞짱 → 방 만들기 · 상대가 참가하고 둘 다 준비 완료를 누르면 시작해요.',
  });
}

// Cards are numbered suit × 13 + rank − 1 with suits ♠ ♥ ♦ ♣; 52 and 53 are the jokers.
const card = (suit, rank) => suit * 13 + rank - 1;
const face = (value, extra = '') => `<span class="card-face guide-card${redCard(value) ? ' red-card' : ''}${extra}" title="${cardName(value)}">${cardFace(value)}</span>`;
const hand = (values, dim = []) => `<span class="guide-hand">${values.map((value, index) => face(value, dim.includes(index) ? ' dim' : '')).join('')}</span>`;

function oneCardGuide() {
  const steps = [
    ['맨 위 카드 보기', '맨 위 카드와 <b>같은 무늬</b>나 <b>같은 숫자</b>를 낼 수 있어요.',
      `${face(card(1, 5))}<b class="guide-swap">→</b>${hand([card(1, 9), card(3, 5), card(0, 8)], [2])}<p>♥9 · ♣5 OK, ♠8은 안 돼요</p>`],
    ['카드 한 장 내기', '밝게 보이는 카드만 낼 수 있어요.<br>내면 다음 사람 차례예요.',
      hand([card(1, 2), card(1, 12), card(2, 4), 52], [2]) + '<p>← 어두운 카드는 지금 못 내요</p>'],
    ['낼 카드가 없으면 받기', '카드 1장을 받고 차례를 넘겨요.<br>공격을 받는 중이면 쌓인 장수만큼 받아요.',
      chip('카드 1장 받기 · 차례 넘기기') + chip('공격 받기 · 5장', 'peach')],
    ['1장 남으면 원카드!', '마지막 1장이 되면 바로 원카드!를 눌러요.<br>손패를 모두 내면 승리!',
      chip('원카드!', 'mint big') + '<p>← 언제든 누를 수 있어요</p>'],
  ];
  const attacks = [
    [card(0, 2), '2', '+2', '2 · 같은 무늬 A·3 · 조커'],
    [card(1, 1), 'A', '+3', 'A · 조커'],
    [card(0, 1), '♠A', '+5', '조커'],
    [52, '흑조커', '+5', '♠A · 컬러 조커'],
    [53, '컬러 조커', '+7', '막을 수 없어요'],
  ];
  const specials = [
    [card(3, 7), '7', '다음 무늬를 내가 골라요'],
    [card(1, 11), 'J', '다음 사람을 건너뛰어요'],
    [card(2, 12), 'Q', '진행 방향이 반대로 바뀌어요'],
    [card(0, 13), 'K', '내가 한 번 더 내요'],
  ];
  return article('onecard', {
    eyebrow: '원카드 게임 룰', title: '원카드 쉽게 배우기',
    intro: '같은 무늬나 같은 숫자를 이어서 내요. 손패를 먼저 모두 내는 사람이 이겨요.',
    art: hand([card(0, 1), card(1, 7), 53]),
    stats: [['2~4명', '돌아가며 진행'], ['7장', '처음 받는 카드'], ['54장', '조커 2장 포함'], ['원카드!', '1장 남으면 외치기']],
    sections: [
      ['내 차례는 이렇게 해요', stepList(steps,
        '1장 남았는데 원카드!를 안 누르면 다른 사람이 눌러 <b>벌칙 1장</b>을 줄 수 있어요. 외치지 않은 1장 남은 사람이 없을 때 누르면 내가 벌칙 1장을 받아요. 버튼은 1초에 한 번만 눌려요.')],
      ['공격 카드와 막기', `<ul class="guide-combos guide-attacks">${attacks.map(([value, name, attack, defend]) => `
        <li><strong>${name}</strong><span>막기: ${defend}</span>${face(value)}<b>${attack}</b></li>`).join('')}</ul>
        <div class="guide-upper">
          <div><h4>공격은 쌓여요</h4><p>막는 카드를 내면 공격이 다음 사람에게 넘어가며 더해져요.</p>
            <div class="guide-example">${face(card(2, 2))}<b>+2</b><b class="guide-swap">→</b>${face(card(2, 1))}<b>+3 = 5장</b></div></div>
          <div class="guide-bonus"><p>같은 무늬 <b>3</b>을 내면</p><strong>2 공격 막기!</strong>
            <p>2 공격을 받았을 때 같은 무늬 3을 내면 쌓인 공격이 0이 돼요.</p>
            <p class="guide-small">못 막으면 쌓인 장수만큼 카드를 받아요.</p></div>
        </div>
        <p class="guide-small">· 조커는 무늬와 상관없이 낼 수 있는 공격 카드예요 · 컬러 조커 공격만은 막을 수 없어요</p>`],
      ['특수 카드', `<ul class="guide-combos guide-specials">${specials.map(([value, name, text]) => `
        <li><strong>${name}</strong><span>${text}</span>${face(value)}<b></b></li>`).join('')}</ul>
        <p class="guide-small">· 첫 카드는 4·5·6·8·9·10 중 하나로 시작해요</p>`],
      ['이기는 꿀팁', tipList([
        ['공격 카드는 아껴두기', '2·A·조커는 상대 공격을 막을 때도 써요. 급하지 않으면 남겨 두세요.'],
        ['원카드! 먼저 누르기', '누가 1장 남았는데 안 외쳤다면 먼저 눌러서 벌칙 1장을 줄 수 있어요.'],
        ['K로 한 번 더', 'K를 내면 내 차례가 이어져요. 같은 무늬 카드를 연달아 털어 보세요.'],
      ])],
    ],
    foot: '카드가 모두 떨어져 아무도 받을 수 없으면 손패가 가장 적은 사람이 이겨요.',
  });
}

const key = (label, tone = '') => `<span class="guide-key ${tone}">${label}</span>`;
const poop = '<span class="guide-emoji" aria-hidden="true">💩</span>';

function dodgeGuide() {
  const steps = [
    ['시작하기', '로그인한 뒤 시작 버튼을 누르면 바로 시작해요.', chip('시작', 'mint big')],
    ['좌우로 움직이기', '누르고 있는 동안 계속 움직여요.<br>휴대폰은 화면 아래 버튼을 눌러요.',
      `${key('←')}${key('→')}<p>또는</p>${key('A')}${key('D')}`],
    ['떨어지는 똥 피하기', '위에서 떨어지는 똥에 닿으면<br>그 자리에서 바로 끝나요.', `${poop}${poop}<b class="guide-swap">↓</b><p>닿으면 GAME OVER</p>`],
    ['기록 저장', '끝나면 점수가 자동으로 저장돼요.<br>랭킹에는 내 최고 점수가 올라가요.', chip('최고 점수 갱신!', 'gold')],
  ];
  const points = [
    ['버틴 시간', '1초 버틸 때마다', chip('생존 1초'), '+10'],
    ['피한 똥', '똥이 화면 아래로 지나가면', poop, '+25'],
  ];
  return article('dodge', {
    eyebrow: '똥 피하기 게임 룰', title: '똥 피하기 쉽게 배우기',
    intro: '좌우로 움직여 떨어지는 똥을 피해요. 오래 버티고 많이 피할수록 점수가 올라가요.',
    art: poop + poop,
    stats: [['1명', '혼자 하는 게임'], ['← →', '좌우 이동'], ['한 번', '닿으면 끝'], ['최대 4배', '빨라지는 속도']],
    sections: [
      ['이렇게 해요', stepList(steps,
        '목숨은 하나뿐이에요. 똥에 한 번만 닿아도 끝나요. Space나 Esc로 잠시 멈출 수 있어요.')],
      ['점수 계산', `<ul class="guide-combos">${points.map(([name, text, visual, score]) => `
        <li><strong>${name}</strong><span>${text}</span>${visual}<b>${score}</b></li>`).join('')}</ul>
        <div class="guide-upper">
          <div><h4>예시</h4><p>60초를 버티면서 똥 80개를 피했다면</p>
            <div class="guide-example"><b>600 + 2,000 = 2,600점</b></div>
            <p class="guide-small">60초 × 10 + 80개 × 25</p></div>
          <div class="guide-bonus"><p>시간보다 큰 점수</p><strong>똥 1개 = 2.5초</strong>
            <p>피한 똥이 쌓일수록 점수가 빠르게 올라가요.</p></div>
        </div>`],
      ['점점 어려워져요', `<ul class="guide-combos">${[['시작', '보통 속도', '×1'], ['1분', '떨어지는 속도 2배', '×2'], ['2분', '떨어지는 속도 3배', '×3'], ['3분 이후', '가장 빠른 속도', '×4']]
        .map(([time, text, speed]) => `<li><strong>${time}</strong><span>${text}</span><span></span><b>${speed}</b></li>`).join('')}</ul>
        <p class="guide-small">· 시간이 지날수록 똥도 더 자주 떨어져요 · 한 판은 최대 30분까지예요</p>`],
      ['이기는 꿀팁', tipList([
        ['멈추는 것도 기술', '← →를 같이 누르면 그 자리에 멈춰요. 똥 사이 빈틈에서 기다려 보세요.'],
        ['벽에 붙지 않기', '벽 쪽에 있으면 한쪽으로만 피할 수 있어요. 가운데 근처가 안전해요.'],
        ['멀리 보기', '바로 위보다 조금 위에서 오는 똥을 보고 미리 자리를 잡아요.'],
      ])],
    ],
    foot: '로그인하면 바로 시작할 수 있어요 · 랭킹에는 사람마다 가장 높은 점수 하나만 올라가요.',
  });
}

function rhythmGuide() {
  const steps = [
    ['키 자리 익히기', '왼쪽 줄은 왼손 S · D,<br>오른쪽 줄은 오른손 K · L이에요.',
      `${key('S', 'left')}${key('D', 'left')}<b class="guide-swap">|</b>${key('K', 'right')}${key('L', 'right')}`],
    ['블록 보기', '블록마다 눌러야 할 키가 적혀 있어요.<br>양쪽에 동시에 떨어지기도 해요.', `${key('D', 'left')}${key('K', 'right')}<p>← 동시에 누르기</p>`],
    ['선에 닿을 때 누르기', '블록이 판정선에 닿는 순간 그 키를 눌러요.<br>정확할수록 높은 판정이 나와요.', chip('PERFECT', 'mint') + chip('GREAT') + chip('GOOD', 'gold')],
    ['콤보 잇기', '놓치지 않고 이어서 맞히면 콤보가 쌓이고<br>점수도 더 많이 받아요.', chip('42 COMBO', 'mint big')],
  ];
  const judgements = [
    ['PERFECT', '±0.05초 안에 누름', chip('라이프 +2', 'mint'), '300'],
    ['GREAT', '±0.1초 안에 누름', chip('라이프 +1'), '200'],
    ['GOOD', '±0.16초 안에 누름', chip('라이프 그대로'), '100'],
    ['MISS', '블록을 놓치거나 0.16초보다 일찍 누름', chip('라이프 −25', 'peach'), '0'],
  ];
  return article('rhythm', {
    eyebrow: '키보드 리듬 게임 룰', title: '키보드 리듬 쉽게 배우기',
    intro: '내려오는 블록이 판정선에 닿을 때 블록에 적힌 키를 눌러요. MISS 4번이면 끝나요.',
    art: key('S', 'left big') + key('K', 'right big'),
    stats: [['1명', '혼자 하는 게임'], ['4키', 'S · D · K · L'], ['MISS 4번', '라이프 0이면 끝'], ['×1.2 → ×3.9', '빨라지는 속도']],
    sections: [
      ['이렇게 해요', stepList(steps,
        '블록을 놓칠 때마다 라이프가 25씩 줄어요. 블록이 없을 때 누르는 건 감점이 없어요. 한글 입력 상태여도 돼요.')],
      ['판정과 점수', `<ul class="guide-combos">${judgements.map(([name, text, visual, score]) => `
        <li><strong>${name}</strong><span>${text}</span>${visual}<b>${score}</b></li>`).join('')}</ul>
        <div class="guide-upper">
          <div><h4>라이프 100</h4><p>MISS가 나면 25씩 줄고, PERFECT와 GREAT로 다시 채울 수 있어요.</p>
            <div class="guide-example"><span class="hp-bar guide-hp">${Array.from({ length: 6 }, (_, index) => `<i${index < 4 ? ' class="on"' : ''}></i>`).join('')}</span><b>라이프 70%</b></div></div>
          <div class="guide-bonus"><p>콤보를 이어가면</p><strong>콤보 × 2점 추가!</strong>
            <p>맞힐 때마다 이어온 콤보 수 × 2점을 더 받아요.</p><p class="guide-small">보너스는 최대 200점 (콤보 100부터)</p></div>
        </div>`],
      ['점점 빨라져요', `<ul class="guide-combos">${[['시작', '블록이 내려오는 속도', '×1.2'], ['1분', '연타와 양손 블록이 늘어나요', '×2.4'], ['2분', '훨씬 빽빽해져요', '×3.6'], ['그 이후', '가장 빠른 속도', '×3.9']]
        .map(([time, text, speed]) => `<li><strong>${time}</strong><span>${text}</span><span></span><b>${speed}</b></li>`).join('')}</ul>
        <p class="guide-small">· 게임 화면 위쪽 SPEED에서 지금 속도를 볼 수 있어요 · 한 판은 최대 30분까지예요</p>`],
      ['이기는 꿀팁', tipList([
        ['손가락 고정', '왼손 검지·중지를 D·S에, 오른손 검지·중지를 K·L에 올려 두면 키를 찾지 않아도 돼요.'],
        ['선을 보고 누르기', '블록이 아니라 판정선을 보고 있다가 닿는 순간 누르면 PERFECT가 잘 나와요.'],
        ['라이프 회복', 'MISS가 나도 PERFECT 열세 번이면 MISS 하나만큼 라이프를 되찾아요. 포기하지 마세요!'],
      ])],
    ],
    foot: '로그인하면 바로 시작할 수 있어요 · Space나 Esc로 잠시 멈출 수 있어요.',
  });
}

function sidesGuide() {
  const steps = [
    ['양쪽 편 기억하기', '왼쪽과 오른쪽에 세 마리씩 서 있어요.<br>누가 어느 편인지 먼저 봐 두세요.',
      `${critterSvg(0)}${critterSvg(2)}${critterSvg(4)}<b class="guide-swap">|</b>${critterSvg(1)}${critterSvg(3)}${critterSvg(5)}`],
    ['맨 앞 캐릭터 보기', '가운데 줄 맨 아래, 노란 자리에 선<br>캐릭터를 보낼 차례예요.', critterSvg(5) + '<p>← 지금 보낼 캐릭터</p>'],
    ['같은 편 쪽으로 보내기', '같은 캐릭터가 있는 쪽 방향키를 눌러요.<br>휴대폰은 화면 왼쪽·오른쪽을 눌러요.',
      `${critterSvg(5)}<b class="guide-swap">→</b>${key('→')}<p>도깨비는 오른쪽 편</p>`],
    ['콤보 잇기', '틀리지 않고 이어서 맞히면 콤보가 쌓이고<br>한 마리당 점수가 커져요.', chip('25 COMBO', 'mint big')],
  ];
  const results = [
    ['맞히기', '같은 편 쪽으로 보냈을 때', chip('체력 +' + sidesLifeGain, 'mint'), '+100~'],
    ['틀리기', '다른 편 쪽으로 보냈을 때 · 콤보 0', chip('체력 −' + sidesMissPenalty, 'peach'), '0'],
    ['시간', '가만히 있어도 체력이 계속 줄어요', chip('초당 −' + sidesDrain(0) + '부터'), ''],
  ];
  return article('sides', {
    eyebrow: '니편내편 게임 룰', title: '니편내편 쉽게 배우기',
    intro: '줄 맨 앞 캐릭터를 같은 캐릭터가 서 있는 쪽으로 ← → 키로 보내요. 체력이 다 떨어지기 전에 많이 보낼수록 점수가 올라가요.',
    art: critterSvg(0) + critterSvg(5),
    stats: [['1명', '혼자 하는 게임'], ['← →', '왼쪽 · 오른쪽'], ['30초마다', '섞어!!'], ['최대 1,100', '한 마리당 점수']],
    sections: [
      ['이렇게 해요', stepList(steps,
        `틀리면 체력이 ${sidesMissPenalty} 줄고 콤보가 0이 돼요. 틀린 캐릭터는 그대로 맨 앞에 남아요. Space나 Esc로 잠시 멈출 수 있어요.`)],
      ['체력과 점수', `<ul class="guide-combos">${results.map(([name, text, visual, score]) => `
        <li><strong>${name}</strong><span>${text}</span>${visual}<b>${score}</b></li>`).join('')}</ul>
        <div class="guide-upper">
          <div><h4>콤보 점수</h4><p>한 마리 보낼 때마다 100점 + 지금까지 이어온 콤보 × 10점을 받아요.</p>
            <div class="guide-example"><b>콤보 30에서 맞히면 100 + 300 = ${sidesPoints(30)}점</b></div>
            <p class="guide-small">체력은 최대 100이에요 · 다 떨어지면 끝나요</p></div>
          <div class="guide-bonus"><p>콤보 100부터는</p><strong>한 마리 ${sidesPoints(100).toLocaleString('ko-KR')}점!</strong>
            <p>틀리면 콤보가 0부터 다시 쌓여요.</p></div>
        </div>`],
      ['30초마다 섞어!!', `<div class="guide-upper">
          <div><h4>자리 바꾸기</h4><p>게임 시간 30초마다 시간이 잠깐 멈추고 양쪽 여섯 마리가 자리를 바꿔요. 적어도 한 마리는 반대편으로 넘어가요.</p>
            <div class="guide-example">${chip('섞어!!', 'gold big')}<b class="guide-swap">→</b>${chip('다시 시작!', 'mint big')}</div></div>
          <div class="guide-bonus"><p>섞는 동안은</p><strong>체력이 줄지 않아요</strong>
            <p>새 자리를 잘 봐 두세요. 섞기 3초 전부터 화면에 알려 줘요.</p></div>
        </div>`],
      ['점점 빨라져요', `<ul class="guide-combos">${[['시작', 0], ['1분', 60], ['2분', 120], ['3분', 180], ['5분 이후', 300]]
        .map(([time, seconds]) => `<li><strong>${time}</strong><span>체력이 줄어드는 속도</span><span></span><b>초당 ${sidesDrain(seconds)}</b></li>`).join('')}</ul>
        <p class="guide-small">· 섞는 시간은 빼고 세요 · 한 판은 최대 30분까지예요</p>`],
      ['이기는 꿀팁', tipList([
        ['한쪽만 외우기', '왼쪽 세 마리만 확실히 외우면 나머지는 전부 오른쪽이에요.'],
        ['다음 캐릭터 미리 보기', '맨 앞 바로 뒤 캐릭터를 보고 손가락을 미리 준비해요.'],
        ['막 누르지 않기', '틀리면 맞힐 때보다 세 배 많이 체력이 줄어요. 헷갈리면 한 번 더 보고 눌러요.'],
      ])],
    ],
    foot: '로그인하면 바로 시작할 수 있어요 · 랭킹에는 사람마다 가장 높은 점수 하나만 올라가요.',
  });
}

const ciaoDie = (face, tone = '') => `<span class="guide-ciao-die ${tone}">${face}</span>`;
const ciaoTrack = pawns => `<div class="ciao-track guide-track">${[0, 1, 2, 3, 4, 9, 8, 7, 6, 5].map(step => `<div><span>${
  step === 0 ? 'S →' : step === 9 ? 'G' : step === 4 ? '4 ↓' : step < 4 ? step + ' →' : '← ' + step}</span><span class="pawns">${
  pawns.filter(([, position]) => position === step).map(([seat]) => `<i class="pawn seat-${seat} active"></i>`).join('')}</span></div>`).join('')}</div>`;

function ciaoGuide() {
  const steps = [
    ['몰래 주사위 굴리기', '주사위 눈은 나만 볼 수 있어요.<br>1 · 2 · 3 · 4 · X · X 중 하나가 나와요.',
      [1, 2, 3, 4, 'X', 'X'].map(face => ciaoDie(face)).join('')],
    ['숫자 선언하기', '1~4 중 하나를 말해요. 거짓말해도 돼요!<br>X가 나오면 무조건 블러핑해야 해요.',
      `${ciaoDie('X')}<b class="guide-swap">→</b>${chip('“3이 나왔어요”', 'gold')}`],
    ['다른 사람은 PASS 또는 의심', '20초 안에 골라요. 시간이 지나면 PASS예요.<br>의심은 가장 먼저 누른 한 명만 판정해요.',
      chip('PASS') + chip('의심', 'mint')],
    ['말 이동', '모두 PASS하면 선언한 사람이<br>선언한 칸 수만큼 말을 옮겨요.', `${chip('선언 3')}<b class="guide-swap">→</b>${ciaoTrack([[0, 3]])}`],
  ];
  const doubts = [
    ['진짜였다', '의심한 사람의 말이 떨어지고, 선언한 사람이 이동', chip('의심 실패', 'peach'), '선언자'],
    ['거짓말이었다', '선언한 사람의 말이 떨어지고, 의심한 사람이 이동', chip('의심 성공', 'mint'), '의심자'],
  ];
  return article('ciao', {
    eyebrow: '차오차오 게임 룰', title: '차오차오 쉽게 배우기',
    intro: '몰래 굴린 주사위 눈을 선언하고 말을 옮겨요. 거짓말과 의심으로 말을 떨어뜨리며 먼저 3개를 도착시키면 이겨요.',
    art: ciaoDie('?', 'big') + ciaoDie('X', 'big light'),
    stats: [['2~4명', '돌아가며 진행'], ['말 7개', '한 번에 1개씩 출발'], ['9칸', '출발에서 도착까지'], ['3개 도착', '즉시 승리']],
    sections: [
      ['내 차례는 이렇게 해요', stepList(steps,
        '의심이 틀리면 <b>내 말이 떨어져요</b>. 이동 중인 말이 없고 도착한 말만 있을 때 의심이 틀리면, 도착한 말 중 점수가 가장 낮은 말이 떨어져요.')],
      ['의심하면 이렇게 돼요', `<ul class="guide-combos">${doubts.map(([name, text, visual, mover]) => `
        <li><strong>${name}</strong><span>${text}</span>${visual}<b>${mover}</b></li>`).join('')}</ul>
        <p class="guide-small">· 오른쪽은 선언한 칸 수만큼 말을 옮기는 사람이에요 · 의심한 사람은 선언한 숫자만큼 대신 이동해요</p>
        <div class="guide-upper">
          <div><h4>말이 떨어지면</h4><p>이동판의 말이 사라지고, 남은 말 하나가 출발점(S)에서 새로 출발해요.</p>
            <div class="guide-example">${ciaoTrack([[1, 0]])}</div><p class="guide-small">6칸까지 갔어도 떨어지면 S부터 다시!</p></div>
          <div class="guide-bonus"><p>남은 말을 모두 잃으면</p><strong>더는 이동 못 해요</strong>
            <p>이동판에 말이 없으면 내 차례는 건너뛰어요.</p><p class="guide-small">도착한 말이 있으면 의심은 계속할 수 있어요.</p></div>
        </div>`],
      ['도착대와 점수', `<div class="guide-upper">
          <div><h4>9칸을 가면 도착</h4><p>S에서 출발해 G를 넘어가면 도착대에 올라가요. 도착하면 다음 말이 S에서 출발해요.</p>
            <div class="guide-example">${ciaoTrack([[0, 8], [1, 2]])}</div></div>
          <div class="guide-bonus"><p>도착대 8자리 · 늦게 올수록</p><strong>1점 → 8점</strong>
            <p>도착하는 순서대로 1점, 2점 … 8점 자리에 놓여요.</p>
            <p class="guide-small">도착했던 말이 떨어진 자리는 다시 쓰지 않아요.</p></div>
        </div>
        <ul class="guide-combos">${[['말 3개 도착', '그 자리에서 바로 승리!', '승리'], ['도착대 8자리 다 참', '도착한 말 점수 합계가 가장 높은 사람 승리', '합계'],
          ['이동할 말이 아무도 없음', '도착한 말 점수 합계로 승부', '합계']]
          .map(([name, text, result]) => `<li><strong>${name}</strong><span>${text}</span><span></span><b>${result}</b></li>`).join('')}</ul>
        <p class="guide-small">· 혼자만 말이 남으면 남은 말을 자동으로 도착시켜 정산해요 · 합계가 같으면 공동 승리예요</p>`],
      ['이기는 꿀팁', tipList([
        ['작은 숫자는 덜 의심받아요', '1이나 2를 말하면 적게 가지만 거짓말이어도 잘 안 들켜요.'],
        ['멀리 간 말을 노려요', '상대 말이 G 바로 앞이면 의심해서 떨어뜨릴 가치가 커요.'],
        ['늦은 도착이 큰 점수', '도착대는 뒤로 갈수록 점수가 높아요. 3개를 못 채울 것 같으면 점수 합계를 노려요.'],
      ])],
    ],
    foot: '응답 시간은 20초예요 · 시간 안에 고르지 않으면 자동으로 PASS 처리돼요.',
  });
}

// Rows of a small board: b/w stones, B/W stones in the winning line, x a point Black may not take.
const goban = rows => `<span class="guide-goban" style="--size: ${rows[0].length}">${[...rows.join('')].map(point => `<span class="omok-cell${point === 'x' ? ' ban' : ''}">${
  'bBwW'.includes(point) ? `<i class="stone ${'bB'.includes(point) ? 'black' : 'white'}${'BW'.includes(point) ? ' win' : ''}"></i>` : ''}</span>`).join('')}</span>`;
const stone = color => `<span class="stone-icon ${color}"></span>`;

function omokGuide() {
  const steps = [
    ['흑과 백 정하기', '흑이 먼저 둬요. 첫 판은 방을 만든 P1이 흑,<br>다음 판부터는 판마다 흑과 백을 바꿔요.', `${stone('black')}${chip('먼저 둠')}<b class="guide-swap">⇄</b>${stone('white')}`],
    ['빈 곳에 돌 놓기', '15 × 15 판의 빈 교차점을 눌러요.<br>마지막에 둔 돌에는 빨간 점이 찍혀요.', goban(['.....', '..b..', '.wbw.', '.....'])],
    ['다섯 개 잇기', '가로, 세로, 대각선 어느 쪽이든<br>내 돌 다섯 개를 한 줄로 이으면 승리!', goban(['B....', '.B...', '..B..', '...B.', '....B'])],
    ['기권과 무승부', '기권하면 이번 판은 패배로 기록돼요.<br>판이 가득 차면 무승부예요.', chip('기권하기', 'peach')],
  ];
  const fouls = [
    ['3-3 (삼삼)', '한 수로 열린 3이 두 개 생김', goban(['.......', '...b...', '.bbx...', '...b...', '.......'])],
    ['4-4 (사사)', '한 수로 4가 두 개 생김', goban(['...b...', '...b...', 'bbbx...', '...b...', '.......'])],
    ['장목', '여섯 개 이상 이어짐', goban(['.......', 'bbbxbb.', '.......'])],
  ];
  return article('omok', {
    eyebrow: '오목 게임 룰', title: '렌주룰 오목 쉽게 배우기',
    intro: '흑과 백이 번갈아 돌을 놓아요. 다섯 개를 먼저 한 줄로 이으면 이겨요. 먼저 두는 흑에게는 금수가 있어요.',
    art: stone('black') + stone('white') + stone('black'),
    stats: [['2명', '1 : 1 대전'], ['15 × 15', '오목판 크기'], ['흑 먼저', '판마다 색 교대'], ['금수 3가지', '흑만 적용']],
    sections: [
      ['한 판은 이렇게 해요', stepList(steps,
        '흑은 <b>금수 자리</b>에 둘 수 없어요. 내 차례가 흑이면 금수 자리에 <b>× 표시</b>가 나와요.')],
      ['흑의 금수 (렌주룰)', `<ul class="guide-combos guide-fouls">${fouls.map(([name, text, board]) => `
        <li><strong>${name}</strong><span>${text}</span>${board}<b>× 금지</b></li>`).join('')}</ul>
        <div class="guide-upper">
          <div><h4>4-3은 괜찮아요</h4><p>4 하나와 열린 3 하나가 동시에 생기는 수는 흑도 둘 수 있어요. 흑의 가장 강한 공격이에요.</p>
            <div class="guide-example">${goban(['...b...', '...b...', '.bbB...', '...b...'])}</div>
            <p class="guide-small">테두리 돌 하나로 세로 4와 가로 3이 함께 생겨요.</p></div>
          <div class="guide-bonus"><p>금수 자리라도</p><strong>오목이 되면 OK!</strong>
            <p>그 수로 정확히 다섯 개가 이어지면 흑의 승리예요.</p><p class="guide-small">× 표시는 오목이 안 되는 금수 자리에만 나와요.</p></div>
        </div>`],
      ['흑과 백의 승리 조건', `<ul class="guide-combos">${[['흑', '정확히 다섯 개만 승리 · 여섯 개 이상은 금수', stone('black'), '5개'], ['백', '다섯 개 이상이면 모두 승리 · 금수 없음', stone('white'), '5개 이상']]
        .map(([name, text, visual, result]) => `<li><strong>${name}</strong><span>${text}</span>${visual}<b>${result}</b></li>`).join('')}</ul>
        <p class="guide-small">· 먼저 두는 흑이 유리해서 렌주룰은 흑에게만 제한을 둬요</p>`],
      ['이기는 꿀팁', tipList([
        ['흑은 4-3을 노리기', '4와 열린 3을 동시에 만들면 백이 둘 다 막을 수 없어요.'],
        ['백은 금수로 몰기', '흑이 막아야 할 자리를 금수로 만들면 흑은 그 자리에 둘 수 없어요.'],
        ['열린 3은 바로 막기', '양쪽이 비어 있는 3을 두면 다음 수에 막을 수 없는 4가 돼요.'],
      ])],
    ],
    foot: '게임 선택 → 오목 → 방 만들기 · 상대가 참가하고 둘 다 준비 완료를 누르면 시작해요.',
  });
}

// Hwatu cards by month; the picture card (광 or 열끗) is variant 0.
const hwatuPair = ([first, second]) => `<span class="seotda-cards">${hwatu(first)}${hwatu(second)}</span>`;
const month = (number, picture = true) => (number - 1) * 2 + (picture ? 0 : 1);

function seotdaGuide() {
  const steps = [
    ['기본 판돈 내기', `모두 ${won(baseBet)}씩 판돈에 넣고<br>화투를 한 장씩 받아요. 내 패는 나만 봐요.`,
      `${hwatu(month(7))}${chip('판돈 +' + won(baseBet), 'gold')}`],
    ['첫째 장 보고 베팅', '돌아가며 다이 · 체크 · 콜 · 삥 · 따당 · 하프 중<br>하나를 골라요. 판마다 첫 순서가 바뀌어요.', chip('체크') + chip('삥', 'mint') + chip('다이', 'peach')],
    ['둘째 장 받고 또 베팅', '한 장을 더 받아 두 장으로 족보를 확인하고<br>한 번 더 베팅해요.', `${hwatuPair([month(9), month(9, false)])}<b class="guide-swap">→</b>${chip('9땡', 'gold')}`],
    ['패 공개', '다이하지 않은 사람끼리 족보를 비교해요.<br>이긴 사람이 판돈을 모두 가져가요.', chip('판돈 획득', 'mint')],
  ];
  const hands = [
    ['38광땡', '3월 광 + 8월 광 · 가장 높은 패', [month(3), month(8)], '1위'],
    ['18 · 13광땡', '광 두 장 · 18광땡이 13광땡보다 높아요', [month(1), month(8)], '광땡'],
    ['장땡', '10월 두 장 · 땡 중에서 가장 높아요', [month(10), month(10, false)], '땡'],
    ['9땡 ~ 1땡', '같은 월 두 장 · 숫자가 클수록 높아요', [month(5), month(5, false)], '땡'],
    ['알리 → 세륙', '알리(1·2) > 독사(1·4) > 구삥(1·9) > 장삥(1·10) > 장사(4·10) > 세륙(4·6)', [month(1, false), month(2, false)], '중간'],
    ['갑오 → 망통', '두 장 합의 끝자리 · 9끗(갑오)이 가장 높고 0끗(망통)이 가장 낮아요', [month(2, false), month(7, false)], '끗'],
  ];
  const specials = [
    ['암행어사', '4월 열끗 + 7월 열끗 · 13·18광땡을 잡아요 (38광땡은 못 잡음) · 아니면 1끗', [month(4), month(7)], '광땡 잡기'],
    ['땡잡이', '3월 광 + 7월 열끗 · 1~9땡을 잡아요 (장땡은 못 잡음) · 아니면 망통', [month(3), month(7)], '땡 잡기'],
    ['구사', '4월 + 9월 · 가장 높은 패가 알리 이하면 재경기 · 아니면 3끗', [month(4, false), month(9, false)], '재경기'],
    ['멍텅구리 구사', '4월 열끗 + 9월 열끗 · 가장 높은 패가 9땡 이하면 재경기', [month(4), month(9)], '재경기'],
  ];
  const bets = [
    ['다이', '이번 판을 포기해요. 이미 건 돈은 판돈에 남아요.', chip('포기', 'peach'), '0원'],
    ['체크', '앞에서 아무도 베팅하지 않았을 때 돈을 걸지 않고 넘겨요.', chip('넘기기'), '0원'],
    ['콜', '앞 사람이 건 만큼 맞춰서 받아요.', chip('맞추기'), '차액'],
    ['삥', '아무도 베팅하지 않았을 때 첫 베팅을 해요.', chip('첫 베팅', 'mint'), won(baseBet)],
    ['따당', '앞 사람 베팅의 두 배로 올려요.', chip('× 2', 'mint'), '2배'],
    ['하프', '콜한 뒤 판돈의 절반만큼 더 올려요.', chip('+ 판돈 ½', 'mint'), '절반'],
  ];
  const row = ([name, text, visual, result]) => `<li><strong>${name}</strong><span>${text}</span>${visual}<b>${result}</b></li>`;
  return article('seotda', {
    eyebrow: '섯다 게임 룰', title: '섯다 쉽게 배우기',
    intro: '화투 두 장으로 족보를 만들고 베팅해요. 끝까지 남아 가장 높은 족보를 가진 사람이 판돈을 가져가요. 섯다 랭킹은 보유 금액 순이에요.',
    art: hwatu(month(3)) + hwatu(month(8)),
    stats: [['2~4명', '돌아가며 베팅'], ['20장', '1~10월 두 장씩'], [won(startMoney), '모두 같은 시작 금액'], [won(baseBet), '기본 판돈']],
    sections: [
      ['한 판은 이렇게 해요', stepList(steps,
        '내 차례에 <b>30초</b> 안에 고르지 않으면 앞 베팅이 없을 땐 체크, 있을 땐 <b>다이</b>로 처리돼요. 판 도중 관전석으로 이동해도 다이예요.')],
      ['족보 (높은 순서)', `<ul class="guide-combos">${hands.map(([name, text, cards, result]) => row([name, text, hwatuPair(cards), result])).join('')}</ul>
        <p class="guide-small">· 광은 1월 · 3월 · 8월에만 있어요 · 족보가 같으면 판돈을 똑같이 나눠요</p>`],
      ['특수 패', `<ul class="guide-combos">${specials.map(([name, text, cards, result]) => row([name, text, hwatuPair(cards), result])).join('')}</ul>
        <p class="guide-small">· 재경기는 다이하지 않은 사람끼리 판돈을 그대로 두고 패를 새로 받아 다시 베팅해요</p>`],
      ['베팅 방법', `<ul class="guide-combos">${bets.map(row).join('')}</ul>
        <p class="guide-small">· 누가 올리면 나머지 사람은 다시 콜 · 다이 · 따당 · 하프 중에서 골라요</p>`],
      ['돈과 랭킹', `<div class="guide-upper">
          <div><h4>모두 ${won(startMoney)}으로 시작</h4><p>딴 돈과 잃은 돈은 계정에 남고, 섯다 랭킹은 보유 금액 순이에요.</p>
            <p class="guide-small">한 판에 걸 수 있는 돈은 그 판 참가자 중 잔액이 가장 적은 사람의 잔액까지예요.</p></div>
          <div class="guide-bonus"><p>잔액이 ${won(bankruptLine)} 이하가 되면</p><strong>파산 · ${won(refillMoney)} 지원</strong>
            <p>다음 판을 시작할 때 ${won(refillMoney)}으로 다시 채워요.</p><p class="guide-small">파산 횟수는 랭킹에 표시돼요.</p></div>
        </div>`],
    ],
    foot: '게임 선택 → 섯다 → 방 만들기 · 2~4명이 참가하고 모두 준비 완료를 누르면 시작해요.<br><small class="guide-small">화투 그림: ' +
      '<a href="https://commons.wikimedia.org/wiki/Category:SVG_Hwatu" target="_blank" rel="noopener">Spenĉjo · Marcus Richert · Louie Mantia, Jr. (Wikimedia Commons)</a>, ' +
      '<a href="https://creativecommons.org/licenses/by-sa/4.0/deed.ko" target="_blank" rel="noopener">CC BY-SA 4.0</a></small>',
  });
}

// Every 사보타지 card with how many of it are in the deck.
function saboteurCardList() {
  const counts = new Map();
  for (const [card, info] of cards.entries()) {
    const id = JSON.stringify(info);
    counts.set(id, { card, count: (counts.get(id)?.count ?? 0) + 1 });
  }
  return [...counts.values()];
}

function saboteurGuide() {
  const list = saboteurCardList();
  const gallery = items => `<ul class="guide-sab-cards">${items.map(([art, name, text, count]) =>
    `<li>${art}<b>${name}</b>${count ? `<em>${count}장</em>` : ''}<small>${text}</small></li>`).join('')}</ul>`;
  const paths = list.filter(({ card }) => cards[card].type === 'path');
  const actions = list.filter(({ card }) => cards[card].type !== 'path');
  const steps = [
    ['역할 받기', '역할 카드를 몰래 받아요. 광부인지 방해꾼인지는<br>나만 알아요. 같은 팀이 누군지도 몰라요!', `<span class="seotda-cards">${roleArt('digger')}${roleArt('saboteur')}</span>`],
    ['카드 한 장 쓰기', '길 카드를 광산에 놓거나, 행동 카드를 쓰거나,<br>낼 카드가 없으면 한 장을 버리고 패스해요.', `<span class="seotda-cards">${cardArt(30)}${cardArt(40)}</span>`],
    ['한 장 뽑기', '쓴 만큼 카드 더미에서 한 장을 뽑아요.<br>더미가 떨어지면 남은 손패로만 해요.', `<span class="seotda-cards">${cardBack()}</span>`],
    ['목적지 열기', '시작 카드에서 끊기지 않은 길이 목적지에 닿으면<br>뒤집어요. 금이면 라운드 끝, 돌이면 계속!', `<span class="seotda-cards">${goalBack()}<b class="guide-swap">→</b>${goalArt('gold')}</span>`],
  ];
  const roleRows = Object.entries(saboteurCounts).map(([count, saboteurs]) => [Number(count), saboteurs]);
  return article('saboteur', {
    eyebrow: '사보타지 게임 룰', title: '사보타지 쉽게 배우기',
    intro: '광부들은 시작 카드에서 굴을 파서 금이 묻힌 목적지를 찾고, 정체를 숨긴 방해꾼은 몰래 길을 막아요. 광부 팀과 방해꾼 팀이 한 판으로 승부하는 팀전이에요.',
    art: startArt() + goalArt('gold') + roleArt('saboteur'),
    stats: [['3~10명', '역할은 비밀'], ['팀전', '광부 vs 방해꾼'], ['목적지 3장', '금 1 · 돌 2'], ['60초', '시간이 지나면 패스']],
    sections: [
      ['내 차례는 이렇게 해요', stepList(steps,
        '도구(곡괭이 · 랜턴 · 수레)가 <b>하나라도 부서져 있으면</b> 길 카드를 낼 수 없어요. 차례에 <b>60초</b> 안에 고르지 않으면 첫 번째 손패를 버리고 패스해요.')],
      ['인원별 역할과 손패', `<div class="guide-sab-scroll"><table class="guide-sab-table"><thead><tr><th scope="col">인원</th>${roleRows.map(([count]) => `<th scope="col">${count}명</th>`).join('')}</tr></thead>
        <tbody><tr><th scope="row">방해꾼</th>${roleRows.map(([, saboteurs]) => `<td>${saboteurs}</td>`).join('')}</tr>
        <tr><th scope="row">광부</th>${roleRows.map(([count, saboteurs]) => `<td>${count - saboteurs}</td>`).join('')}</tr>
        <tr><th scope="row">손패</th>${roleRows.map(([count]) => `<td>${handSize(count)}장</td>`).join('')}</tr></tbody></table></div>
        <p class="guide-small">· 방해꾼은 언제나 표의 수만큼 나오고 나머지는 모두 광부예요. 누가 방해꾼인지는 게임이 끝날 때 공개돼요.</p>`],
      ['광산과 길 카드 (40장)', `${gallery([
        [startArt(), '시작 카드', '사다리가 있는 입구 · 네 방향 모두 길', 0],
        [goalBack(), '목적지 (뒷면)', '시작 카드에서 7장 오른쪽에 1장 간격으로 3장', 0],
        [goalArt('gold'), '금 목적지', '여기에 길이 닿으면 광부 승리', 0],
        [goalArt('stone-up'), '돌 목적지', '꽝! 돌이 나와도 라운드는 계속돼요', 0],
        ...paths.map(({ card, count }) => [cardArt(card), saboteurCardName(card), cards[card].dead ? '가운데가 막혀서 지나갈 수 없어요' : '맞닿는 길을 모두 맞춰 놓아요', count]),
      ])}
        <p class="guide-small">· 카드는 세로로만 놓고 180°만 돌릴 수 있어요 · 맞닿는 변은 길과 길, 벽과 벽이 맞아야 하고, 시작 카드와 길로 이어져야 해요 · 뒷면 목적지 옆에는 아무 카드나 붙일 수 있어요</p>`],
      ['행동 카드 (27장)', `${gallery(actions.map(({ card, count }) => [cardArt(card), saboteurCardName(card), cardHelp(card), count]))}
        <p class="guide-small">· 이미 부서진 도구는 또 부술 수 없어요 · 둘 중 하나 고치기 카드는 한 가지만 고쳐요 · 고치기는 나에게도 쓸 수 있어요</p>`],
      ['승리 조건 · 팀전', `<div class="guide-upper">
          <div><h4>광부 팀 승리</h4><p>시작 카드에서 끊기지 않은 길이 <b>금 목적지</b>에 닿으면 그 순간 게임이 끝나고 <b>광부 전원</b>이 이겨요.</p>
            <p class="guide-small">방해꾼이 실수로 금까지 길을 이어도 광부 팀이 이겨요.</p>
            <div class="guide-example"><span class="seotda-cards">${roleArt('digger')}${goalArt('gold')}</span></div></div>
          <div class="guide-bonus"><p>카드 더미와 모든 손패가 떨어질 때까지 금을 못 찾으면</p><strong>방해꾼 팀 승리!</strong>
            <p>방해꾼 <b>전원</b>이 이겨요. 게임이 끝나면 모두의 역할을 공개해요.</p></div>
        </div>
        <p class="guide-small">· 원작은 3라운드 동안 금 카드를 나눠 갖지만, 여기서는 한 판 팀전으로 승부하고 랭킹은 이긴 팀 전원이 승리로 기록돼요.</p>`],
    ],
    foot: '게임 선택 → 사보타지 → 방 만들기 · 3~10명이 참가하고 모두 준비 완료를 누르면 시작해요.<br><small class="guide-small">원작 사보타지(Saboteur) · Frederic Moyersoen, AMIGO · 카드 그림은 이 사이트에서 새로 그렸어요.</small>',
  });
}

// A row of tiles for the 다빈치 코드 guide: [color, tile or null, open].
const code = tiles => `<span class="guide-code">${tiles.map(([color, tile, open]) => dvTile(color, tile, { open })).join('')}</span>`;

function davinciGuide() {
  const steps = [
    ['패 나눠 받기', '2~3명은 4장, 4명은 3장씩 받아요.<br>처음 받는 패에는 조커가 없어요.', code([['black', null], ['white', null], ['white', null], ['black', null]])],
    ['작은 수부터 세우기', '왼쪽이 작은 수, 오른쪽이 큰 수예요.<br>숫자가 같으면 <b>검은 패가 왼쪽</b>이에요.', code([['black', 2], ['white', 3], ['black', 10], ['white', 19]])],
    ['패 한 장 가져오기', '검은 패와 흰 패 중 색을 골라 한 장 가져와<br>순서에 맞는 자리에 끼워 넣어요.', `${dvTile('black', null)}${chip('검은 패')}${dvTile('white', null)}${chip('흰 패')}`],
    ['상대 패 맞히기', '상대의 숨겨진 패 하나를 골라<br>0~11 또는 조커 중 숫자를 말해요.', `${dvTile('white', null)}${chip('7?', 'mint')}`],
  ];
  const results = [
    ['맞혔다!', '상대 패가 공개돼요. 또 추리하거나 멈추고 차례를 넘겨요', code([['white', 15, true]]), '계속 · 멈춤'],
    ['틀렸다…', '방금 가져온 내 패를 모두에게 공개하고 차례가 끝나요', code([['black', 8, true]]), '내 패 공개'],
    ['멈추기', '맞힌 뒤 멈추면 가져온 패는 숨긴 채로 내 코드에 남아요', chip('멈추기'), '안전'],
    ['더미가 비면', '패를 가져오지 않고 추리만 해요. 틀리면 내 숨긴 패 하나를 골라 공개해요', chip('내 패 1장', 'peach'), '골라서 공개'],
  ];
  return article('davinci', {
    eyebrow: '다빈치 코드 게임 룰', title: '다빈치 코드 쉽게 배우기',
    intro: '숫자가 적힌 패를 상대에게 보이지 않게 세워 두고, 차례마다 상대의 숨겨진 숫자를 추리해요. 내 패가 모두 공개되면 탈락이고, 마지막까지 살아남으면 이겨요.',
    art: code([['black', 6], ['white', null], ['white', 25], ['black', null]]),
    stats: [['2~4명', '개인전'], ['26장', '검은·흰 0~11 + 조커 2'], ['4장 / 3장', '2~3명 / 4명 시작 패'], ['60초', '단계마다 제한 시간']],
    sections: [
      ['한 판은 이렇게 해요', stepList(steps,
        '추리가 <b>틀리면</b> 방금 가져온 내 패를 모두가 볼 수 있게 공개해요. 내 패가 <b>모두 공개되면 탈락</b>이에요.')],
      ['맞혔을 때와 틀렸을 때', `<ul class="guide-combos">${results.map(([name, text, visual, result]) =>
        `<li><strong>${name}</strong><span>${text}</span>${visual}<b>${result}</b></li>`).join('')}</ul>
        <p class="guide-small">· 공개된 패는 금색 테두리로 표시돼요 · 숨긴 패 아래 빨간 ✕ 숫자는 누군가 말했다가 틀린 숫자예요</p>`],
      ['조커와 패 읽는 법', `<div class="guide-upper">
          <div><h4>조커는 어디든 OK</h4><p>가져온 조커는 내 코드의 원하는 자리에 끼워 넣을 수 있어요. 숫자 순서를 흐트러뜨려 상대를 헷갈리게 해요. 조커를 맞힐 때는 <b>조커</b>를 고르면 돼요.</p>
            <div class="guide-example">${code([['black', 4], ['white', 25], ['black', 12], ['white', 17]])}</div>
            <p class="guide-small">조커 옆에 숫자 패가 들어갈 때는 놓을 자리를 고를 수 있어요.</p></div>
          <div class="guide-bonus"><p>패 색은 모두에게 보여요</p><strong>숫자만 비밀!</strong>
            <p>상대 패의 색과 순서로 들어갈 수 있는 숫자를 좁혀 보세요.</p><p class="guide-small">6과 9는 밑줄로 구별해요.</p></div>
        </div>`],
      ['이기는 꿀팁', tipList([
        ['양 끝부터 노리기', '가장 왼쪽 패는 작은 수, 가장 오른쪽 패는 큰 수일 가능성이 높아요.'],
        ['공개된 패로 범위 좁히기', '공개된 패 사이에 숨은 패는 두 숫자 사이의 값만 될 수 있어요.'],
        ['욕심은 적당히', '연속으로 맞히면 좋지만, 틀리면 방금 가져온 내 패가 공개돼요. 자신 없으면 멈추세요.'],
        ['시간 초과 주의', '60초 안에 고르지 않으면 자동으로 진행돼요. 추리를 한 번도 안 했다면 틀린 것으로 처리해요.'],
      ])],
    ],
    foot: '게임 선택 → 다빈치 코드 → 방 만들기 · 2~4명이 참가하고 모두 준비 완료를 누르면 시작해요.<br><small class="guide-small">원작 다빈치 코드(Coda, アルゴ) · 스즈키 히로아키 · 와카스기 에이지, 갓켄 · 패 그림은 이 사이트에서 새로 그렸어요.</small>',
  });
}

function bluemarbleGuide() {
  const short = amount => bmWon(amount).replace('원', '');
  const deedBadge = (name, group) => `<span class="bm-guide-deed ${group}"><i></i>${name}</span>`;
  const steps = [
    ['주사위 굴리기', '주사위 2개를 굴려 나온 합만큼 앞으로 가요.<br><b>더블</b>이면 한 번 더! 단, 더블 3번이면 무인도로 가요.', dice([4, 4])],
    ['땅 사기', '주인 없는 도시 · 관광지 · 탈것에 서면<br>땅값을 내고 살 수 있어요. 안 사도 돼요.<br>산 땅에는 내 말 색깔의 <b>깃발</b>이 꽂혀요.', deedBadge('서울', 'tour')],
    ['건물 짓기', '내 도시에 다시 서면 별장(2채까지) · 빌딩 · 호텔을<br>순서 없이 지을 수 있어요. 지을수록 통행료가 올라요.', '<span class="bm-guide-marks"><i class="bm-villa"></i><i class="bm-villa"></i><i class="bm-building"></i><i class="bm-hotel"></i></span>'],
    ['통행료 내기', '남의 땅에 서면 주인에게 통행료를 내요.<br>땅 통행료 + 지은 건물마다의 통행료를 모두 더해요.', deedBadge('파리', 'g6')],
  ];
  const lots = bmSpaces.map((space, pos) => ({ space, pos })).filter(({ space }) => space.price);
  const groups = new Map();
  for (const card of goldenKeys) {
    const id = card.name + card.text;
    groups.set(id, { card, count: (groups.get(id)?.count ?? 0) + 1 });
  }
  const specialPlaces = [
    ['🏁 출발', `지나가거나 멈추면 월급 <b>${bmWon(bmSalary)}</b>`],
    ['🏝️ 무인도', `<b>${islandTurns}턴</b> 갇혀요. 더블이 나오면 바로 탈출, ${islandTurns}번째 턴에는 굴린 만큼 나가요. 무인도 탈출권을 쓰면 바로 굴려요.`],
    ['🎗️ 사회복지기금 접수처', `기금에 <b>${bmWon(fundFee)}</b>을 내요.`],
    ['💰 사회복지기금 수령처', '그동안 모인 기금을 <b>모두</b> 받아요.'],
    ['🚀 우주여행', `차례가 끝나고, 다음 차례에 판의 아무 칸으로나 날아가요. 컬럼비아호 주인에게 탑승료 <b>${bmWon(spaceFee)}</b>.`],
    ['🔑 황금열쇠', '카드 한 장을 뽑아 그대로 따라요. 우대권 · 무인도 탈출권은 갖고 있다가 써요.'],
  ];
  return article('bluemarble', {
    eyebrow: '부루마불 게임 룰', title: '부루마불 쉽게 배우기',
    intro: '주사위를 굴려 세계 여러 도시를 돌며 땅을 사고 건물을 지어요. 남이 내 땅에 서면 통행료를 받아요. 다른 사람이 모두 파산하거나, 라운드가 끝났을 때 총자산이 가장 많으면 이겨요.',
    art: dice([6, 6]) + deedBadge('서울', 'tour'),
    stats: [['2~4명', 'P1부터 차례로'], [short(bmStartMoney(4)), `시작 자금 (2명이면 ${short(bmStartMoney(2))})`], [short(bmSalary), '출발 월급'], [`${maxRounds}라운드`, '끝나면 총자산 승부']],
    sections: [
      ['내 차례는 이렇게 해요', stepList(steps,
        `한 번 고르는 데 <b>30초</b>예요. 시간이 지나면 주사위는 대신 굴려 주고, 땅 사기와 건물 짓기는 넘어가고, 우주여행은 출발로 가요. 굴리기 전에는 내 땅을 은행에 <b>반값</b>으로 팔 수 있어요.`)],
      ['특별한 칸', `<ul class="guide-tips bm-guide-places">${specialPlaces.map(([title, text]) => `<li><h4>${title}</h4><p>${text}</p></li>`).join('')}</ul>`],
      ['땅값과 통행료', `<div class="guide-sab-scroll"><table class="guide-sab-table bm-guide-table"><thead><tr><th scope="col">땅</th><th scope="col">땅값</th>
          <th scope="col">${parts.map(part => partNames[part]).join(' · ')}</th><th scope="col">통행료: 땅</th><th scope="col">별장 1 · 2채</th><th scope="col">빌딩</th><th scope="col">호텔</th></tr></thead>
        <tbody>${lots.map(({ space }) => space.kind === 'city'
          ? `<tr><th scope="row"><span class="bm-guide-dot g${space.group}"></span>${space.name}</th><td>${short(space.price)}</td><td>${parts.map(part => short(space.cost[part])).join(' · ')}</td>
            <td>${short(space.tolls[0])}</td><td>+${short(space.tolls[1])} · +${short(space.tolls[2])}</td><td>+${short(space.tolls[3])}</td><td>+${short(space.tolls[4])}</td></tr>`
          : `<tr><th scope="row"><span class="bm-guide-dot ${space.group}"></span>${space.name}</th><td>${short(space.price)}</td><td>못 지어요</td><td colspan="4">${short(space.toll)}</td></tr>`).join('')}</tbody></table></div>
        <p class="guide-small">· 통행료는 땅 통행료에 지은 건물의 통행료를 모두 더해요. 예) 베이징에 별장 2채 · 빌딩 · 호텔이면 4천 + 6만 + 18만 + 45만 = 69만 4천원 · 단위: 원</p>`],
      ['황금열쇠 (30장)', `<ul class="bm-guide-keys">${[...groups.values()].map(({ card, count }) =>
        `<li><b>${card.name}</b>${count > 1 ? `<em>${count}장</em>` : ''}<small>${card.text}</small></li>`).join('')}</ul>`],
      ['돈이 모자라면 · 끝나는 조건', `<div class="guide-upper">
          <div><h4>돈이 모자라면</h4><p>낼 돈이 모자라면 내 땅을 <b>싼 것부터</b> 은행에 반값으로 팔아서 내요. 땅을 다 팔아도 모자라면 가진 돈을 모두 내고 <b>파산</b>해요. 파산한 사람의 땅은 은행으로 돌아가요.</p></div>
          <div class="guide-bonus"><p>다른 사람이 모두 파산하면</p><strong>최후의 1인 승리!</strong>
            <p>${maxRounds}라운드가 끝나면 현금 + 땅값 + 건물값을 더한 <b>총자산</b>이 가장 많은 사람이 이겨요.</p></div>
        </div>`],
    ],
    foot: '게임 선택 → 부루마불 → 방 만들기 · 2~4명이 참가하고 모두 준비 완료를 누르면 시작해요.<br><small class="guide-small">원작 부루마불 · 씨앗사 · 땅값 · 통행료 · 황금열쇠는 나무위키 「부루마불/주요 카드」를 따랐어요.</small>',
  });
}

function jeungYutGuide() {
  return article('jeungyut', {eyebrow:'운을 던지고, 판을 바꾸다',title:'증윷',intro:'일반 윷놀이에 세 번의 증강 선택을 더한 2~4인 개인전이에요.',art:'윷',stats:[['2~4','플레이어'],['4','각자의 말'],[String(AUGMENTS.length),'증강 종류']],sections:[
    ['기본 규칙','<p>도·개·걸·윷·모로 1~5칸 이동해 말 4개를 먼저 완주하면 승리해요. 내 말을 만나면 업고, 상대 묶음을 잡으면 대기로 보내요. 윷·모·잡기는 추가 던지기를 줍니다. 모서리에서 이동을 시작할 때 지름길을 고를 수 있어요.</p>'],
    ['증강 선택','<p>각자의 5·10·15번째 턴 시작에 3개 중 하나씩 골라요. 추가 던지기는 같은 턴입니다. 사단 합체·일렬횡대 승리는 해당 증강을 골랐을 때만 적용돼요.</p><ul class="guide-tips">'+AUGMENTS.map(a=>'<li><h4>'+escape(a.name)+'</h4><p>'+escape(a.desc)+'</p></li>').join('')+'</ul>'],
    ['드래그 알까기','<p>내 알을 뒤로 당겼다 놓으면 반대 방향으로 날아가요. 길게 당길수록 강해집니다. 맞힌 상대 묶음이 탈락하고, 빗나가면 내 묶음이 탈락해 대기로 돌아가요. 면역·호신부에 막히면 양쪽 모두 살아남아요. 3초 안에 쏘지 않으면 턴이 끝나요.</p>'],
  ],foot:'대기방에서 증윷 방을 만들고 모두 준비한 뒤, 증윷 게임판 열기를 누르세요. 기존 계정·관전·랭킹을 그대로 사용합니다.'});
}

const guides = { jeungyut: jeungYutGuide, dodge: dodgeGuide, rhythm: rhythmGuide, sides: sidesGuide, slap: slapGuide, ciao: ciaoGuide, onecard: oneCardGuide, yacht: yachtGuide, omok: omokGuide, seotda: seotdaGuide, saboteur: saboteurGuide, davinci: davinciGuide, bluemarble: bluemarbleGuide };

export function guide(game) {
  const tabs = Object.entries(games).map(([id, item]) =>
    `<a class="${id === game ? 'selected' : ''}" href="#guide/${id}" ${id === game ? 'aria-current="page"' : ''}>${item.title}</a>`).join('');
  return heading('게임설명', '게임별 규칙과 진행 방법을 확인하세요.') + `
    <div class="tabs" aria-label="설명할 게임">${tabs}</div>
    ${guides[game]?.() ?? `<section class="panel empty"><h2>${games[game].title}</h2><p>설명을 준비하고 있어요.</p></section>`}`;
}
