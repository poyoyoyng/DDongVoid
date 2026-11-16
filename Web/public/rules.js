export const games = {
  dodge: { title: '똥 피하기', description: '떨어지는 똥을 피해서 오래 살아남으세요.', mode: '싱글', max: 1 },
  slap: { title: '맞짱', description: '공격, 방어, 기 모으기로 상대의 체력을 깎으세요.', mode: '2인 대전', max: 2 },
  ciao: { title: '차오차오', description: '주사위 눈을 속이고 상대의 선언을 의심하세요.', mode: '2~4인 대전', max: 4 },
  onecard: { title: '원카드', description: '특수 카드를 활용해 손패를 먼저 모두 내세요.', mode: '2~4인 대전', max: 4 },
  yacht: { title: '야추', description: '주사위 다섯 개로 열두 칸의 점수판을 채우세요.', mode: '2인 대전', max: 2 },
};

export const canTakeSeat = room => room.status === 'playing'
  ? room.players.some(player => player.vacant)
  : room.status !== 'deleted' && room.players.length < games[room.game].max;

export const suits = ['♠', '♥', '♦', '♣'];
export const suitNames = ['스페이드', '하트', '다이아몬드', '클로버'];
export const zones = ['상단', '중단', '하단'];
export const powerNames = ['기본공격', '강한 뺨', '필살뺨'];
export const powerCosts = [0, 1, 3];

export const yachtCategories = [
  '1', '2', '3', '4', '5', '6', '찬스', '포 다이스',
  '풀 하우스', 'S. 스트레이트', 'L. 스트레이트', '야추',
];

export const sum = values => values.reduce((total, value) => total + (value ?? 0), 0);
export const yachtBonus = scores => sum(scores.slice(0, 6)) >= 63 ? 35 : 0;
export const yachtTotal = scores => sum(scores) + yachtBonus(scores);

export function yachtScore(category, dice) {
  if (dice.length !== 5 || dice.some(die => die < 1 || die > 6)) return 0;
  const counts = Array.from({ length: 6 }, (_, index) => dice.filter(die => die === index + 1).length);
  const hasRun = length => counts.some((_, index) =>
    index + length <= counts.length && counts.slice(index, index + length).every(Boolean));
  if (category < 6) return counts[category] * (category + 1);
  switch (category) {
    case 6: return sum(dice);
    case 7: return Math.max(...counts) >= 4 ? sum(dice) : 0;
    case 8: return counts.includes(5) || (counts.includes(3) && counts.includes(2)) ? sum(dice) : 0;
    case 9: return hasRun(4) ? 15 : 0;
    case 10: return hasRun(5) ? 30 : 0;
    case 11: return counts.includes(5) ? 50 : 0;
    default: return 0;
  }
}

export const cardRank = card => card < 52 ? card % 13 + 1 : 0;
export const cardSuit = card => Math.floor(card / 13);

export function cardName(card) {
  if (card === 52) return '흑조커';
  if (card === 53) return '컬러 조커';
  const rank = cardRank(card);
  return suits[cardSuit(card)] + ' ' + ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[rank] ?? rank);
}

export function cardAttack(card) {
  if (card === 53) return 7;
  if (card === 52 || card === 0) return 5;
  return { 1: 3, 2: 2 }[cardRank(card)] ?? 0;
}

export function legalCard(card, top, activeSuit, pendingAttack) {
  const rank = cardRank(card);
  const topRank = cardRank(top);
  if (!pendingAttack) return card >= 52 || activeSuit === null || cardSuit(card) === activeSuit || rank === topRank;
  if (top === 53) return false;
  if (top === 52) return card === 0 || card >= 52;
  if (top === 0) return card >= 52;
  if (card >= 52) return true;
  if (topRank === 2) return rank === 2 || (cardSuit(card) === activeSuit && [1, 3].includes(rank));
  return topRank === 1 && rank === 1;
}
