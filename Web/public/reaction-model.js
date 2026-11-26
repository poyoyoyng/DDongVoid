export const maxReactionMs = 60_000;

// Each run receives a fresh random uint32 from the server.
export const reactionDelay = seed => 2000 + Math.floor((seed >>> 0) / 0x100000000 * 3001);

export function reactionRankChange(previousRank, currentRank) {
  if (previousRank == null) return '첫 랭킹 진입';
  const change = previousRank - currentRank;
  if (change > 0) return `↑ ${change}계단 상승`;
  if (change < 0) return `↓ ${-change}계단 하락`;
  return '순위 유지';
}

export function validReaction(seed, reactionMs, elapsedMs, serverElapsedMs) {
  return Number.isInteger(reactionMs) && reactionMs >= 1 && reactionMs <= maxReactionMs &&
    Number.isFinite(elapsedMs) && elapsedMs >= reactionDelay(seed) + reactionMs &&
    elapsedMs <= serverElapsedMs + 1000;
}
