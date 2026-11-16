export const startRating = 1000;
const kFactor = 32;

// Only a sole win extends a streak. From the second straight win each win earns 2 more points, up to +10.
export const extendsStreak = outcome => outcome === 'W';
export const streakBonus = streak => Math.min(10, Math.max(0, streak - 1) * 2);

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
