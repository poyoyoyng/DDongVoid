import { cardName, games, powerCosts, powerNames, yachtCategories, yachtScore } from './rules.js';
import { cardFace, heading, redCard, yachtFace } from './views.js';

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
      <a class="button button-primary" href="#lobby/${game}">${games[game].title} 방 만들러 가기 <span aria-hidden="true">↗</span></a></footer>
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

const guides = { yacht: yachtGuide, slap: slapGuide, onecard: oneCardGuide };

export function guide(game) {
  const tabs = Object.entries(games).map(([id, item]) =>
    `<a class="${id === game ? 'selected' : ''}" href="#guide/${id}" ${id === game ? 'aria-current="page"' : ''}>${item.title}</a>`).join('');
  return heading('게임설명', '게임별 규칙과 진행 방법을 확인하세요.') + `
    <div class="tabs" aria-label="설명할 게임">${tabs}</div>
    ${guides[game]?.() ?? `<section class="panel empty"><h2>${games[game].title}</h2><p>설명을 준비하고 있어요.</p></section>`}`;
}
