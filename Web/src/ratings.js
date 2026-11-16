export const startRating = 1000;
const kFactor = 32;

// Elo for one finished match. Each winner beats each loser and ties with the other winners;
// losers are not ranked against each other. With more players every pairing counts for less,
// so a four-player win moves a rating about as much as a two-player win.
export function ratingChanges(outcomes, ratings) {
  const rating = id => ratings.get(id) ?? startRating;
  const share = kFactor / (outcomes.length - 1);
  return outcomes.map(player => {
    let change = 0;
    for (const other of outcomes) {
      const won = player.outcome !== 'L';
      const otherWon = other.outcome !== 'L';
      if (other === player || !won && !otherWon) continue;
      const score = won === otherWon ? 0.5 : won ? 1 : 0;
      const expected = 1 / (1 + 10 ** ((rating(other.id) - rating(player.id)) / 400));
      change += share * (score - expected);
    }
    return { id: player.id, change };
  });
}
