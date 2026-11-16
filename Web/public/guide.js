import { games, yachtCategories, yachtScore } from './rules.js';
import { heading, yachtFace } from './views.js';

const dice = (values, { held = [], dim = [] } = {}) => `<span class="guide-dice">${values.map((value, index) =>
  `<span class="die-face guide-die${held.includes(index) ? ' held' : ''}${dim.includes(index) ? ' dim' : ''}">${yachtFace(value)}</span>`).join('')}</span>`;

const steps = [
  ['굴리기', '주사위 5개를 모두 굴려요.', dice([5, 2, 5, 3, 5])],
  ['남길 주사위 고정', '마음에 드는 주사위를 눌러 고정해요.',
    dice([5, 2, 5, 3, 5], { held: [0, 2, 4] }) + '<p><b class="guide-green">초록 테두리 = 고정</b> · 다시 누르면 풀려요</p>'],
  ['다시 굴리기', '고정 안 한 주사위만 다시 굴려요.<br>굴리기는 한 차례에 최대 3번!', dice([5, 5, 5, 5, 5], { held: [0, 2, 4] })],
  ['빈 칸 하나에 점수 적기', '적으면 상대 차례로 넘어가요.<br>1~2번만 굴리고 바로 적어도 OK.',
    `<span class="guide-score">${yachtCategories[11]} <b>${yachtScore(11, [5, 5, 5, 5, 5])}</b></span><p>← 미리 보이는 점수를 눌러 기록</p>`],
];

const lower = [
  [6, '초이스', '아무거나 · 5개 합', [6, 5, 6, 4, 3]],
  [7, '포 다이스', '같은 눈 4개 이상 · 5개 합', [4, 4, 4, 4, 2]],
  [8, '풀 하우스', '같은 눈 3개 + 2개 · 5개 합', [3, 3, 3, 6, 6]],
  [9, 'S. 스트레이트', '연속된 숫자 4개', [1, 2, 3, 4, 6]],
  [10, 'L. 스트레이트', '연속된 숫자 5개', [2, 3, 4, 5, 6]],
  [11, '야추', '같은 눈 5개!', [6, 6, 6, 6, 6]],
];

const tips = [
  ['보너스부터 챙기기', '상단에서 같은 눈을 3개 이상 모으면 63점에 가까워져요. 35점은 야추 다음으로 큰 점수!'],
  ['버릴 칸 정해두기', '망한 판은 에이스(1)나 초이스처럼 손해가 적은 칸에 적어요.'],
  ['스트레이트는 일찍', 'L. 스트레이트 30점은 노리기 어려워요. 연속 4개가 나오면 S.부터 확보!'],
];

const section = (number, title, body) =>
  `<section class="guide-section"><h3><span class="guide-number">${number}</span>${title}</h3>${body}</section>`;

function yachtGuide() {
  return `<article class="panel guide-yacht">
    <header class="guide-head">
      <div><p class="guide-eyebrow">야추 게임 룰</p><h2>야추 다이스 쉽게 배우기</h2>
        <p>주사위 5개를 굴려 족보를 만들고, 12칸을 모두 채워 총점이 높은 사람이 이겨요.</p></div>
      <span class="guide-hero-dice" aria-hidden="true">${dice([6, 6, 6, 6, 6])}</span>
    </header>
    <ul class="guide-stats">
      <li><b>2명</b>번갈아 진행</li><li><b>12라운드</b>칸 12개 = 12번</li>
      <li><b>최대 3번</b>한 차례 굴림</li><li><b>+35</b>상단 63점 보너스</li>
    </ul>
    ${section(1, '내 차례는 이렇게 해요', `<ol class="guide-steps">${steps.map(([title, text, demo], index) => `
      <li><div><h4>${'①②③④'[index]} ${title}</h4><p>${text}</p></div><div class="guide-demo">${demo}</div></li>`).join('')}</ol>
      <p class="guide-warning"><b>주의</b> 굴린 뒤에는 꼭 한 칸을 채워야 해요. 맞는 족보가 없으면 아무 칸에나 <b>0점</b>을 적어야 해요. 한 번 적은 칸은 다시 못 써요.</p>`)}
    ${section(2, '상단 6칸과 보너스 +35', `<div class="guide-upper">
      <div><h4>에이스·듀스·트레이·포·파이브·식스</h4><p>= 1·2·3·4·5·6 눈이 나온 주사위만 더해요.</p>
        <div class="guide-example">${dice([5, 5, 3, 5, 1], { dim: [2, 4] })}<b>→ 파이브 ${yachtScore(4, [5, 5, 3, 5, 1])}점</b></div>
        <p class="guide-small">5가 3개 → 5 × 3 = 15</p></div>
      <div class="guide-bonus"><p>상단 합계 <b>63점 이상</b>이면</p><strong>+35점 보너스!</strong>
        <p>요령: 눈마다 <b>3개씩</b> 모으면 딱 63점</p><p class="guide-small">3 + 6 + 9 + 12 + 15 + 18 = 63</p>
        <p class="guide-small">게임 화면 <b class="guide-plain">소계 48/63</b> · <b>15점 남음</b></p>
        <span class="guide-progress" aria-hidden="true"><i></i></span>
        <p class="guide-small guide-legend"><span><b>15★</b> = 이 칸에 적으면 보너스 달성!</span>
          <span><b>+35</b> = 달성</span><span><b class="guide-plain">실패</b> = 이제 63점은 불가능</span></p></div>
    </div>`)}
    ${section(3, '하단 6칸 족보', `<ul class="guide-combos">${lower.map(([category, name, text, values]) => `
      <li><strong>${name}</strong><span>${text}</span>${dice(values)}<b>${yachtScore(category, values)}</b></li>`).join('')}</ul>
      <p class="guide-small">· 조건이 안 맞는 칸에 적으면 0점 · 같은 눈 5개는 풀 하우스로도 인정돼요</p>`)}
    ${section(4, '이기는 꿀팁', `<ul class="guide-tips">${tips.map(([title, text]) =>
      `<li><h4>${title}</h4><p>${text}</p></li>`).join('')}</ul>`)}
    <footer class="guide-foot"><p>게임 선택 → 야추 → 방 만들기 · 상대가 참가하고 둘 다 준비 완료를 누르면 시작해요.</p>
      <a class="button button-primary" href="#lobby/yacht">야추 방 만들러 가기 <span aria-hidden="true">↗</span></a></footer>
  </article>`;
}

export function guide(game) {
  const tabs = Object.entries(games).map(([id, item]) =>
    `<a class="${id === game ? 'selected' : ''}" href="#guide/${id}" ${id === game ? 'aria-current="page"' : ''}>${item.title}</a>`).join('');
  return heading('게임설명', '게임별 규칙과 진행 방법을 확인하세요.') + `
    <div class="tabs" aria-label="설명할 게임">${tabs}</div>
    ${game === 'yacht' ? yachtGuide() : `<section class="panel empty"><h2>${games[game].title}</h2><p>설명을 준비하고 있어요.</p></section>`}`;
}
