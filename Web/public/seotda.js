// 섯다 uses 20 hwatu cards, two for each month 1~10. Card = (month - 1) * 2 + variant; variant 0 is the month's picture card.
export const deckSize = 20;
export const startMoney = 10_000_000;
export const baseBet = 10_000;
// Below bankruptLine a player goes bankrupt and gets refillMoney at the next hand.
export const bankruptLine = 100_000;
export const refillMoney = 3_000_000;
export const turnTime = 30_000;

export const cardMonth = card => (card >> 1) + 1;
export const isGwang = card => card % 2 === 0 && [1, 3, 8].includes(cardMonth(card));
// Only the 열끗 of 4, 7 and 9 count for 암행어사, 땡잡이 and 멍텅구리 구사.
const isYeol = card => card % 2 === 0 && [4, 7, 9].includes(cardMonth(card));
const pictures = ['광', '열끗', '광', '열끗', '열끗', '열끗', '열끗', '광', '열끗', '열끗'];
export const cardKind = card => card % 2 ? (cardMonth(card) === 8 ? '열끗' : '띠') : pictures[cardMonth(card) - 1];
export const cardName = card => cardMonth(card) + '월 ' + cardKind(card);

const pairs = [[1, 2, '알리'], [1, 4, '독사'], [1, 9, '구삥'], [1, 10, '장삥'], [4, 10, '장사'], [4, 6, '세륙']];

// rank: 광땡 980~1000, 땡 901~910, 알리~세륙 801~806, 끗 0~9. special marks the hands that catch or call a regame.
export function handOf(cards) {
  const [first, second] = cards;
  const [low, high] = [cardMonth(first), cardMonth(second)].sort((a, b) => a - b);
  if (isGwang(first) && isGwang(second)) {
    return high === 8 ? (low === 3 ? { rank: 1000, name: '38광땡' } : { rank: 990, name: '18광땡' }) : { rank: 980, name: '13광땡' };
  }
  if (low === high) return { rank: 900 + low, name: low === 10 ? '장땡' : low + '땡' };
  const pair = pairs.findIndex(([a, b]) => a === low && b === high);
  if (pair >= 0) return { rank: 806 - pair, name: pairs[pair][2] };
  const points = (low + high) % 10;
  const hand = { rank: points, name: points === 9 ? '갑오' : points ? points + '끗' : '망통' };
  const yeol = isYeol(first) && isYeol(second);
  if (low === 4 && high === 7 && yeol) hand.special = '암행어사';
  if (low === 3 && high === 7 && [first, second].some(isGwang) && [first, second].some(isYeol)) hand.special = '땡잡이';
  if (low === 4 && high === 9) hand.special = yeol ? '멍텅구리 구사' : '구사';
  if (hand.special) hand.name = hand.special + ' (' + hand.name + ')';
  return hand;
}

// Every hand from best to worst, with the rank handOf gives it.
export const handLadder = [
  [1000, '38광땡'], [990, '18광땡'], [980, '13광땡'], [910, '장땡'],
  ...Array.from({ length: 9 }, (_, step) => [909 - step, 9 - step + '땡']),
  ...pairs.map(([, , name], step) => [806 - step, name]),
  ...Array.from({ length: 10 }, (_, step) => [9 - step, step ? step === 9 ? '망통' : 9 - step + '끗' : '갑오']),
].map(([rank, name]) => ({ rank, name }));

export const specialHands = [
  ['암행어사', '4·7 열끗', '13·18광땡을 잡음'], ['땡잡이', '3광·7 열끗', '1~9땡을 잡음'],
  ['구사', '4·9', '알리 이하면 재경기'], ['멍텅구리 구사', '4·9 열끗', '9땡 이하면 재경기'],
];

// Picks the winners among the hands still in. 암행어사 catches 13·18광땡, 땡잡이 catches 1~9땡.
// 구사 calls a regame when the best hand is 알리 or lower, 멍텅구리 구사 when it is 9땡 or lower.
export function showdown(entries, allowRegame = true) {
  const hands = entries.map(entry => ({ ...entry, hand: handOf(entry.cards) }));
  const best = Math.max(...hands.map(entry => entry.hand.rank));
  const holder = special => hands.find(entry => entry.hand.special === special);
  const catcher = best === 980 || best === 990 ? holder('암행어사') : best > 900 && best < 910 ? holder('땡잡이') : null;
  const winners = catcher ? [catcher] : hands.filter(entry => entry.hand.rank === best);
  const nine = hands.find(entry => !winners.includes(entry) &&
    (entry.hand.special === '구사' && best <= 806 || entry.hand.special === '멍텅구리 구사' && best <= 909));
  if (nine && allowRegame) return { regame: nine };
  return { winners: winners.map(entry => entry.id), hand: winners[0].hand };
}

export function won(amount) {
  const value = Math.abs(amount);
  const parts = [];
  if (value >= 1e8) parts.push(Math.floor(value / 1e8).toLocaleString('ko-KR') + '억');
  if (value % 1e8 >= 1e4) parts.push(Math.floor(value % 1e8 / 1e4).toLocaleString('ko-KR') + '만');
  if (value % 1e4) parts.push((value % 1e4).toLocaleString('ko-KR'));
  return (amount < 0 ? '-' : '') + (parts.join(' ') || '0') + '원';
}

// What each betting button costs the player right now; null when it cannot raise.
// Nobody may put more into one hand than the poorest player had when it began (room.cap).
export function betOptions(room, player) {
  const paid = room.stakes[player.id]?.paid ?? 0;
  const limit = player.roundBet + room.cap - paid;
  const toCall = room.currentBet - player.roundBet;
  const raise = target => {
    const to = Math.min(target, limit);
    return to > room.currentBet ? to - player.roundBet : null;
  };
  return {
    toCall,
    ping: room.currentBet ? null : raise(baseBet),
    ddadang: room.currentBet ? raise(room.currentBet * 2) : null,
    half: raise(room.currentBet + Math.ceil((room.pot + toCall) / 2 / 10_000) * 10_000),
  };
}
