// 다빈치 코드 (Coda / アルゴ, 갓켄 2002): 2~4 players hide numbered tiles in order and guess each other's numbers.
// Rules follow 나무위키's base game: 26 tiles (black and white 0~11 plus a joker of each color), 4 tiles each for
// 2~3 players and 3 for 4, no joker in a starting hand, ascending order from the left with black before white on the same
// number, a drawn joker goes anywhere. Whoever has every tile turned face up is out; the last one left wins.
// The wiki says nothing about an empty pile, so like the published rules a player then guesses without drawing and,
// on a miss, turns up one of their own hidden tiles.
export const stepTime = 60_000;
export const joker = 12;
export const colors = ['black', 'white'];
export const colorNames = { black: '검은', white: '흰' };

// A tile is its index: number × 2 + color for 0~11 (so ascending ids are the hand order), 24 and 25 for the jokers.
export const tileCount = 26;
export const tileValue = tile => tile >= 24 ? joker : tile >> 1;
export const tileColor = tile => colors[tile >= 24 ? tile - 24 : tile & 1];
export const isJoker = tile => tile >= 24;
export const valueName = value => value === joker ? '조커' : String(value);
export const tileName = tile => `${colorNames[tileColor(tile)]} ${valueName(tileValue(tile))}`;
export const handSize = count => count >= 4 ? 3 : 4;

// Where a drawn tile may go in an ordered hand: a joker anywhere, a number between its smaller and larger neighbours
// (the jokers sitting between those neighbours leave a choice).
export function insertSlots(hand, tile) {
  if (isJoker(tile)) return Array.from({ length: hand.length + 1 }, (_, index) => index);
  let first = 0;
  let last = hand.length;
  hand.forEach((entry, index) => {
    if (isJoker(entry.tile)) return;
    if (entry.tile < tile) first = index + 1;
    else if (last === hand.length) last = index;
  });
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

// The hint under each hidden tile: a number cannot be there if I can already see that tile somewhere,
// or if somebody already guessed it there and missed.
export function seenTiles(room, me) {
  const seen = new Set();
  for (const player of room.players) {
    for (const entry of player.tiles ?? []) {
      if (entry.tile != null && (entry.open || player === me)) seen.add(entry.tile);
    }
  }
  return seen;
}

export function ruledOut(room, me, entry) {
  const seen = seenTiles(room, me);
  const color = colors.indexOf(entry.color);
  const out = new Set(entry.misses ?? []);
  for (let value = 0; value <= joker; value++) {
    const tile = value === joker ? 24 + color : value * 2 + color;
    if (seen.has(tile)) out.add(value);
  }
  return out;
}
