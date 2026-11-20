// 부루마불 (Blue Marble, 씨앗사 1982): 2~4 players roll two dice around a 40-space world board, buy cities and build on them.
// Prices, tolls and golden keys follow 나무위키 (부루마불/주요 카드, 게임 방법); the board, money and cards are shared by
// server and browser. Amounts are in won.
export const turnTime = 30_000;
export const salary = 200_000;
export const fundFee = 150_000;
export const spaceFee = 200_000;
export const islandTurns = 3;
// The game ends when one player is left, or after maxRounds rounds with the most assets winning.
export const maxRounds = 30;
// Each player starts with 293만원 (50만 ×3, 10만 ×10, 5만·2만·1만·5천·1천 ×5); two players get double.
export const startMoney = count => count === 2 ? 5_860_000 : 2_930_000;

const man = value => Math.round(value * 10_000);

export const START = 0, ISLAND = 10, FUND = 20, SPACE = 30, DONATE = 38, COLUMBIA = 32;

// tolls: land only, 1 villa, 2 villas, building, hotel (만원). A lot holds up to 2 villas, 1 building and 1 hotel; tolls add up.
const city = (name, group, price, [villa, building, hotel], tolls) =>
  ({ kind: 'city', name, group, price: man(price), cost: { villa: man(villa), building: man(building), hotel: man(hotel) }, tolls: tolls.map(man) });
// 관광지(제주도·부산·서울) and 탈것(콩코드·퀸 엘리자베스·컬럼비아호) cannot be built on and have one toll.
const special = (name, group, price, toll) => ({ kind: 'special', name, group, price: man(price), toll: man(toll) });
const key = { kind: 'key', name: '황금열쇠' };

export const spaces = [
  { kind: 'start', name: '출발' },
  city('타이베이', 0, 5, [5, 15, 25], [0.2, 1, 3, 9, 25]),
  key,
  city('베이징', 0, 8, [5, 15, 25], [0.4, 2, 6, 18, 45]),
  city('마닐라', 0, 8, [5, 15, 25], [0.4, 2, 6, 18, 45]),
  special('제주도', 'tour', 20, 30),
  city('싱가포르', 1, 10, [5, 15, 25], [0.6, 3, 9, 27, 55]),
  key,
  city('카이로', 1, 10, [5, 15, 25], [0.6, 3, 9, 27, 55]),
  city('이스탄불', 1, 12, [5, 15, 25], [0.8, 4, 10, 30, 60]),
  { kind: 'island', name: '무인도' },
  city('아테네', 2, 14, [10, 30, 50], [1, 5, 15, 45, 75]),
  key,
  city('코펜하겐', 2, 16, [10, 30, 50], [1.2, 6, 18, 50, 90]),
  city('스톡홀름', 2, 16, [10, 30, 50], [1.2, 6, 18, 50, 90]),
  special('콩코드 여객기', 'ride', 20, 30),
  city('베른', 3, 18, [10, 30, 50], [1.4, 7, 20, 55, 95]),
  key,
  city('베를린', 3, 18, [10, 30, 50], [1.4, 7, 20, 55, 95]),
  city('오타와', 3, 20, [10, 30, 50], [1.6, 8, 22, 60, 100]),
  { kind: 'fund', name: '사회복지기금 수령처' },
  city('부에노스아이레스', 4, 22, [15, 40, 75], [1.8, 9, 25, 70, 105]),
  key,
  city('상파울루', 4, 24, [15, 45, 75], [2, 10, 30, 75, 110]),
  city('시드니', 4, 24, [15, 45, 75], [2, 10, 30, 75, 110]),
  special('부산', 'tour', 50, 60),
  city('하와이', 5, 26, [15, 45, 75], [2.2, 11, 33, 80, 115]),
  city('리스본', 5, 26, [15, 45, 75], [2.2, 11, 33, 80, 115]),
  special('퀸 엘리자베스호', 'ride', 30, 25),
  city('마드리드', 5, 28, [15, 45, 75], [2.4, 12, 36, 85, 120]),
  { kind: 'space', name: '우주여행' },
  city('도쿄', 6, 30, [20, 60, 100], [2.6, 13, 39, 90, 127]),
  special('컬럼비아호', 'ride', 45, 40),
  city('파리', 6, 32, [20, 60, 100], [2.8, 15, 45, 100, 140]),
  city('로마', 6, 32, [20, 60, 100], [2.8, 15, 45, 100, 140]),
  key,
  city('런던', 7, 35, [20, 60, 100], [3.5, 17, 50, 110, 150]),
  city('뉴욕', 7, 35, [20, 60, 100], [3.5, 17, 50, 110, 150]),
  { kind: 'donate', name: '사회복지기금 접수처' },
  special('서울', 'tour', 100, 200),
];

// Names short enough for a board cell.
// The four pawns, each in one strong colour so a seat is told apart at a glance. The art is assets/bluemarble/<art>.svg,
// and styles.css paints .bm-pawn.seat-N with it and owned lots (.own-N) in the same colour.
export const pieces = [
  { name: '꼬마 히어로', art: 'hero', color: '#e8352f' },
  { name: '삐약이', art: 'chick', color: '#f5b800' },
  { name: '꼬마 경찰', art: 'police', color: '#2f6fe0' },
  { name: '아기 공룡', art: 'dino', color: '#2aa84a' },
];

export const shortNames = {
  21: '부에노스', 15: '콩코드', 28: '퀸엘리자베스', 32: '컬럼비아', 20: '기금 받기', 38: '기금 내기',
};
export const shortName = pos => shortNames[pos] ?? spaces[pos].name;
export const ownable = pos => spaces[pos].kind === 'city' || spaces[pos].kind === 'special';
export const parts = ['villa', 'building', 'hotel'];
export const partNames = { villa: '별장', building: '빌딩', hotel: '호텔' };
export const partLimit = { villa: 2, building: 1, hotel: 1 };

export const emptyEstate = () => ({ owner: null, villa: 0, building: 0, hotel: 0 });

export function toll(pos, estate) {
  const space = spaces[pos];
  if (space.kind === 'special') return space.toll;
  const [land, villa1, villa2, building, hotel] = space.tolls;
  return land + [0, villa1, villa2][estate.villa] + (estate.building ? building : 0) + (estate.hotel ? hotel : 0);
}

// What the lot cost: land plus every building on it. The bank buys it back for half.
export function estateValue(pos, estate) {
  const space = spaces[pos];
  if (space.kind === 'special') return space.price;
  return space.price + parts.reduce((total, part) => total + estate[part] * space.cost[part], 0);
}
export const saleValue = (pos, estate) => Math.floor(estateValue(pos, estate) / 2);

// Buildings this lot can still take, cheapest first.
export const buildable = (pos, estate) => spaces[pos].kind === 'city' ? parts.filter(part => estate[part] < partLimit[part]) : [];

// Golden keys: 30 cards. keep cards stay with the player until used.
const keySpecs = [
  [{ type: 'sale', name: '반액대매출', text: '가장 비싼 내 땅을 건물과 함께 은행에 반값으로 팝니다.' }, 1],
  [{ type: 'levy', name: '정기종합소득세', text: '호텔 15만 · 빌딩 10만 · 별장 3만원씩 세금을 냅니다.', rates: { hotel: man(15), building: man(10), villa: man(3) } }, 1],
  [{ type: 'levy', name: '건물수리비', text: '호텔 10만 · 빌딩 6만 · 별장 3만원씩 수리비를 냅니다.', rates: { hotel: man(10), building: man(6), villa: man(3) } }, 1],
  [{ type: 'levy', name: '방범비', text: '호텔 5만 · 빌딩 3만 · 별장 1만원씩 방범비를 냅니다.', rates: { hotel: man(5), building: man(3), villa: man(1) } }, 1],
  [{ type: 'escape', name: '무인도 탈출권', text: '갖고 있다가 무인도에서 더블 없이 바로 탈출할 때 씁니다.', keep: true }, 2],
  [{ type: 'pass', name: '우대권', text: '갖고 있다가 통행료를 한 번 내지 않을 때 씁니다.', keep: true }, 2],
  [{ type: 'back', name: '이사', text: '뒤로 2칸 이동합니다.', steps: 2 }, 1],
  [{ type: 'back', name: '이사', text: '뒤로 3칸 이동합니다.', steps: 3 }, 1],
  [{ type: 'go', name: '관광여행', text: '제주도로 갑니다. 출발을 지나면 월급을 받아요.', to: 5 }, 1],
  [{ type: 'go', name: '관광여행', text: '부산으로 갑니다. 출발을 지나면 월급을 받아요.', to: 25 }, 1],
  [{ type: 'go', name: '관광여행', text: '서울로 갑니다. 출발을 지나면 월급을 받아요.', to: 39 }, 1],
  [{ type: 'island', name: '무인도', text: '무인도로 곧장 갑니다. 출발을 지나도 월급은 없어요.' }, 1],
  [{ type: 'go', name: '사회복지기금 배당', text: '사회복지기금 수령처로 가서 모인 기금을 모두 받습니다.', to: FUND }, 1],
  [{ type: 'world', name: '세계일주 초대권', text: '한 바퀴 돌아 제자리로 와요. 월급과 사회복지기금을 모두 받습니다.' }, 1],
  [{ type: 'space', name: '우주여행 초대권', text: '우주여행 칸으로 가서, 다음 차례에 컬럼비아호를 공짜로 타고 원하는 곳으로 갑니다.' }, 1],
  [{ type: 'ride', name: '유람선 여행', text: '퀸 엘리자베스호를 타고 베이징으로 갑니다. 배 주인에게 탑승료를 내요.', via: 28, to: 3 }, 1],
  [{ type: 'ride', name: '항공여행', text: '콩코드 여객기를 타고 타이베이로 갑니다. 비행기 주인에게 탑승료를 내요.', via: 15, to: 1 }, 1],
  [{ type: 'go', name: '고속도로', text: '출발로 가서 월급 20만원을 받습니다.', to: START }, 1],
  [{ type: 'gain', name: '노벨평화상 수상', text: '상금 30만원을 받습니다.', amount: man(30) }, 1],
  [{ type: 'gain', name: '복권 당첨', text: '당첨금 20만원을 받습니다.', amount: man(20) }, 1],
  [{ type: 'gain', name: '자동차 경주 우승', text: '상금 10만원을 받습니다.', amount: man(10) }, 1],
  [{ type: 'gain', name: '장학금 혜택', text: '장학금 10만원을 받습니다.', amount: man(10) }, 1],
  [{ type: 'gain', name: '연금 혜택', text: '연금 5만원을 받습니다.', amount: man(5) }, 1],
  [{ type: 'pay', name: '해외유학', text: '학비 10만원을 은행에 냅니다.', amount: man(10) }, 1],
  [{ type: 'pay', name: '병원비', text: '병원비 5만원을 은행에 냅니다.', amount: man(5) }, 1],
  [{ type: 'pay', name: '과속운전 벌금', text: '벌금 5만원을 은행에 냅니다.', amount: man(5) }, 1],
  [{ type: 'gift', name: '생일 축하', text: '다른 사람 모두에게서 축하금 1만원씩 받습니다.', amount: man(1) }, 1],
  [{ type: 'gift', name: '장기자랑', text: '장기자랑 1등! 다른 사람 모두에게서 상금 1만원씩 받습니다.', amount: man(1) }, 1],
];
// A key in the deck or a hand is its index here.
export const keys = keySpecs.flatMap(([card, count]) => Array.from({ length: count }, () => card));

export function won(amount) {
  const sign = amount < 0 ? '-' : '';
  const value = Math.abs(amount);
  const tenThousands = Math.floor(value / 10_000);
  const rest = value % 10_000;
  const head = tenThousands ? tenThousands.toLocaleString('ko-KR') + '만' : '';
  const tail = rest ? (rest % 1000 ? rest.toLocaleString('ko-KR') : rest / 1000 + '천') : '';
  return sign + ([head, tail].filter(Boolean).join(' ') || '0') + '원';
}

// Board cell for each space: 출발 at the bottom right, then left along the bottom, up the left side, right along the top and down.
export function cellPlace(pos) {
  if (pos <= 10) return { row: 11, col: 11 - pos };
  if (pos <= 20) return { row: 21 - pos, col: 1 };
  if (pos <= 30) return { row: 1, col: pos - 19 };
  return { row: pos - 29, col: 11 };
}
