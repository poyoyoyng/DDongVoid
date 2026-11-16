import assert from 'node:assert/strict';
import test from 'node:test';
import { extendsStreak, ratingChanges, streakBonus } from '../src/ratings.js';

const changes = (outcomes, ratings = {}) => Object.fromEntries(
  ratingChanges(outcomes.map(([id, outcome]) => ({ id, outcome })), new Map(Object.entries(ratings)))
    .map(({ id, change }) => [id, Math.round(change)]));

test('equal ratings move by half the K factor', () => {
  assert.deepEqual(changes([['a', 'W'], ['b', 'L']]), { a: 16, b: -16 });
});

test('an upset moves more than an expected win', () => {
  assert.deepEqual(changes([['low', 'W'], ['high', 'L']], { low: 1000, high: 1200 }), { low: 24, high: -24 });
  assert.deepEqual(changes([['high', 'W'], ['low', 'L']], { low: 1000, high: 1200 }), { high: 8, low: -8 });
});

test('a draw pulls the ratings together', () => {
  assert.deepEqual(changes([['a', 'D'], ['b', 'D']]), { a: 0, b: 0 });
  assert.deepEqual(changes([['low', 'D'], ['high', 'D']], { low: 1000, high: 1200 }), { low: 8, high: -8 });
});

test('a four-player win counts each loser for a third', () => {
  assert.deepEqual(changes([['a', 'W'], ['b', 'L'], ['c', 'L'], ['d', 'L']]), { a: 16, b: -5, c: -5, d: -5 });
});

test('streak bonus starts at the second straight win and stops at ten', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 9].map(streakBonus), [0, 0, 2, 4, 6, 8, 10, 10]);
  assert.deepEqual(['W', 'D', 'L'].map(extendsStreak), [true, false, false]);
});
